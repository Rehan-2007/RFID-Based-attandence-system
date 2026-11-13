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
  UnregisteredAttendanceGroup
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

export const INITIAL_STUDENTS: Student[] = [
  {
    uid: '5AA5AB24',
    name: 'Mohammed Rehan',
    studentId: 'STU-2024-001',
    department: 'Computer Science & Engineering',
    year: 'Final Year',
    semester: 'Semester 8',
    email: 'techbyrehan123@gmail.com',
    phone: '+91 98765 43210',
    registeredAt: '2026-01-15T09:00:00Z',
    status: 'active',
  },
  {
    uid: '0A37B224',
    name: 'Shakir Ahmed',
    studentId: 'STU-2024-002',
    department: 'Electronics & Communication',
    year: '3rd Year',
    semester: 'Semester 6',
    email: 'shakir@gmail.com',
    phone: '+91 98450 12345',
    registeredAt: '2026-01-15T09:15:00Z',
    status: 'active',
    authUid: 'rUyNTxxi8tYnv3314Jc9poaiKHA3',
  },
  {
    uid: '8A75B525',
    name: 'Mohammed Zaheer',
    studentId: 'STU-2024-003',
    department: 'Information Technology',
    year: 'Final Year',
    semester: 'Semester 8',
    email: 'zaheer@gmail.com',
    phone: '+91 97400 98765',
    registeredAt: '2026-01-15T09:30:00Z',
    status: 'active',
    authUid: 'K0umaWs1dbMWbOsCuWzC5pH7BGe2',
  },
];

/**
 * Known existing Firebase Authentication Student Accounts to link to Firestore
 */
export const KNOWN_STUDENT_AUTH_ACCOUNTS: Record<string, {
  uid: string;
  email: string;
  role: UserRole;
  name: string;
  rollNumber: string;
  rfidUID: string;
  department: string;
  year: string;
  semester: string;
  phone: string;
}> = {
  // STUDENT 1: Zaheer
  'K0umaWs1dbMWbOsCuWzC5pH7BGe2': {
    uid: 'K0umaWs1dbMWbOsCuWzC5pH7BGe2',
    email: 'zaheer@gmail.com',
    role: 'student',
    name: 'Mohammed Zaheer',
    rollNumber: 'STU-2024-003',
    rfidUID: '8A75B525',
    department: 'Information Technology',
    year: 'Final Year',
    semester: 'Semester 8',
    phone: '+91 97400 98765',
  },
  // STUDENT 2: Shakir
  'rUyNTxxi8tYnv3314Jc9poaiKHA3': {
    uid: 'rUyNTxxi8tYnv3314Jc9poaiKHA3',
    email: 'shakir@gmail.com',
    role: 'student',
    name: 'Shakir Ahmed',
    rollNumber: 'STU-2024-002',
    rfidUID: '0A37B224',
    department: 'Electronics & Communication',
    year: '3rd Year',
    semester: 'Semester 6',
    phone: '+91 98450 12345',
  },
  // STUDENT 3: Mohammed Rehan
  'bi3c890VUXhVE0JFxroYfnlQwea2': {
    uid: 'bi3c890VUXhVE0JFxroYfnlQwea2',
    email: 'techbyrehan123@gmail.com',
    role: 'admin',
    name: 'Mohammed Rehan',
    rollNumber: 'STU-2024-001',
    rfidUID: '5AA5AB24',
    department: 'Computer Science & Engineering',
    year: 'Final Year',
    semester: 'Semester 8',
    phone: '+91 98765 43210',
  },
};

export const KNOWN_STUDENTS_BY_EMAIL: Record<string, typeof KNOWN_STUDENT_AUTH_ACCOUNTS[string]> = {
  'zaheer@gmail.com': KNOWN_STUDENT_AUTH_ACCOUNTS['K0umaWs1dbMWbOsCuWzC5pH7BGe2'],
  'zaheer.m@example.com': KNOWN_STUDENT_AUTH_ACCOUNTS['K0umaWs1dbMWbOsCuWzC5pH7BGe2'],
  'shakir@gmail.com': KNOWN_STUDENT_AUTH_ACCOUNTS['rUyNTxxi8tYnv3314Jc9poaiKHA3'],
  'shakir.ahmed@example.com': KNOWN_STUDENT_AUTH_ACCOUNTS['rUyNTxxi8tYnv3314Jc9poaiKHA3'],
  'techbyrehan123@gmail.com': KNOWN_STUDENT_AUTH_ACCOUNTS['bi3c890VUXhVE0JFxroYfnlQwea2'],
};

// In-memory cache of students fetched from RTDB or Firestore
export const cachedStudentsMap: Record<string, Student> = {};


export function getActiveFirebaseConfig(): FirebaseConfigState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_FIREBASE_CONFIG);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Ensure apiKey is never empty or placeholder
      if (!parsed.apiKey || parsed.apiKey === 'AIzaSyPlaceholderClientInitialKey00') {
        parsed.apiKey = DEFAULT_FIREBASE_CONFIG.apiKey;
      }
      return { ...DEFAULT_FIREBASE_CONFIG, ...parsed };
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
  localStorage.setItem(STORAGE_KEY_FIREBASE_CONFIG, JSON.stringify(config));
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
        if (val && typeof val === 'object') {
          Object.keys(val).forEach((k) => {
            const st = val[k];
            if (st) {
              const cardUid = (st.uid || k).toString().trim().toUpperCase();
              cachedStudentsMap[cardUid] = {
                ...st,
                uid: cardUid,
              };
            }
          });
          onSuccess(val);
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

export async function saveStudent(student: Student): Promise<void> {
  const db = getFirebaseDatabase();
  const cardUid = student.uid.trim().toUpperCase();
  const studentRef = ref(db, `students/${cardUid}`);

  // Check if student already exists so profile edits use update() without wiping concurrent nested attendance
  let exists = false;
  let existingAttendance: Record<string, AttendanceRecord> | undefined = undefined;
  try {
    const snap = await withTimeout(get(studentRef), 3000, null);
    if (snap && snap.exists && snap.exists()) {
      exists = true;
      const current = snap.val();
      if (current?.attendance) {
        existingAttendance = current.attendance;
      }
    }
  } catch {}

  if (exists && !student.attendance) {
    const { attendance: _ignored, ...profileOnly } = student;
    await update(
      studentRef,
      stripUndefinedDeep({
        ...profileOnly,
        uid: cardUid,
      })
    );
    return;
  }

  const payload: any = {
    ...student,
    uid: cardUid,
  };
  if (student.attendance) {
    payload.attendance = { ...(existingAttendance || {}), ...student.attendance };
  } else if (existingAttendance) {
    payload.attendance = existingAttendance;
  }

  await set(studentRef, stripUndefinedDeep(payload));
}

export async function deleteStudent(uid: string): Promise<void> {
  const db = getFirebaseDatabase();
  const studentRef = ref(db, `students/${uid.toUpperCase()}`);
  await remove(studentRef);
}

// Unified Attendance & Working Days Realtime Database Operations
// Primary Unified Structure: students/{RFID_UID}/attendance/{YYYY-MM-DD}

export function subscribeToAttendanceSettings(
  onSuccess: (settings: AttendanceSettings) => void,
  onError?: (err: Error) => void
) {
  let localFallback: AttendanceSettings = { deadlineTime: DEFAULT_ATTENDANCE_DEADLINE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ATTENDANCE_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw) as AttendanceSettings;
      if (isValidDeadlineHHMM(parsed?.deadlineTime)) {
        localFallback = parsed;
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
              localStorage.setItem(STORAGE_KEY_ATTENDANCE_SETTINGS, JSON.stringify(val));
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
    localStorage.setItem(STORAGE_KEY_ATTENDANCE_SETTINGS, JSON.stringify(payload));
  } catch {}

  const db = getFirebaseDatabase();
  await set(ref(db, 'settings/attendance'), payload);
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
      Object.entries(studentsMap || {}).forEach(([rfidKey, st]) => {
        if (!st || !st.attendance) return;
        const cardUid = (st.uid || rfidKey).trim().toUpperCase();
        const rawRec = st.attendance[dateStr];
        if (rawRec && !rawRec.isDeleted) {
          result[cardUid] = normalizeAttendanceRecord(
            {
              ...rawRec,
              studentName: rawRec.studentName || st.name,
              studentId: rawRec.studentId || st.studentId,
              department: rawRec.department || st.department,
              authUid: rawRec.authUid || st.authUid,
            },
            dateStr,
            cardUid
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
      Object.entries(studentsMap || {}).forEach(([rfidKey, st]) => {
        if (!st || !st.attendance) return;
        const cardUid = (st.uid || rfidKey).trim().toUpperCase();
        Object.entries(st.attendance).forEach(([dateKey, rawRec]) => {
          if (!rawRec) return;
          if (!recordsByDate[dateKey]) {
            recordsByDate[dateKey] = {};
          }
          recordsByDate[dateKey][cardUid] = normalizeAttendanceRecord(
            {
              ...rawRec,
              studentName: rawRec.studentName || st.name,
              studentId: rawRec.studentId || st.studentId,
              department: rawRec.department || st.department,
              authUid: rawRec.authUid || st.authUid,
            },
            dateKey,
            cardUid
          );
        });
      });
      onSuccess(recordsByDate);
    },
    onError
  );
}

/**
 * Record attendance from ESP32 or portal directly into students/{RFID_UID}/attendance/{DATE}.
 * Validates UID normalization, student existence, active status, suspension expiry, overrides, and duplicates.
 */
export async function recordAttendanceScan(
  uidInput: string,
  options?: {
    device?: string;
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
  const studentRef = ref(db, `students/${uid}`);
  const studentAttRef = ref(db, `students/${uid}/attendance/${dateStr}`);

  // 1. Find the student using students/{RFID_UID}
  let student: Student | null = null;
  if (options?.studentsLookup && options.studentsLookup[uid]) {
    student = options.studentsLookup[uid];
  } else {
    try {
      const studentSnap = await get(studentRef);
      if (studentSnap.exists()) {
        student = studentSnap.val();
      }
    } catch (e) {
      console.warn('Could not query student record', e);
    }
  }

  // 2. Reject unknown RFID cards (never auto-register unknown cards)
  if (!student) {
    const unknownRecord: AttendanceRecord = stripUndefinedDeep({
      uid,
      studentName: 'UNKNOWN CARD',
      timestamp: now.getTime(),
      date: dateStr,
      time: timeStr,
      status: 'Unknown',
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

  // 3. Reject inactive student accounts
  if (student.status === 'inactive') {
    return {
      success: false,
      message: `ACCESS DENIED: Student ${student.name} (${uid}) account is INACTIVE. Attendance cannot be registered.`,
    };
  }

  // 4. Suspension Check: Prevent suspended students from marking attendance
  if (student.status === 'suspended' || student.isSuspended) {
    const activeSusp = student.activeSuspension;
    if (activeSusp && activeSusp.endDate && dateStr > activeSusp.endDate) {
      // Suspension has expired: automatically restore active status
      student.status = 'active';
      student.isSuspended = false;
      student.activeSuspension = undefined;
      try {
        await update(studentRef, {
          status: 'active',
          isSuspended: false,
          activeSuspension: null,
        });
        await update(ref(db, `suspensions/${uid}/${activeSusp.id}`), {
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

  // 5. Resolve student Auth UID and build validated record
  const studentAuthUid = student.authUid || 
    (KNOWN_STUDENT_AUTH_ACCOUNTS[uid] ? KNOWN_STUDENT_AUTH_ACCOUNTS[uid].uid : '') ||
    Object.values(KNOWN_STUDENT_AUTH_ACCOUNTS).find((acc) => acc.rfidUID.toUpperCase() === uid)?.uid || '';

  const record: AttendanceRecord = stripUndefinedDeep({
    uid,
    rfidUID: uid,
    studentRfid: uid,
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

  const txResult = await runTransaction(studentAttRef, (currentVal) => {
    if (currentVal && !currentVal.isDeleted) {
      const existing = currentVal as AttendanceRecord;
      existingRecordFound = existing;
      if (existing.isOverridden && existing.status === 'Absent') {
        blockedReason = 'overridden';
      } else {
        blockedReason = 'duplicate';
      }
      return undefined; // Abort transaction without overwriting
    }
    return record;
  });

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
      lastScannedUid: uid,
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

// Seed the 3 required students if database is fresh (only if authenticated as Admin)
export async function seedInitialStudentsIfEmpty(): Promise<boolean> {
  try {
    const auth = getFirebaseAuth();
    if (!auth.currentUser || auth.currentUser.uid !== CONFIGURED_ADMIN_UID) {
      return false;
    }
    const db = getFirebaseDatabase();
    const studentsRef = ref(db, 'students');
    const snapshot = await get(studentsRef);
    
    if (!snapshot.exists() || Object.keys(snapshot.val() || {}).length === 0) {
      for (const student of INITIAL_STUDENTS) {
        await set(ref(db, `students/${student.uid}`), student);
      }
      return true;
    }
    return false;
  } catch (e) {
    console.warn('Could not check or seed students', e);
    return false;
  }
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
  if (auth.currentUser.uid !== adminUid && auth.currentUser.uid !== CONFIGURED_ADMIN_UID) {
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
 * Register a student account with Firebase Authentication and save their profile in RTDB.
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

  // Check if RFID UID is already registered in student database
  const existingRfidSnap = await get(ref(db, `students/${trimmedRfid}`));
  if (existingRfidSnap.exists()) {
    throw new Error(`A student is already registered with RFID Card UID: ${trimmedRfid}`);
  }

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

  // Create user profile under users/{authUid}
  const userProfile: UserProfile = {
    uid: authUid,
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
  };
  await set(ref(db, `users/${authUid}`), userProfile);

  // Create student registry record under students/{rfidUID}
  const studentRecord: Student = {
    uid: trimmedRfid,
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
  };
  await set(ref(db, `students/${trimmedRfid}`), studentRecord);

  // Store rfid_to_uid mapping
  try {
    await set(ref(db, `rfid_to_uid/${trimmedRfid}`), authUid);
  } catch {
    // Non-blocking
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
 * Verifies live Firebase Authentication session, administrator UID match, and active ID token.
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

  if (fbUser.uid !== CONFIGURED_ADMIN_UID) {
    throw new RtdbOperationError(
      'AUTH_UID_CHECK',
      '/auth/currentUser',
      'UNAUTHORIZED_UID',
      `Authenticated UID "${fbUser.uid}" does not match authorized administrator UID "${CONFIGURED_ADMIN_UID}".`
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
 * Links and synchronizes existing student accounts in Firestore 'users' collection
 * Document ID = authUid
 * Preserves any existing fields and does not overwrite with empty values.
 */
export async function linkExistingStudentProfilesInFirestore(): Promise<void> {
  const fs = getFirebaseFirestore();
  const db = getFirebaseDatabase();

  for (const account of Object.values(KNOWN_STUDENT_AUTH_ACCOUNTS)) {
    try {
      const docRef = doc(fs, 'users', account.uid);
      
      const profilePayload: Record<string, any> = {
        email: account.email,
        role: 'student',
        name: account.name,
        rollNumber: account.rollNumber,
        rfidUID: account.rfidUID,
        department: account.department,
        year: account.year,
        semester: account.semester,
        phone: account.phone,
        createdAt: Date.now(),
      };

      // Atomic non-blocking merge with 2000ms timeout
      await withTimeout(setDoc(docRef, profilePayload, { merge: true }), 2000, null);

      // Sync RTDB in background
      try {
        await withTimeout(update(ref(db, `users/${account.uid}`), profilePayload), 2000, null);
        await withTimeout(update(ref(db, `rfid_to_uid/${account.rfidUID}`), { authUid: account.uid }), 2000, null);
        await withTimeout(update(ref(db, `students/${account.rfidUID}`), {
          authUid: account.uid,
          email: account.email,
        }), 2000, null);
      } catch {
        // Non-blocking
      }
    } catch (err) {
      console.warn(`Notice linking student ${account.email} in Firestore:`, err);
    }
  }
}

/**
 * Fetch user profile from Firestore users/{uid} or infer from directory with strict timeout protection
 */
export async function getUserProfile(
  authUid: string,
  email?: string | null
): Promise<UserProfile | null> {
  const normalizedEmail = email?.trim().toLowerCase();

  // 1. Instant check: configured Admin
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
    // Non-blocking background sync
    try {
      const fs = getFirebaseFirestore();
      withTimeout(setDoc(doc(fs, 'users', authUid), adminProfile, { merge: true }), 2000, null).catch(() => {});
    } catch {}
    return adminProfile;
  }

  // 2. Instant check: known student authentication accounts mapping
  const knownAccount = 
    KNOWN_STUDENT_AUTH_ACCOUNTS[authUid] || 
    (normalizedEmail ? KNOWN_STUDENTS_BY_EMAIL[normalizedEmail] : undefined);

  if (knownAccount) {
    const resolvedProfile: UserProfile = {
      uid: authUid,
      email: knownAccount.email,
      role: 'student',
      name: knownAccount.name,
      rollNumber: knownAccount.rollNumber,
      rfidUID: knownAccount.rfidUID,
      department: knownAccount.department,
      year: knownAccount.year,
      semester: knownAccount.semester,
      phone: knownAccount.phone,
      createdAt: Date.now(),
    };

    // Non-blocking background sync to Firestore & RTDB
    try {
      const fs = getFirebaseFirestore();
      withTimeout(setDoc(doc(fs, 'users', authUid), resolvedProfile, { merge: true }), 2000, null).catch(() => {});
      const db = getFirebaseDatabase();
      withTimeout(update(ref(db, `users/${authUid}`), resolvedProfile), 2000, null).catch(() => {});
      withTimeout(update(ref(db, `rfid_to_uid/${knownAccount.rfidUID}`), { authUid }), 2000, null).catch(() => {});
      withTimeout(update(ref(db, `students/${knownAccount.rfidUID}`), { authUid, email: knownAccount.email }), 2000, null).catch(() => {});
    } catch {}

    return resolvedProfile;
  }

  // 3. Retrieve student profile from Firestore users/{authUid} with 2500ms timeout
  let firestoreProfile: UserProfile | null = null;
  try {
    const fs = getFirebaseFirestore();
    const docRef = doc(fs, 'users', authUid);
    const docSnap = await withTimeout(getDoc(docRef), 2500, null);

    if (docSnap && docSnap.exists && docSnap.exists()) {
      const data = docSnap.data();
      firestoreProfile = {
        uid: authUid,
        email: data.email || normalizedEmail || '',
        role: data.role || 'student',
        name: data.name || data.displayName || '',
        rollNumber: data.rollNumber || data.studentId || '',
        rfidUID: data.rfidUID || '',
        department: data.department || '',
        year: data.year || '',
        semester: data.semester || '',
        phone: data.phone || '',
        createdAt: data.createdAt || Date.now(),
      };
    }
  } catch (fsErr) {
    console.warn('Firestore user doc read notice:', fsErr);
  }

  if (firestoreProfile && firestoreProfile.role) {
    if (firestoreProfile.role === 'student' && !firestoreProfile.rfidUID) {
      const studentMatch = lookupStudentInfo(firestoreProfile.rollNumber || '') || 
                           lookupStudentInfo(firestoreProfile.email || '') || 
                           lookupStudentInfo(authUid);
      if (studentMatch) {
        firestoreProfile.rfidUID = studentMatch.rfidUID;
        if (!firestoreProfile.rollNumber) firestoreProfile.rollNumber = studentMatch.studentId;
        if (!firestoreProfile.name) firestoreProfile.name = studentMatch.name;
        if (!firestoreProfile.department) firestoreProfile.department = studentMatch.department;
      }
    }
    return firestoreProfile;
  }

  // 4. Fallback: check Realtime Database users/{authUid} with 2000ms timeout
  const db = getFirebaseDatabase();
  try {
    const userSnap = await withTimeout(get(ref(db, `users/${authUid}`)), 2000, null);
    if (userSnap && userSnap.exists && userSnap.exists()) {
      const rtdbProfile = userSnap.val() as UserProfile;
      const merged: UserProfile = {
        ...rtdbProfile,
        ...(firestoreProfile || {}),
        uid: authUid,
      };
      if (merged.role === 'student' && !merged.rfidUID) {
        const studentMatch = lookupStudentInfo(merged.rollNumber || '') || 
                             lookupStudentInfo(merged.email || '') || 
                             lookupStudentInfo(authUid);
        if (studentMatch) {
          merged.rfidUID = studentMatch.rfidUID;
        }
      }
      return merged;
    }
  } catch (e) {
    console.warn('Error reading RTDB users node:', e);
  }

  // 5. Fallback: match by email or authUid in students node with 2000ms timeout
  try {
    const studentsSnap = await withTimeout(get(ref(db, 'students')), 2000, null);
    if (studentsSnap && studentsSnap.exists && studentsSnap.exists()) {
      const allStudents = studentsSnap.val() as Record<string, Student>;
      const matched = Object.values(allStudents).find(
        (st) =>
          st.authUid === authUid ||
          (normalizedEmail && st.email && st.email.toLowerCase() === normalizedEmail)
      );

      if (matched) {
        const studentProfile: UserProfile = {
          uid: authUid,
          name: matched.name,
          email: matched.email,
          rollNumber: matched.studentId,
          department: matched.department,
          year: matched.year,
          semester: matched.semester || 'Semester 1',
          role: 'student',
          rfidUID: matched.uid,
          phone: matched.phone || '',
          createdAt: Date.now(),
        };

        // Non-blocking sync
        try {
          const fs = getFirebaseFirestore();
          withTimeout(setDoc(doc(fs, 'users', authUid), studentProfile, { merge: true }), 2000, null).catch(() => {});
          withTimeout(set(ref(db, `users/${authUid}`), studentProfile), 2000, null).catch(() => {});
        } catch {}

        return studentProfile;
      }
    }
  } catch (e) {
    console.warn('Error finding student in directory:', e);
  }

  // Profile does not exist anywhere
  return null;
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
  rfidUID: string;
  authUid?: string;
  studentId?: string;
  email?: string;
}

/**
 * Resolves student metadata for an RFID UID, studentId, authUid, email, or name
 */
export function lookupStudentInfo(identifier: string): {
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
  const emailPrefix = lower.includes('@') ? lower.split('@')[0] : lower;

  // 1. Check in-memory cachedStudentsMap (from live RTDB students node)
  if (cachedStudentsMap[clean]) {
    const s = cachedStudentsMap[clean];
    return {
      name: s.name,
      studentId: s.studentId,
      rfidUID: s.uid.toUpperCase(),
      authUid: s.authUid || '',
      department: s.department,
      email: s.email,
    };
  }

  for (const s of Object.values(cachedStudentsMap)) {
    if (
      s.uid.toUpperCase() === clean ||
      s.studentId.toUpperCase() === clean ||
      (s.authUid && s.authUid === identifier) ||
      (s.email && s.email.toLowerCase() === lower) ||
      (s.name && s.name.toLowerCase() === lower)
    ) {
      return {
        name: s.name,
        studentId: s.studentId,
        rfidUID: s.uid.toUpperCase(),
        authUid: s.authUid || '',
        department: s.department,
        email: s.email,
      };
    }
  }

  // 2. Check INITIAL_STUDENTS
  const initStudent = INITIAL_STUDENTS.find(
    (s) =>
      s.uid.toUpperCase() === clean ||
      s.studentId.toUpperCase() === clean ||
      s.authUid === identifier ||
      s.email.toLowerCase() === lower ||
      s.email.toLowerCase().startsWith(emailPrefix) ||
      s.name.toLowerCase() === lower
  );
  if (initStudent) {
    return {
      name: initStudent.name,
      studentId: initStudent.studentId,
      rfidUID: initStudent.uid.toUpperCase(),
      authUid: initStudent.authUid || '',
      department: initStudent.department,
      email: initStudent.email,
    };
  }

  // 3. Check KNOWN_STUDENT_AUTH_ACCOUNTS
  for (const acc of Object.values(KNOWN_STUDENT_AUTH_ACCOUNTS)) {
    if (
      acc.rfidUID.toUpperCase() === clean ||
      acc.rollNumber.toUpperCase() === clean ||
      acc.uid === identifier ||
      acc.email.toLowerCase() === lower ||
      acc.email.toLowerCase().startsWith(emailPrefix) ||
      acc.name.toLowerCase() === lower
    ) {
      return {
        name: acc.name,
        studentId: acc.rollNumber,
        rfidUID: acc.rfidUID.toUpperCase(),
        authUid: acc.uid,
        department: acc.department,
        email: acc.email,
      };
    }
  }

  // 4. Check known email aliases directly
  if (KNOWN_STUDENTS_BY_EMAIL[lower]) {
    const acc = KNOWN_STUDENTS_BY_EMAIL[lower];
    return {
      name: acc.name,
      studentId: acc.rollNumber,
      rfidUID: acc.rfidUID.toUpperCase(),
      authUid: acc.uid,
      department: acc.department,
      email: acc.email,
    };
  }

  // 5. Hardcoded identifier mappings for Shakir, Zaheer, and Rehan
  if (clean === '0A37B224' || clean === 'STU-2024-002' || lower.includes('shakir')) {
    return {
      name: 'Shakir Ahmed',
      studentId: 'STU-2024-002',
      rfidUID: '0A37B224',
      authUid: 'rUyNTxxi8tYnv3314Jc9poaiKHA3',
      department: 'Electronics & Communication',
      email: 'shakir@gmail.com',
    };
  }
  if (clean === '8A75B525' || clean === 'STU-2024-003' || lower.includes('zaheer')) {
    return {
      name: 'Mohammed Zaheer',
      studentId: 'STU-2024-003',
      rfidUID: '8A75B525',
      authUid: 'K0umaWs1dbMWbOsCuWzC5pH7BGe2',
      department: 'Information Technology',
      email: 'zaheer@gmail.com',
    };
  }
  if (clean === '5AA5AB24' || clean === 'STU-2024-001' || lower.includes('rehan')) {
    return {
      name: 'Mohammed Rehan',
      studentId: 'STU-2024-001',
      rfidUID: '5AA5AB24',
      authUid: 'bi3c890VUXhVE0JFxroYfnlQwea2',
      department: 'Computer Science & Engineering',
      email: 'techbyrehan123@gmail.com',
    };
  }

  return null;
}

/**
 * Normalizes an attendance record from Firebase RTDB or Firestore.
 * Ensures every record contains studentId, rollNumber, rfidUID, studentName, date, time, status,
 * and a valid Unix epoch timestamp (resolving 10-digit Unix seconds and ESP32 millis() if present).
 */
export function normalizeAttendanceRecord(
  rawRecord: any,
  dateKey: string,
  rfidKey: string
): AttendanceRecord {
  const rawRfid = (rawRecord?.rfidUID || rawRecord?.uid || rawRecord?.studentRfid || rfidKey || '').toString().trim().toUpperCase();
  const rawStudentId = (rawRecord?.studentId || rawRecord?.rollNumber || '').toString().trim();
  const rawAuthUid = rawRecord?.authUid || rawRecord?.userId || '';
  const rawName = (rawRecord?.studentName || rawRecord?.name || '').toString().trim();

  // Look up student metadata using any available identifier (RFID, studentId, authUid, or name)
  const student = 
    lookupStudentInfo(rawRfid) || 
    lookupStudentInfo(rawStudentId) || 
    lookupStudentInfo(rawAuthUid) ||
    (rawName ? lookupStudentInfo(rawName) : null);

  const studentId = student?.studentId || rawStudentId || '';
  const rfidUID = student?.rfidUID || rawRfid;
  const studentName = student?.name || rawName || (rfidUID ? `Student (${rfidUID})` : 'Student');
  const authUid = student?.authUid || rawAuthUid;
  const department = student?.department || rawRecord?.department || '';

  const recordDate = rawRecord?.date || dateKey;
  const recordTime = rawRecord?.time || rawRecord?.checkInTime || '00:00:00';

  // Compute true Unix epoch timestamp in milliseconds
  // Handles:
  // 1. Millisecond timestamps (> 1.5e12)
  // 2. 10-digit Unix epoch seconds (e.g. 1794146650 uploaded by ESP32) -> multiply by 1000
  // 3. Firestore Timestamp objects (.toMillis(), .toDate())
  // 4. ISO Date + Time strings
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
    uid: rfidUID,
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
    device: rawRecord?.device || rawRecord?.readerDevice || 'ESP32-RFID-01',
    notes: rawRecord?.notes || '',
  };
}

export interface CentralAttendanceUserTarget {
  role: UserRole;
  uid: string;
  studentId?: string;
  rollNumber?: string;
  rfidUID?: string;
  email?: string | null;
  displayName?: string;
}

/**
 * Unified Attendance Subscription for Admin and Student Portals.
 * Single Source of Truth: students/{RFID_UID}/attendance/{YYYY-MM-DD} + working_days/{YYYY-MM-DD}.
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

  const resolved = lookupStudentInfo(user.rfidUID || '') ||
                   lookupStudentInfo(user.studentId || user.rollNumber || '') ||
                   lookupStudentInfo(user.uid) ||
                   (user.email ? lookupStudentInfo(user.email) : null);

  const studentRfid = (user.rfidUID || resolved?.rfidUID || '').trim().toUpperCase();

  if (user.role === 'admin') {
    const unsubStudents = subscribeToStudents(
      (studentsMap) => {
        const istToday = getISTDateStr();
        const allMap: Record<string, Record<string, AttendanceRecord>> = {};
        const todayMap: Record<string, AttendanceRecord> = {};
        const discoveredDates = new Set<string>();

        Object.entries(studentsMap || {}).forEach(([rfidKey, st]) => {
          if (!st || !st.attendance) return;
          const cardUid = (st.uid || rfidKey).trim().toUpperCase();
          Object.entries(st.attendance).forEach(([dateKey, rawRec]) => {
            if (!rawRec || rawRec.isDeleted) return;
            discoveredDates.add(dateKey);
            const rec = normalizeAttendanceRecord(
              {
                ...rawRec,
                studentName: rawRec.studentName || st.name,
                studentId: rawRec.studentId || st.studentId,
                department: rawRec.department || st.department,
                authUid: rawRec.authUid || st.authUid,
              },
              dateKey,
              cardUid
            );
            if (!allMap[dateKey]) allMap[dateKey] = {};
            allMap[dateKey][cardUid] = rec;
            if (dateKey === istToday) {
              todayMap[cardUid] = rec;
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
    // STUDENT: Listen strictly to own node students/{studentRfid} + shared working_days
    let currentStudentData: Student | null = null;
    let currentWorkingDays: Record<string, WorkingDayConfig> = {};

    const emitStudentState = () => {
      const istToday = getISTDateStr();
      const personalMap: Record<string, Record<string, AttendanceRecord>> = {};
      const todayMap: Record<string, AttendanceRecord> = {};

      // Seed institutional working dates from working_days so denominator matches Admin Portal
      Object.keys(currentWorkingDays || {}).forEach((d) => {
        if (!currentWorkingDays[d]?.isHoliday && d <= istToday) {
          personalMap[d] = {};
        }
      });

      const attObj = currentStudentData?.attendance || {};

      Object.entries(attObj).forEach(([dateKey, rawRec]) => {
        if (!rawRec || rawRec.isDeleted) return;
        const rec = normalizeAttendanceRecord(
          {
            ...rawRec,
            studentName: rawRec.studentName || currentStudentData?.name || user.displayName,
            studentId: rawRec.studentId || currentStudentData?.studentId || user.studentId,
            department: rawRec.department || currentStudentData?.department,
            authUid: rawRec.authUid || currentStudentData?.authUid || user.uid,
          },
          dateKey,
          studentRfid
        );

        if (!personalMap[dateKey]) personalMap[dateKey] = {};
        personalMap[dateKey][studentRfid] = rec;

        // Strictly only place today's IST attendance into todayMap
        if (dateKey === istToday) {
          todayMap[studentRfid] = rec;
        }
      });

      onAttendanceUpdate(personalMap, todayMap);
    };

    if (studentRfid) {
      const studentNodeRef = ref(db, `students/${studentRfid}`);
      const unsubStudent = onValue(
        studentNodeRef,
        (snap: DataSnapshot) => {
          currentStudentData = snap.exists() ? (snap.val() as Student) : null;
          emitStudentState();
        },
        (err) => {
          console.warn(`Student unified node listener notice (students/${studentRfid}):`, err?.message);
          onError?.(err);
        }
      );
      unsubs.push(() => off(studentNodeRef, 'value', unsubStudent));
    }

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
 * Direct on-demand re-fetch from Firebase Unified Students Tree (students/{RFID_UID}/attendance/{DATE}).
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

  const resolved = lookupStudentInfo(user.rfidUID || '') ||
                   lookupStudentInfo(user.studentId || user.rollNumber || '') ||
                   lookupStudentInfo(user.uid) ||
                   (user.email ? lookupStudentInfo(user.email) : null);

  const studentRfid = (user.rfidUID || resolved?.rfidUID || '').trim().toUpperCase();

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
    const snap = await withTimeout(get(ref(db, 'students')), 4500, null);
    if (snap && snap.exists && snap.exists()) {
      const studentsMap = snap.val() as Record<string, Student>;
      Object.entries(studentsMap).forEach(([rfidKey, st]) => {
        if (!st || !st.attendance) return;
        const cardUid = (st.uid || rfidKey).trim().toUpperCase();
        Object.entries(st.attendance).forEach(([dateKey, rawRec]) => {
          if (!rawRec || rawRec.isDeleted) return;
          const rec = normalizeAttendanceRecord(
            {
              ...rawRec,
              studentName: rawRec.studentName || st.name,
              studentId: rawRec.studentId || st.studentId,
              department: rawRec.department || st.department,
              authUid: rawRec.authUid || st.authUid,
            },
            dateKey,
            cardUid
          );
          if (!allMap[dateKey]) allMap[dateKey] = {};
          allMap[dateKey][cardUid] = rec;
          recordCount++;
          if (dateKey === istToday) {
            todayMap[cardUid] = rec;
          }
        });
      });
    }
  } else if (studentRfid) {
    Object.keys(workingDays).forEach((d) => {
      if (!workingDays[d]?.isHoliday && d <= istToday) {
        allMap[d] = {};
      }
    });

    const snap = await withTimeout(get(ref(db, `students/${studentRfid}`)), 4500, null);
    if (snap && snap.exists && snap.exists()) {
      studentNode = snap.val() as Student;
      const attObj = studentNode.attendance || {};
      Object.entries(attObj).forEach(([dateKey, rawRec]) => {
        if (!rawRec || rawRec.isDeleted) return;
        const rec = normalizeAttendanceRecord(
          {
            ...rawRec,
            studentName: rawRec.studentName || studentNode?.name,
            studentId: rawRec.studentId || studentNode?.studentId,
            department: rawRec.department || studentNode?.department,
            authUid: rawRec.authUid || studentNode?.authUid || user.uid,
          },
          dateKey,
          studentRfid
        );
        if (!allMap[dateKey]) allMap[dateKey] = {};
        allMap[dateKey][studentRfid] = rec;
        recordCount++;
        if (dateKey === istToday) {
          todayMap[studentRfid] = rec;
        }
      });
    }
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
  const upperRfid = (typeof target === 'string' ? target : target.rfidUID).trim().toUpperCase();
  let authUid = typeof target === 'object' ? target.authUid : undefined;
  let studentId = typeof target === 'object' ? target.studentId : undefined;

  const info = lookupStudentInfo(upperRfid) || lookupStudentInfo(studentId || '') || lookupStudentInfo(authUid || '');
  if (info) {
    if (!authUid) authUid = info.authUid;
    if (!studentId) studentId = info.studentId;
  }

  return subscribeToCentralAttendance(
    {
      role: 'student',
      uid: authUid || '',
      rfidUID: upperRfid,
      studentId: studentId || '',
      rollNumber: studentId || '',
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
 * Subscribe to today's attendance record for a specific student at students/{RFID_UID}/attendance/{DATE}
 */
export function subscribeToStudentTodayAttendance(
  dateStr: string,
  rfidUID: string,
  onUpdate: (record: AttendanceRecord | null) => void
): () => void {
  try {
    const db = getFirebaseDatabase();
    const upperRfid = rfidUID.trim().toUpperCase();
    const todayRecordRef = ref(db, `students/${upperRfid}/attendance/${dateStr}`);

    const unsubscribe = onValue(
      todayRecordRef,
      (snapshot: DataSnapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          if (val && !val.isDeleted) {
            onUpdate(normalizeAttendanceRecord(val, dateStr, upperRfid));
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

    // 2. Clear auxiliary nodes
    try { await remove(ref(db, 'working_days')); } catch {}
    try { await remove(ref(db, 'attendance_trash')); } catch {}
    try { await remove(ref(db, 'suspensions')); } catch {}
    try { await remove(ref(db, 'unknown_scans')); } catch {}

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
 * Edit an attendance record's date, time, status, or notes at students/{RFID_UID}/attendance/{DATE}.
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
  const uid = uidInput.trim().toUpperCase();
  const oldRef = ref(db, `students/${uid}/attendance/${date}`);
  const snap = await get(oldRef);

  if (!snap.exists()) {
    throw new Error(`Record for student ${uid} on ${date} not found.`);
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

  const updatedRecord: AttendanceRecord = stripUndefinedDeep({
    ...existing,
    uid,
    rfidUID: uid,
    studentRfid: uid,
    date: targetDate,
    time: updates.time || existing.time,
    status: updates.status || existing.status,
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
    await remove(oldRef);
    await set(ref(db, `students/${uid}/attendance/${targetDate}`), updatedRecord);
  } else {
    await set(oldRef, updatedRecord);
  }

  await syncWorkingDaysFromDates([targetDate]);

  await logAuditActivity('EDIT_ATTENDANCE', adminUser, {
    studentRfid: uid,
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
  const uid = uidInput.trim().toUpperCase();
  const targetRef = ref(db, `students/${uid}/attendance/${date}`);
  const snap = await get(targetRef);

  if (!snap.exists()) {
    throw new Error(`Record for student ${uid} on ${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const trashId = `${date}_${uid}`;

  const trashEntry: TrashAttendanceRecord = stripUndefinedDeep({
    ...existing,
    uid,
    trashId,
    deletedAt: Date.now(),
    deletedBy: adminUser.email || 'admin',
    deleteReason: reason || 'Deleted by administrator',
    originalPath: `students/${uid}/attendance/${date}`,
    isDeleted: true,
  });

  await set(ref(db, `attendance_trash/${trashId}`), trashEntry);
  await remove(targetRef);

  await logAuditActivity('DELETE_ATTENDANCE', adminUser, {
    studentRfid: uid,
    studentName: existing.studentName,
    studentId: existing.studentId,
    date,
    reason,
    previousValues: existing,
  });

  return { success: true, deletedRecord: existing, trashId };
}

/**
 * Bulk delete multiple attendance records with soft-delete archiving.
 */
export async function bulkDeleteAttendance(
  records: Array<{ date: string; uid: string; studentName?: string }>,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; count: number; deletedRecords: AttendanceRecord[] }> {
  const db = getFirebaseDatabase();
  const deletedRecords: AttendanceRecord[] = [];

  for (const r of records) {
    const cleanUid = r.uid.trim().toUpperCase();
    try {
      const targetRef = ref(db, `students/${cleanUid}/attendance/${r.date}`);
      const snap = await get(targetRef);
      if (snap.exists()) {
        const existing = snap.val() as AttendanceRecord;
        const trashId = `${r.date}_${cleanUid}`;
        const trashEntry: TrashAttendanceRecord = stripUndefinedDeep({
          ...existing,
          uid: cleanUid,
          trashId,
          deletedAt: Date.now(),
          deletedBy: adminUser.email || 'admin',
          deleteReason: reason || 'Bulk deletion by administrator',
          originalPath: `students/${cleanUid}/attendance/${r.date}`,
          isDeleted: true,
        });

        await set(ref(db, `attendance_trash/${trashId}`), trashEntry);
        await remove(targetRef);

        deletedRecords.push(existing);
      }
    } catch (err) {
      console.warn(`Failed deleting record students/${cleanUid}/attendance/${r.date}:`, err);
    }
  }

  await logAuditActivity('BULK_DELETE', adminUser, {
    reason,
    affectedCount: deletedRecords.length,
    details: `Bulk deleted ${deletedRecords.length} attendance records`,
    previousValues: deletedRecords.map((d) => ({ date: d.date, uid: d.uid, name: d.studentName })),
  });

  return { success: true, count: deletedRecords.length, deletedRecords };
}

/**
 * Bulk update attendance status for multiple records.
 */
export async function bulkUpdateAttendanceStatus(
  records: Array<{ date: string; uid: string; studentName?: string }>,
  newStatus: AttendanceStatus,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; count: number; previousStates: Array<{ date: string; uid: string; prevStatus: AttendanceStatus }> }> {
  const db = getFirebaseDatabase();
  const previousStates: Array<{ date: string; uid: string; prevStatus: AttendanceStatus }> = [];

  for (const r of records) {
    const cleanUid = r.uid.trim().toUpperCase();
    try {
      const targetRef = ref(db, `students/${cleanUid}/attendance/${r.date}`);
      const snap = await get(targetRef);
      if (snap.exists()) {
        const existing = snap.val() as AttendanceRecord;
        previousStates.push({ date: r.date, uid: cleanUid, prevStatus: existing.status });

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
          uid: cleanUid,
          status: newStatus,
          lastModifiedBy: adminUser.email || 'admin',
          lastModifiedAt: Date.now(),
          previousEdits: prevEdits,
        });

        await set(targetRef, updated);
      }
    } catch (err) {
      console.warn(`Failed bulk updating students/${cleanUid}/attendance/${r.date}:`, err);
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
 * Restore an attendance record from attendance_trash back into students/{RFID_UID}/attendance/{DATE}.
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
  const uid = (trashEntry.rfidUID || trashEntry.uid).toUpperCase();

  // Omit trash-only & deleted metadata cleanly instead of passing undefined to RTDB set()
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
    uid,
    rfidUID: uid,
    isDeleted: false,
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
  });

  const validationError = validateAttendancePayload(restoredRecord);
  if (validationError) {
    throw new Error(`Cannot restore invalid record: ${validationError}`);
  }

  await set(ref(db, `students/${uid}/attendance/${date}`), restoredRecord);
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
  const uid = uidInput.trim().toUpperCase();
  const targetRef = ref(db, `students/${uid}/attendance/${date}`);
  const snap = await get(targetRef);

  if (!snap.exists()) {
    throw new Error(`Record ${uid}/attendance/${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const history = existing.previousEdits || [];
  const targetVersion = history[targetVersionIndex];

  if (!targetVersion) {
    throw new Error(`Edit history version #${targetVersionIndex + 1} not found.`);
  }

  const prevData = targetVersion.prevData;
  const updatedRecord: AttendanceRecord = stripUndefinedDeep({
    ...existing,
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
    studentRfid: uid,
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
 * Override student's status to Absent (Manual Override) at students/{RFID_UID}/attendance/{DATE}.
 * Preserves original scan data and prevents subsequent ESP32 RFID scans from overriding it for that date.
 */
export async function overrideAttendanceToAbsent(
  date: string,
  uidInput: string,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; updatedRecord: AttendanceRecord; previousRecord: AttendanceRecord }> {
  const db = getFirebaseDatabase();
  const uid = uidInput.trim().toUpperCase();
  const targetRef = ref(db, `students/${uid}/attendance/${date}`);
  const snap = await get(targetRef);

  if (!snap.exists()) {
    throw new Error(`Attendance record for ${uid} on ${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const originalRecord = existing.originalRecord || {
    status: existing.status,
    time: existing.time,
    timestamp: existing.timestamp,
    device: existing.device,
  };

  const updatedRecord: AttendanceRecord = stripUndefinedDeep({
    ...existing,
    uid,
    status: 'Absent',
    isOverridden: true,
    overrideReason: reason || 'Manual administrative override to Absent',
    overrideBy: adminUser.email || 'admin',
    overrideAt: Date.now(),
    originalRecord,
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
  });

  await set(targetRef, updatedRecord);

  await logAuditActivity('OVERRIDE_ATTENDANCE', adminUser, {
    studentRfid: uid,
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
  const uid = uidInput.trim().toUpperCase();
  const targetRef = ref(db, `students/${uid}/attendance/${date}`);
  const snap = await get(targetRef);

  if (!snap.exists()) {
    throw new Error(`Record for ${uid} on ${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const original = existing.originalRecord;

  const {
    overrideReason: _or,
    overrideBy: _ob,
    overrideAt: _oa,
    ...restFields
  } = existing;

  const updatedRecord: AttendanceRecord = stripUndefinedDeep({
    ...restFields,
    uid,
    status: original?.status || 'Present',
    time: original?.time || existing.time,
    isOverridden: false,
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
  });

  await set(targetRef, updatedRecord);

  await logAuditActivity('REMOVE_OVERRIDE', adminUser, {
    studentRfid: uid,
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
  studentRfidInput: string,
  duration: '1_day' | '1_week' | '1_month' | 'custom',
  startDate: string,
  endDate: string,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; suspension: StudentSuspension }> {
  const db = getFirebaseDatabase();
  const rfid = studentRfidInput.trim().toUpperCase();
  const info = lookupStudentInfo(rfid);

  // Retrieve student record
  let student: Student | null = null;
  const studentSnap = await get(ref(db, `students/${rfid}`));
  if (studentSnap.exists()) {
    student = studentSnap.val();
  }

  const suspId = `susp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const suspension: StudentSuspension = stripUndefinedDeep({
    id: suspId,
    studentRfid: rfid,
    studentName: student?.name || info?.name || 'Student',
    studentId: student?.studentId || info?.studentId || 'N/A',
    duration,
    startDate,
    endDate,
    reason: reason || 'Disciplinary suspension',
    suspendedBy: adminUser.email || 'admin',
    createdAt: Date.now(),
    status: 'active',
  });

  // 1. Record suspension in /suspensions/{rfid}/{suspId}
  await set(ref(db, `suspensions/${rfid}/${suspId}`), suspension);

  // 2. Update student status in /students/{rfid}
  await update(ref(db, `students/${rfid}`), {
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
  studentRfidInput: string,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean }> {
  const db = getFirebaseDatabase();
  const rfid = studentRfidInput.trim().toUpperCase();

  const studentSnap = await get(ref(db, `students/${rfid}`));
  const student = studentSnap.exists() ? (studentSnap.val() as Student) : null;
  const activeSusp = student?.activeSuspension;

  // 1. Re-activate student
  await update(ref(db, `students/${rfid}`), {
    status: 'active',
    isSuspended: false,
    activeSuspension: null,
  });

  // 2. Mark suspension revoked in history
  if (activeSusp && activeSusp.id) {
    try {
      await update(ref(db, `suspensions/${rfid}/${activeSusp.id}`), {
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

    for (const [rfid, st] of Object.entries(allStudents)) {
      if (st.status === 'suspended' || st.isSuspended) {
        const activeSusp = st.activeSuspension;
        if (activeSusp && activeSusp.endDate && nowStr > activeSusp.endDate) {
          await update(ref(db, `students/${rfid}`), {
            status: 'active',
            isSuspended: false,
            activeSuspension: null,
          });
          if (activeSusp.id) {
            await update(ref(db, `suspensions/${rfid}/${activeSusp.id}`), {
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
 * Execute an undo action, restoring the previous state on students/{RFID_UID}/attendance/{DATE}.
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
      const cleanCurUid = (curRec.rfidUID || curRec.uid).toUpperCase();
      const cleanPrevUid = (prevRec.rfidUID || prevRec.uid).toUpperCase();
      if (curRec.date !== prevRec.date) {
        await remove(ref(db, `students/${cleanCurUid}/attendance/${curRec.date}`));
      }
      await set(ref(db, `students/${cleanPrevUid}/attendance/${prevRec.date}`), stripUndefinedDeep(prevRec));
      break;
    }

    case 'DELETE': {
      const deleted = action.revertData.deletedRecord as AttendanceRecord;
      const cleanUid = (deleted.rfidUID || deleted.uid).toUpperCase();
      const trashId = action.revertData.trashId as string;
      await set(ref(db, `students/${cleanUid}/attendance/${deleted.date}`), stripUndefinedDeep(deleted));
      if (trashId) {
        await remove(ref(db, `attendance_trash/${trashId}`));
      }
      break;
    }

    case 'OVERRIDE': {
      const prevRec = action.revertData.previousRecord as AttendanceRecord;
      const cleanUid = (prevRec.rfidUID || prevRec.uid).toUpperCase();
      await set(ref(db, `students/${cleanUid}/attendance/${prevRec.date}`), stripUndefinedDeep(prevRec));
      break;
    }

    case 'BULK_DELETE': {
      const deletedRecords = action.revertData.deletedRecords as AttendanceRecord[];
      for (const rec of deletedRecords) {
        const cleanUid = (rec.rfidUID || rec.uid).toUpperCase();
        await set(ref(db, `students/${cleanUid}/attendance/${rec.date}`), stripUndefinedDeep(rec));
        await remove(ref(db, `attendance_trash/${rec.date}_${cleanUid}`));
      }
      break;
    }

    case 'BULK_EDIT': {
      const prevStates = action.revertData.previousStates as Array<{ date: string; uid: string; prevStatus: AttendanceStatus }>;
      for (const p of prevStates) {
        const cleanUid = p.uid.toUpperCase();
        const targetRef = ref(db, `students/${cleanUid}/attendance/${p.date}`);
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

function mergeAttendanceEntries(existing: any, incoming: any): any {
  if (!existing) return incoming;
  if (!incoming) return existing;
  // Preserve admin overrides & edit history if present in existing
  return {
    ...incoming,
    ...existing,
    isOverridden: existing.isOverridden ?? incoming.isOverridden,
    overrideReason: existing.overrideReason ?? incoming.overrideReason,
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
export async function runUnifiedDatabaseMigration(
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
  const lowercaseKeysToClean: string[] = [];
  const affectedNormKeys = new Set<string>();

  for (const [rawKey, rawStu] of Object.entries(rawStudents)) {
    if (!rawStu || typeof rawStu !== 'object') continue;
    const normKey = normalizeRfidKey(rawStu.uid || rawKey);
    const existing = studentRegistry[normKey];
    const mergedAttendance: Record<string, AttendanceRecord> = {
      ...(existing?.attendance || {}),
      ...(rawStu.attendance || {}),
    };
    studentRegistry[normKey] = stripUndefinedDeep({
      ...(existing || {}),
      ...rawStu,
      uid: normKey,
      ...(Object.keys(mergedAttendance).length > 0 ? { attendance: mergedAttendance } : {}),
    });
    if (rawKey !== normKey) {
      lowercaseKeysToClean.push(rawKey);
      affectedNormKeys.add(normKey);
    }
  }

  // Normalize only mixed-case student keys if any actually exist
  try {
    for (const normKey of affectedNormKeys) {
      await runRtdbOp('SET', `/students/${normKey}`, () =>
        set(ref(db, `students/${normKey}`), stripUndefinedDeep(studentRegistry[normKey]))
      );
    }
    for (const oldKey of lowercaseKeysToClean) {
      await runRtdbOp('REMOVE', `/students/${oldKey}`, () =>
        remove(ref(db, `students/${oldKey}`))
      );
    }
  } catch (err: any) {
    const opErr = err instanceof RtdbOperationError ? err : null;
    const msg = err?.message || 'Failed normalizing student keys';
    return {
      success: false,
      message: `Migration aborted while normalizing /students keys. Legacy /attendance was preserved.`,
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
      failedOperation: opErr?.operation || 'SET',
      failedPath: opErr?.path || '/students',
      errors: [msg],
      recordLogs,
    };
  }

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

  const expectedTargets: Array<{ targetPath: string; date: string; uid: string; status: string }> = [];

  // 5. Migrate each record strictly to /students/{UID}/attendance/{DATE}
  for (const entry of legacyPairs.values()) {
    const { date, normUid, rawRec } = entry;

    let targetStudent = studentRegistry[normUid];
    if (!targetStudent && rawRec.studentId) {
      const targetStuId = rawRec.studentId.toString().trim().toUpperCase();
      targetStudent = Object.values(studentRegistry).find(
        (s) => s.studentId?.trim().toUpperCase() === targetStuId
      ) as Student;
    }
    if (!targetStudent && rawRec.authUid) {
      targetStudent = Object.values(studentRegistry).find(
        (s) => s.authUid === rawRec.authUid
      ) as Student;
    }
    if (!targetStudent && rawRec.email) {
      const targetEmail = rawRec.email.toString().trim().toLowerCase();
      targetStudent = Object.values(studentRegistry).find(
        (s) => s.email?.trim().toLowerCase() === targetEmail
      ) as Student;
    }
    if (!targetStudent && (rawRec.studentName || rawRec.name)) {
      const targetName = (rawRec.studentName || rawRec.name).toString().trim().toLowerCase();
      targetStudent = Object.values(studentRegistry).find(
        (s) => s.name?.trim().toLowerCase() === targetName
      ) as Student;
    }
    if (!targetStudent) {
      const infoMatch =
        lookupStudentInfo(normUid) ||
        (rawRec.studentName || rawRec.name ? lookupStudentInfo(rawRec.studentName || rawRec.name) : null);
      if (infoMatch && studentRegistry[infoMatch.rfidUID.toUpperCase()]) {
        targetStudent = studentRegistry[infoMatch.rfidUID.toUpperCase()];
      }
    }

    try {
      if (targetStudent) {
        const targetUid = normalizeRfidKey(targetStudent.uid);
        const destPath = `students/${targetUid}/attendance/${date}`;
        const existingAtTarget = targetStudent.attendance?.[date];
        const normalizedRec = stripUndefinedDeep(
          normalizeAttendanceRecord(
            {
              ...rawRec,
              uid: targetUid,
              rfidUID: targetUid,
              studentRfid: targetUid,
              studentName: rawRec.studentName || rawRec.name || targetStudent.name,
              studentId: rawRec.studentId || targetStudent.studentId,
              department: rawRec.department || targetStudent.department,
              authUid: rawRec.authUid || targetStudent.authUid || '',
              date: rawRec.date || date,
            },
            date,
            targetUid
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
          expectedTargets.push({ targetPath: destPath, date, uid: targetUid, status: merged.status });
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
          expectedTargets.push({ targetPath: destPath, date, uid: targetUid, status: normalizedRec.status });
        }
      } else {
        // Unregistered RFID: preserve in recovery node without discarding
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
        const hasValidFields =
          val.date === target.date &&
          storedUid === target.uid &&
          Boolean(val.status) &&
          Boolean(val.time);
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
  targetStudentUidInput: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; assignedCount: number }> {
  const db = getFirebaseDatabase();
  const unregisteredUid = normalizeRfidKey(unregisteredUidInput);
  const targetUid = normalizeRfidKey(targetStudentUidInput);

  const studentSnap = await get(ref(db, `students/${targetUid}`));
  if (!studentSnap.exists()) {
    throw new Error(`Target student ${targetUid} does not exist.`);
  }
  const targetStudent = studentSnap.val() as Student;

  const recRef = ref(db, `migration_recovery/unregistered_attendance/${unregisteredUid}`);
  const recSnap = await get(recRef);
  if (!recSnap.exists()) {
    throw new Error(`No recovered records found for ${unregisteredUid}.`);
  }

  const recMap = recSnap.val() as Record<string, any>;
  const assignedDates: string[] = [];

  for (const [dateKey, rawRec] of Object.entries(recMap)) {
    const destRef = ref(db, `students/${targetUid}/attendance/${dateKey}`);
    const existingSnap = await get(destRef);
    const updatedRec = normalizeAttendanceRecord(
      {
        ...rawRec,
        uid: targetUid,
        rfidUID: targetUid,
        studentRfid: targetUid,
        studentName: targetStudent.name,
        studentId: targetStudent.studentId,
        department: targetStudent.department,
        authUid: targetStudent.authUid || '',
        date: dateKey,
        notes: `Recovered & reassigned from legacy UID ${unregisteredUid}`,
      },
      dateKey,
      targetUid
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
    studentRfid: targetUid,
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


