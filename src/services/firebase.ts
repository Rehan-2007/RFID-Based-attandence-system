import { initializeApp, getApps, getApp, FirebaseApp, deleteApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updatePassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut as fbSignOut, 
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User as FirebaseUser,
  Auth
} from 'firebase/auth';
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  update, 
  remove, 
  onValue, 
  off, 
  runTransaction,
  DataSnapshot,
  Database
} from 'firebase/database';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  Unsubscribe,
  Firestore 
} from 'firebase/firestore';
import { 
  Student, 
  AttendanceRecord, 
  FirebaseConfigState, 
  DeviceCommand, 
  ResetAuditLog,
  UserProfile,
  StudentRegistrationInput,
  UserRole,
  AttendanceStatus,
  StudentSuspension,
  AuditActivityLog,
  UndoAction,
  TrashAttendanceRecord,
  WorkingDayConfig,
  MigrationInspection,
  MigrationResult,
  MigrationRecordLog,
  AttendanceSettings,
  UnregisteredAttendanceGroup,
  DbDiagnosticCode,
  DbDiagnosticState,
  DatabaseValidationReport,
  DatabaseDiagnosticIssue,
  UnlinkedUserProfileEntry
} from '../types';
import {
  getISTDateStr,
  getISTTimeStr,
  getISTTimestampDisplay,
  isValidDateStr,
  isValidDeadlineHHMM,
} from '../utils/dateUtils';

const STORAGE_KEY_FIREBASE_CONFIG = 'rfid_firebase_config_override';
const STORAGE_KEY_ATTENDANCE_SETTINGS = 'rfid_attendance_settings_v1';
export const DEFAULT_ATTENDANCE_DEADLINE = '10:30';

/**
 * Recursively strips any properties with `undefined` values so Firebase RTDB set()/update() never throws.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([k, v]) => {
      if (v !== undefined) {
        cleaned[k] = stripUndefinedDeep(v);
      }
    });
    return cleaned as T;
  }
  return value;
}

const VALID_ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'Present',
  'Absent',
  'Late',
  'Excused',
  'Duplicate',
  'Unknown',
];

/**
 * Validates required attendance record fields before writing to Firebase RTDB.
 * Returns null if valid, or a descriptive error string.
 */
export function validateAttendancePayload(rec: Partial<AttendanceRecord>): string | null {
  const uid = (rec.uid || rec.rfidUID || '').toString().trim().toUpperCase();
  if (!uid || !/^[A-Z0-9_-]{2,32}$/.test(uid)) {
    return `Invalid RFID UID "${rec.uid || ''}"`;
  }
  if (!rec.date || !isValidDateStr(rec.date)) {
    return `Invalid attendance date "${rec.date || ''}" (expected YYYY-MM-DD)`;
  }
  if (!rec.time || !/^\d{2}:\d{2}(:\d{2})?$/.test(rec.time)) {
    return `Invalid attendance time "${rec.time || ''}" (expected HH:mm:ss)`;
  }
  if (typeof rec.timestamp !== 'number' || !Number.isFinite(rec.timestamp) || rec.timestamp <= 0) {
    return `Invalid attendance timestamp "${rec.timestamp}"`;
  }
  if (!rec.status || !VALID_ATTENDANCE_STATUSES.includes(rec.status)) {
    return `Invalid attendance status "${rec.status || ''}"`;
  }
  return null;
}

export const CONFIGURED_ADMIN_UID = 'bi3c890VUXhVE0JFxroYfnlQwea2';
export const CONFIGURED_ESP32_UID = 'MdwxcdNtLgZp3cnYoqXBNkin8C82';
export const CONFIGURED_PROJECT_ID = 'rfid-attendance-system-5fccd';
export const CONFIGURED_DATABASE_URL = 'https://rfid-attendance-system-5fccd-default-rtdb.firebaseio.com';
export const PROJECT_FIREBASE_API_KEY = 'AIzaSyCg52LDce_ACHrJV1FqOTqcLndG9i77J3g';

export const DEFAULT_FIREBASE_CONFIG: FirebaseConfigState = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || PROJECT_FIREBASE_API_KEY,
  authDomain: 'rfid-attendance-system-5fccd.firebaseapp.com',
  databaseURL: CONFIGURED_DATABASE_URL,
  projectId: CONFIGURED_PROJECT_ID,
  storageBucket: 'rfid-attendance-system-5fccd.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// In-memory cache of students fetched dynamically from Firebase RTDB (/students/{studentDbId})
export const cachedStudentsMap: Record<string, Student> = {};

/**
 * Typed Firebase Auth/Profile diagnostic error so UI distinguishes:
 * - auth_expired
 * - permission_denied
 * - not_registered
 * - mapping_missing
 * - disconnected
 */
export class AuthProfileError extends Error {
  code: DbDiagnosticCode;
  path?: string;
  operation?: string;

  constructor(code: DbDiagnosticCode, message: string, path?: string, operation?: string) {
    super(message);
    this.name = 'AuthProfileError';
    this.code = code;
    this.path = path;
    this.operation = operation;
  }
}

export function classifyFirebaseError(
  err: any,
  fallbackMessage?: string
): DbDiagnosticState {
  const rawCode = String(err?.code || '').toLowerCase();
  const rawMsg = String(err?.message || fallbackMessage || '');
  const lowerMsg = rawMsg.toLowerCase();

  if (
    rawCode === 'auth_expired' ||
    rawCode.includes('id-token-expired') ||
    rawCode.includes('user-token-expired') ||
    rawCode.includes('invalid-user-token') ||
    rawCode.includes('unauthenticated') ||
    /token.*expired|session.*expired|auth.*expired|not authenticated|unauthenticated/i.test(lowerMsg)
  ) {
    return {
      code: 'auth_expired',
      label: 'AUTH EXPIRED',
      message: rawMsg || 'Your Firebase Authentication session has expired. Please sign in again.',
      path: err?.path,
      operation: err?.operation,
    };
  }

  if (
    rawCode === 'permission_denied' ||
    rawCode.includes('permission-denied') ||
    rawCode.includes('permission_denied') ||
    /permission_denied|permission denied|insufficient permissions|unauthorized_uid/i.test(lowerMsg)
  ) {
    return {
      code: 'permission_denied',
      label: 'PERM DENIED',
      message: rawMsg || 'Permission denied accessing Firebase Realtime Database.',
      path: err?.path,
      operation: err?.operation,
    };
  }

  if (
    rawCode === 'not_registered' ||
    /not registered|no registered profile|profile has not been configured/i.test(lowerMsg)
  ) {
    return {
      code: 'not_registered',
      label: 'UNREGISTERED',
      message: rawMsg || 'Student account is authenticated but not registered in the database.',
      path: err?.path,
      operation: err?.operation,
    };
  }

  if (
    rawCode === 'mapping_missing' ||
    /mapping missing|missing student|unable to resolve|rfid.*not.*linked/i.test(lowerMsg)
  ) {
    return {
      code: 'mapping_missing',
      label: 'UNMAPPED',
      message: rawMsg || 'Student mapping missing between Auth UID, Student DB ID, and RFID Card.',
      path: err?.path,
      operation: err?.operation,
    };
  }

  if (
    rawCode === 'disconnected' ||
    rawCode.includes('network') ||
    /offline|disconnected|network|timed out/i.test(lowerMsg)
  ) {
    return {
      code: 'disconnected',
      label: 'OFFLINE',
      message: rawMsg || 'Firebase Realtime Database is disconnected.',
      path: err?.path,
      operation: err?.operation,
    };
  }

  return {
    code: 'disconnected',
    label: 'SYNC ERR',
    message: rawMsg || 'Unable to synchronize with Firebase Realtime Database.',
    path: err?.path,
    operation: err?.operation,
  };
}

export function generateStudentDbId(rollNumber?: string): string {
  const cleanRoll = (rollNumber || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  return cleanRoll ? `STU_${cleanRoll}_${rand}` : `STU_${ts}_${rand}`;
}

export function resolveStudentDbIdFromMap(
  identifier: string,
  studentsMap: Record<string, Student> = cachedStudentsMap
): string | null {
  if (!identifier) return null;
  const raw = identifier.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  if (studentsMap[raw]) return raw;
  if (studentsMap[upper]) return upper;

  for (const [dbKey, st] of Object.entries(studentsMap)) {
    if (!st) continue;
    const stDbId = (st.studentDbId || dbKey).trim();
    const stRfid = (st.rfidUID || st.uid || '').trim().toUpperCase();
    const stRoll = (st.studentId || '').trim().toUpperCase();
    const stEmail = (st.email || '').trim().toLowerCase();
    if (
      stDbId === raw ||
      stDbId.toUpperCase() === upper ||
      (stRfid && stRfid === upper) ||
      (stRoll && stRoll === upper) ||
      (st.authUid && st.authUid === raw) ||
      (stEmail && stEmail === lower)
    ) {
      return dbKey;
    }
  }
  return null;
}

export async function resolveStudentByAnyId(
  idOrRfid: string,
  studentsLookup?: Record<string, Student>
): Promise<{ studentDbId: string; student: Student; rfidUID: string } | null> {
  const raw = (idOrRfid || '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const db = getFirebaseDatabase();

  // 1. Check direct lookup in /students/{raw} or /students/{upper}
  for (const candidate of Array.from(new Set([raw, upper]))) {
    try {
      const directSnap = await withTimeout(get(ref(db, `students/${candidate}`)), 3000, null);
      if (directSnap && directSnap.exists && directSnap.exists()) {
        const st = directSnap.val() as Student;
        const rfidUID = (st.rfidUID || st.uid || candidate).trim().toUpperCase();
        return {
          studentDbId: candidate,
          student: { ...st, studentDbId: candidate, rfidUID, uid: rfidUID },
          rfidUID,
        };
      }
    } catch {}
  }

  // 2. Query /rfid_to_student/{upper}
  try {
    const idxSnap = await withTimeout(get(ref(db, `rfid_to_student/${upper}`)), 3000, null);
    if (idxSnap && idxSnap.exists && idxSnap.exists()) {
      const mapping = idxSnap.val();
      const targetDbId = typeof mapping === 'string' ? mapping : mapping?.studentDbId;
      if (targetDbId) {
        const stSnap = await withTimeout(get(ref(db, `students/${targetDbId}`)), 3000, null);
        if (stSnap && stSnap.exists && stSnap.exists()) {
          const st = stSnap.val() as Student;
          const rfidUID = (st.rfidUID || st.uid || upper).trim().toUpperCase();
          return {
            studentDbId: targetDbId,
            student: { ...st, studentDbId: targetDbId, rfidUID, uid: rfidUID },
            rfidUID,
          };
        }
      }
    }
  } catch {}

  // 3. Fallback scan cached / lookup / live /students (for Admin operations)
  const sources = [studentsLookup, cachedStudentsMap].filter(Boolean) as Record<string, Student>[];
  for (const map of sources) {
    const matchedKey = resolveStudentDbIdFromMap(raw, map);
    if (matchedKey && map[matchedKey]) {
      const st = map[matchedKey];
      const rfidUID = (st.rfidUID || st.uid || matchedKey).trim().toUpperCase();
      return {
        studentDbId: matchedKey,
        student: { ...st, studentDbId: matchedKey, rfidUID, uid: rfidUID },
        rfidUID,
      };
    }
  }

  try {
    const allSnap = await withTimeout(get(ref(db, 'students')), 3500, null);
    if (allSnap && allSnap.exists && allSnap.exists()) {
      const allMap = allSnap.val() as Record<string, Student>;
      const matchedKey = resolveStudentDbIdFromMap(raw, allMap);
      if (matchedKey && allMap[matchedKey]) {
        const st = allMap[matchedKey];
        const rfidUID = (st.rfidUID || st.uid || matchedKey).trim().toUpperCase();
        return {
          studentDbId: matchedKey,
          student: { ...st, studentDbId: matchedKey, rfidUID, uid: rfidUID },
          rfidUID,
        };
      }
    }
  } catch {}

  return null;
}


export function getActiveFirebaseConfig(): FirebaseConfigState {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY_FIREBASE_CONFIG);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Ensure apiKey is never empty or placeholder
        if (!parsed.apiKey || parsed.apiKey === 'AIzaSyPlaceholderClientInitialKey00') {
          parsed.apiKey = DEFAULT_FIREBASE_CONFIG.apiKey;
        }
        return { ...DEFAULT_FIREBASE_CONFIG, ...parsed };
      }
    }
  } catch (e) {
    console.warn('Failed reading stored Firebase config', e);
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function resetFirebaseInstances() {
  appInstance = null;
  authInstance = null;
  dbInstance = null;
  firestoreInstance = null;
}

export function saveActiveFirebaseConfig(config: FirebaseConfigState) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_FIREBASE_CONFIG, JSON.stringify(config));
  }
  resetFirebaseInstances();
}

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Database | null = null;
let firestoreInstance: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (appInstance) return appInstance;

  const config = getActiveFirebaseConfig();
  const existingApps = getApps();
  if (existingApps.length > 0) {
    appInstance = existingApps[0];
  } else {
    appInstance = initializeApp({
      ...config,
      apiKey: config.apiKey || PROJECT_FIREBASE_API_KEY,
    });
  }
  return appInstance;
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  authInstance = getAuth(app);
  return authInstance;
}

export function getFirebaseDatabase(): Database {
  if (dbInstance) return dbInstance;
  const app = getFirebaseApp();
  const config = getActiveFirebaseConfig();
  dbInstance = getDatabase(app, config.databaseURL);
  return dbInstance;
}

export function getFirebaseFirestore(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  const app = getFirebaseApp();
  firestoreInstance = getFirestore(app);
  return firestoreInstance;
}

// Realtime Database connection listener using .info/connected
export function subscribeToConnectionStatus(
  onStatusChange: (isConnected: boolean) => void
) {
  try {
    const db = getFirebaseDatabase();
    const connectedRef = ref(db, '.info/connected');
    const unsubscribe = onValue(
      connectedRef, 
      (snap) => {
        onStatusChange(snap.val() === true);
      },
      (error) => {
        console.warn('Firebase .info/connected error:', error);
        onStatusChange(false);
      }
    );
    return () => off(connectedRef, 'value', unsubscribe);
  } catch (e) {
    console.warn('Realtime Database connection status check failed:', e);
    onStatusChange(false);
    return () => {};
  }
}

// Student Realtime Database Operations
export function subscribeToStudents(
  onSuccess: (students: Record<string, Student>) => void,
  onError?: (err: Error) => void
) {
  try {
    const db = getFirebaseDatabase();
    const studentsRef = ref(db, 'students');
    const unsubscribe = onValue(
      studentsRef,
      (snapshot: DataSnapshot) => {
        const val = snapshot.val();
        Object.keys(cachedStudentsMap).forEach((k) => delete cachedStudentsMap[k]);
        if (val && typeof val === 'object') {
          const normalized: Record<string, Student> = {};
          Object.entries(val).forEach(([dbKey, rawSt]: [string, any]) => {
            if (!rawSt || typeof rawSt !== 'object') return;
            const studentDbId = (rawSt.studentDbId || dbKey).toString().trim();
            const rfidUID = (rawSt.rfidUID || rawSt.uid || dbKey).toString().trim().toUpperCase();
            const normStudent: Student = {
              ...rawSt,
              studentDbId: dbKey,
              rfidUID,
              uid: rfidUID,
            };
            cachedStudentsMap[dbKey] = normStudent;
            normalized[dbKey] = normStudent;
          });
          onSuccess(normalized);
        } else {
          onSuccess({});
        }
      },
      (error) => {
        console.warn('Realtime Database students read error:', error);
        onError?.(error);
      }
    );
    return () => off(studentsRef, 'value', unsubscribe);
  } catch (error) {
    console.error('Failed to subscribe to students', error);
    onError?.(error as Error);
    return () => {};
  }
}

export async function saveStudent(student: Student): Promise<Student> {
  const db = getFirebaseDatabase();
  const fs = getFirebaseFirestore();
  const newRfid = (student.rfidUID || student.uid || '').trim().toUpperCase();
  if (!newRfid) {
    throw new Error('RFID Card UID is required.');
  }

  let studentDbId = (student.studentDbId || '').trim();
  let previousRfid = '';
  let exists = false;
  let existingAttendance: Record<string, AttendanceRecord> | undefined = undefined;
  let existingData: Student | null = null;

  // Locate existing student record by studentDbId first, or by matching existing RFID
  if (!studentDbId) {
    const matched = resolveStudentDbIdFromMap(newRfid);
    if (matched) studentDbId = matched;
  }

  if (studentDbId) {
    try {
      const snap = await withTimeout(get(ref(db, `students/${studentDbId}`)), 3000, null);
      if (snap && snap.exists && snap.exists()) {
        exists = true;
        existingData = snap.val() as Student;
        previousRfid = (existingData?.rfidUID || existingData?.uid || studentDbId).trim().toUpperCase();
        if (existingData?.attendance) {
          existingAttendance = existingData.attendance;
        }
      }
    } catch {}
  } else {
    studentDbId = generateStudentDbId(student.studentId);
  }

  // Enforce: Prevent duplicate active RFID card assignments across different students
  try {
    const idxSnap = await withTimeout(get(ref(db, `rfid_to_student/${newRfid}`)), 3000, null);
    if (idxSnap && idxSnap.exists && idxSnap.exists()) {
      const idxVal = idxSnap.val();
      const assignedDbId = typeof idxVal === 'string' ? idxVal : idxVal?.studentDbId;
      const isActiveIdx = typeof idxVal === 'string' ? true : idxVal?.active !== false;
      if (assignedDbId && assignedDbId !== studentDbId && isActiveIdx) {
        throw new Error(`RFID card ${newRfid} is already assigned to another student (${assignedDbId}). Unassign it before reassigning.`);
      }
    }
  } catch (dupErr: any) {
    if (dupErr?.message?.includes('already assigned')) throw dupErr;
  }

  try {
    const allSnap = await withTimeout(get(ref(db, 'students')), 3000, null);
    if (allSnap && allSnap.exists && allSnap.exists()) {
      const all = allSnap.val() as Record<string, Student>;
      for (const [k, other] of Object.entries(all)) {
        if (!other || k === studentDbId) continue;
        const otherRfid = (other.rfidUID || other.uid || k).trim().toUpperCase();
        if (otherRfid === newRfid && other.status !== 'inactive') {
          throw new Error(`RFID card ${newRfid} is already assigned to active student ${other.name} (${other.studentId}).`);
        }
      }
    }
  } catch (dupErr: any) {
    if (dupErr?.message?.includes('already assigned')) throw dupErr;
  }

  const studentRef = ref(db, `students/${studentDbId}`);
  const mergedStudent: Student = {
    ...student,
    studentDbId,
    rfidUID: newRfid,
    uid: newRfid,
    authUid: student.authUid || existingData?.authUid || undefined,
  };

  if (exists && !student.attendance) {
    const { attendance: _ignored, ...profileOnly } = mergedStudent;
    await runRtdbOp('UPDATE', `/students/${studentDbId}`, () =>
      update(studentRef, stripUndefinedDeep(profileOnly))
    );
  } else {
    const payload: any = { ...mergedStudent };
    if (student.attendance) {
      payload.attendance = { ...(existingAttendance || {}), ...student.attendance };
    } else if (existingAttendance) {
      payload.attendance = existingAttendance;
    }
    await runRtdbOp('SET', `/students/${studentDbId}`, () => set(studentRef, stripUndefinedDeep(payload)));
  }

  // Remove stale RFID index if card was reassigned
  if (previousRfid && previousRfid !== newRfid) {
    try { await remove(ref(db, `rfid_to_student/${previousRfid}`)); } catch {}
    try { await remove(ref(db, `rfid_to_uid/${previousRfid}`)); } catch {}
  }

  // Maintain authoritative /rfid_to_student/{RFID} mapping
  await set(
    ref(db, `rfid_to_student/${newRfid}`),
    stripUndefinedDeep({
      rfidUID: newRfid,
      studentDbId,
      authUid: mergedStudent.authUid || '',
      rollNumber: mergedStudent.studentId,
      active: mergedStudent.status !== 'inactive',
      updatedAt: Date.now(),
    })
  );

  if (mergedStudent.authUid) {
    try { await set(ref(db, `rfid_to_uid/${newRfid}`), mergedStudent.authUid); } catch {}
    const userPayload: UserProfile = stripUndefinedDeep({
      uid: mergedStudent.authUid,
      studentDbId,
      name: mergedStudent.name,
      email: (mergedStudent.email || '').trim().toLowerCase(),
      rollNumber: mergedStudent.studentId,
      department: mergedStudent.department,
      year: mergedStudent.year,
      semester: mergedStudent.semester || 'Semester 1',
      role: 'student',
      rfidUID: newRfid,
      phone: mergedStudent.phone || '',
      createdAt: Date.now(),
    });
    try {
      await set(ref(db, `users/${mergedStudent.authUid}`), userPayload);
      await set(
        ref(db, `auth_to_student/${mergedStudent.authUid}`),
        stripUndefinedDeep({
          authUid: mergedStudent.authUid,
          studentDbId,
          rfidUID: newRfid,
          rollNumber: mergedStudent.studentId,
          email: userPayload.email,
          updatedAt: Date.now(),
        })
      );
      await withTimeout(setDoc(doc(fs, 'users', mergedStudent.authUid), userPayload, { merge: true }), 2000, null);
    } catch {}
  }

  return mergedStudent;
}

export async function deleteStudent(idOrUid: string): Promise<void> {
  const db = getFirebaseDatabase();
  const resolved = await resolveStudentByAnyId(idOrUid);
  const targetDbId = resolved?.studentDbId || idOrUid.trim();
  const rfidToClean = resolved?.rfidUID || (resolved?.student?.rfidUID || resolved?.student?.uid || '').trim().toUpperCase();
  const authUidToClean = resolved?.student?.authUid;

  await runRtdbOp('REMOVE', `/students/${targetDbId}`, () => remove(ref(db, `students/${targetDbId}`)));

  if (rfidToClean) {
    try { await remove(ref(db, `rfid_to_student/${rfidToClean}`)); } catch {}
    try { await remove(ref(db, `rfid_to_uid/${rfidToClean}`)); } catch {}
  }
  if (authUidToClean) {
    try { await remove(ref(db, `auth_to_student/${authUidToClean}`)); } catch {}
  }
}

// Unified Attendance & Working Days Realtime Database Operations
// Primary Unified Structure: students/{RFID_UID}/attendance/{YYYY-MM-DD}

export function subscribeToAttendanceSettings(
  onSuccess: (settings: AttendanceSettings) => void,
  onError?: (err: Error) => void
) {
  let localFallback: AttendanceSettings = { deadlineTime: DEFAULT_ATTENDANCE_DEADLINE };
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_ATTENDANCE_SETTINGS);
      if (raw) {
        const parsed = JSON.parse(raw) as AttendanceSettings;
        if (isValidDeadlineHHMM(parsed?.deadlineTime)) {
          localFallback = parsed;
        }
      }
    }
  } catch {}

  try {
    const db = getFirebaseDatabase();
    const settingsRef = ref(db, 'settings/attendance');
    const unsubscribe = onValue(
      settingsRef,
      (snapshot: DataSnapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val() as AttendanceSettings;
          if (val && isValidDeadlineHHMM(val.deadlineTime)) {
            try {
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY_ATTENDANCE_SETTINGS, JSON.stringify(val));
              }
            } catch {}
            onSuccess(val);
            return;
          }
        }
        onSuccess(localFallback);
      },
      (error) => {
        onSuccess(localFallback);
        onError?.(error);
      }
    );
    return () => off(settingsRef, 'value', unsubscribe);
  } catch (error) {
    onSuccess(localFallback);
    onError?.(error as Error);
    return () => {};
  }
}

export async function saveAttendanceSettings(
  deadlineTime: string,
  adminEmail?: string | null
): Promise<AttendanceSettings> {
  const cleanDeadline = deadlineTime.trim();
  if (!isValidDeadlineHHMM(cleanDeadline)) {
    throw new Error('Invalid deadline format. Please use 24-hour HH:mm format (e.g., 10:30).');
  }

  const payload: AttendanceSettings = stripUndefinedDeep({
    deadlineTime: cleanDeadline,
    updatedAt: Date.now(),
    updatedBy: adminEmail || 'admin',
  });

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_ATTENDANCE_SETTINGS, JSON.stringify(payload));
    }
  } catch {}

  const db = getFirebaseDatabase();
  await runRtdbOp('SET', '/settings/attendance', () => set(ref(db, 'settings/attendance'), payload));
  return payload;
}

export function subscribeToWorkingDays(
  onSuccess: (workingDays: Record<string, WorkingDayConfig>) => void,
  onError?: (err: Error) => void
) {
  try {
    const db = getFirebaseDatabase();
    const wdRef = ref(db, 'working_days');
    const unsubscribe = onValue(
      wdRef,
      (snapshot: DataSnapshot) => {
        onSuccess(snapshot.val() || {});
      },
      (error) => {
        console.warn('Working days listener notice:', error?.message);
        onError?.(error);
      }
    );
    return () => off(wdRef, 'value', unsubscribe);
  } catch (error) {
    onError?.(error as Error);
    return () => {};
  }
}

export async function setWorkingDayStatus(
  date: string,
  isHoliday: boolean,
  label?: string
): Promise<void> {
  if (!isValidDateStr(date)) {
    throw new Error(`Invalid date "${date}" for working day configuration.`);
  }
  const db = getFirebaseDatabase();
  const payload: WorkingDayConfig = stripUndefinedDeep({
    date,
    isHoliday,
    label: label || (isHoliday ? 'Holiday / Non-Working Day' : 'Institutional Working Day'),
    updatedAt: Date.now(),
  });
  await set(ref(db, `working_days/${date}`), payload);
}

export async function syncWorkingDaysFromDates(dates: string[]): Promise<void> {
  if (!dates || dates.length === 0) return;
  try {
    const db = getFirebaseDatabase();
    const wdSnap = await withTimeout(get(ref(db, 'working_days')), 2500, null);
    const existing = (wdSnap && wdSnap.exists && wdSnap.exists() ? wdSnap.val() : {}) as Record<string, WorkingDayConfig>;
    const today = getISTDateStr();

    const workingDayUpdates: Record<string, any> = {};
    dates.forEach((d) => {
      if (d && isValidDateStr(d) && d <= today && !existing[d]) {
        workingDayUpdates[d] = {
          date: d,
          isHoliday: false,
          label: 'Institutional Working Day',
          updatedAt: Date.now(),
        };
      }
    });

    if (Object.keys(workingDayUpdates).length > 0) {
      await update(ref(db, 'working_days'), stripUndefinedDeep(workingDayUpdates));
    }
  } catch {
    // Non-blocking sync
  }
}

/**
 * Shared calculation for Total Applicable Working Days:
 * - Includes recorded attendance dates and registered working days
 * - Strictly excludes holidays/non-working days
 * - Strictly excludes future dates (> todayStr)
 * - Deduplicates dates
 */
export function computeApplicableWorkingDates(
  allAttendance: Record<string, Record<string, AttendanceRecord>>,
  workingDays: Record<string, WorkingDayConfig>,
  todayStr: string
): string[] {
  const dateSet = new Set<string>();

  Object.keys(allAttendance || {}).forEach((d) => {
    if (!d || d > todayStr) return;
    const dayMap = allAttendance[d];
    if (dayMap && Object.values(dayMap).some((r) => r && !r.isDeleted)) {
      dateSet.add(d);
    }
  });

  Object.keys(workingDays || {}).forEach((d) => {
    if (!d || d > todayStr) return;
    const cfg = workingDays[d];
    if (cfg && !cfg.isHoliday) {
      dateSet.add(d);
    }
  });

  // Remove any explicitly marked holidays
  Object.keys(workingDays || {}).forEach((d) => {
    if (workingDays[d]?.isHoliday) {
      dateSet.delete(d);
    }
  });

  return Array.from(dateSet).sort();
}

export function subscribeToDateAttendance(
  dateStr: string,
  onSuccess: (records: Record<string, AttendanceRecord>) => void,
  onError?: (err: Error) => void
) {
  return subscribeToStudents(
    (studentsMap) => {
      const result: Record<string, AttendanceRecord> = {};
      Object.entries(studentsMap || {}).forEach(([dbKey, st]) => {
        if (!st || !st.attendance) return;
        const studentDbId = (st.studentDbId || dbKey).trim();
        const cardUid = (st.rfidUID || st.uid || dbKey).trim().toUpperCase();
        const rawRec = st.attendance[dateStr];
        if (rawRec && !rawRec.isDeleted) {
          result[studentDbId] = normalizeAttendanceRecord(
            {
              ...rawRec,
              studentDbId,
              studentName: rawRec.studentName || st.name,
              studentId: rawRec.studentId || st.studentId,
              department: rawRec.department || st.department,
              authUid: rawRec.authUid || st.authUid,
            },
            dateStr,
            cardUid,
            studentDbId
          );
        }
      });
      onSuccess(result);
    },
    onError
  );
}

export function subscribeToAllAttendance(
  onSuccess: (recordsByDate: Record<string, Record<string, AttendanceRecord>>) => void,
  onError?: (err: Error) => void
) {
  return subscribeToStudents(
    (studentsMap) => {
      const recordsByDate: Record<string, Record<string, AttendanceRecord>> = {};
      Object.entries(studentsMap || {}).forEach(([dbKey, st]) => {
        if (!st || !st.attendance) return;
        const studentDbId = (st.studentDbId || dbKey).trim();
        const cardUid = (st.rfidUID || st.uid || dbKey).trim().toUpperCase();
        Object.entries(st.attendance).forEach(([dateKey, rawRec]) => {
          if (!rawRec) return;
          if (!recordsByDate[dateKey]) {
            recordsByDate[dateKey] = {};
          }
          recordsByDate[dateKey][studentDbId] = normalizeAttendanceRecord(
            {
              ...rawRec,
              studentDbId,
              studentName: rawRec.studentName || st.name,
              studentId: rawRec.studentId || st.studentId,
              department: rawRec.department || st.department,
              authUid: rawRec.authUid || st.authUid,
            },
            dateKey,
            cardUid,
            studentDbId
          );
        });
      });
      onSuccess(recordsByDate);
    },
    onError
  );
}

/**
 * Record attendance from ESP32 or portal into students/{studentDbId}/attendance/{DATE}.
 * Resolves RFID Card UID -> Student Database ID dynamically via /rfid_to_student/{UID} and /students.
 */
export async function recordAttendanceScan(
  uidInput: string,
  options?: {
    device?: string;
    source?: string;
    studentsLookup?: Record<string, Student>;
    customTimestamp?: number;
  }
): Promise<{ success: boolean; message: string; record?: AttendanceRecord }> {
  const uid = uidInput.trim().toUpperCase();
  if (!uid || !/^[A-Z0-9_-]{4,32}$/.test(uid)) {
    return {
      success: false,
      message: `Invalid RFID UID format [${uidInput}]. Expected valid hex card identifier.`,
    };
  }

  const now = options?.customTimestamp ? new Date(options.customTimestamp) : new Date();
  const dateStr = getISTDateStr(now);
  const timeStr = getISTTimeStr(now);
  const db = getFirebaseDatabase();

  // 1. Dynamically resolve RFID card UID (or studentDbId) to authoritative student record
  const resolved = await resolveStudentByAnyId(uid, options?.studentsLookup);
  const student: Student | null = resolved?.student || null;
  const studentDbId = resolved?.studentDbId || '';
  const cardUid = resolved?.rfidUID || uid;

  // 2. Reject unknown RFID cards (never auto-register unknown cards)
  if (!student || !studentDbId) {
    const unknownRecord: AttendanceRecord = stripUndefinedDeep({
      uid,
      studentUID: uid,
      rfidUID: uid,
      studentName: 'UNKNOWN CARD',
      timestamp: now.getTime(),
      date: dateStr,
      time: timeStr,
      status: 'Unknown',
      source: options?.source || 'rfid_scanner',
      device: options?.device || 'ESP32-READER-01',
      notes: 'Card not registered in student database. Access Denied.',
    });

    try {
      const alertRef = ref(db, `unknown_scans/${now.getTime()}`);
      await set(alertRef, unknownRecord);
    } catch (e) {
      console.warn('Could not record unknown scan audit', e);
    }

    return {
      success: false,
      message: `Unknown RFID UID [${uid}]. Card is not registered. Attendance rejected.`,
      record: unknownRecord,
    };
  }

  const studentRef = ref(db, `students/${studentDbId}`);
  const studentAttRef = ref(db, `students/${studentDbId}/attendance/${dateStr}`);

  // 3. Reject inactive student accounts
  if (student.status === 'inactive') {
    return {
      success: false,
      message: `ACCESS DENIED: Student ${student.name} (${cardUid}) account is INACTIVE. Attendance cannot be registered.`,
    };
  }

  // 4. Suspension Check: Prevent suspended students from marking attendance
  if (student.status === 'suspended' || student.isSuspended) {
    const activeSusp = student.activeSuspension;
    if (activeSusp && activeSusp.endDate && dateStr > activeSusp.endDate) {
      student.status = 'active';
      student.isSuspended = false;
      student.activeSuspension = undefined;
      try {
        await update(studentRef, {
          status: 'active',
          isSuspended: false,
          activeSuspension: null,
        });
        await update(ref(db, `suspensions/${studentDbId}/${activeSusp.id}`), {
          status: 'expired',
        });
      } catch (err) {
        console.warn('Auto reactivation notice during scan:', err);
      }
    } else {
      const reasonMsg = activeSusp?.reason || 'Disciplinary suspension in effect.';
      const endMsg = activeSusp?.endDate ? ` until ${activeSusp.endDate}` : '';
      return {
        success: false,
        message: `ACCESS DENIED: Student ${student.name} is currently SUSPENDED${endMsg}. Attendance cannot be registered. Reason: ${reasonMsg}`,
      };
    }
  }

  // 5. Build validated unified record using resolved student metadata
  const studentAuthUid = student.authUid || '';
  const resolvedSource =
    options?.source ||
    (options?.device && /manual|admin/i.test(options.device) ? 'admin_manual' : 'rfid_scanner');

  const record: AttendanceRecord = stripUndefinedDeep({
    uid: cardUid,
    studentUID: cardUid,
    rfidUID: cardUid,
    studentRfid: cardUid,
    studentDbId,
    authUid: studentAuthUid,
    userId: studentAuthUid,
    studentName: student.name,
    studentId: student.studentId,
    rollNumber: student.studentId,
    department: student.department,
    date: dateStr,
    time: timeStr,
    timestamp: now.getTime(),
    status: 'Present',
    source: resolvedSource,
    device: options?.device || 'ESP32-RFID-01',
  });

  const validationError = validateAttendancePayload(record);
  if (validationError) {
    return {
      success: false,
      message: `Validation rejected scan payload: ${validationError}`,
    };
  }

  // 6. Atomic duplicate & admin-override protection via RTDB runTransaction
  let blockedReason: 'overridden' | 'duplicate' | null = null;
  let existingRecordFound: AttendanceRecord | undefined = undefined;

  const txResult = await runRtdbOp('TRANSACTION', `/students/${studentDbId}/attendance/${dateStr}`, () =>
    runTransaction(studentAttRef, (currentVal) => {
      if (currentVal && !currentVal.isDeleted) {
        const existing = currentVal as AttendanceRecord;
        existingRecordFound = existing;
        if (existing.isOverridden && existing.status === 'Absent') {
          blockedReason = 'overridden';
        } else {
          blockedReason = 'duplicate';
        }
        return undefined;
      }
      return record;
    })
  );

  if (!txResult.committed) {
    const existing = existingRecordFound || (txResult.snapshot.val() as AttendanceRecord | undefined);
    if (blockedReason === 'overridden' || (existing?.isOverridden && existing?.status === 'Absent')) {
      return {
        success: false,
        message: `Attendance Locked: Admin manually marked ${student.name} as Absent on ${dateStr} (${existing?.overrideReason || 'Administrative override'}). Subsequent RFID scans cannot override this decision.`,
        record: existing,
      };
    }

    return {
      success: false,
      message: `Duplicate Tap: ${student.name} was already marked ${existing?.status || 'Present'} at ${existing?.time || timeStr}. Duplicate entry prevented.`,
      record: existing,
    };
  }

  // Register date as an institutional working day if not already marked as holiday
  try {
    const wdRef = ref(db, `working_days/${dateStr}`);
    const wdSnap = await get(wdRef);
    if (!wdSnap.exists()) {
      await set(wdRef, {
        date: dateStr,
        isHoliday: false,
        label: 'Institutional Working Day',
        updatedAt: now.getTime(),
      });
    }
  } catch {
    // Non-blocking
  }

  // Update ESP32 device status
  try {
    const devRef = ref(db, `devices/${options?.device || 'ESP32-RFID-01'}`);
    await update(devRef, {
      lastPing: now.getTime(),
      lastScannedUid: cardUid,
      status: 'online',
    });
  } catch {
    // Non-blocking
  }

  return {
    success: true,
    message: `Attendance Recorded: ${student.name} marked Present at ${timeStr}`,
    record,
  };
}

// Refresh Firebase Auth ID token if authentication is near expiration or expired
export async function refreshAdminToken(): Promise<boolean> {
  try {
    const auth = getFirebaseAuth();
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
      return true;
    }
  } catch (e) {
    console.warn('Failed to force refresh admin auth token:', e);
  }
  return false;
}

/**
 * Re-authenticate administrator with their password before executing destructive reset
 */
export async function reverifyAdminPassword(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = getFirebaseAuth();
    if (auth.currentUser && auth.currentUser.email) {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
      await reauthenticateWithCredential(auth.currentUser, credential);
      return { success: true };
    } else {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return { success: true };
    }
  } catch (err: any) {
    console.error('Password re-verification failed:', err);
    let msg = 'Password verification failed. Incorrect password.';
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      msg = 'Incorrect administrator password. Action cancelled.';
    } else if (err.code === 'auth/too-many-requests') {
      msg = 'Too many failed attempts. Action temporarily locked.';
    } else if (err.message) {
      msg = err.message;
    }
    return { success: false, error: msg };
  }
}

/**
 * OPTION A: Reset Attendance Data
 * Strictly deletes ONLY nested attendance under /students/{uid}/attendance, /working_days,
 * /attendance_trash, and /unknown_scans.
 * Preserves all student profiles, RFID UIDs, and Firebase Authentication accounts.
 */
export async function resetAttendanceData(
  adminUid: string,
  adminEmail: string
): Promise<{ success: boolean; message: string }> {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) {
    throw new Error('AUTH_ERROR: No administrator is currently authenticated.');
  }
  const authorizedAdmin = await isUserAdmin(auth.currentUser.uid);
  if (!authorizedAdmin || (auth.currentUser.uid !== adminUid && auth.currentUser.uid !== CONFIGURED_ADMIN_UID)) {
    throw new Error(`UID_MISMATCH: Authenticated user (${auth.currentUser.uid}) is not authorized as Administrator.`);
  }

  const db = getFirebaseDatabase();

  try {
    const studentsSnap = await get(ref(db, 'students'));
    if (studentsSnap.exists()) {
      const studentsVal = studentsSnap.val() as Record<string, any>;
      for (const uid of Object.keys(studentsVal)) {
        try {
          await remove(ref(db, `students/${uid}/attendance`));
        } catch (err) {
          console.warn(`Could not clear attendance for student ${uid}:`, err);
        }
      }
    }

    // Clear working_days, trash, and unknown scans
    try { await remove(ref(db, 'working_days')); } catch {}
    try { await remove(ref(db, 'attendance_trash')); } catch {}
    try { await remove(ref(db, 'unknown_scans')); } catch {}

    // Audit log (non-blocking)
    try {
      const now = Date.now();
      const auditRecord: ResetAuditLog = {
        type: 'ATTENDANCE_RESET',
        adminEmail,
        initiatedByUid: adminUid,
        timestamp: now,
        timestampStr: getISTTimestampDisplay(now),
        description: 'All student attendance records deleted from students/*/attendance. Student profiles and accounts preserved.',
      };
      await set(ref(db, `auditLogs/resets/${now}`), auditRecord);
      await set(ref(db, 'auditLogs/lastReset'), auditRecord);
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      message: 'Attendance records successfully deleted from students/*/attendance. Student directory and accounts remain intact.',
    };
  } catch (err: any) {
    console.error('Firebase remove error on students/*/attendance:', err);
    const code = err.code || 'PERMISSION_DENIED';
    const message = err.message || 'Permission denied clearing student attendance';
    throw new Error(`${code}: ${message}`);
  }
}

/**
 * Register a student account with Firebase Authentication and persist their unified mapping
 * across /students/{studentDbId}, /rfid_to_student/{rfid}, /auth_to_student/{authUid},
 * /users/{authUid}, and Firestore users/{authUid}.
 * Uses a secondary Firebase app instance to avoid logging out the administrator.
 */
export async function registerStudentAccount(
  input: StudentRegistrationInput
): Promise<{ authUid: string; student: Student }> {
  const adminAuth = getFirebaseAuth();
  if (!adminAuth.currentUser) {
    throw new Error('Unauthorized: Must be logged in as Administrator to create student accounts.');
  }

  const trimmedEmail = input.email.trim().toLowerCase();
  const trimmedRfid = input.rfidUID.trim().toUpperCase();
  const trimmedRoll = input.rollNumber.trim();
  const trimmedName = input.name.trim();
  const initialPassword = input.password?.trim() || 'Student@123';

  if (!trimmedRfid || !trimmedName || !trimmedRoll || !trimmedEmail) {
    throw new Error('Please fill in Name, Roll Number, Email, and RFID Card UID.');
  }

  if (initialPassword.length < 6) {
    throw new Error('Student password must be at least 6 characters.');
  }

  const db = getFirebaseDatabase();
  const fs = getFirebaseFirestore();

  // Enforce duplicate prevention across /rfid_to_student and /students
  const idxSnap = await get(ref(db, `rfid_to_student/${trimmedRfid}`));
  if (idxSnap.exists()) {
    const val = idxSnap.val();
    const isActiveIdx = typeof val === 'string' ? true : val?.active !== false;
    if (isActiveIdx) {
      throw new Error(`RFID Card UID ${trimmedRfid} is already registered to an existing student.`);
    }
  }

  const allStudentsSnap = await get(ref(db, 'students'));
  if (allStudentsSnap.exists()) {
    const allStudents = allStudentsSnap.val() as Record<string, Student>;
    for (const [k, st] of Object.entries(allStudents)) {
      if (!st) continue;
      const stRfid = (st.rfidUID || st.uid || k).trim().toUpperCase();
      if (stRfid === trimmedRfid) {
        throw new Error(`A student (${st.name}) is already registered with RFID Card UID: ${trimmedRfid}`);
      }
      if (st.studentId && st.studentId.trim().toUpperCase() === trimmedRoll.toUpperCase()) {
        throw new Error(`A student (${st.name}) is already registered with Roll Number: ${trimmedRoll}`);
      }
    }
  }

  const studentDbId = generateStudentDbId(trimmedRoll);

  // Create Firebase Auth user using isolated secondary app instance
  const config = getActiveFirebaseConfig();
  const secondaryAppName = `student_reg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const secondaryApp = initializeApp(
    {
      ...config,
      apiKey: config.apiKey || import.meta.env.VITE_FIREBASE_API_KEY || PROJECT_FIREBASE_API_KEY,
    },
    secondaryAppName
  );
  const secondaryAuth = getAuth(secondaryApp);

  let authUid = '';
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, trimmedEmail, initialPassword);
    authUid = cred.user.uid;
    await fbSignOut(secondaryAuth);
  } catch (err: any) {
    console.error('Student Firebase Auth creation error:', err);
    let msg = err.message || 'Failed to create student authentication account.';
    if (err.code === 'auth/email-already-in-use') {
      msg = `The email ${trimmedEmail} is already registered in Firebase Authentication.`;
    } else if (err.code === 'auth/weak-password') {
      msg = 'Password is too weak. Please use at least 6 characters.';
    }
    throw new Error(msg);
  } finally {
    try {
      await deleteApp(secondaryApp);
    } catch {
      // Ignore
    }
  }

  const userProfile: UserProfile = stripUndefinedDeep({
    uid: authUid,
    studentDbId,
    name: trimmedName,
    email: trimmedEmail,
    rollNumber: trimmedRoll,
    department: input.department.trim(),
    year: input.year.trim(),
    semester: input.semester.trim(),
    role: 'student',
    rfidUID: trimmedRfid,
    phone: input.phone || '',
    createdAt: Date.now(),
  });

  const studentRecord: Student = stripUndefinedDeep({
    studentDbId,
    uid: trimmedRfid,
    rfidUID: trimmedRfid,
    name: trimmedName,
    studentId: trimmedRoll,
    department: input.department.trim(),
    year: input.year.trim(),
    semester: input.semester.trim(),
    email: trimmedEmail,
    phone: input.phone || '',
    status: 'active',
    registeredAt: new Date().toISOString(),
    authUid,
  });

  // Persist universal bidirectional mappings across RTDB & Firestore
  await runRtdbOp('SET', `/students/${studentDbId}`, () =>
    set(ref(db, `students/${studentDbId}`), studentRecord)
  );
  await runRtdbOp('SET', `/users/${authUid}`, () =>
    set(ref(db, `users/${authUid}`), userProfile)
  );
  await runRtdbOp('SET', `/auth_to_student/${authUid}`, () =>
    set(
      ref(db, `auth_to_student/${authUid}`),
      stripUndefinedDeep({
        authUid,
        studentDbId,
        rfidUID: trimmedRfid,
        rollNumber: trimmedRoll,
        email: trimmedEmail,
        updatedAt: Date.now(),
      })
    )
  );
  await runRtdbOp('SET', `/rfid_to_student/${trimmedRfid}`, () =>
    set(
      ref(db, `rfid_to_student/${trimmedRfid}`),
      stripUndefinedDeep({
        rfidUID: trimmedRfid,
        studentDbId,
        authUid,
        rollNumber: trimmedRoll,
        active: true,
        updatedAt: Date.now(),
      })
    )
  );

  try {
    await set(ref(db, `rfid_to_uid/${trimmedRfid}`), authUid);
  } catch {
    // Non-blocking legacy index sync
  }

  try {
    await withTimeout(setDoc(doc(fs, 'users', authUid), userProfile, { merge: true }), 3000, null);
  } catch (fsErr) {
    console.warn('Notice syncing new student profile to Firestore:', fsErr);
  }

  return { authUid, student: studentRecord };
}

/**
 * Helper to race any promise against a timeout, avoiding hangs
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallbackValue);
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function withTimeoutReject<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export class RtdbOperationError extends Error {
  operation: string;
  path: string;
  code: string;

  constructor(operation: string, path: string, code: string, originalMessage: string) {
    super(`[${code}] ${operation} failed at path "${path}": ${originalMessage}`);
    this.name = 'RtdbOperationError';
    this.operation = operation;
    this.path = path;
    this.code = code;
  }
}

async function runRtdbOp<T>(operation: string, path: string, fn: () => Promise<T>): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  try {
    return await fn();
  } catch (err: any) {
    if (err instanceof RtdbOperationError) throw err;
    const rawMsg = err?.message || String(err || 'Unknown Firebase error');
    const code =
      err?.code ||
      (/permission_denied|permission denied/i.test(rawMsg) ? 'PERMISSION_DENIED' : 'FIREBASE_ERROR');
    throw new RtdbOperationError(operation, normalizedPath, code, rawMsg);
  }
}

/**
 * Checks whether the given Firebase Auth UID is an authorized Administrator
 * via either the bootstrap admin UID or a verified role === 'admin' in RTDB /users or Firestore users.
 */
export async function isUserAdmin(authUid?: string | null): Promise<boolean> {
  if (!authUid) return false;
  if (authUid === CONFIGURED_ADMIN_UID) return true;

  try {
    const db = getFirebaseDatabase();
    const uSnap = await withTimeout(get(ref(db, `users/${authUid}/role`)), 2500, null);
    if (uSnap && uSnap.exists && uSnap.exists() && uSnap.val() === 'admin') {
      return true;
    }
  } catch {}

  try {
    const fs = getFirebaseFirestore();
    const docSnap = await withTimeout(getDoc(doc(fs, 'users', authUid)), 2500, null);
    if (docSnap && docSnap.exists && docSnap.exists() && docSnap.data()?.role === 'admin') {
      return true;
    }
  } catch {}

  return false;
}

/**
 * Verifies live Firebase Authentication session, administrator role/UID match, and active ID token.
 */
export async function verifyAdministratorAuth(): Promise<{
  uid: string;
  email: string | null;
  tokenVerified: boolean;
}> {
  const auth = getFirebaseAuth();
  const fbUser = auth.currentUser;

  if (!fbUser) {
    throw new RtdbOperationError(
      'AUTH_CHECK',
      '/auth/currentUser',
      'UNAUTHENTICATED',
      'No authenticated Firebase user session found. Please sign in as Administrator.'
    );
  }

  const adminAuthorized = await isUserAdmin(fbUser.uid);
  if (!adminAuthorized) {
    throw new RtdbOperationError(
      'AUTH_UID_CHECK',
      `/users/${fbUser.uid}`,
      'UNAUTHORIZED_UID',
      `Authenticated UID "${fbUser.uid}" does not have Administrator authorization.`
    );
  }

  let tokenVerified = false;
  try {
    const freshToken = await withTimeoutReject(fbUser.getIdToken(true), 5000, 'ID token refresh timed out');
    tokenVerified = Boolean(freshToken);
  } catch {
    const cachedToken = await withTimeout(fbUser.getIdToken(false), 3000, '');
    tokenVerified = Boolean(cachedToken);
  }

  if (!tokenVerified) {
    throw new RtdbOperationError(
      'AUTH_TOKEN_REFRESH',
      '/auth/token',
      'AUTH_TOKEN_INVALID',
      'Unable to obtain a valid Firebase Authentication ID token.'
    );
  }

  return {
    uid: fbUser.uid,
    email: fbUser.email,
    tokenVerified,
  };
}

/**
 * Admin-only dynamic reconciliation: links existing and newly registered students
 * across /students/{studentDbId}, /rfid_to_student/{rfid}, /auth_to_student/{authUid},
 * /users/{authUid}, and Firestore users/{authUid}.
 * - Preserves all existing student data and RFID assignments.
 * - Never guesses mappings when multiple candidates match.
 */
export async function reconcileAllStudentMappings(
  studentsMapOverride?: Record<string, Student>
): Promise<{ linkedCount: number; ambiguousStudents: string[] }> {
  const ambiguousStudents: string[] = [];
  try {
    const auth = getFirebaseAuth();
    if (!auth.currentUser) {
      return { linkedCount: 0, ambiguousStudents };
    }
    const adminAuthorized = await isUserAdmin(auth.currentUser.uid);
    if (!adminAuthorized) {
      return { linkedCount: 0, ambiguousStudents };
    }

    const db = getFirebaseDatabase();
    const fs = getFirebaseFirestore();
    let linkedCount = 0;

    let studentsMap = studentsMapOverride;
    if (!studentsMap) {
      const sSnap = await withTimeout(get(ref(db, 'students')), 4000, null);
      studentsMap = (sSnap && sSnap.exists && sSnap.exists() ? sSnap.val() : {}) as Record<string, Student>;
    }

    // Collect known user accounts dynamically from RTDB /users, /auth_to_student, /rfid_to_uid, and Firestore users
    const userRecordsByAuthUid: Record<string, Partial<UserProfile>> = {};
    const authToStudentMap: Record<string, any> = {};
    const rfidToUidMap: Record<string, string> = {};

    try {
      const rtdbUsersSnap = await withTimeout(get(ref(db, 'users')), 3000, null);
      if (rtdbUsersSnap && rtdbUsersSnap.exists && rtdbUsersSnap.exists()) {
        const uVal = rtdbUsersSnap.val() as Record<string, Partial<UserProfile>>;
        Object.entries(uVal || {}).forEach(([uid, u]) => {
          if (u && uid !== CONFIGURED_ADMIN_UID && u.role !== 'admin') {
            userRecordsByAuthUid[uid] = { ...u, uid };
          }
        });
      }
    } catch {}

    try {
      const a2sSnap = await withTimeout(get(ref(db, 'auth_to_student')), 3000, null);
      if (a2sSnap && a2sSnap.exists && a2sSnap.exists()) {
        const aVal = a2sSnap.val() as Record<string, any>;
        Object.entries(aVal || {}).forEach(([uid, m]) => {
          if (!m) return;
          authToStudentMap[uid] = m;
          if (uid !== CONFIGURED_ADMIN_UID) {
            userRecordsByAuthUid[uid] = {
              ...(userRecordsByAuthUid[uid] || {}),
              uid,
              studentDbId: userRecordsByAuthUid[uid]?.studentDbId || m.studentDbId,
              rfidUID: userRecordsByAuthUid[uid]?.rfidUID || m.rfidUID,
              rollNumber: userRecordsByAuthUid[uid]?.rollNumber || m.rollNumber,
              email: userRecordsByAuthUid[uid]?.email || m.email,
              role: 'student',
            };
          }
        });
      }
    } catch {}

    try {
      const r2uSnap = await withTimeout(get(ref(db, 'rfid_to_uid')), 2500, null);
      if (r2uSnap && r2uSnap.exists && r2uSnap.exists()) {
        const rVal = r2uSnap.val() as Record<string, any>;
        Object.entries(rVal || {}).forEach(([rfid, val]) => {
          const authUid = typeof val === 'string' ? val : val?.authUid;
          if (authUid && typeof authUid === 'string') {
            rfidToUidMap[rfid.trim().toUpperCase()] = authUid.trim();
          }
        });
      }
    } catch {}

    try {
      const fsSnap = await withTimeout(getDocs(collection(fs, 'users')), 3000, null);
      if (fsSnap && fsSnap.docs) {
        fsSnap.docs.forEach((d) => {
          const data = d.data() as Partial<UserProfile>;
          if (data && d.id !== CONFIGURED_ADMIN_UID && data.role !== 'admin') {
            userRecordsByAuthUid[d.id] = {
              ...(userRecordsByAuthUid[d.id] || {}),
              ...data,
              uid: d.id,
            };
          }
        });
      }
    } catch {}

    const findMatchingAuthCandidates = (st: Student, dbKey: string, rfid: string): string[] => {
      if (st.authUid && st.authUid.trim()) {
        return [st.authUid.trim()];
      }
      const candidates = new Set<string>();
      if (rfidToUidMap[rfid] && rfidToUidMap[rfid] !== CONFIGURED_ADMIN_UID) {
        candidates.add(rfidToUidMap[rfid]);
      }
      const stEmail = (st.email || '').trim().toLowerCase();
      const stRoll = (st.studentId || '').trim().toUpperCase();
      for (const [authUid, u] of Object.entries(userRecordsByAuthUid)) {
        if (!authUid || authUid === CONFIGURED_ADMIN_UID || u.role === 'admin') continue;
        const uEmail = (u.email || '').trim().toLowerCase();
        const uRoll = (u.rollNumber || '').trim().toUpperCase();
        const uRfid = (u.rfidUID || '').trim().toUpperCase();
        if (
          (u.studentDbId && u.studentDbId === dbKey) ||
          (uRfid && uRfid === rfid) ||
          (stEmail && uEmail && stEmail === uEmail) ||
          (stRoll && uRoll && stRoll === uRoll)
        ) {
          candidates.add(authUid);
        }
      }
      return Array.from(candidates);
    };

    for (const [dbKey, st] of Object.entries(studentsMap || {})) {
      if (!st || typeof st !== 'object') continue;
      const rfidUID = (st.rfidUID || st.uid || dbKey).trim().toUpperCase();
      const candidates = findMatchingAuthCandidates(st, dbKey, rfidUID);

      if (candidates.length > 1) {
        // Never guess when multiple Auth UIDs match the same student
        ambiguousStudents.push(dbKey);
      }

      const resolvedAuthUid = candidates.length === 1 ? candidates[0] : (st.authUid || '').trim();

      const studentUpdates: Record<string, any> = {};
      if (!st.studentDbId) studentUpdates.studentDbId = dbKey;
      if (!st.rfidUID && rfidUID) studentUpdates.rfidUID = rfidUID;
      if (!st.uid && rfidUID) studentUpdates.uid = rfidUID;
      if (resolvedAuthUid && !st.authUid) {
        studentUpdates.authUid = resolvedAuthUid;
      }

      if (Object.keys(studentUpdates).length > 0) {
        await update(ref(db, `students/${dbKey}`), stripUndefinedDeep(studentUpdates)).catch(() => {});
      }

      await update(
        ref(db, `rfid_to_student/${rfidUID}`),
        stripUndefinedDeep({
          rfidUID,
          studentDbId: dbKey,
          authUid: resolvedAuthUid || '',
          rollNumber: st.studentId || '',
          active: st.status !== 'inactive',
          updatedAt: Date.now(),
        })
      ).catch(() => {});

      if (resolvedAuthUid) {
        const existingU = userRecordsByAuthUid[resolvedAuthUid] || {};
        const profilePayload: UserProfile = stripUndefinedDeep({
          uid: resolvedAuthUid,
          studentDbId: dbKey,
          name: st.name || existingU.name || 'Student',
          email: (st.email || existingU.email || '').trim().toLowerCase(),
          rollNumber: st.studentId || existingU.rollNumber || '',
          department: st.department || existingU.department || '',
          year: st.year || existingU.year || '',
          semester: st.semester || existingU.semester || 'Semester 1',
          role: existingU.role === 'admin' ? 'admin' : 'student',
          rfidUID,
          phone: st.phone || existingU.phone || '',
          createdAt: existingU.createdAt || Date.now(),
        });

        await update(ref(db, `users/${resolvedAuthUid}`), profilePayload).catch(() => {});
        await set(
          ref(db, `auth_to_student/${resolvedAuthUid}`),
          stripUndefinedDeep({
            authUid: resolvedAuthUid,
            studentDbId: dbKey,
            rfidUID,
            rollNumber: st.studentId || '',
            email: profilePayload.email,
            updatedAt: Date.now(),
          })
        ).catch(() => {});
        await update(ref(db, `rfid_to_uid/${rfidUID}`), { authUid: resolvedAuthUid }).catch(() => {});
        await withTimeout(
          setDoc(doc(fs, 'users', resolvedAuthUid), profilePayload, { merge: true }),
          2000,
          null
        ).catch(() => {});
        linkedCount++;
      }
    }

    return { linkedCount, ambiguousStudents };
  } catch (err) {
    console.warn('Reconcile student mappings notice:', err);
    return { linkedCount: 0, ambiguousStudents };
  }
}

/**
 * Fetch user profile dynamically using the strict 7-step flow:
 * 1. Read /users/{authUid} and /auth_to_student/{authUid} (and Firestore users/{authUid})
 * 2. Distinguish PERMISSION_DENIED vs non-existent profile (missing profile returns null)
 * 3. Verify role ('admin' or 'student') separately
 * 4. For students, retrieve verified studentDbId and read /students/{studentDbId}
 */
export async function getUserProfile(
  authUid: string,
  email?: string | null
): Promise<UserProfile | null> {
  const normalizedEmail = email?.trim().toLowerCase();
  const db = getFirebaseDatabase();
  const fs = getFirebaseFirestore();

  // 1. Bootstrap Administrator: still verify/ensure /users/{adminUid} exists cleanly
  if (authUid === CONFIGURED_ADMIN_UID) {
    const adminProfile: UserProfile = {
      uid: authUid,
      name: 'System Administrator',
      email: normalizedEmail || 'admin@rfidportal.com',
      rollNumber: 'ADMIN-01',
      department: 'System Administration',
      year: 'Staff',
      semester: 'N/A',
      role: 'admin',
      rfidUID: '',
      createdAt: Date.now(),
    };
    try {
      const existingAdminSnap = await withTimeout(get(ref(db, `users/${authUid}`)), 2500, null);
      if (!existingAdminSnap || !existingAdminSnap.exists || !existingAdminSnap.exists() || existingAdminSnap.val()?.role !== 'admin') {
        await withTimeout(update(ref(db, `users/${authUid}`), stripUndefinedDeep(adminProfile)), 2500, null);
      }
    } catch {}
    try {
      withTimeout(setDoc(doc(fs, 'users', authUid), adminProfile, { merge: true }), 2000, null).catch(() => {});
    } catch {}
    return adminProfile;
  }

  let authMapping: Record<string, any> | null = null;
  let rtdbProfile: Partial<UserProfile> | null = null;
  let firestoreProfile: Partial<UserProfile> | null = null;
  const permissionDeniedPaths: string[] = [];
  let authExpiredDiag: { diag: DbDiagnosticState; path: string } | null = null;
  let networkErrorDiag: { diag: DbDiagnosticState; path: string } | null = null;

  // 2a. Read /users/{authUid} (primary user profile & role source)
  try {
    const userSnap = await withTimeoutReject(
      get(ref(db, `users/${authUid}`)),
      4500,
      `Timed out reading /users/${authUid}`
    );
    if (userSnap.exists()) {
      rtdbProfile = userSnap.val() as Partial<UserProfile>;
    }
  } catch (err: any) {
    const diag = classifyFirebaseError(err);
    const p = `/users/${authUid}`;
    if (diag.code === 'auth_expired') {
      authExpiredDiag = { diag, path: p };
    } else if (diag.code === 'permission_denied') {
      permissionDeniedPaths.push(p);
    } else if (diag.code === 'disconnected') {
      networkErrorDiag = { diag, path: p };
    }
  }

  // 2b. Read /auth_to_student/{authUid} (authoritative student mapping source)
  try {
    const mapSnap = await withTimeoutReject(
      get(ref(db, `auth_to_student/${authUid}`)),
      4000,
      `Timed out reading /auth_to_student/${authUid}`
    );
    if (mapSnap.exists()) {
      authMapping = mapSnap.val();
    }
  } catch (err: any) {
    const diag = classifyFirebaseError(err);
    const p = `/auth_to_student/${authUid}`;
    if (diag.code === 'auth_expired' && !authExpiredDiag) {
      authExpiredDiag = { diag, path: p };
    } else if (diag.code === 'permission_denied') {
      permissionDeniedPaths.push(p);
    } else if (diag.code === 'disconnected' && !networkErrorDiag) {
      networkErrorDiag = { diag, path: p };
    }
  }

  // 2c. Read Firestore users/{authUid} (secondary mirror, strictly owner-readable)
  try {
    const docRef = doc(fs, 'users', authUid);
    const docSnap = await withTimeoutReject(getDoc(docRef), 4000, 'Timed out reading Firestore profile');
    if (docSnap.exists()) {
      const data = docSnap.data();
      firestoreProfile = {
        uid: authUid,
        studentDbId: data.studentDbId || '',
        email: data.email || normalizedEmail || '',
        role: data.role || 'student',
        name: data.name || data.displayName || '',
        rollNumber: data.rollNumber || data.studentId || '',
        rfidUID: (data.rfidUID || '').toString().trim().toUpperCase(),
        department: data.department || '',
        year: data.year || '',
        semester: data.semester || '',
        phone: data.phone || '',
        createdAt: data.createdAt || Date.now(),
      };
    }
  } catch (fsErr: any) {
    const diag = classifyFirebaseError(fsErr);
    const p = `firestore/users/${authUid}`;
    if (diag.code === 'auth_expired' && !authExpiredDiag) {
      authExpiredDiag = { diag, path: p };
    } else if (diag.code === 'permission_denied') {
      permissionDeniedPaths.push(p);
    }
  }

  // If no profile source returned data, prioritize Auth Expiration -> Permission Denied -> Network -> Missing Profile (null)
  const hasAnyProfile = Boolean(authMapping || rtdbProfile || firestoreProfile);
  if (!hasAnyProfile) {
    if (authExpiredDiag) {
      throw new AuthProfileError(
        'auth_expired',
        `${authExpiredDiag.diag.message} (Path: ${authExpiredDiag.path})`,
        authExpiredDiag.path,
        'GET'
      );
    }
    if (permissionDeniedPaths.length > 0) {
      const primaryPath = permissionDeniedPaths.find((p) => p.startsWith('/users/')) || permissionDeniedPaths[0];
      throw new AuthProfileError(
        'permission_denied',
        `Permission denied (Path: ${primaryPath}). Verify Firebase Realtime Database Rules grant authenticated users read access to their own /users/{auth.uid} and /auth_to_student/{auth.uid} profile.`,
        primaryPath,
        'GET'
      );
    }
    if (networkErrorDiag) {
      throw new AuthProfileError(
        'disconnected',
        `${networkErrorDiag.diag.message} (Path: ${networkErrorDiag.path})`,
        networkErrorDiag.path,
        'GET'
      );
    }
    // All readable paths explicitly returned non-existent (!exists()) -> missing profile
    return null;
  }

  // 3. Role verification: Admin accounts do NOT require studentDbId / RFID mapping
  const mergedRole: UserRole =
    rtdbProfile?.role === 'admin' || firestoreProfile?.role === 'admin' ? 'admin' : 'student';

  if (mergedRole === 'admin') {
    return {
      uid: authUid,
      name: rtdbProfile?.name || firestoreProfile?.name || 'Administrator',
      email: rtdbProfile?.email || firestoreProfile?.email || normalizedEmail || '',
      rollNumber: rtdbProfile?.rollNumber || firestoreProfile?.rollNumber || 'ADMIN',
      department: rtdbProfile?.department || firestoreProfile?.department || 'System Administration',
      year: rtdbProfile?.year || firestoreProfile?.year || 'Staff',
      semester: rtdbProfile?.semester || firestoreProfile?.semester || 'N/A',
      role: 'admin',
      rfidUID: '',
      createdAt: rtdbProfile?.createdAt || firestoreProfile?.createdAt || Date.now(),
    };
  }

  // 4. Student role: retrieve verified studentDbId and rfidUID
  let studentDbId = (
    authMapping?.studentDbId ||
    rtdbProfile?.studentDbId ||
    firestoreProfile?.studentDbId ||
    ''
  ).toString().trim();

  let rfidUID = (
    authMapping?.rfidUID ||
    rtdbProfile?.rfidUID ||
    firestoreProfile?.rfidUID ||
    ''
  ).toString().trim().toUpperCase();

  if (!studentDbId && rfidUID) {
    studentDbId = rfidUID;
  }

  if (!studentDbId) {
    throw new AuthProfileError(
      'mapping_missing',
      'Your Firebase account is authenticated, but your Student Database ID and RFID Card mapping are missing. Ask an administrator to link your account.',
      `/users/${authUid}`,
      'GET'
    );
  }

  // 5. Retrieve student profile from /students/{studentDbId} using scoped direct read
  let studentNode: Student | null = null;
  try {
    const studentSnap = await withTimeoutReject(
      get(ref(db, `students/${studentDbId}`)),
      4500,
      `Timed out reading /students/${studentDbId}`
    );
    if (!studentSnap.exists()) {
      throw new AuthProfileError(
        'not_registered',
        `Student profile not registered (Path: /students/${studentDbId}). Contact your administrator.`,
        `/students/${studentDbId}`,
        'GET'
      );
    }
    studentNode = studentSnap.val() as Student;
    rfidUID = (studentNode.rfidUID || studentNode.uid || rfidUID || studentDbId).trim().toUpperCase();
  } catch (stuErr: any) {
    if (stuErr instanceof AuthProfileError) {
      throw stuErr;
    }
    const diag = classifyFirebaseError(stuErr);
    if (diag.code === 'auth_expired' || diag.code === 'permission_denied' || diag.code === 'disconnected') {
      throw new AuthProfileError(
        diag.code,
        `${diag.message} (Path: /students/${studentDbId})`,
        `/students/${studentDbId}`,
        'GET'
      );
    }
    throw stuErr;
  }

  return {
    uid: authUid,
    studentDbId,
    name: studentNode?.name || rtdbProfile?.name || firestoreProfile?.name || 'Student',
    email: studentNode?.email || rtdbProfile?.email || firestoreProfile?.email || normalizedEmail || '',
    rollNumber:
      studentNode?.studentId ||
      authMapping?.rollNumber ||
      rtdbProfile?.rollNumber ||
      firestoreProfile?.rollNumber ||
      '',
    department: studentNode?.department || rtdbProfile?.department || firestoreProfile?.department || '',
    year: studentNode?.year || rtdbProfile?.year || firestoreProfile?.year || '',
    semester: studentNode?.semester || rtdbProfile?.semester || firestoreProfile?.semester || 'Semester 1',
    role: 'student',
    rfidUID,
    phone: studentNode?.phone || rtdbProfile?.phone || firestoreProfile?.phone || '',
    createdAt: rtdbProfile?.createdAt || firestoreProfile?.createdAt || Date.now(),
  };
}

/**
 * Update authenticated user password
 */
export async function updateUserPassword(newPassword: string): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) throw new Error('No user is currently authenticated.');
  await updatePassword(auth.currentUser, newPassword);
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, email.trim());
}

export interface StudentSubscriptionTarget {
  studentDbId?: string;
  rfidUID: string;
  authUid?: string;
  studentId?: string;
  email?: string;
}

/**
 * Resolves student metadata dynamically from live cachedStudentsMap using any identifier
 * (studentDbId, RFID UID, studentId, authUid, email, or name). Zero hardcoded entries.
 */
export function lookupStudentInfo(identifier: string): {
  studentDbId: string;
  name: string;
  studentId: string;
  rfidUID: string;
  authUid: string;
  department: string;
  email?: string;
} | null {
  if (!identifier) return null;
  const raw = identifier.trim();
  const clean = raw.toUpperCase();
  const lower = raw.toLowerCase();

  const direct = cachedStudentsMap[raw] || cachedStudentsMap[clean];
  if (direct) {
    const studentDbId = (direct.studentDbId || (cachedStudentsMap[raw] ? raw : clean)).trim();
    return {
      studentDbId,
      name: direct.name,
      studentId: direct.studentId,
      rfidUID: (direct.rfidUID || direct.uid || '').trim().toUpperCase(),
      authUid: direct.authUid || '',
      department: direct.department,
      email: direct.email,
    };
  }

  for (const [dbKey, s] of Object.entries(cachedStudentsMap)) {
    if (!s) continue;
    const stDbId = (s.studentDbId || dbKey).trim();
    const stRfid = (s.rfidUID || s.uid || '').trim().toUpperCase();
    if (
      stDbId === raw ||
      stDbId.toUpperCase() === clean ||
      stRfid === clean ||
      (s.studentId && s.studentId.trim().toUpperCase() === clean) ||
      (s.authUid && s.authUid === raw) ||
      (s.email && s.email.trim().toLowerCase() === lower) ||
      (s.name && s.name.trim().toLowerCase() === lower)
    ) {
      return {
        studentDbId: stDbId,
        name: s.name,
        studentId: s.studentId,
        rfidUID: stRfid,
        authUid: s.authUid || '',
        department: s.department,
        email: s.email,
      };
    }
  }

  return null;
}

/**
 * Normalizes an attendance record from Firebase RTDB or Firestore.
 */
export function normalizeAttendanceRecord(
  rawRecord: any,
  dateKey: string,
  rfidKey: string,
  explicitStudentDbId?: string
): AttendanceRecord {
  const rawRfid = (rawRecord?.rfidUID || rawRecord?.uid || rawRecord?.studentRfid || rfidKey || '')
    .toString()
    .trim()
    .toUpperCase();
  const rawDbId = (explicitStudentDbId || rawRecord?.studentDbId || '').toString().trim();
  const rawStudentId = (rawRecord?.studentId || rawRecord?.rollNumber || '').toString().trim();
  const rawAuthUid = rawRecord?.authUid || rawRecord?.userId || '';
  const rawName = (rawRecord?.studentName || rawRecord?.name || '').toString().trim();

  const student =
    (rawDbId ? lookupStudentInfo(rawDbId) : null) ||
    lookupStudentInfo(rawRfid) ||
    lookupStudentInfo(rawStudentId) ||
    lookupStudentInfo(rawAuthUid) ||
    (rawName ? lookupStudentInfo(rawName) : null);

  const studentDbId = student?.studentDbId || rawDbId || rawRfid;
  const studentId = student?.studentId || rawStudentId || '';
  const rfidUID = student?.rfidUID || rawRfid;
  const studentName = student?.name || rawName || (rfidUID ? `Student (${rfidUID})` : 'Student');
  const authUid = student?.authUid || rawAuthUid;
  const department = student?.department || rawRecord?.department || '';

  const recordDate = rawRecord?.date || dateKey;
  const recordTime = rawRecord?.time || rawRecord?.checkInTime || '00:00:00';

  let timestampNum = Date.now();
  if (typeof rawRecord?.timestamp === 'number') {
    if (rawRecord.timestamp > 1500000000000) {
      timestampNum = rawRecord.timestamp;
    } else if (rawRecord.timestamp > 1000000000 && rawRecord.timestamp < 10000000000) {
      timestampNum = rawRecord.timestamp * 1000;
    } else if (recordDate && recordTime && recordTime !== '00:00:00') {
      const parsed = new Date(`${recordDate}T${recordTime}`).getTime();
      if (!isNaN(parsed) && parsed > 0) {
        timestampNum = parsed;
      }
    }
  } else if (typeof rawRecord?.timestamp?.toMillis === 'function') {
    timestampNum = rawRecord.timestamp.toMillis();
  } else if (typeof rawRecord?.timestamp?.toDate === 'function') {
    timestampNum = rawRecord.timestamp.toDate().getTime();
  } else if (recordDate && recordTime && recordTime !== '00:00:00') {
    const parsed = new Date(`${recordDate}T${recordTime}`).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      timestampNum = parsed;
    }
  }

  return {
    ...(rawRecord || {}),
    studentDbId,
    uid: rfidUID,
    studentUID: rfidUID,
    rfidUID,
    studentRfid: rfidUID,
    authUid,
    userId: authUid,
    studentName,
    studentId,
    rollNumber: studentId,
    department,
    date: recordDate,
    time: recordTime,
    timestamp: timestampNum,
    status: (rawRecord?.status as any) || 'Present',
    source:
      rawRecord?.source ||
      (rawRecord?.isOverridden
        ? 'admin_override'
        : rawRecord?.lastModifiedBy
        ? 'admin_edit'
        : rawRecord?.device && /manual|admin/i.test(rawRecord.device)
        ? 'admin_manual'
        : 'rfid_scanner'),
    device: rawRecord?.device || rawRecord?.readerDevice || 'ESP32-RFID-01',
    notes: rawRecord?.notes || '',
  };
}

export interface CentralAttendanceUserTarget {
  role: UserRole;
  uid: string;
  studentDbId?: string;
  studentId?: string;
  rollNumber?: string;
  rfidUID?: string;
  email?: string | null;
  displayName?: string;
}

/**
 * Unified Attendance Subscription for Admin and Student Portals.
 * Admin: subscribes to /students.
 * Student: subscribes strictly to /students/{studentDbId} + /working_days.
 */
export function subscribeToCentralAttendance(
  user: CentralAttendanceUserTarget,
  onAttendanceUpdate: (
    allAttendance: Record<string, Record<string, AttendanceRecord>>,
    todayAttendance: Record<string, AttendanceRecord>
  ) => void,
  onError?: (error: Error) => void
): () => void {
  const unsubs: (() => void)[] = [];
  const db = getFirebaseDatabase();

  if (user.role === 'admin') {
    const unsubStudents = subscribeToStudents(
      (studentsMap) => {
        const istToday = getISTDateStr();
        const allMap: Record<string, Record<string, AttendanceRecord>> = {};
        const todayMap: Record<string, AttendanceRecord> = {};
        const discoveredDates = new Set<string>();

        Object.entries(studentsMap || {}).forEach(([dbKey, st]) => {
          if (!st || !st.attendance) return;
          const studentDbId = (st.studentDbId || dbKey).trim();
          const cardUid = (st.rfidUID || st.uid || dbKey).trim().toUpperCase();
          Object.entries(st.attendance).forEach(([dateKey, rawRec]) => {
            if (!rawRec || rawRec.isDeleted) return;
            discoveredDates.add(dateKey);
            const rec = normalizeAttendanceRecord(
              {
                ...rawRec,
                studentDbId,
                studentName: rawRec.studentName || st.name,
                studentId: rawRec.studentId || st.studentId,
                department: rawRec.department || st.department,
                authUid: rawRec.authUid || st.authUid,
              },
              dateKey,
              cardUid,
              studentDbId
            );
            if (!allMap[dateKey]) allMap[dateKey] = {};
            allMap[dateKey][studentDbId] = rec;
            if (dateKey === istToday) {
              todayMap[studentDbId] = rec;
            }
          });
        });

        if (discoveredDates.size > 0) {
          syncWorkingDaysFromDates(Array.from(discoveredDates)).catch(() => {});
        }

        onAttendanceUpdate(allMap, todayMap);
      },
      (error) => {
        console.warn('Admin unified students attendance subscription notice:', error);
        onError?.(error);
      }
    );
    unsubs.push(unsubStudents);
  } else {
    const studentDbId = (user.studentDbId || user.rfidUID || '').trim();
    const fallbackRfid = (user.rfidUID || studentDbId).trim().toUpperCase();

    if (!studentDbId) {
      onError?.(
        new AuthProfileError(
          'mapping_missing',
          'Student Database ID mapping missing for your account. Contact Administrator.'
        )
      );
      return () => {};
    }

    let currentStudentData: Student | null = null;
    let currentWorkingDays: Record<string, WorkingDayConfig> = {};

    const emitStudentState = () => {
      const istToday = getISTDateStr();
      const personalMap: Record<string, Record<string, AttendanceRecord>> = {};
      const todayMap: Record<string, AttendanceRecord> = {};

      Object.keys(currentWorkingDays || {}).forEach((d) => {
        if (!currentWorkingDays[d]?.isHoliday && d <= istToday) {
          personalMap[d] = {};
        }
      });

      const activeRfid = (
        currentStudentData?.rfidUID ||
        currentStudentData?.uid ||
        fallbackRfid
      ).trim().toUpperCase();
      const attObj = currentStudentData?.attendance || {};

      Object.entries(attObj).forEach(([dateKey, rawRec]) => {
        if (!rawRec || rawRec.isDeleted) return;
        const rec = normalizeAttendanceRecord(
          {
            ...rawRec,
            studentDbId,
            studentName: rawRec.studentName || currentStudentData?.name || user.displayName,
            studentId: rawRec.studentId || currentStudentData?.studentId || user.studentId,
            department: rawRec.department || currentStudentData?.department,
            authUid: rawRec.authUid || currentStudentData?.authUid || user.uid,
          },
          dateKey,
          activeRfid,
          studentDbId
        );

        if (!personalMap[dateKey]) personalMap[dateKey] = {};
        personalMap[dateKey][studentDbId] = rec;

        if (dateKey === istToday) {
          todayMap[studentDbId] = rec;
        }
      });

      onAttendanceUpdate(personalMap, todayMap);
    };

    const studentNodeRef = ref(db, `students/${studentDbId}`);
    const unsubStudent = onValue(
      studentNodeRef,
      (snap: DataSnapshot) => {
        if (!snap.exists()) {
          currentStudentData = null;
          onError?.(
            new AuthProfileError(
              'not_registered',
              `Student record not found at /students/${studentDbId}.`
            )
          );
          emitStudentState();
          return;
        }
        const val = snap.val() as Student;
        const activeRfid = (val.rfidUID || val.uid || fallbackRfid).trim().toUpperCase();
        const normalizedStudent: Student = {
          ...val,
          studentDbId,
          rfidUID: activeRfid,
          uid: activeRfid,
        };
        cachedStudentsMap[studentDbId] = normalizedStudent;
        currentStudentData = normalizedStudent;
        emitStudentState();
      },
      (err) => {
        console.warn(`Student unified node listener error (students/${studentDbId}):`, err?.message);
        onError?.(
          new RtdbOperationError(
            'ON_VALUE',
            `/students/${studentDbId}`,
            (err as any)?.code || 'PERMISSION_DENIED',
            err?.message || 'Permission denied reading student node'
          )
        );
      }
    );
    unsubs.push(() => off(studentNodeRef, 'value', unsubStudent));

    const unsubWorkingDays = subscribeToWorkingDays(
      (wd) => {
        currentWorkingDays = wd || {};
        emitStudentState();
      },
      () => {
        // Non-blocking if working_days not yet accessible
      }
    );
    unsubs.push(unsubWorkingDays);
  }

  return () => {
    unsubs.forEach((unsub) => {
      try {
        unsub();
      } catch {}
    });
  };
}

/**
 * Direct on-demand re-fetch from Firebase Unified Students Tree (students/{studentDbId}/attendance/{DATE}).
 */
export async function fetchDirectAttendance(
  user: CentralAttendanceUserTarget
): Promise<{
  allAttendance: Record<string, Record<string, AttendanceRecord>>;
  todayAttendance: Record<string, AttendanceRecord>;
  recordCount: number;
  studentNode?: Student | null;
  workingDays?: Record<string, WorkingDayConfig>;
}> {
  const db = getFirebaseDatabase();
  const istToday = getISTDateStr();
  const studentDbId = (user.studentDbId || user.rfidUID || '').trim();
  const fallbackRfid = (user.rfidUID || studentDbId).trim().toUpperCase();

  const allMap: Record<string, Record<string, AttendanceRecord>> = {};
  const todayMap: Record<string, AttendanceRecord> = {};
  let workingDays: Record<string, WorkingDayConfig> = {};
  let recordCount = 0;
  let studentNode: Student | null = null;

  try {
    const wdSnap = await withTimeout(get(ref(db, 'working_days')), 2500, null);
    if (wdSnap && wdSnap.exists && wdSnap.exists()) {
      workingDays = wdSnap.val() || {};
    }
  } catch {}

  if (user.role === 'admin') {
    const snap = await runRtdbOp('GET', '/students', () =>
      withTimeoutReject(get(ref(db, 'students')), 6000, 'Timed out reading /students')
    );
    if (snap.exists()) {
      const studentsMap = snap.val() as Record<string, Student>;
      Object.entries(studentsMap).forEach(([dbKey, st]) => {
        if (!st || !st.attendance) return;
        const resolvedDbId = (st.studentDbId || dbKey).trim();
        const cardUid = (st.rfidUID || st.uid || dbKey).trim().toUpperCase();
        Object.entries(st.attendance).forEach(([dateKey, rawRec]) => {
          if (!rawRec || rawRec.isDeleted) return;
          const rec = normalizeAttendanceRecord(
            {
              ...rawRec,
              studentDbId: resolvedDbId,
              studentName: rawRec.studentName || st.name,
              studentId: rawRec.studentId || st.studentId,
              department: rawRec.department || st.department,
              authUid: rawRec.authUid || st.authUid,
            },
            dateKey,
            cardUid,
            resolvedDbId
          );
          if (!allMap[dateKey]) allMap[dateKey] = {};
          allMap[dateKey][resolvedDbId] = rec;
          recordCount++;
          if (dateKey === istToday) {
            todayMap[resolvedDbId] = rec;
          }
        });
      });
    }
  } else {
    if (!studentDbId) {
      throw new AuthProfileError(
        'mapping_missing',
        'Student Database ID mapping is missing for your account.'
      );
    }

    Object.keys(workingDays).forEach((d) => {
      if (!workingDays[d]?.isHoliday && d <= istToday) {
        allMap[d] = {};
      }
    });

    const snap = await runRtdbOp('GET', `/students/${studentDbId}`, () =>
      withTimeoutReject(get(ref(db, `students/${studentDbId}`)), 6000, `Timed out reading /students/${studentDbId}`)
    );
    if (!snap.exists()) {
      throw new AuthProfileError(
        'not_registered',
        `Student profile not found at /students/${studentDbId}.`
      );
    }
    const rawNode = snap.val() as Student;
    const cardUid = (rawNode.rfidUID || rawNode.uid || fallbackRfid).trim().toUpperCase();
    studentNode = { ...rawNode, studentDbId, rfidUID: cardUid, uid: cardUid };
    cachedStudentsMap[studentDbId] = studentNode;
    const attObj = studentNode.attendance || {};
    Object.entries(attObj).forEach(([dateKey, rawRec]) => {
      if (!rawRec || rawRec.isDeleted) return;
      const rec = normalizeAttendanceRecord(
        {
          ...rawRec,
          studentDbId,
          studentName: rawRec.studentName || studentNode?.name,
          studentId: rawRec.studentId || studentNode?.studentId,
          department: rawRec.department || studentNode?.department,
          authUid: rawRec.authUid || studentNode?.authUid || user.uid,
        },
        dateKey,
        cardUid,
        studentDbId
      );
      if (!allMap[dateKey]) allMap[dateKey] = {};
      allMap[dateKey][studentDbId] = rec;
      recordCount++;
      if (dateKey === istToday) {
        todayMap[studentDbId] = rec;
      }
    });
  }

  return {
    allAttendance: allMap,
    todayAttendance: todayMap,
    recordCount,
    studentNode,
    workingDays,
  };
}

/**
 * Subscribe to real-time attendance records for a specific student from unified node.
 */
export function subscribeToStudentAttendance(
  target: StudentSubscriptionTarget | string,
  onUpdate: (records: AttendanceRecord[]) => void
): () => void {
  const rawIdentifier = typeof target === 'string' ? target : (target.studentDbId || target.rfidUID);
  const info = lookupStudentInfo(rawIdentifier) ||
    (typeof target === 'object' ? (lookupStudentInfo(target.rfidUID) || lookupStudentInfo(target.studentId || '') || lookupStudentInfo(target.authUid || '')) : null);

  const studentDbId = (
    (typeof target === 'object' ? target.studentDbId : undefined) ||
    info?.studentDbId ||
    (typeof target === 'string' ? target : target.rfidUID)
  ).trim();
  const upperRfid = ((typeof target === 'string' ? target : target.rfidUID) || info?.rfidUID || '').trim().toUpperCase();
  const authUid = (typeof target === 'object' ? target.authUid : undefined) || info?.authUid || '';
  const studentId = (typeof target === 'object' ? target.studentId : undefined) || info?.studentId || '';

  return subscribeToCentralAttendance(
    {
      role: 'student',
      uid: authUid,
      studentDbId,
      rfidUID: upperRfid,
      studentId,
      rollNumber: studentId,
    },
    (allAttendance) => {
      const allRecords: AttendanceRecord[] = [];
      Object.keys(allAttendance).forEach((d) => {
        Object.values(allAttendance[d]).forEach((rec) => {
          if (rec.status === 'Present' && !allRecords.some((r) => r.date === rec.date)) {
            allRecords.push(rec);
          }
        });
      });
      allRecords.sort((a, b) => b.timestamp - a.timestamp);
      onUpdate(allRecords);
    }
  );
}

/**
 * Subscribe to today's attendance record for a specific student at students/{studentDbId}/attendance/{DATE}
 */
export function subscribeToStudentTodayAttendance(
  dateStr: string,
  studentDbIdOrRfid: string,
  onUpdate: (record: AttendanceRecord | null) => void
): () => void {
  try {
    const db = getFirebaseDatabase();
    const info = lookupStudentInfo(studentDbIdOrRfid);
    const dbKey = (info?.studentDbId || studentDbIdOrRfid).trim();
    const cardUid = (info?.rfidUID || studentDbIdOrRfid).trim().toUpperCase();
    const todayRecordRef = ref(db, `students/${dbKey}/attendance/${dateStr}`);

    const unsubscribe = onValue(
      todayRecordRef,
      (snapshot: DataSnapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          if (val && !val.isDeleted) {
            onUpdate(normalizeAttendanceRecord(val, dateStr, cardUid, dbKey));
            return;
          }
        }
        onUpdate(null);
      },
      (error) => {
        console.warn('Realtime Database student today attendance listener notice:', error?.message);
        onUpdate(null);
      }
    );

    return () => off(todayRecordRef, 'value', unsubscribe);
  } catch (e) {
    console.warn('Failed subscribing to student today attendance:', e);
    return () => {};
  }
}

/**
 * OPTION B: Complete System Reset
 * Deletes unified students (including nested attendance), working_days, trash, suspensions, unknown_scans,
 * and dispatches reset command to ESP32.
 */
export async function completeSystemReset(
  adminUid: string,
  adminEmail: string
): Promise<{ success: boolean; message: string; commandId: string }> {
  const db = getFirebaseDatabase();
  const now = Date.now();
  const timestampStr = getISTTimestampDisplay(now);
  const commandId = `cmd_${now}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    // 1. Delete all student records (including unified nested attendance)
    let studentsDeleted = false;
    try {
      await remove(ref(db, 'students'));
      studentsDeleted = true;
    } catch (stuErr: any) {
      console.warn('Root /students deletion blocked; attempting child deletion:', stuErr?.message);
    }

    if (!studentsDeleted) {
      try {
        const snap = await get(ref(db, 'students'));
        if (snap.exists()) {
          const stuData = snap.val() as Record<string, any>;
          for (const uid of Object.keys(stuData)) {
            try {
              await remove(ref(db, `students/${uid}`));
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Non-blocking fallback
      }
    }

    // 2. Clear auxiliary nodes & identity indexes
    try { await remove(ref(db, 'working_days')); } catch {}
    try { await remove(ref(db, 'attendance_trash')); } catch {}
    try { await remove(ref(db, 'suspensions')); } catch {}
    try { await remove(ref(db, 'unknown_scans')); } catch {}
    try { await remove(ref(db, 'rfid_to_student')); } catch {}
    try { await remove(ref(db, 'rfid_to_uid')); } catch {}
    try { await remove(ref(db, 'auth_to_student')); } catch {}

    // 3. Send reset command to ESP32 via deviceCommands/esp32
    const deviceCmd: DeviceCommand = {
      command: 'RESET_SYSTEM',
      commandId,
      timestamp: now,
      initiatedBy: adminEmail,
      status: 'PENDING',
    };
    try {
      await set(ref(db, 'deviceCommands/esp32'), deviceCmd);
    } catch (cmdErr: any) {
      console.warn('Could not write deviceCommands/esp32 (check rules):', cmdErr?.message);
    }

    // 4. Log audit record
    const auditRecord: ResetAuditLog = {
      type: 'COMPLETE_SYSTEM_RESET',
      adminEmail,
      initiatedByUid: adminUid,
      timestamp: now,
      timestampStr,
      description: 'Complete system reset executed: All unified student profiles and nested attendance records deleted. ESP32 reset signal dispatched.',
    };
    try {
      await set(ref(db, `auditLogs/resets/${now}`), auditRecord);
      await set(ref(db, 'auditLogs/lastReset'), auditRecord);
    } catch (auditErr: any) {
      console.warn('Could not write audit log:', auditErr?.message);
      try {
        localStorage.setItem('rfid_last_reset_audit', JSON.stringify(auditRecord));
      } catch {}
    }

    return {
      success: true,
      message: 'Complete System Reset executed. All unified student and attendance data removed. Reset signal dispatched to ESP32.',
      commandId,
    };
  } catch (err: any) {
    console.error('Error during complete system reset:', err);
    throw new Error(err.message || 'Firebase permission error during system reset.');
  }
}

/**
 * Subscribe to ESP32 device commands to monitor status & acknowledgements
 */
export function subscribeToDeviceCommands(
  onUpdate: (cmd: DeviceCommand | null) => void
) {
  try {
    const db = getFirebaseDatabase();
    const cmdRef = ref(db, 'deviceCommands/esp32');
    const unsubscribe = onValue(cmdRef, (snap) => {
      onUpdate(snap.val() || null);
    });
    return () => off(cmdRef, 'value', unsubscribe);
  } catch (e) {
    console.warn('Failed subscribing to device commands', e);
    return () => {};
  }
}

/**
 * Subscribe to the last reset audit log
 */
export function subscribeToLastReset(
  onUpdate: (log: ResetAuditLog | null) => void
) {
  try {
    const db = getFirebaseDatabase();
    const logRef = ref(db, 'auditLogs/lastReset');
    const unsubscribe = onValue(logRef, (snap) => {
      onUpdate(snap.val() || null);
    });
    return () => off(logRef, 'value', unsubscribe);
  } catch (e) {
    console.warn('Failed subscribing to last reset log', e);
    return () => {};
  }
}

// ============================================================================
// ADMIN ATTENDANCE CONTROL SYSTEM (AUDIT, OVERRIDE, SUSPENSION, UNDO, BULK)
// ============================================================================

/**
 * Log administrative activity to /audit_logs
 */
export async function logAuditActivity(
  action: AuditActivityLog['action'],
  adminUser: { email?: string | null; uid?: string },
  data: {
    studentRfid?: string;
    studentName?: string;
    studentId?: string;
    date?: string;
    reason?: string;
    details?: string;
    previousValues?: any;
    updatedValues?: any;
    affectedCount?: number;
  }
): Promise<string> {
  const db = getFirebaseDatabase();
  const logId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();
  const auditEntry: AuditActivityLog = stripUndefinedDeep({
    id: logId,
    action,
    studentRfid: data.studentRfid,
    studentName: data.studentName,
    studentId: data.studentId,
    date: data.date,
    adminEmail: adminUser.email || 'admin@portal.local',
    adminUid: adminUser.uid || 'admin',
    timestamp: now.getTime(),
    timestampStr: getISTTimestampDisplay(now),
    reason: data.reason || 'Administrative action',
    details: data.details,
    previousValues: data.previousValues,
    updatedValues: data.updatedValues,
    affectedCount: data.affectedCount || 1,
  });

  try {
    await set(ref(db, `audit_logs/${logId}`), auditEntry);
  } catch (err: any) {
    console.warn('Failed logging audit activity:', err?.message);
  }
  return logId;
}

/**
 * Subscribe in real-time to audit logs
 */
export function subscribeToAuditLogs(
  onUpdate: (logs: AuditActivityLog[]) => void
): () => void {
  try {
    const db = getFirebaseDatabase();
    const logsRef = ref(db, 'audit_logs');
    const unsubscribe = onValue(
      logsRef,
      (snap) => {
        if (!snap.exists()) {
          onUpdate([]);
          return;
        }
        const val = snap.val() as Record<string, AuditActivityLog>;
        const list = Object.values(val).sort((a, b) => b.timestamp - a.timestamp);
        onUpdate(list);
      },
      (err) => console.warn('Audit logs listener notice:', err?.message)
    );
    return () => off(logsRef, 'value', unsubscribe);
  } catch {
    return () => {};
  }
}

/**
 * Subscribe in real-time to deleted/trash attendance records
 */
export function subscribeToTrashRecords(
  onUpdate: (records: TrashAttendanceRecord[]) => void
): () => void {
  try {
    const db = getFirebaseDatabase();
    const trashRef = ref(db, 'attendance_trash');
    const unsubscribe = onValue(
      trashRef,
      (snap) => {
        if (!snap.exists()) {
          onUpdate([]);
          return;
        }
        const val = snap.val() as Record<string, TrashAttendanceRecord>;
        const list = Object.values(val).sort((a, b) => b.deletedAt - a.deletedAt);
        onUpdate(list);
      },
      (err) => console.warn('Trash listener notice:', err?.message)
    );
    return () => off(trashRef, 'value', unsubscribe);
  } catch {
    return () => {};
  }
}

/**
 * Subscribe in real-time to student suspensions
 */
export function subscribeToSuspensions(
  onUpdate: (suspensions: Record<string, StudentSuspension[]>) => void
): () => void {
  try {
    const db = getFirebaseDatabase();
    const suspRef = ref(db, 'suspensions');
    const unsubscribe = onValue(
      suspRef,
      (snap) => {
        if (!snap.exists()) {
          onUpdate({});
          return;
        }
        const val = snap.val() as Record<string, Record<string, StudentSuspension>>;
        const map: Record<string, StudentSuspension[]> = {};
        Object.keys(val).forEach((rfid) => {
          map[rfid] = Object.values(val[rfid] || {}).sort((a, b) => b.createdAt - a.createdAt);
        });
        onUpdate(map);
      },
      (err) => console.warn('Suspensions listener notice:', err?.message)
    );
    return () => off(suspRef, 'value', unsubscribe);
  } catch {
    return () => {};
  }
}

/**
 * Subscribe in real-time to a single student's suspension history at /suspensions/{studentDbId}
 */
export function subscribeToStudentSuspensions(
  studentDbIdOrRfid: string,
  onUpdate: (list: StudentSuspension[]) => void,
  onError?: (err: Error) => void
): () => void {
  const raw = studentDbIdOrRfid.trim();
  if (!raw) return () => {};
  const info = lookupStudentInfo(raw);
  const dbKey = (info?.studentDbId || raw).trim();
  try {
    const db = getFirebaseDatabase();
    const suspRef = ref(db, `suspensions/${dbKey}`);
    const unsubscribe = onValue(
      suspRef,
      (snap) => {
        if (!snap.exists()) {
          onUpdate([]);
          return;
        }
        const val = snap.val() as Record<string, StudentSuspension>;
        const list = Object.values(val || {}).sort((a, b) => b.createdAt - a.createdAt);
        onUpdate(list);
      },
      (err) => {
        onError?.(err);
      }
    );
    return () => off(suspRef, 'value', unsubscribe);
  } catch {
    return () => {};
  }
}

/**
 * Edit an attendance record's date, time, status, or notes at students/{studentDbId}/attendance/{DATE}.
 * Preserves edit history and creates an audit entry.
 */
export async function updateAttendanceRecord(
  date: string,
  uidInput: string,
  updates: {
    date?: string;
    time?: string;
    status?: AttendanceStatus;
    notes?: string;
    device?: string;
  },
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; updatedRecord: AttendanceRecord; previousRecord: AttendanceRecord }> {
  const db = getFirebaseDatabase();
  const resolved = await resolveStudentByAnyId(uidInput);
  const studentDbId = resolved?.studentDbId || uidInput.trim();
  const cardUid = (resolved?.rfidUID || uidInput).trim().toUpperCase();
  const oldRef = ref(db, `students/${studentDbId}/attendance/${date}`);
  const snap = await get(oldRef);

  if (!snap.exists()) {
    throw new Error(`Record for student ${uidInput} on ${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const targetDate = updates.date || date;

  const prevEdits = existing.previousEdits || [];
  prevEdits.unshift({
    editedAt: Date.now(),
    editedBy: adminUser.email || 'admin',
    reason: reason || 'Administrative modification',
    prevData: {
      date: existing.date,
      time: existing.time,
      status: existing.status,
      device: existing.device,
      notes: existing.notes,
    },
  });

  const resolvedCardUid = (resolved?.rfidUID || existing.rfidUID || existing.uid || cardUid).trim().toUpperCase();
  const updatedRecord: AttendanceRecord = stripUndefinedDeep({
    ...existing,
    studentDbId,
    uid: resolvedCardUid,
    studentUID: resolvedCardUid,
    rfidUID: resolvedCardUid,
    studentRfid: resolvedCardUid,
    date: targetDate,
    time: updates.time || existing.time,
    status: updates.status || existing.status,
    source: 'admin_edit',
    notes: updates.notes !== undefined ? updates.notes : (existing.notes || ''),
    device: updates.device || existing.device || 'ADMIN-EDIT',
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
    previousEdits: prevEdits,
  });

  const validationError = validateAttendancePayload(updatedRecord);
  if (validationError) {
    throw new Error(`Invalid attendance update: ${validationError}`);
  }

  if (targetDate !== date) {
    await runRtdbOp('REMOVE', `/students/${studentDbId}/attendance/${date}`, () => remove(oldRef));
    await runRtdbOp('SET', `/students/${studentDbId}/attendance/${targetDate}`, () =>
      set(ref(db, `students/${studentDbId}/attendance/${targetDate}`), updatedRecord)
    );
  } else {
    await runRtdbOp('SET', `/students/${studentDbId}/attendance/${date}`, () => set(oldRef, updatedRecord));
  }

  await syncWorkingDaysFromDates([targetDate]);

  await logAuditActivity('EDIT_ATTENDANCE', adminUser, {
    studentRfid: resolvedCardUid,
    studentName: existing.studentName,
    studentId: existing.studentId,
    date: targetDate,
    reason,
    previousValues: {
      date: existing.date,
      time: existing.time,
      status: existing.status,
      notes: existing.notes,
    },
    updatedValues: {
      date: targetDate,
      time: updatedRecord.time,
      status: updatedRecord.status,
      notes: updatedRecord.notes,
    },
  });

  return { success: true, updatedRecord, previousRecord: existing };
}

/**
 * Delete an individual attendance record (soft delete into attendance_trash).
 */
export async function deleteAttendanceRecord(
  date: string,
  uidInput: string,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; deletedRecord: AttendanceRecord; trashId: string }> {
  const db = getFirebaseDatabase();
  const resolved = await resolveStudentByAnyId(uidInput);
  const studentDbId = resolved?.studentDbId || uidInput.trim();
  const cardUid = (resolved?.rfidUID || uidInput).trim().toUpperCase();
  const targetRef = ref(db, `students/${studentDbId}/attendance/${date}`);
  const snap = await get(targetRef);

  if (!snap.exists()) {
    throw new Error(`Record for student ${uidInput} on ${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const resolvedCardUid = (resolved?.rfidUID || existing.rfidUID || existing.uid || cardUid).trim().toUpperCase();
  const trashId = `${date}_${studentDbId}`;

  const trashEntry: TrashAttendanceRecord = stripUndefinedDeep({
    ...existing,
    studentDbId,
    uid: resolvedCardUid,
    rfidUID: resolvedCardUid,
    trashId,
    deletedAt: Date.now(),
    deletedBy: adminUser.email || 'admin',
    deleteReason: reason || 'Deleted by administrator',
    originalPath: `students/${studentDbId}/attendance/${date}`,
    isDeleted: true,
  });

  await runRtdbOp('SET', `/attendance_trash/${trashId}`, () =>
    set(ref(db, `attendance_trash/${trashId}`), trashEntry)
  );
  await runRtdbOp('REMOVE', `/students/${studentDbId}/attendance/${date}`, () => remove(targetRef));

  await logAuditActivity('DELETE_ATTENDANCE', adminUser, {
    studentRfid: resolvedCardUid,
    studentName: existing.studentName,
    studentId: existing.studentId,
    date,
    reason,
    previousValues: existing,
  });

  return { success: true, deletedRecord: { ...existing, studentDbId }, trashId };
}

/**
 * Bulk delete multiple attendance records with soft-delete archiving.
 */
export async function bulkDeleteAttendance(
  records: Array<{ date: string; uid: string; studentDbId?: string; studentName?: string }>,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; count: number; deletedRecords: AttendanceRecord[] }> {
  const db = getFirebaseDatabase();
  const deletedRecords: AttendanceRecord[] = [];

  for (const r of records) {
    const resolved = await resolveStudentByAnyId(r.studentDbId || r.uid);
    const studentDbId = resolved?.studentDbId || (r.studentDbId || r.uid).trim();
    const cardUid = (resolved?.rfidUID || r.uid).trim().toUpperCase();
    try {
      const targetRef = ref(db, `students/${studentDbId}/attendance/${r.date}`);
      const snap = await get(targetRef);
      if (snap.exists()) {
        const existing = snap.val() as AttendanceRecord;
        const resolvedCardUid = (resolved?.rfidUID || existing.rfidUID || existing.uid || cardUid).trim().toUpperCase();
        const trashId = `${r.date}_${studentDbId}`;
        const trashEntry: TrashAttendanceRecord = stripUndefinedDeep({
          ...existing,
          studentDbId,
          uid: resolvedCardUid,
          rfidUID: resolvedCardUid,
          trashId,
          deletedAt: Date.now(),
          deletedBy: adminUser.email || 'admin',
          deleteReason: reason || 'Bulk deletion by administrator',
          originalPath: `students/${studentDbId}/attendance/${r.date}`,
          isDeleted: true,
        });

        await set(ref(db, `attendance_trash/${trashId}`), trashEntry);
        await remove(targetRef);

        deletedRecords.push({ ...existing, studentDbId });
      }
    } catch (err) {
      console.warn(`Failed deleting record students/${studentDbId}/attendance/${r.date}:`, err);
    }
  }

  await logAuditActivity('BULK_DELETE', adminUser, {
    reason,
    affectedCount: deletedRecords.length,
    details: `Bulk deleted ${deletedRecords.length} attendance records`,
    previousValues: deletedRecords.map((d) => ({ date: d.date, uid: d.uid, studentDbId: d.studentDbId, name: d.studentName })),
  });

  return { success: true, count: deletedRecords.length, deletedRecords };
}

/**
 * Bulk update attendance status for multiple records.
 */
export async function bulkUpdateAttendanceStatus(
  records: Array<{ date: string; uid: string; studentDbId?: string; studentName?: string }>,
  newStatus: AttendanceStatus,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; count: number; previousStates: Array<{ date: string; uid: string; studentDbId: string; prevStatus: AttendanceStatus }> }> {
  const db = getFirebaseDatabase();
  const previousStates: Array<{ date: string; uid: string; studentDbId: string; prevStatus: AttendanceStatus }> = [];

  for (const r of records) {
    const resolved = await resolveStudentByAnyId(r.studentDbId || r.uid);
    const studentDbId = resolved?.studentDbId || (r.studentDbId || r.uid).trim();
    const cardUid = (resolved?.rfidUID || r.uid).trim().toUpperCase();
    try {
      const targetRef = ref(db, `students/${studentDbId}/attendance/${r.date}`);
      const snap = await get(targetRef);
      if (snap.exists()) {
        const existing = snap.val() as AttendanceRecord;
        const resolvedCardUid = (resolved?.rfidUID || existing.rfidUID || existing.uid || cardUid).trim().toUpperCase();
        previousStates.push({ date: r.date, uid: resolvedCardUid, studentDbId, prevStatus: existing.status });

        const prevEdits = existing.previousEdits || [];
        prevEdits.unshift({
          editedAt: Date.now(),
          editedBy: adminUser.email || 'admin',
          reason: reason || `Bulk status changed to ${newStatus}`,
          prevData: {
            date: existing.date,
            time: existing.time,
            status: existing.status,
            device: existing.device,
            notes: existing.notes,
          },
        });

        const updated: AttendanceRecord = stripUndefinedDeep({
          ...existing,
          studentDbId,
          uid: resolvedCardUid,
          studentUID: resolvedCardUid,
          rfidUID: resolvedCardUid,
          status: newStatus,
          source: 'admin_edit',
          lastModifiedBy: adminUser.email || 'admin',
          lastModifiedAt: Date.now(),
          previousEdits: prevEdits,
        });

        await set(targetRef, updated);
      }
    } catch (err) {
      console.warn(`Failed bulk updating students/${studentDbId}/attendance/${r.date}:`, err);
    }
  }

  await logAuditActivity('BULK_STATUS_CHANGE', adminUser, {
    reason,
    affectedCount: previousStates.length,
    details: `Bulk updated ${previousStates.length} records to ${newStatus}`,
    updatedValues: { newStatus },
    previousValues: previousStates,
  });

  return { success: true, count: previousStates.length, previousStates };
}

/**
 * Restore an attendance record from attendance_trash back into students/{studentDbId}/attendance/{DATE}.
 */
export async function restoreDeletedAttendance(
  trashId: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; restoredRecord: AttendanceRecord }> {
  const db = getFirebaseDatabase();
  const trashRef = ref(db, `attendance_trash/${trashId}`);
  const snap = await get(trashRef);

  if (!snap.exists()) {
    throw new Error(`Trash record ${trashId} not found.`);
  }

  const trashEntry = snap.val() as TrashAttendanceRecord;
  const date = trashEntry.date;
  const resolved = await resolveStudentByAnyId(trashEntry.studentDbId || trashEntry.rfidUID || trashEntry.uid);
  const studentDbId = resolved?.studentDbId || trashEntry.studentDbId || (trashEntry.rfidUID || trashEntry.uid).toUpperCase();
  const uid = (resolved?.rfidUID || trashEntry.rfidUID || trashEntry.uid).toUpperCase();

  const {
    trashId: _tid,
    originalPath: _op,
    deletedAt: _da,
    deletedBy: _db,
    deleteReason: _dr,
    ...baseFields
  } = trashEntry;

  const restoredRecord: AttendanceRecord = stripUndefinedDeep({
    ...baseFields,
    studentDbId,
    uid,
    studentUID: uid,
    rfidUID: uid,
    source: baseFields.source || 'admin_restore',
    isDeleted: false,
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
  });

  const validationError = validateAttendancePayload(restoredRecord);
  if (validationError) {
    throw new Error(`Cannot restore invalid record: ${validationError}`);
  }

  await set(ref(db, `students/${studentDbId}/attendance/${date}`), restoredRecord);
  await syncWorkingDaysFromDates([date]);
  await remove(trashRef);

  await logAuditActivity('RESTORE_ATTENDANCE', adminUser, {
    studentRfid: uid,
    studentName: restoredRecord.studentName,
    studentId: restoredRecord.studentId,
    date,
    reason: 'Restored from Trash',
    updatedValues: restoredRecord,
  });

  return { success: true, restoredRecord };
}

/**
 * Restore a previously edited version of an attendance record.
 */
export async function restorePreviousAttendance(
  date: string,
  uidInput: string,
  targetVersionIndex: number,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; restoredRecord: AttendanceRecord }> {
  const db = getFirebaseDatabase();
  const resolved = await resolveStudentByAnyId(uidInput);
  const studentDbId = resolved?.studentDbId || uidInput.trim();
  const targetRef = ref(db, `students/${studentDbId}/attendance/${date}`);
  const snap = await get(targetRef);

  if (!snap.exists()) {
    throw new Error(`Record ${uidInput}/attendance/${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const history = existing.previousEdits || [];
  const targetVersion = history[targetVersionIndex];

  if (!targetVersion) {
    throw new Error(`Edit history version #${targetVersionIndex + 1} not found.`);
  }

  const prevData = targetVersion.prevData;
  const cardUid = (resolved?.rfidUID || existing.rfidUID || existing.uid || uidInput).trim().toUpperCase();
  const updatedRecord: AttendanceRecord = stripUndefinedDeep({
    ...existing,
    studentDbId,
    uid: cardUid,
    rfidUID: cardUid,
    date: prevData.date,
    time: prevData.time,
    status: prevData.status,
    device: prevData.device || existing.device,
    notes: prevData.notes !== undefined ? prevData.notes : existing.notes,
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
  });

  await set(targetRef, updatedRecord);

  await logAuditActivity('RESTORE_ATTENDANCE', adminUser, {
    studentRfid: cardUid,
    studentName: existing.studentName,
    studentId: existing.studentId,
    date,
    reason: `Restored to version edited on ${getISTTimestampDisplay(targetVersion.editedAt)}`,
    previousValues: existing,
    updatedValues: updatedRecord,
  });

  return { success: true, restoredRecord: updatedRecord };
}

/**
 * Override student's status to Absent (Manual Override) at students/{studentDbId}/attendance/{DATE}.
 * Preserves original scan data and prevents subsequent ESP32 RFID scans from overriding it for that date.
 */
export async function overrideAttendanceToAbsent(
  date: string,
  uidInput: string,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; updatedRecord: AttendanceRecord; previousRecord: AttendanceRecord }> {
  const db = getFirebaseDatabase();
  const resolved = await resolveStudentByAnyId(uidInput);
  const studentDbId = resolved?.studentDbId || uidInput.trim();
  const targetRef = ref(db, `students/${studentDbId}/attendance/${date}`);
  const snap = await get(targetRef);

  if (!snap.exists()) {
    throw new Error(`Attendance record for ${uidInput} on ${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const cardUid = (resolved?.rfidUID || existing.rfidUID || existing.uid || uidInput).trim().toUpperCase();
  const originalRecord = existing.originalRecord || {
    status: existing.status,
    time: existing.time,
    timestamp: existing.timestamp,
    device: existing.device,
  };

  const updatedRecord: AttendanceRecord = stripUndefinedDeep({
    ...existing,
    studentDbId,
    uid: cardUid,
    studentUID: cardUid,
    rfidUID: cardUid,
    status: 'Absent',
    source: 'admin_override',
    isOverridden: true,
    overrideReason: reason || 'Manual administrative override to Absent',
    overrideBy: adminUser.email || 'admin',
    overrideAt: Date.now(),
    originalRecord,
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
  });

  await runRtdbOp('SET', `/students/${studentDbId}/attendance/${date}`, () => set(targetRef, updatedRecord));

  await logAuditActivity('OVERRIDE_ATTENDANCE', adminUser, {
    studentRfid: cardUid,
    studentName: existing.studentName,
    studentId: existing.studentId,
    date,
    reason,
    previousValues: { status: existing.status, time: existing.time },
    updatedValues: { status: 'Absent', isOverridden: true, overrideReason: reason },
  });

  return { success: true, updatedRecord, previousRecord: existing };
}

/**
 * Remove an attendance override and restore the original Present status.
 */
export async function removeAttendanceOverride(
  date: string,
  uidInput: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; updatedRecord: AttendanceRecord }> {
  const db = getFirebaseDatabase();
  const resolved = await resolveStudentByAnyId(uidInput);
  const studentDbId = resolved?.studentDbId || uidInput.trim();
  const targetRef = ref(db, `students/${studentDbId}/attendance/${date}`);
  const snap = await get(targetRef);

  if (!snap.exists()) {
    throw new Error(`Record for ${uidInput} on ${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const cardUid = (resolved?.rfidUID || existing.rfidUID || existing.uid || uidInput).trim().toUpperCase();
  const original = existing.originalRecord;

  const {
    overrideReason: _or,
    overrideBy: _ob,
    overrideAt: _oa,
    ...restFields
  } = existing;

  const updatedRecord: AttendanceRecord = stripUndefinedDeep({
    ...restFields,
    studentDbId,
    uid: cardUid,
    studentUID: cardUid,
    rfidUID: cardUid,
    status: original?.status || 'Present',
    time: original?.time || existing.time,
    source: 'admin_override_removed',
    isOverridden: false,
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
  });

  await runRtdbOp('SET', `/students/${studentDbId}/attendance/${date}`, () => set(targetRef, updatedRecord));

  await logAuditActivity('REMOVE_OVERRIDE', adminUser, {
    studentRfid: cardUid,
    studentName: existing.studentName,
    studentId: existing.studentId,
    date,
    reason: 'Removed manual override and restored original scan',
    updatedValues: { status: updatedRecord.status, isOverridden: false },
  });

  return { success: true, updatedRecord };
}

/**
 * Suspend a student for 1 Day, 1 Week, 1 Month, or Custom duration.
 * Suspended students are blocked from registering attendance via RFID.
 */
export async function suspendStudent(
  studentIdOrRfid: string,
  duration: '1_day' | '1_week' | '1_month' | 'custom',
  startDate: string,
  endDate: string,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; suspension: StudentSuspension }> {
  const db = getFirebaseDatabase();
  const resolved = await resolveStudentByAnyId(studentIdOrRfid);
  const studentDbId = resolved?.studentDbId || studentIdOrRfid.trim();
  const student = resolved?.student || null;
  const rfid = (resolved?.rfidUID || student?.rfidUID || student?.uid || studentIdOrRfid).trim().toUpperCase();

  const suspId = `susp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const suspension: StudentSuspension = stripUndefinedDeep({
    id: suspId,
    studentDbId,
    studentRfid: rfid,
    studentName: student?.name || 'Student',
    studentId: student?.studentId || 'N/A',
    duration,
    startDate,
    endDate,
    reason: reason || 'Disciplinary suspension',
    suspendedBy: adminUser.email || 'admin',
    createdAt: Date.now(),
    status: 'active',
  });

  // 1. Record suspension in /suspensions/{studentDbId}/{suspId}
  await set(ref(db, `suspensions/${studentDbId}/${suspId}`), suspension);

  // 2. Update student status in /students/{studentDbId}
  await update(ref(db, `students/${studentDbId}`), {
    status: 'suspended',
    isSuspended: true,
    activeSuspension: suspension,
  });

  // 3. Log activity
  await logAuditActivity('SUSPEND_STUDENT', adminUser, {
    studentRfid: rfid,
    studentName: suspension.studentName,
    studentId: suspension.studentId,
    reason,
    details: `Suspended for ${duration} (${startDate} to ${endDate})`,
    updatedValues: suspension,
  });

  return { success: true, suspension };
}

/**
 * Manually unsuspend a student and re-enable RFID attendance scanning.
 */
export async function unsuspendStudent(
  studentIdOrRfid: string,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean }> {
  const db = getFirebaseDatabase();
  const resolved = await resolveStudentByAnyId(studentIdOrRfid);
  const studentDbId = resolved?.studentDbId || studentIdOrRfid.trim();
  const student = resolved?.student || null;
  const rfid = (resolved?.rfidUID || student?.rfidUID || student?.uid || studentIdOrRfid).trim().toUpperCase();
  const activeSusp = student?.activeSuspension;

  // 1. Re-activate student
  await update(ref(db, `students/${studentDbId}`), {
    status: 'active',
    isSuspended: false,
    activeSuspension: null,
  });

  // 2. Mark suspension revoked in history
  if (activeSusp && activeSusp.id) {
    try {
      await update(ref(db, `suspensions/${studentDbId}/${activeSusp.id}`), {
        status: 'revoked',
        revokedAt: Date.now(),
        revokedBy: adminUser.email || 'admin',
        revocationReason: reason || 'Manually unsuspended by administrator',
      });
    } catch {}
  }

  // 3. Log audit
  await logAuditActivity('UNSUSPEND_STUDENT', adminUser, {
    studentRfid: rfid,
    studentName: student?.name,
    studentId: student?.studentId,
    reason: reason || 'Manually unsuspended by administrator',
  });

  return { success: true };
}

/**
 * Check all student suspensions and automatically reactivate expired ones.
 */
export async function checkAndReactivateExpiredSuspensions(): Promise<number> {
  const db = getFirebaseDatabase();
  const nowStr = getISTDateStr();
  let reactivatedCount = 0;

  try {
    const snap = await get(ref(db, 'students'));
    if (!snap.exists()) return 0;
    const allStudents = snap.val() as Record<string, Student>;

    for (const [dbKey, st] of Object.entries(allStudents)) {
      if (st && (st.status === 'suspended' || st.isSuspended)) {
        const activeSusp = st.activeSuspension;
        if (activeSusp && activeSusp.endDate && nowStr > activeSusp.endDate) {
          await update(ref(db, `students/${dbKey}`), {
            status: 'active',
            isSuspended: false,
            activeSuspension: null,
          });
          if (activeSusp.id) {
            await update(ref(db, `suspensions/${dbKey}/${activeSusp.id}`), {
              status: 'expired',
            });
          }
          reactivatedCount++;
        }
      }
    }
  } catch (err) {
    console.warn('Expired suspension check notice:', err);
  }
  return reactivatedCount;
}

/**
 * Execute an undo action, restoring the previous state on students/{studentDbId}/attendance/{DATE}.
 */
export async function executeUndoAction(
  action: UndoAction,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; message: string }> {
  const db = getFirebaseDatabase();

  switch (action.type) {
    case 'EDIT': {
      const prevRec = action.revertData.previousRecord as AttendanceRecord;
      const curRec = action.revertData.updatedRecord as AttendanceRecord;
      const resolvedCur = await resolveStudentByAnyId(curRec.studentDbId || curRec.rfidUID || curRec.uid);
      const resolvedPrev = await resolveStudentByAnyId(prevRec.studentDbId || prevRec.rfidUID || prevRec.uid);
      const curDbId = resolvedCur?.studentDbId || curRec.studentDbId || (curRec.rfidUID || curRec.uid).toUpperCase();
      const prevDbId = resolvedPrev?.studentDbId || prevRec.studentDbId || (prevRec.rfidUID || prevRec.uid).toUpperCase();
      if (curRec.date !== prevRec.date || curDbId !== prevDbId) {
        await remove(ref(db, `students/${curDbId}/attendance/${curRec.date}`));
      }
      await set(ref(db, `students/${prevDbId}/attendance/${prevRec.date}`), stripUndefinedDeep(prevRec));
      break;
    }

    case 'DELETE': {
      const deleted = action.revertData.deletedRecord as AttendanceRecord;
      const resolved = await resolveStudentByAnyId(deleted.studentDbId || deleted.rfidUID || deleted.uid);
      const studentDbId = resolved?.studentDbId || deleted.studentDbId || (deleted.rfidUID || deleted.uid).toUpperCase();
      const trashId = action.revertData.trashId as string;
      await set(ref(db, `students/${studentDbId}/attendance/${deleted.date}`), stripUndefinedDeep(deleted));
      if (trashId) {
        await remove(ref(db, `attendance_trash/${trashId}`));
      }
      break;
    }

    case 'OVERRIDE': {
      const prevRec = action.revertData.previousRecord as AttendanceRecord;
      const resolved = await resolveStudentByAnyId(prevRec.studentDbId || prevRec.rfidUID || prevRec.uid);
      const studentDbId = resolved?.studentDbId || prevRec.studentDbId || (prevRec.rfidUID || prevRec.uid).toUpperCase();
      await set(ref(db, `students/${studentDbId}/attendance/${prevRec.date}`), stripUndefinedDeep(prevRec));
      break;
    }

    case 'BULK_DELETE': {
      const deletedRecords = action.revertData.deletedRecords as AttendanceRecord[];
      for (const rec of deletedRecords) {
        const resolved = await resolveStudentByAnyId(rec.studentDbId || rec.rfidUID || rec.uid);
        const studentDbId = resolved?.studentDbId || rec.studentDbId || (rec.rfidUID || rec.uid).toUpperCase();
        await set(ref(db, `students/${studentDbId}/attendance/${rec.date}`), stripUndefinedDeep(rec));
        await remove(ref(db, `attendance_trash/${rec.date}_${studentDbId}`));
      }
      break;
    }

    case 'BULK_EDIT': {
      const prevStates = action.revertData.previousStates as Array<{ date: string; uid: string; studentDbId?: string; prevStatus: AttendanceStatus }>;
      for (const p of prevStates) {
        const resolved = await resolveStudentByAnyId(p.studentDbId || p.uid);
        const studentDbId = resolved?.studentDbId || p.studentDbId || p.uid.toUpperCase();
        const targetRef = ref(db, `students/${studentDbId}/attendance/${p.date}`);
        const snap = await get(targetRef);
        if (snap.exists()) {
          const cur = snap.val() as AttendanceRecord;
          await set(targetRef, stripUndefinedDeep({ ...cur, status: p.prevStatus }));
        }
      }
      break;
    }

    default:
      throw new Error(`Unsupported undo action type: ${action.type}`);
  }

  await logAuditActivity('UNDO_OPERATION', adminUser, {
    reason: `Reverted ${action.description}`,
    details: `Executed 30s undo for action ${action.id}`,
  });

  return { success: true, message: `Successfully reverted: ${action.description}` };
}

// ============================================================================
// DATABASE MIGRATION & RECOVERY ENGINE (LEGACY -> UNIFIED students/{UID})
// ============================================================================

function normalizeRfidKey(raw: string): string {
  return raw.trim().toUpperCase();
}

export function toEpochMs(val: any, dateStr?: string, timeStr?: string): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val > 1e12 ? val : val > 1e9 ? val * 1000 : 0;
  }
  if (dateStr && timeStr && timeStr !== '00:00:00') {
    const parsed = new Date(`${dateStr}T${timeStr}+05:30`).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

export function mergeAttendanceEntries(existing: any, incoming: any): any {
  if (!existing) return incoming;
  if (!incoming) return existing;
  // Never overwrite admin overrides, admin-edited records, or soft-deleted entries
  if (existing.isOverridden || existing.lastModifiedAt || existing.isDeleted) {
    return {
      ...incoming,
      ...existing,
      isOverridden: existing.isOverridden ?? incoming.isOverridden,
      overrideReason: existing.overrideReason ?? incoming.overrideReason,
      previousEdits: existing.previousEdits ?? incoming.previousEdits,
    };
  }
  const existingTs = toEpochMs(existing.timestamp, existing.date, existing.time);
  const incomingTs = toEpochMs(incoming.timestamp, incoming.date, incoming.time);
  if (incomingTs > existingTs) {
    return {
      ...existing,
      ...incoming,
      previousEdits: existing.previousEdits ?? incoming.previousEdits,
    };
  }
  // Never overwrite newer or equal unified record with older legacy data
  return {
    ...incoming,
    ...existing,
    previousEdits: existing.previousEdits ?? incoming.previousEdits,
  };
}

function countLegacyAttendanceRecords(
  legacyAtt: Record<string, any> | null | undefined,
  legacyStuAtt?: Record<string, any> | null | undefined
): number {
  const seenPairs = new Set<string>();
  let count = 0;

  if (legacyAtt && typeof legacyAtt === 'object') {
    Object.entries(legacyAtt).forEach(([dateKey, dayMap]) => {
      if (!dayMap || typeof dayMap !== 'object') return;
      Object.entries(dayMap).forEach(([uidKey, rawRec]) => {
        if (!rawRec || typeof rawRec !== 'object') return;
        const normUid = normalizeRfidKey((rawRec as any).rfidUID || (rawRec as any).uid || uidKey);
        seenPairs.add(`${dateKey}::${normUid}`);
        count++;
      });
    });
  }

  if (legacyStuAtt && typeof legacyStuAtt === 'object') {
    Object.entries(legacyStuAtt).forEach(([uidKey, datesMap]) => {
      if (!datesMap || typeof datesMap !== 'object') return;
      Object.entries(datesMap).forEach(([dateKey, rawRec]) => {
        if (!rawRec || typeof rawRec !== 'object') return;
        const normUid = normalizeRfidKey((rawRec as any).rfidUID || (rawRec as any).uid || uidKey);
        const pair = `${dateKey}::${normUid}`;
        if (!seenPairs.has(pair)) {
          seenPairs.add(pair);
          count++;
        }
      });
    });
  }

  return count;
}

/**
 * Safely inspect current Firebase Realtime Database state without modifying any data.
 */
export async function inspectLegacyDatabase(): Promise<MigrationInspection> {
  const db = getFirebaseDatabase();
  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;
  const authenticatedUid = currentUser?.uid || null;
  const isAuthorizedAdmin = authenticatedUid === CONFIGURED_ADMIN_UID;

  let studentsVal: Record<string, any> = {};
  let legacyAttVal: Record<string, Record<string, any>> = {};
  let legacyStuAttVal: Record<string, Record<string, any>> = {};
  let recoveryVal: Record<string, Record<string, any>> = {};
  let backupCount = 0;
  let migrationCompletedAt: number | undefined = undefined;
  const inspectionErrors: string[] = [];

  try {
    const sSnap = await runRtdbOp('GET', '/students', () =>
      withTimeoutReject(get(ref(db, 'students')), 5000, 'Timed out reading /students')
    );
    if (sSnap.exists()) studentsVal = sSnap.val() || {};
  } catch (err: any) {
    inspectionErrors.push(err?.message || 'Failed reading /students');
  }

  try {
    const aSnap = await runRtdbOp('GET', '/attendance', () =>
      withTimeoutReject(get(ref(db, 'attendance')), 5000, 'Timed out reading /attendance')
    );
    if (aSnap.exists()) legacyAttVal = aSnap.val() || {};
  } catch (err: any) {
    inspectionErrors.push(err?.message || 'Failed reading /attendance');
  }

  try {
    const saSnap = await withTimeout(get(ref(db, 'students_attendance')), 2500, null);
    if (saSnap && saSnap.exists && saSnap.exists()) legacyStuAttVal = saSnap.val() || {};
  } catch {}

  try {
    const recSnap = await withTimeout(get(ref(db, 'migration_recovery/unregistered_attendance')), 2500, null);
    if (recSnap && recSnap.exists && recSnap.exists()) recoveryVal = recSnap.val() || {};
  } catch {}

  try {
    const bSnap = await runRtdbOp('GET', '/backups', () =>
      withTimeoutReject(get(ref(db, 'backups')), 4000, 'Timed out reading /backups')
    );
    if (bSnap.exists()) {
      const backupsObj = bSnap.val() || {};
      const keys = Object.keys(backupsObj);
      backupCount = keys.length;
      keys.forEach((k) => {
        const verifiedAt = backupsObj[k]?.migrationVerification?.completedAt;
        if (typeof verifiedAt === 'number' && (!migrationCompletedAt || verifiedAt > migrationCompletedAt)) {
          migrationCompletedAt = verifiedAt;
        }
      });
    }
  } catch (err: any) {
    inspectionErrors.push(err?.message || 'Failed reading /backups');
  }

  if (!migrationCompletedAt) {
    try {
      const mSnap = await withTimeout(get(ref(db, 'migration_status/unified_students_v1')), 2000, null);
      if (mSnap && mSnap.exists && mSnap.exists()) {
        migrationCompletedAt = mSnap.val()?.completedAt;
      }
    } catch {}
  }

  const normalizedStudents: Record<string, Student> = {};
  let alreadyUnifiedCount = 0;
  Object.entries(studentsVal).forEach(([k, st]) => {
    if (!st || typeof st !== 'object') return;
    const normKey = normalizeRfidKey(st?.uid || k);
    normalizedStudents[normKey] = st;
    if (st?.attendance && typeof st.attendance === 'object') {
      alreadyUnifiedCount += Object.keys(st.attendance).length;
    }
  });

  const legacyDates = Object.keys(legacyAttVal);
  const legacyRecordCount = countLegacyAttendanceRecords(legacyAttVal, legacyStuAttVal);

  const unregisteredGroups: UnregisteredAttendanceGroup[] = [];
  let unregisteredCount = 0;
  Object.entries(recoveryVal).forEach(([uidKey, datesMap]) => {
    if (datesMap && typeof datesMap === 'object') {
      const records: Record<string, AttendanceRecord> = {};
      let sampleName: string | undefined = undefined;
      Object.entries(datesMap).forEach(([dKey, raw]) => {
        const normRec = normalizeAttendanceRecord(raw, dKey, uidKey);
        records[dKey] = normRec;
        if (!sampleName && raw?.name) sampleName = raw.name;
        if (!sampleName && raw?.studentName) sampleName = raw.studentName;
      });
      const count = Object.keys(records).length;
      if (count > 0) {
        unregisteredCount += count;
        unregisteredGroups.push({
          uid: normalizeRfidKey(uidKey),
          records,
          recordCount: count,
          sampleName,
        });
      }
    }
  });

  return {
    hasLegacyAttendance: legacyRecordCount > 0,
    legacyDateCount: legacyDates.length,
    legacyRecordCount,
    studentCount: Object.keys(normalizedStudents).length,
    alreadyUnifiedCount,
    unregisteredCount,
    unregisteredGroups,
    backupCount,
    migrationCompletedAt,
    legacyKeysSample: legacyDates.slice(0, 6),
    authenticatedUid,
    isAuthorizedAdmin,
    inspectionError: inspectionErrors.length > 0 ? inspectionErrors.join(' | ') : undefined,
  };
}

/**
 * Real-time listener on legacy /attendance/{DATE}/{UID} so admin detects pending or newly uploaded
 * legacy records immediately and triggers automatic verified migration without manual intervention.
 */
export function subscribeToLegacyAttendanceChanges(
  onDetected: (info: { hasLegacy: boolean; recordCount: number; signature: string }) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const db = getFirebaseDatabase();
    const attRef = ref(db, 'attendance');
    const unsubscribe = onValue(
      attRef,
      (snap) => {
        if (!snap.exists()) {
          onDetected({ hasLegacy: false, recordCount: 0, signature: '' });
          return;
        }
        const val = snap.val() as Record<string, Record<string, any>>;
        const keys: string[] = [];
        let recordCount = 0;
        Object.entries(val || {}).forEach(([dateKey, dayMap]) => {
          if (!dayMap || typeof dayMap !== 'object') return;
          Object.entries(dayMap).forEach(([uidKey, rawRec]) => {
            if (!rawRec || typeof rawRec !== 'object') return;
            recordCount++;
            const normUid = normalizeRfidKey((rawRec as any).rfidUID || (rawRec as any).uid || uidKey);
            keys.push(`${dateKey}::${normUid}::${(rawRec as any).timestamp || ''}`);
          });
        });
        keys.sort();
        onDetected({
          hasLegacy: recordCount > 0,
          recordCount,
          signature: `${recordCount}|${keys.join(',')}`,
        });
      },
      (err) => {
        console.warn('Legacy /attendance listener error:', err?.message);
        onError?.(
          new RtdbOperationError(
            'ON_VALUE',
            '/attendance',
            (err as any)?.code || 'PERMISSION_DENIED',
            err?.message || 'Permission denied reading /attendance'
          )
        );
      }
    );
    return () => off(attRef, 'value', unsubscribe);
  } catch (err: any) {
    onError?.(err);
    return () => {};
  }
}

/**
 * Create a verified backup under /backups/{backupKey} before migration and return downloadable JSON + RTDB path.
 */
export async function exportCompleteDatabaseBackup(
  adminUser?: { email?: string | null; uid?: string }
): Promise<{
  backupPath: string;
  rawBackupPath: string;
  backupKey: string;
  jsonString: string;
  filename: string;
  verifiedRecordCount: number;
  expectedRecordCount: number;
  adminUid: string;
}> {
  const verifiedAdmin = await verifyAdministratorAuth();
  const db = getFirebaseDatabase();
  const ts = Date.now();
  const dateStamp = `${getISTDateStr(ts)}_${getISTTimeStr(ts).replace(/:/g, '-')}`;

  const studentsVal = await runRtdbOp('GET', '/students', async () => {
    const s = await withTimeoutReject(get(ref(db, 'students')), 6000, 'Timed out reading /students');
    return s.exists() ? s.val() : null;
  });

  const attendanceVal = await runRtdbOp('GET', '/attendance', async () => {
    const s = await withTimeoutReject(get(ref(db, 'attendance')), 6000, 'Timed out reading /attendance');
    return s.exists() ? s.val() : null;
  });

  const safeGet = async (path: string) => {
    try {
      const s = await withTimeout(get(ref(db, path)), 2500, null);
      return s && s.exists && s.exists() ? s.val() : null;
    } catch {
      return null;
    }
  };

  const studentsAttendanceVal = await safeGet('students_attendance');
  const expectedRecordCount = countLegacyAttendanceRecords(attendanceVal, studentsAttendanceVal);

  const backupPayload = stripUndefinedDeep({
    createdAt: ts,
    createdAtIst: getISTTimestampDisplay(ts),
    createdBy: verifiedAdmin.email || adminUser?.email || 'admin',
    createdByUid: verifiedAdmin.uid,
    schemaVersion: 'pre_unified_students_v1',
    legacyAttendanceRecordCount: expectedRecordCount,
    nodes: {
      students: studentsVal,
      attendance: attendanceVal,
      students_attendance: studentsAttendanceVal,
      working_days: await safeGet('working_days'),
      settings: await safeGet('settings'),
      suspensions: await safeGet('suspensions'),
      attendance_trash: await safeGet('attendance_trash'),
      audit_logs: await safeGet('audit_logs'),
      migration_recovery: await safeGet('migration_recovery'),
      users: await safeGet('users'),
      rfid_to_uid: await safeGet('rfid_to_uid'),
    },
  });

  const backupKey = `pre_migration_${ts}`;
  const rawBackupPath = `backups/${backupKey}`;
  const backupPath = `/${rawBackupPath}`;

  await runRtdbOp('SET', backupPath, () =>
    withTimeoutReject(set(ref(db, rawBackupPath), backupPayload), 8000, `Timed out writing backup to ${backupPath}`)
  );

  // Verify the backup read-back contains every legacy attendance record
  const verifySnap = await runRtdbOp('GET (Verify Backup)', backupPath, () =>
    withTimeoutReject(get(ref(db, rawBackupPath)), 6000, `Timed out verifying backup at ${backupPath}`)
  );

  if (!verifySnap.exists()) {
    throw new RtdbOperationError(
      'VERIFY_BACKUP',
      backupPath,
      'BACKUP_MISSING',
      `Backup snapshot does not exist at ${backupPath} after write.`
    );
  }

  const verifiedVal = verifySnap.val();
  const verifiedRecordCount = countLegacyAttendanceRecords(
    verifiedVal?.nodes?.attendance,
    verifiedVal?.nodes?.students_attendance
  );

  if (verifiedRecordCount !== expectedRecordCount) {
    throw new RtdbOperationError(
      'VERIFY_BACKUP',
      backupPath,
      'BACKUP_COUNT_MISMATCH',
      `Backup at ${backupPath} recorded ${verifiedRecordCount}/${expectedRecordCount} legacy attendance records.`
    );
  }

  return {
    backupPath,
    rawBackupPath,
    backupKey,
    jsonString: JSON.stringify(backupPayload, null, 2),
    filename: `rfid_attendance_backup_${dateStamp}.json`,
    verifiedRecordCount,
    expectedRecordCount,
    adminUid: verifiedAdmin.uid,
  };
}

/**
 * Safely migrate legacy /attendance & /students_attendance into unified /students/{RFID_UID}/attendance/{DATE}.
 * 1. Verifies Firebase Auth & Administrator UID (bi3c890VUXhVE0JFxroYfnlQwea2).
 * 2. Reads all legacy attendance records & creates verified backup under /backups.
 * 3. Verifies backup contains all legacy records before touching /students.
 * 4. Writes records strictly to /students/{UID}/attendance/{DATE} without unauthorized root writes.
 * 5. Verifies every migrated record via read-back parity checks.
 * 6. Preserves /attendance until 100% verification passes.
 */
let activeMigrationPromise: Promise<MigrationResult> | null = null;

export async function runUnifiedDatabaseMigration(
  adminUser: { email?: string | null; uid?: string }
): Promise<MigrationResult> {
  if (activeMigrationPromise) {
    return activeMigrationPromise;
  }

  activeMigrationPromise = executeUnifiedDatabaseMigrationInternal(adminUser).finally(() => {
    activeMigrationPromise = null;
  });
  return activeMigrationPromise;
}

async function executeUnifiedDatabaseMigrationInternal(
  adminUser: { email?: string | null; uid?: string }
): Promise<MigrationResult> {
  const db = getFirebaseDatabase();
  const errors: string[] = [];
  const recordLogs: MigrationRecordLog[] = [];

  // 1. Verify Firebase Authentication and Administrator UID match
  let verifiedAdmin: { uid: string; email: string | null; tokenVerified: boolean };
  try {
    verifiedAdmin = await verifyAdministratorAuth();
  } catch (authErr: any) {
    const opErr = authErr instanceof RtdbOperationError ? authErr : null;
    const msg = authErr?.message || 'Administrator authentication verification failed.';
    return {
      success: false,
      message: `Migration aborted: ${msg}`,
      migratedCount: 0,
      skippedDuplicateCount: 0,
      unregisteredCount: 0,
      verifiedCount: 0,
      totalLegacyCount: 0,
      legacyRemoved: false,
      failedOperation: opErr?.operation || 'AUTH_CHECK',
      failedPath: opErr?.path || '/auth/currentUser',
      errors: [msg],
      recordLogs,
    };
  }

  // 2. Mandatory pre-migration backup under /backups + read-back verification
  let backupPath = '';
  let rawBackupPath = '';
  let backupVerifiedCount = 0;
  let backupExpectedCount = 0;
  try {
    const backup = await exportCompleteDatabaseBackup({
      email: verifiedAdmin.email || adminUser?.email,
      uid: verifiedAdmin.uid,
    });
    backupPath = backup.backupPath;
    rawBackupPath = backup.rawBackupPath;
    backupVerifiedCount = backup.verifiedRecordCount;
    backupExpectedCount = backup.expectedRecordCount;
  } catch (err: any) {
    const opErr = err instanceof RtdbOperationError ? err : null;
    const msg = err?.message || 'Backup write failed';
    return {
      success: false,
      message: `Migration aborted: Pre-migration backup failed. Legacy /attendance was preserved.`,
      adminUid: verifiedAdmin.uid,
      migratedCount: 0,
      skippedDuplicateCount: 0,
      unregisteredCount: 0,
      verifiedCount: 0,
      totalLegacyCount: 0,
      legacyRemoved: false,
      failedOperation: opErr?.operation || 'BACKUP',
      failedPath: opErr?.path || '/backups',
      errors: [msg],
      recordLogs,
    };
  }

  // 3. Read /students explicitly (no silent null fallback)
  let rawStudents: Record<string, any> = {};
  try {
    const studentsSnap = await runRtdbOp('GET', '/students', () =>
      withTimeoutReject(get(ref(db, 'students')), 6000, 'Timed out reading /students')
    );
    rawStudents = studentsSnap.exists() ? studentsSnap.val() : {};
  } catch (err: any) {
    const opErr = err instanceof RtdbOperationError ? err : null;
    const msg = err?.message || 'Failed reading /students';
    return {
      success: false,
      message: `Migration aborted reading /students. Legacy /attendance was preserved.`,
      adminUid: verifiedAdmin.uid,
      backupPath,
      backupVerifiedCount,
      backupExpectedCount,
      migratedCount: 0,
      skippedDuplicateCount: 0,
      unregisteredCount: 0,
      verifiedCount: 0,
      totalLegacyCount: 0,
      legacyRemoved: false,
      failedOperation: opErr?.operation || 'GET',
      failedPath: opErr?.path || '/students',
      errors: [msg],
      recordLogs,
    };
  }

  const studentRegistry: Record<string, Student> = {};
  const rfidToDbKey: Record<string, string> = {};

  for (const [rawKey, rawStu] of Object.entries(rawStudents)) {
    if (!rawStu || typeof rawStu !== 'object') continue;
    const dbKey = rawKey.trim();
    const cardRfid = normalizeRfidKey(rawStu.rfidUID || rawStu.uid || dbKey);
    const existing = studentRegistry[dbKey];
    const mergedAttendance: Record<string, AttendanceRecord> = {
      ...(existing?.attendance || {}),
      ...(rawStu.attendance || {}),
    };
    studentRegistry[dbKey] = stripUndefinedDeep({
      ...(existing || {}),
      ...rawStu,
      studentDbId: dbKey,
      rfidUID: cardRfid,
      uid: cardRfid,
      ...(Object.keys(mergedAttendance).length > 0 ? { attendance: mergedAttendance } : {}),
    });
    rfidToDbKey[cardRfid] = dbKey;
  }

  // Also read /rfid_to_student index so reassigned RFID cards route legacy records to the right student
  try {
    const idxSnap = await withTimeout(get(ref(db, 'rfid_to_student')), 2500, null);
    if (idxSnap && idxSnap.exists && idxSnap.exists()) {
      const idxVal = idxSnap.val() as Record<string, any>;
      Object.entries(idxVal || {}).forEach(([rfidKey, mapping]) => {
        const targetDbId = typeof mapping === 'string' ? mapping : mapping?.studentDbId;
        if (targetDbId && studentRegistry[targetDbId]) {
          rfidToDbKey[normalizeRfidKey(rfidKey)] = targetDbId;
        }
      });
    }
  } catch {}

  // 4. Read all legacy records from /attendance (explicitly, no silent timeout suppression)
  let hasRootAttendance = false;
  let legacyAtt: Record<string, Record<string, any>> = {};
  try {
    const attSnap = await runRtdbOp('GET', '/attendance', () =>
      withTimeoutReject(get(ref(db, 'attendance')), 6000, 'Timed out reading /attendance')
    );
    hasRootAttendance = attSnap.exists();
    if (hasRootAttendance) {
      legacyAtt = attSnap.val() || {};
    }
  } catch (err: any) {
    const opErr = err instanceof RtdbOperationError ? err : null;
    const msg = err?.message || 'Failed reading /attendance';
    return {
      success: false,
      message: `Migration aborted reading /attendance. Legacy /attendance was preserved.`,
      adminUid: verifiedAdmin.uid,
      backupPath,
      backupVerifiedCount,
      backupExpectedCount,
      migratedCount: 0,
      skippedDuplicateCount: 0,
      unregisteredCount: 0,
      verifiedCount: 0,
      totalLegacyCount: 0,
      legacyRemoved: false,
      failedOperation: opErr?.operation || 'GET',
      failedPath: opErr?.path || '/attendance',
      errors: [msg],
      recordLogs,
    };
  }

  let hasLegacyStudentsAttendance = false;
  let legacyStuAtt: Record<string, Record<string, any>> = {};
  try {
    const saSnap = await withTimeout(get(ref(db, 'students_attendance')), 3500, null);
    if (saSnap && saSnap.exists && saSnap.exists()) {
      hasLegacyStudentsAttendance = true;
      legacyStuAtt = saSnap.val() || {};
    }
  } catch {}

  const legacyPairs = new Map<string, { date: string; rawUid: string; normUid: string; rawRec: any }>();

  Object.entries(legacyAtt).forEach(([dateKey, dayMap]) => {
    if (!dayMap || typeof dayMap !== 'object') return;
    Object.entries(dayMap).forEach(([uidKey, rawRec]) => {
      if (!rawRec || typeof rawRec !== 'object') return;
      const normUid = normalizeRfidKey(rawRec.rfidUID || rawRec.uid || uidKey);
      const key = `${dateKey}::${normUid}`;
      legacyPairs.set(key, { date: dateKey, rawUid: uidKey, normUid, rawRec });
    });
  });

  Object.entries(legacyStuAtt).forEach(([uidKey, datesMap]) => {
    if (!datesMap || typeof datesMap !== 'object') return;
    Object.entries(datesMap).forEach(([dateKey, rawRec]) => {
      if (!rawRec || typeof rawRec !== 'object') return;
      const normUid = normalizeRfidKey(rawRec.rfidUID || rawRec.uid || uidKey);
      const key = `${dateKey}::${normUid}`;
      if (!legacyPairs.has(key)) {
        legacyPairs.set(key, { date: dateKey, rawUid: uidKey, normUid, rawRec });
      }
    });
  });

  const totalLegacyCount = legacyPairs.size;
  if (totalLegacyCount === 0) {
    return {
      success: true,
      message: `No legacy records found in /attendance. Verified backup created at ${backupPath}.`,
      adminUid: verifiedAdmin.uid,
      backupPath,
      backupVerifiedCount,
      backupExpectedCount,
      migratedCount: 0,
      skippedDuplicateCount: 0,
      unregisteredCount: 0,
      verifiedCount: 0,
      totalLegacyCount: 0,
      legacyRemoved: !hasRootAttendance,
      errors: [],
      recordLogs,
    };
  }

  let migratedCount = 0;
  let skippedDuplicateCount = 0;
  let unregisteredCount = 0;
  let firstFailedOperation: string | undefined;
  let firstFailedPath: string | undefined;

  const expectedTargets: Array<{ targetPath: string; date: string; uid: string; studentDbId?: string; status: string }> = [];

  // 5. Migrate each record dynamically to /students/{studentDbId}/attendance/{DATE}
  for (const entry of legacyPairs.values()) {
    const { date, normUid, rawRec } = entry;

    let targetStudent: Student | undefined =
      (rawRec.studentDbId && studentRegistry[rawRec.studentDbId]) ||
      (rfidToDbKey[normUid] && studentRegistry[rfidToDbKey[normUid]]) ||
      studentRegistry[normUid];

    if (!targetStudent && rawRec.studentId) {
      const targetStuId = rawRec.studentId.toString().trim().toUpperCase();
      targetStudent = Object.values(studentRegistry).find(
        (s) => s.studentId?.trim().toUpperCase() === targetStuId
      );
    }
    if (!targetStudent && rawRec.authUid) {
      targetStudent = Object.values(studentRegistry).find(
        (s) => s.authUid === rawRec.authUid
      );
    }
    if (!targetStudent && rawRec.email) {
      const targetEmail = rawRec.email.toString().trim().toLowerCase();
      targetStudent = Object.values(studentRegistry).find(
        (s) => s.email?.trim().toLowerCase() === targetEmail
      );
    }
    if (!targetStudent && (rawRec.studentName || rawRec.name)) {
      const targetName = (rawRec.studentName || rawRec.name).toString().trim().toLowerCase();
      targetStudent = Object.values(studentRegistry).find(
        (s) => s.name?.trim().toLowerCase() === targetName
      );
    }

    try {
      if (targetStudent) {
        const targetDbId = (targetStudent.studentDbId || normUid).trim();
        const targetUid = normalizeRfidKey(targetStudent.rfidUID || targetStudent.uid || normUid);
        const destPath = `students/${targetDbId}/attendance/${date}`;
        const existingAtTarget = targetStudent.attendance?.[date];
        const normalizedRec = stripUndefinedDeep(
          normalizeAttendanceRecord(
            {
              ...rawRec,
              studentDbId: targetDbId,
              uid: targetUid,
              studentUID: targetUid,
              rfidUID: targetUid,
              studentRfid: targetUid,
              studentName: rawRec.studentName || rawRec.name || targetStudent.name,
              studentId: rawRec.studentId || targetStudent.studentId,
              department: rawRec.department || targetStudent.department,
              authUid: rawRec.authUid || targetStudent.authUid || '',
              source: rawRec.source || 'migration',
              date: rawRec.date || date,
            },
            date,
            targetUid,
            targetDbId
          )
        );

        const validationErr = validateAttendancePayload(normalizedRec);
        if (validationErr) {
          if (!firstFailedOperation) {
            firstFailedOperation = 'VALIDATE_PAYLOAD';
            firstFailedPath = `/${destPath}`;
          }
          errors.push(`/${destPath}: ${validationErr}`);
          recordLogs.push({ uid: targetUid, date, targetPath: `/${destPath}`, action: 'failed', message: validationErr });
          continue;
        }

        if (existingAtTarget) {
          const merged = stripUndefinedDeep(mergeAttendanceEntries(existingAtTarget, normalizedRec));
          await runRtdbOp('SET', `/${destPath}`, () => set(ref(db, destPath), merged));
          skippedDuplicateCount++;
          recordLogs.push({
            uid: targetUid,
            date,
            targetPath: `/${destPath}`,
            action: 'merged',
            message: 'Duplicate avoided; merged with existing unified record',
          });
          expectedTargets.push({ targetPath: destPath, date, uid: targetUid, studentDbId: targetDbId, status: merged.status });
        } else {
          await runRtdbOp('SET', `/${destPath}`, () => set(ref(db, destPath), normalizedRec));
          migratedCount++;
          recordLogs.push({
            uid: targetUid,
            date,
            targetPath: `/${destPath}`,
            action: 'migrated',
            message: `Preserved ${normalizedRec.time} (${normalizedRec.status})`,
          });
          expectedTargets.push({ targetPath: destPath, date, uid: targetUid, studentDbId: targetDbId, status: normalizedRec.status });
        }
      } else {
        const recPath = `migration_recovery/unregistered_attendance/${normUid}/${date}`;
        const normalizedUnreg = stripUndefinedDeep(
          normalizeAttendanceRecord(
            {
              ...rawRec,
              uid: normUid,
              rfidUID: normUid,
              date: rawRec.date || date,
            },
            date,
            normUid
          )
        );
        await runRtdbOp('SET', `/${recPath}`, () => set(ref(db, recPath), normalizedUnreg));
        unregisteredCount++;
        expectedTargets.push({ targetPath: recPath, date, uid: normUid, status: normalizedUnreg.status });
        recordLogs.push({
          uid: normUid,
          date,
          targetPath: `/${recPath}`,
          action: 'recovery',
          message: 'Unregistered RFID archived safely in recovery vault',
        });
      }
    } catch (recErr: any) {
      const opErr = recErr instanceof RtdbOperationError ? recErr : null;
      const errMsg = recErr?.message || 'Write failed';
      const failPath = opErr?.path || `/students/${normUid}/attendance/${date}`;
      if (!firstFailedOperation) {
        firstFailedOperation = opErr?.operation || 'SET';
        firstFailedPath = failPath;
      }
      errors.push(errMsg);
      recordLogs.push({
        uid: normUid,
        date,
        targetPath: failPath,
        action: 'failed',
        message: errMsg,
      });
    }
  }

  // 6. Verify EVERY migrated record via read-back parity check
  let verifiedCount = 0;
  for (const target of expectedTargets) {
    try {
      const checkSnap = await runRtdbOp('GET (Verify Migrated)', `/${target.targetPath}`, () =>
        withTimeoutReject(
          get(ref(db, target.targetPath)),
          5000,
          `Verification read timed out at /${target.targetPath}`
        )
      );
      if (checkSnap.exists()) {
        const val = checkSnap.val() || {};
        const storedUid = normalizeRfidKey(val.uid || val.rfidUID || '');
        const storedDbId = (val.studentDbId || '').toString().trim();
        const idMatches =
          storedUid === target.uid ||
          (target.studentDbId && storedDbId === target.studentDbId);
        const hasValidFields =
          val.date === target.date &&
          idMatches &&
          Boolean(val.status) &&
          Boolean(val.time) &&
          typeof val.timestamp === 'number' &&
          val.timestamp > 0;
        if (hasValidFields) {
          verifiedCount++;
        } else {
          if (!firstFailedOperation) {
            firstFailedOperation = 'VERIFY_PARITY';
            firstFailedPath = `/${target.targetPath}`;
          }
          errors.push(`Parity mismatch at /${target.targetPath} (stored uid=${storedUid}, date=${val.date || 'missing'})`);
        }
      } else {
        if (!firstFailedOperation) {
          firstFailedOperation = 'VERIFY_EXISTS';
          firstFailedPath = `/${target.targetPath}`;
        }
        errors.push(`Missing verified record at /${target.targetPath}`);
      }
    } catch (verifyErr: any) {
      const opErr = verifyErr instanceof RtdbOperationError ? verifyErr : null;
      if (!firstFailedOperation) {
        firstFailedOperation = opErr?.operation || 'GET (Verify Migrated)';
        firstFailedPath = opErr?.path || `/${target.targetPath}`;
      }
      errors.push(verifyErr?.message || `Verification error at /${target.targetPath}`);
    }
  }

  const isVerified =
    verifiedCount === totalLegacyCount &&
    verifiedCount === expectedTargets.length &&
    errors.length === 0;
  let legacyRemoved = false;

  // 7. Preserve legacy /attendance until 100% verification passes
  if (isVerified) {
    if (hasRootAttendance) {
      try {
        await runRtdbOp('REMOVE', '/attendance', () => remove(ref(db, 'attendance')));
        legacyRemoved = true;
      } catch (rmErr: any) {
        const opErr = rmErr instanceof RtdbOperationError ? rmErr : null;
        if (!firstFailedOperation) {
          firstFailedOperation = opErr?.operation || 'REMOVE';
          firstFailedPath = opErr?.path || '/attendance';
        }
        errors.push(rmErr?.message || 'Could not remove legacy /attendance');
        legacyRemoved = false;
      }
    } else {
      legacyRemoved = true;
    }

    if (hasLegacyStudentsAttendance) {
      try {
        await runRtdbOp('REMOVE', '/students_attendance', () => remove(ref(db, 'students_attendance')));
      } catch {
        // Non-blocking legacy auxiliary cleanup
      }
    }

    // Record verification summary strictly inside the authorized /backups node
    if (rawBackupPath) {
      try {
        await runRtdbOp('UPDATE', `${backupPath}/migrationVerification`, () =>
          update(ref(db, rawBackupPath), {
            migrationVerification: {
              completedAt: Date.now(),
              completedAtIst: getISTTimestampDisplay(),
              completedBy: verifiedAdmin.email || 'admin',
              completedByUid: verifiedAdmin.uid,
              migratedCount,
              skippedDuplicateCount,
              unregisteredCount,
              verifiedCount,
              totalLegacyCount,
              legacyRemoved,
            },
          })
        );
      } catch {
        // Non-blocking metadata update on verified backup
      }
    }
  }

  const overallSuccess = isVerified && legacyRemoved && errors.length === 0;

  return {
    success: overallSuccess,
    message: overallSuccess
      ? `Migration verified (${verifiedCount}/${totalLegacyCount} records confirmed). Backup verified at ${backupPath} and legacy /attendance removed.`
      : isVerified && !legacyRemoved
      ? `All ${verifiedCount}/${totalLegacyCount} records migrated & verified, but legacy /attendance cleanup failed. Legacy records remain preserved.`
      : `Migration failed or verification incomplete (${verifiedCount}/${totalLegacyCount} verified). Legacy /attendance was preserved.`,
    adminUid: verifiedAdmin.uid,
    backupPath,
    backupVerifiedCount,
    backupExpectedCount,
    migratedCount,
    skippedDuplicateCount,
    unregisteredCount,
    verifiedCount,
    totalLegacyCount,
    legacyRemoved,
    failedOperation: overallSuccess ? undefined : firstFailedOperation,
    failedPath: overallSuccess ? undefined : firstFailedPath,
    errors,
    recordLogs,
  };
}

export function subscribeToMigrationRecovery(
  onUpdate: (groups: UnregisteredAttendanceGroup[]) => void
): () => void {
  try {
    const db = getFirebaseDatabase();
    const recRef = ref(db, 'migration_recovery/unregistered_attendance');
    const unsubscribe = onValue(
      recRef,
      (snap) => {
        if (!snap.exists()) {
          onUpdate([]);
          return;
        }
        const val = snap.val() as Record<string, Record<string, any>>;
        const list: UnregisteredAttendanceGroup[] = [];
        Object.entries(val).forEach(([uidKey, datesMap]) => {
          if (!datesMap || typeof datesMap !== 'object') return;
          const records: Record<string, AttendanceRecord> = {};
          let sampleName: string | undefined = undefined;
          Object.entries(datesMap).forEach(([dKey, raw]) => {
            records[dKey] = normalizeAttendanceRecord(raw, dKey, uidKey);
            if (!sampleName && raw?.name) sampleName = raw.name;
            if (!sampleName && raw?.studentName) sampleName = raw.studentName;
          });
          const count = Object.keys(records).length;
          if (count > 0) {
            list.push({
              uid: normalizeRfidKey(uidKey),
              records,
              recordCount: count,
              sampleName,
            });
          }
        });
        onUpdate(list);
      },
      () => onUpdate([])
    );
    return () => off(recRef, 'value', unsubscribe);
  } catch {
    return () => {};
  }
}

export async function assignRecoveredAttendanceToStudent(
  unregisteredUidInput: string,
  targetStudentIdOrRfid: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; assignedCount: number }> {
  const db = getFirebaseDatabase();
  const unregisteredUid = normalizeRfidKey(unregisteredUidInput);
  const resolved = await resolveStudentByAnyId(targetStudentIdOrRfid);
  if (!resolved) {
    throw new Error(`Target student ${targetStudentIdOrRfid} does not exist.`);
  }
  const targetDbId = resolved.studentDbId;
  const targetStudent = resolved.student;
  const targetCardUid = resolved.rfidUID;

  const recRef = ref(db, `migration_recovery/unregistered_attendance/${unregisteredUid}`);
  const recSnap = await get(recRef);
  if (!recSnap.exists()) {
    throw new Error(`No recovered records found for ${unregisteredUid}.`);
  }

  const recMap = recSnap.val() as Record<string, any>;
  const assignedDates: string[] = [];

  for (const [dateKey, rawRec] of Object.entries(recMap)) {
    const destRef = ref(db, `students/${targetDbId}/attendance/${dateKey}`);
    const existingSnap = await get(destRef);
    const updatedRec = stripUndefinedDeep(
      normalizeAttendanceRecord(
        {
          ...rawRec,
          studentDbId: targetDbId,
          uid: targetCardUid,
          rfidUID: targetCardUid,
          studentRfid: targetCardUid,
          studentName: targetStudent.name,
          studentId: targetStudent.studentId,
          department: targetStudent.department,
          authUid: targetStudent.authUid || '',
          date: dateKey,
          notes: `Recovered & reassigned from legacy UID ${unregisteredUid}`,
        },
        dateKey,
        targetCardUid,
        targetDbId
      )
    );

    if (existingSnap.exists()) {
      await set(destRef, mergeAttendanceEntries(existingSnap.val(), updatedRec));
    } else {
      await set(destRef, updatedRec);
    }
    assignedDates.push(dateKey);
  }

  await syncWorkingDaysFromDates(assignedDates);
  await remove(recRef);

  await logAuditActivity('DATABASE_MIGRATION', adminUser, {
    studentRfid: targetCardUid,
    studentName: targetStudent.name,
    studentId: targetStudent.studentId,
    affectedCount: assignedDates.length,
    reason: `Assigned ${assignedDates.length} recovered legacy attendance records from UID ${unregisteredUid} to ${targetStudent.name}`,
  });

  return { success: true, assignedCount: assignedDates.length };
}

export async function deleteRecoveredAttendance(
  unregisteredUidInput: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<void> {
  const db = getFirebaseDatabase();
  const unregisteredUid = normalizeRfidKey(unregisteredUidInput);
  await remove(ref(db, `migration_recovery/unregistered_attendance/${unregisteredUid}`));
  await logAuditActivity('DATABASE_MIGRATION', adminUser, {
    studentRfid: unregisteredUid,
    reason: `Dismissed unregistered recovered attendance records for unknown UID ${unregisteredUid}`,
  });
}

/**
 * Administrator-only recovery: Links an existing Firebase Authentication UID
 * to an existing registered student node (/students/{studentDbId}) WITHOUT
 * overwriting student details, RFID card, or attendance history.
 */
export async function linkAuthUidToStudent(
  studentDbIdInput: string,
  authUidInput: string,
  overrideEmail?: string
): Promise<{ studentDbId: string; authUid: string; rfidUID: string }> {
  const adminCheck = await verifyAdministratorAuth();
  const db = getFirebaseDatabase();
  const fs = getFirebaseFirestore();

  const studentDbId = studentDbIdInput.trim();
  const authUid = authUidInput.trim();
  if (!studentDbId || !authUid) {
    throw new Error('Both Student Database ID and Firebase Auth UID are required.');
  }
  if (authUid === CONFIGURED_ADMIN_UID) {
    throw new Error('Cannot link the primary System Administrator UID as a student account.');
  }

  const studentSnap = await runRtdbOp('GET', `/students/${studentDbId}`, () =>
    get(ref(db, `students/${studentDbId}`))
  );
  if (!studentSnap.exists()) {
    throw new Error(`Student record not found at /students/${studentDbId}.`);
  }

  const student = studentSnap.val() as Student;
  const rfidUID = (student.rfidUID || student.uid || studentDbId).trim().toUpperCase();

  // Guard against linking an Auth UID that already belongs to a different student
  const existingMapSnap = await withTimeout(get(ref(db, `auth_to_student/${authUid}`)), 2500, null);
  if (existingMapSnap && existingMapSnap.exists && existingMapSnap.exists()) {
    const mappedDbId = existingMapSnap.val()?.studentDbId;
    if (mappedDbId && mappedDbId !== studentDbId) {
      throw new Error(
        `Firebase Auth UID ${authUid} is already linked to student "${mappedDbId}". Resolve the conflict before re-linking.`
      );
    }
  }

  const resolvedEmail = (overrideEmail || student.email || '').trim().toLowerCase();

  await runRtdbOp('UPDATE', `/students/${studentDbId}`, () =>
    update(
      ref(db, `students/${studentDbId}`),
      stripUndefinedDeep({
        studentDbId,
        rfidUID,
        uid: rfidUID,
        authUid,
        ...(resolvedEmail && !student.email ? { email: resolvedEmail } : {}),
      })
    )
  );

  const userProfile: UserProfile = stripUndefinedDeep({
    uid: authUid,
    studentDbId,
    name: student.name || 'Student',
    email: resolvedEmail,
    rollNumber: student.studentId || '',
    department: student.department || '',
    year: student.year || '',
    semester: student.semester || 'Semester 1',
    role: 'student',
    rfidUID,
    phone: student.phone || '',
    createdAt: Date.now(),
  });

  await runRtdbOp('SET', `/users/${authUid}`, () =>
    update(ref(db, `users/${authUid}`), userProfile)
  );
  await runRtdbOp('SET', `/auth_to_student/${authUid}`, () =>
    set(
      ref(db, `auth_to_student/${authUid}`),
      stripUndefinedDeep({
        authUid,
        studentDbId,
        rfidUID,
        rollNumber: student.studentId || '',
        email: resolvedEmail,
        updatedAt: Date.now(),
      })
    )
  );
  await runRtdbOp('UPDATE', `/rfid_to_student/${rfidUID}`, () =>
    update(
      ref(db, `rfid_to_student/${rfidUID}`),
      stripUndefinedDeep({
        rfidUID,
        studentDbId,
        authUid,
        rollNumber: student.studentId || '',
        active: student.status !== 'inactive',
        updatedAt: Date.now(),
      })
    )
  );
  await update(ref(db, `rfid_to_uid/${rfidUID}`), { authUid }).catch(() => {});
  await withTimeout(setDoc(doc(fs, 'users', authUid), userProfile, { merge: true }), 2500, null).catch(() => {});

  await logAuditActivity('STUDENT_UPDATE', { uid: adminCheck.uid, email: adminCheck.email }, {
    studentRfid: rfidUID,
    studentName: student.name,
    studentId: student.studentId,
    reason: `Linked Firebase Auth UID ${authUid} to existing student ${studentDbId}`,
  });

  return { studentDbId, authUid, rfidUID };
}

/**
 * Administrator-only provisioning for an EXISTING student record (/students/{studentDbId})
 * that does not yet have a Firebase Authentication account. Preserves existing RFID, student
 * profile, and all nested attendance records without creating a duplicate student.
 */
export async function provisionAuthForExistingStudent(
  studentDbIdInput: string,
  passwordInput: string,
  emailOverride?: string
): Promise<{ studentDbId: string; authUid: string; rfidUID: string; email: string }> {
  await verifyAdministratorAuth();
  const db = getFirebaseDatabase();
  const studentDbId = studentDbIdInput.trim();
  const password = passwordInput.trim();

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const snap = await runRtdbOp('GET', `/students/${studentDbId}`, () =>
    get(ref(db, `students/${studentDbId}`))
  );
  if (!snap.exists()) {
    throw new Error(`Student record not found at /students/${studentDbId}.`);
  }

  const student = snap.val() as Student;
  if (student.authUid) {
    throw new Error(`Student "${student.name}" already has a linked Firebase Auth UID (${student.authUid}).`);
  }

  const email = (emailOverride || student.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('An email address is required to provision Firebase Authentication login.');
  }

  const config = getActiveFirebaseConfig();
  const secondaryAppName = `student_prov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const secondaryApp = initializeApp(
    {
      ...config,
      apiKey: config.apiKey || import.meta.env.VITE_FIREBASE_API_KEY || PROJECT_FIREBASE_API_KEY,
    },
    secondaryAppName
  );
  const secondaryAuth = getAuth(secondaryApp);

  let authUid = '';
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    authUid = cred.user.uid;
    await fbSignOut(secondaryAuth);
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      throw new Error(
        `The email ${email} already exists in Firebase Authentication. Paste that user's Firebase Auth UID in the manual linking tool instead of recreating the account.`
      );
    }
    throw new Error(err?.message || 'Failed provisioning Firebase Authentication account.');
  } finally {
    try {
      await deleteApp(secondaryApp);
    } catch {}
  }

  const linked = await linkAuthUidToStudent(studentDbId, authUid, email);
  return { ...linked, email };
}

/**
 * Pure validation engine used by both live Admin Diagnostics and automated verification.
 */
export function evaluateDatabaseConsistency(params: {
  adminUid: string;
  adminEmail?: string | null;
  permissionChecks: Array<{ path: string; operation: string; allowed: boolean; error?: string }>;
  studentsMap: Record<string, Student>;
  usersMap: Record<string, Partial<UserProfile>>;
  authToStudentMap: Record<string, any>;
  rfidToStudentMap: Record<string, any>;
  legacyAttendanceMap?: Record<string, any>;
  legacyStudentsAttendanceMap?: Record<string, any>;
  recoveryVaultMap?: Record<string, any>;
}): DatabaseValidationReport {
  const {
    adminUid,
    adminEmail,
    permissionChecks,
    studentsMap,
    usersMap,
    authToStudentMap,
    rfidToStudentMap,
    legacyAttendanceMap,
    legacyStudentsAttendanceMap,
    recoveryVaultMap,
  } = params;

  const issues: DatabaseDiagnosticIssue[] = [];
  const unlinkedUserProfiles: UnlinkedUserProfileEntry[] = [];

  let missingUserProfiles = 0;
  let incorrectRoles = 0;
  let missingMappings = 0;
  let ambiguousMappings = 0;
  let invalidRfids = 0;
  let incorrectPaths = 0;
  let missingAttendanceIssues = 0;
  let permissionErrors = 0;

  // 1. Permission-denied errors
  for (const check of permissionChecks) {
    if (!check.allowed) {
      permissionErrors++;
      issues.push({
        id: `perm_${check.path}`,
        category: 'permissions',
        severity: 'critical',
        title: `Permission check failed at ${check.path}`,
        description: check.error || `Client failed ${check.operation} check on ${check.path}. Ensure updated database.rules.json and firestore.rules are published.`,
        path: check.path,
      });
    }
  }

  // 2. Check Admin's own /users/{adminUid} profile
  const adminUserDoc = usersMap[adminUid];
  if (!adminUserDoc || adminUserDoc.role !== 'admin') {
    missingUserProfiles++;
    issues.push({
      id: `admin_profile_${adminUid}`,
      category: !adminUserDoc ? 'missing_profiles' : 'incorrect_roles',
      severity: 'warning',
      title: !adminUserDoc ? 'Missing RTDB profile for signed-in Admin' : 'Admin user profile has non-admin role',
      description: `/users/${adminUid} ${!adminUserDoc ? 'does not exist' : `has role "${adminUserDoc.role}"`}. Auto-repair creates/updates /users/${adminUid} cleanly.`,
      path: `/users/${adminUid}`,
      authUid: adminUid,
      canAutoRepair: true,
      repairAction: 'Ensure /users/{adminUid} has role: "admin"',
    });
  }

  // Track active RFIDs to detect duplicates
  const rfidOwners: Record<string, string[]> = {};
  const linkedAuthUids = new Set<string>();

  // 3. Inspect every registered student under /students/{studentDbId}
  for (const [dbKey, st] of Object.entries(studentsMap || {})) {
    if (!st || typeof st !== 'object') continue;
    const rawRfid = (st.rfidUID || st.uid || '').trim();
    const normRfid = rawRfid.toUpperCase();

    // Incorrect path / metadata mismatch
    if (st.studentDbId && st.studentDbId !== dbKey) {
      incorrectPaths++;
      issues.push({
        id: `path_mismatch_${dbKey}`,
        category: 'incorrect_paths',
        severity: 'warning',
        title: `Student database key mismatch (${dbKey})`,
        description: `Student "${st.name}" is stored at /students/${dbKey} but carries studentDbId="${st.studentDbId}".`,
        path: `/students/${dbKey}`,
        studentDbId: dbKey,
        canAutoRepair: true,
        repairAction: 'Align studentDbId field with storage key',
      });
    } else if (!st.studentDbId) {
      incorrectPaths++;
      issues.push({
        id: `missing_dbid_${dbKey}`,
        category: 'incorrect_paths',
        severity: 'warning',
        title: `Missing studentDbId property (${st.name || dbKey})`,
        description: `Node /students/${dbKey} is missing explicit studentDbId field.`,
        path: `/students/${dbKey}`,
        studentDbId: dbKey,
        canAutoRepair: true,
        repairAction: 'Populate studentDbId without modifying attendance',
      });
    }

    // Invalid or duplicate RFID assignment
    if (!normRfid || !/^[A-Z0-9_-]{4,32}$/.test(normRfid)) {
      invalidRfids++;
      issues.push({
        id: `invalid_rfid_${dbKey}`,
        category: 'invalid_rfid',
        severity: 'critical',
        title: `Invalid or missing RFID UID for ${st.name || dbKey}`,
        description: `Expected a valid uppercase hex/alphanumeric RFID UID; found "${rawRfid || 'empty'}".`,
        path: `/students/${dbKey}`,
        studentDbId: dbKey,
        rfidUID: rawRfid,
      });
    } else {
      if (st.status !== 'inactive') {
        if (!rfidOwners[normRfid]) rfidOwners[normRfid] = [];
        rfidOwners[normRfid].push(dbKey);
      }

      if (rawRfid !== normRfid || (st.uid || '').trim() !== normRfid || (st.rfidUID || '').trim() !== normRfid) {
        invalidRfids++;
        issues.push({
          id: `norm_rfid_${dbKey}`,
          category: 'invalid_rfid',
          severity: 'warning',
          title: `Unnormalized RFID case/fields for ${st.name || dbKey}`,
          description: `Fields uid="${st.uid || ''}" and rfidUID="${st.rfidUID || ''}" should match uppercase "${normRfid}".`,
          path: `/students/${dbKey}`,
          studentDbId: dbKey,
          rfidUID: normRfid,
          canAutoRepair: true,
          repairAction: 'Normalize uid & rfidUID casing',
        });
      }

      const rIdx = rfidToStudentMap[normRfid];
      const rIdxDbId = typeof rIdx === 'string' ? rIdx : rIdx?.studentDbId;
      if (!rIdx || rIdxDbId !== dbKey) {
        missingMappings++;
        issues.push({
          id: `missing_rfid_idx_${dbKey}`,
          category: 'missing_mappings',
          severity: 'warning',
          title: `Missing or out-of-sync RFID index for ${st.name || dbKey}`,
          description: `/rfid_to_student/${normRfid} ${!rIdx ? 'is missing' : `points to "${rIdxDbId}" instead of "${dbKey}"`}.`,
          path: `/rfid_to_student/${normRfid}`,
          studentDbId: dbKey,
          rfidUID: normRfid,
          canAutoRepair: true,
          repairAction: 'Sync /rfid_to_student index',
        });
      }
    }

    // Check Auth UID, /users/{authUid}, and /auth_to_student/{authUid}
    const authUid = (st.authUid || '').trim();
    if (!authUid) {
      // Check candidate matches in usersMap without guessing
      const stEmail = (st.email || '').trim().toLowerCase();
      const stRoll = (st.studentId || '').trim().toUpperCase();
      const candidateUids = Object.entries(usersMap || {})
        .filter(([uid, u]) => {
          if (!u || uid === CONFIGURED_ADMIN_UID || u.role === 'admin') return false;
          const uEmail = (u.email || '').trim().toLowerCase();
          const uRoll = (u.rollNumber || '').trim().toUpperCase();
          const uRfid = (u.rfidUID || '').trim().toUpperCase();
          return (
            u.studentDbId === dbKey ||
            (normRfid && uRfid === normRfid) ||
            (stEmail && uEmail === stEmail) ||
            (stRoll && uRoll === stRoll)
          );
        })
        .map(([uid]) => uid);

      if (candidateUids.length > 1) {
        ambiguousMappings++;
        issues.push({
          id: `ambiguous_auth_${dbKey}`,
          category: 'ambiguous_mappings',
          severity: 'critical',
          title: `Ambiguous Auth matches for ${st.name || dbKey}`,
          description: `Multiple user accounts (${candidateUids.join(', ')}) match this student. Manual administrator selection is required; auto-repair will NOT guess.`,
          path: `/students/${dbKey}`,
          studentDbId: dbKey,
          rfidUID: normRfid,
        });
      } else if (candidateUids.length === 1) {
        missingMappings++;
        issues.push({
          id: `unlinked_match_${dbKey}`,
          category: 'missing_mappings',
          severity: 'warning',
          title: `Unlinked Auth UID match found for ${st.name || dbKey}`,
          description: `Student lacks authUid, but uniquely matches Auth UID ${candidateUids[0]}. Safe auto-repair can link them without modifying student data.`,
          path: `/students/${dbKey}`,
          studentDbId: dbKey,
          authUid: candidateUids[0],
          rfidUID: normRfid,
          canAutoRepair: true,
          repairAction: 'Link verified Auth UID to existing student',
        });
      } else {
        missingMappings++;
        issues.push({
          id: `no_auth_${dbKey}`,
          category: 'missing_mappings',
          severity: 'warning',
          title: `No Auth UID linked to ${st.name || dbKey}`,
          description: `Student profile exists at /students/${dbKey} with RFID ${normRfid || 'N/A'}, but no Firebase Auth UID is linked yet.`,
          path: `/students/${dbKey}`,
          studentDbId: dbKey,
          rfidUID: normRfid,
        });
      }
    } else {
      linkedAuthUids.add(authUid);
      const uProfile = usersMap[authUid];
      const aMap = authToStudentMap[authUid];

      if (!uProfile) {
        missingUserProfiles++;
        issues.push({
          id: `missing_user_profile_${authUid}`,
          category: 'missing_profiles',
          severity: 'critical',
          title: `Missing /users/${authUid} profile for ${st.name || dbKey}`,
          description: `Student has authUid="${authUid}", but /users/${authUid} is missing, blocking role & profile lookup on login.`,
          path: `/users/${authUid}`,
          studentDbId: dbKey,
          authUid,
          rfidUID: normRfid,
          canAutoRepair: true,
          repairAction: 'Create missing /users/{authUid} profile from verified student record',
        });
      } else {
        if (uProfile.role !== 'student') {
          incorrectRoles++;
          issues.push({
            id: `bad_role_${authUid}`,
            category: 'incorrect_roles',
            severity: 'critical',
            title: `Incorrect role on /users/${authUid} (${uProfile.role || 'missing'})`,
            description: `Account linked to student "${st.name}" has role "${uProfile.role || 'undefined'}" instead of "student".`,
            path: `/users/${authUid}`,
            studentDbId: dbKey,
            authUid,
            canAutoRepair: true,
            repairAction: 'Set role to "student"',
          });
        }
        if (uProfile.studentDbId !== dbKey || (normRfid && (uProfile.rfidUID || '').toUpperCase() !== normRfid)) {
          missingMappings++;
          issues.push({
            id: `stale_user_map_${authUid}`,
            category: 'missing_mappings',
            severity: 'warning',
            title: `Out-of-sync mapping in /users/${authUid}`,
            description: `/users/${authUid} points to studentDbId="${uProfile.studentDbId || 'none'}", rfidUID="${uProfile.rfidUID || 'none'}" instead of "${dbKey}" / "${normRfid}".`,
            path: `/users/${authUid}`,
            studentDbId: dbKey,
            authUid,
            rfidUID: normRfid,
            canAutoRepair: true,
            repairAction: 'Sync studentDbId & rfidUID onto /users/{authUid}',
          });
        }
      }

      if (!aMap || aMap.studentDbId !== dbKey) {
        missingMappings++;
        issues.push({
          id: `missing_a2s_${authUid}`,
          category: 'missing_mappings',
          severity: 'critical',
          title: `Missing or stale /auth_to_student/${authUid}`,
          description: `Auth-to-student index for ${st.name || dbKey} (${authUid}) is ${!aMap ? 'missing' : `pointing to "${aMap.studentDbId}"`}.`,
          path: `/auth_to_student/${authUid}`,
          studentDbId: dbKey,
          authUid,
          rfidUID: normRfid,
          canAutoRepair: true,
          repairAction: 'Rebuild /auth_to_student mapping',
        });
      }
    }

    // Check attendance entries consistency under /students/{dbKey}/attendance
    if (st.attendance && typeof st.attendance === 'object') {
      Object.entries(st.attendance).forEach(([dateKey, attRec]) => {
        if (!attRec) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
          incorrectPaths++;
          issues.push({
            id: `bad_att_date_${dbKey}_${dateKey}`,
            category: 'incorrect_paths',
            severity: 'warning',
            title: `Non-standard attendance date key "${dateKey}"`,
            description: `Attendance under /students/${dbKey}/attendance/${dateKey} is not formatted YYYY-MM-DD.`,
            path: `/students/${dbKey}/attendance/${dateKey}`,
            studentDbId: dbKey,
          });
        }
      });
    } else if (authUid && st.status === 'active') {
      missingAttendanceIssues++;
      issues.push({
        id: `empty_att_${dbKey}`,
        category: 'missing_attendance',
        severity: 'warning',
        title: `No attendance records yet for ${st.name || dbKey}`,
        description: `Student /students/${dbKey}/attendance is currently empty. Normal for newly enrolled students; verify recovery vault if historical scans existed under legacy paths.`,
        path: `/students/${dbKey}/attendance`,
        studentDbId: dbKey,
      });
    }
  }

  // Duplicate active RFID check
  for (const [rfid, owners] of Object.entries(rfidOwners)) {
    if (owners.length > 1) {
      invalidRfids++;
      issues.push({
        id: `dup_rfid_${rfid}`,
        category: 'invalid_rfid',
        severity: 'critical',
        title: `Duplicate RFID card ${rfid} across ${owners.length} students`,
        description: `Card ${rfid} is assigned to multiple active students: ${owners.join(', ')}. Reassign unique RFID cards in Student Directory.`,
        path: `/rfid_to_student/${rfid}`,
        rfidUID: rfid,
      });
    }
  }

  // 4. Inspect /users entries pointing to missing students or invalid roles
  for (const [uid, u] of Object.entries(usersMap || {})) {
    if (!u || uid === CONFIGURED_ADMIN_UID) continue;
    if (u.role !== 'admin' && u.role !== 'student') {
      incorrectRoles++;
      issues.push({
        id: `invalid_user_role_${uid}`,
        category: 'incorrect_roles',
        severity: 'critical',
        title: `Invalid role on /users/${uid}`,
        description: `User ${u.email || uid} has invalid role "${String(u.role || 'undefined')}".`,
        path: `/users/${uid}`,
        authUid: uid,
      });
    }
    if (u.role !== 'admin') {
      const targetDbId = (u.studentDbId || '').trim();
      const isLinked = Boolean(targetDbId && studentsMap[targetDbId]);
      if (!isLinked) {
        unlinkedUserProfiles.push({
          uid,
          email: u.email,
          name: u.name,
          role: u.role,
          studentDbId: u.studentDbId,
          rfidUID: u.rfidUID,
          rollNumber: u.rollNumber,
        });
        missingMappings++;
        issues.push({
          id: `orphan_user_${uid}`,
          category: 'missing_mappings',
          severity: 'critical',
          title: `User ${u.email || uid} points to missing student record`,
          description: `/users/${uid} has studentDbId="${targetDbId || 'none'}", which does not exist in /students. Link it safely via Manual Auth Linking.`,
          path: `/users/${uid}`,
          authUid: uid,
          studentDbId: targetDbId || undefined,
          rfidUID: u.rfidUID,
        });
      }
    }
  }

  // 5. Legacy paths & unregistered recovery checks
  const legacyCount = Object.values(legacyAttendanceMap || {}).reduce(
    (sum: number, dayObj: any) => sum + (dayObj && typeof dayObj === 'object' ? Object.keys(dayObj).length : 0),
    0
  );
  if (legacyCount > 0) {
    incorrectPaths++;
    issues.push({
      id: 'legacy_root_attendance',
      category: 'incorrect_paths',
      severity: 'warning',
      title: `${legacyCount} attendance record(s) still at legacy /attendance path`,
      description: `Records at /attendance/{DATE}/{UID} should be migrated into /students/{studentDbId}/attendance/{DATE}.`,
      path: '/attendance',
    });
  }

  const legacySaCount = Object.keys(legacyStudentsAttendanceMap || {}).length;
  if (legacySaCount > 0) {
    incorrectPaths++;
    issues.push({
      id: 'legacy_students_attendance',
      category: 'incorrect_paths',
      severity: 'warning',
      title: `Legacy /students_attendance entries detected (${legacySaCount})`,
      description: `Old entries remain under /students_attendance.`,
      path: '/students_attendance',
    });
  }

  const recoveryGroupsCount = Object.keys(recoveryVaultMap || {}).length;
  if (recoveryGroupsCount > 0) {
    missingAttendanceIssues += recoveryGroupsCount;
    issues.push({
      id: 'unassigned_recovery_vault',
      category: 'missing_attendance',
      severity: 'warning',
      title: `${recoveryGroupsCount} unregistered RFID card group(s) in recovery vault`,
      description: `Historical attendance scans waiting in /migration_recovery/unregistered_attendance can be assigned to students in Migration Center.`,
      path: '/migration_recovery/unregistered_attendance',
    });
  }

  return {
    checkedAt: Date.now(),
    adminUid,
    adminEmail,
    permissionChecks,
    summary: {
      totalStudents: Object.keys(studentsMap || {}).length,
      totalUserProfiles: Object.keys(usersMap || {}).length,
      totalAuthMappings: Object.keys(authToStudentMap || {}).length,
      totalRfidMappings: Object.keys(rfidToStudentMap || {}).length,
      missingUserProfiles,
      incorrectRoles,
      missingMappings,
      ambiguousMappings,
      invalidRfids,
      incorrectPaths,
      missingAttendanceIssues,
      permissionErrors,
    },
    issues,
    unlinkedUserProfiles,
  };
}

/**
 * Administrator-only live Firebase Validation Suite:
 * Checks permissions, missing user profiles, roles, student mappings, RFID indexes,
 * legacy/incorrect paths, and recovery vault status.
 */
export async function runDatabaseDiagnostics(): Promise<DatabaseValidationReport> {
  const admin = await verifyAdministratorAuth();
  const db = getFirebaseDatabase();
  const fs = getFirebaseFirestore();

  const permissionChecks: Array<{ path: string; operation: string; allowed: boolean; error?: string }> = [];

  const probeRtdb = async <T = any>(path: string, fallback: T): Promise<T> => {
    try {
      const snap = await withTimeoutReject(get(ref(db, path)), 4500, `Timed out reading ${path}`);
      permissionChecks.push({ path, operation: 'GET', allowed: true });
      return (snap.exists() ? snap.val() : fallback) as T;
    } catch (err: any) {
      permissionChecks.push({
        path,
        operation: 'GET',
        allowed: false,
        error: err?.message || `Permission denied at ${path}`,
      });
      return fallback;
    }
  };

  const [
    studentsMap,
    usersMap,
    authToStudentMap,
    rfidToStudentMap,
    legacyAttendanceMap,
    legacyStudentsAttendanceMap,
    recoveryVaultMap,
  ] = await Promise.all([
    probeRtdb<Record<string, Student>>('/students', {}),
    probeRtdb<Record<string, Partial<UserProfile>>>('/users', {}),
    probeRtdb<Record<string, any>>('/auth_to_student', {}),
    probeRtdb<Record<string, any>>('/rfid_to_student', {}),
    probeRtdb<Record<string, any>>('/attendance', {}),
    probeRtdb<Record<string, any>>('/students_attendance', {}),
    probeRtdb<Record<string, any>>('/migration_recovery/unregistered_attendance', {}),
  ]);

  // Also verify /backups and Firestore users access
  await probeRtdb('/backups', {});
  try {
    await withTimeoutReject(getDocs(collection(fs, 'users')), 4000, 'Timed out reading Firestore users');
    permissionChecks.push({ path: 'firestore:/users', operation: 'LIST', allowed: true });
  } catch (fsErr: any) {
    permissionChecks.push({
      path: 'firestore:/users',
      operation: 'LIST',
      allowed: false,
      error: fsErr?.message || 'Permission denied reading Firestore users collection',
    });
  }

  return evaluateDatabaseConsistency({
    adminUid: admin.uid,
    adminEmail: admin.email,
    permissionChecks,
    studentsMap,
    usersMap,
    authToStudentMap,
    rfidToStudentMap,
    legacyAttendanceMap,
    legacyStudentsAttendanceMap,
    recoveryVaultMap,
  });
}

/**
 * Safely repairs unambiguous database mapping, profile, role, and RFID index issues
 * WITHOUT deleting any existing records or overwriting existing student/attendance data.
 */
export async function autoRepairDatabaseDiagnostics(): Promise<{
  repairedCount: number;
  ambiguousStudents: string[];
  report: DatabaseValidationReport;
}> {
  const admin = await verifyAdministratorAuth();
  const db = getFirebaseDatabase();
  const fs = getFirebaseFirestore();
  let repairedCount = 0;

  // 1. Ensure current admin's /users/{admin.uid} exists with role: 'admin'
  const adminUserSnap = await get(ref(db, `users/${admin.uid}`));
  if (!adminUserSnap.exists() || adminUserSnap.val()?.role !== 'admin') {
    const adminProfile: UserProfile = {
      uid: admin.uid,
      name: adminUserSnap.val()?.name || 'System Administrator',
      email: (admin.email || adminUserSnap.val()?.email || 'admin@rfidportal.com').toLowerCase(),
      rollNumber: adminUserSnap.val()?.rollNumber || 'ADMIN-01',
      department: 'System Administration',
      year: 'Staff',
      semester: 'N/A',
      role: 'admin',
      rfidUID: '',
      createdAt: adminUserSnap.val()?.createdAt || Date.now(),
    };
    await update(ref(db, `users/${admin.uid}`), stripUndefinedDeep(adminProfile));
    await withTimeout(setDoc(doc(fs, 'users', admin.uid), adminProfile, { merge: true }), 2000, null).catch(() => {});
    repairedCount++;
  }

  // 2. Run safe non-guessing reconciliation across all students and auth mappings
  const studentsSnap = await get(ref(db, 'students'));
  const studentsMap = (studentsSnap.exists() ? studentsSnap.val() : {}) as Record<string, Student>;
  const { linkedCount, ambiguousStudents } = await reconcileAllStudentMappings(studentsMap);
  repairedCount += linkedCount;

  // 3. Re-normalize any uppercase RFID / studentDbId mismatches without deleting attendance
  for (const [dbKey, st] of Object.entries(studentsMap)) {
    if (!st || typeof st !== 'object') continue;
    const normRfid = (st.rfidUID || st.uid || '').trim().toUpperCase();
    const updates: Record<string, any> = {};
    if (st.studentDbId !== dbKey) updates.studentDbId = dbKey;
    if (normRfid && st.rfidUID !== normRfid) updates.rfidUID = normRfid;
    if (normRfid && st.uid !== normRfid) updates.uid = normRfid;
    if (Object.keys(updates).length > 0) {
      await update(ref(db, `students/${dbKey}`), updates);
      repairedCount++;
    }
  }

  const report = await runDatabaseDiagnostics();
  return { repairedCount, ambiguousStudents, report };
}


