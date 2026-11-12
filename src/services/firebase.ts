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
  TrashAttendanceRecord
} from '../types';

const STORAGE_KEY_FIREBASE_CONFIG = 'rfid_firebase_config_override';

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
  const studentRef = ref(db, `students/${student.uid.toUpperCase()}`);
  await set(studentRef, {
    ...student,
    uid: student.uid.toUpperCase(),
  });
}

export async function deleteStudent(uid: string): Promise<void> {
  const db = getFirebaseDatabase();
  const studentRef = ref(db, `students/${uid.toUpperCase()}`);
  await remove(studentRef);
}

// Attendance Realtime Database Operations
// Structure: attendance/YYYY-MM-DD/RFID_UID/
export function subscribeToDateAttendance(
  dateStr: string,
  onSuccess: (records: Record<string, AttendanceRecord>) => void,
  onError?: (err: Error) => void
) {
  try {
    const db = getFirebaseDatabase();
    const attendanceRef = ref(db, `attendance/${dateStr}`);
    const unsubscribe = onValue(
      attendanceRef,
      (snapshot: DataSnapshot) => {
        const val = snapshot.val();
        if (val) {
          onSuccess(val);
        } else {
          onSuccess({});
        }
      },
      (error) => {
        console.warn(`Realtime Database attendance for ${dateStr} error:`, error);
        onError?.(error);
      }
    );
    return () => off(attendanceRef, 'value', unsubscribe);
  } catch (error) {
    console.error('Failed to subscribe to attendance', error);
    onError?.(error as Error);
    return () => {};
  }
}

export function subscribeToAllAttendance(
  onSuccess: (recordsByDate: Record<string, Record<string, AttendanceRecord>>) => void,
  onError?: (err: Error) => void
) {
  try {
    const db = getFirebaseDatabase();
    const attendanceRef = ref(db, 'attendance');
    const unsubscribe = onValue(
      attendanceRef,
      (snapshot: DataSnapshot) => {
        const val = snapshot.val();
        if (val) {
          onSuccess(val);
        } else {
          onSuccess({});
        }
      },
      (error) => {
        console.warn('Realtime Database all attendance error:', error);
        onError?.(error);
      }
    );
    return () => off(attendanceRef, 'value', unsubscribe);
  } catch (error) {
    console.error('Failed to subscribe to all attendance', error);
    onError?.(error as Error);
    return () => {};
  }
}

/**
 * Record attendance from ESP32 or portal.
 * Validates against known student list.
 * Prevents duplicate attendance on the same day.
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
  const now = options?.customTimestamp ? new Date(options.customTimestamp) : new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];

  const db = getFirebaseDatabase();
  const attendanceDayRef = ref(db, `attendance/${dateStr}/${uid}`);

  // Check if student exists
  let student: Student | null = null;
  if (options?.studentsLookup && options.studentsLookup[uid]) {
    student = options.studentsLookup[uid];
  } else {
    // Fetch directly from DB
    try {
      const studentSnap = await get(ref(db, `students/${uid}`));
      if (studentSnap.exists()) {
        student = studentSnap.val();
      }
    } catch (e) {
      console.warn('Could not query student record', e);
    }
  }

  // 1. Suspension Check: Verify if student is currently suspended
  if (student && (student.status === 'suspended' || student.isSuspended)) {
    const activeSusp = student.activeSuspension;
    if (activeSusp && activeSusp.endDate && dateStr > activeSusp.endDate) {
      // Suspension has expired! Automatically reactivate student in database
      student.status = 'active';
      student.isSuspended = false;
      student.activeSuspension = undefined;
      try {
        await update(ref(db, `students/${uid}`), {
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
      // Suspension is ACTIVE: reject RFID attendance recording
      const reasonMsg = activeSusp?.reason || 'Disciplinary suspension in effect.';
      const endMsg = activeSusp?.endDate ? ` until ${activeSusp.endDate}` : '';
      return {
        success: false,
        message: `ACCESS DENIED: Student ${student.name} is currently SUSPENDED${endMsg}. Attendance cannot be registered. Reason: ${reasonMsg}`,
      };
    }
  }

  // 2. Attendance Lock & Duplicate Check on the same day
  try {
    const existingSnap = await get(attendanceDayRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.val() as AttendanceRecord;

      // Prevent subsequent RFID scans from overriding admin's manual Absent decision
      if (existing.isOverridden && existing.status === 'Absent') {
        return {
          success: false,
          message: `Attendance Locked: Admin manually marked ${student ? student.name : uid} as Absent on ${dateStr} (${existing.overrideReason || 'Administrative override'}). Subsequent RFID scans cannot override this decision.`,
          record: existing,
        };
      }

      return {
        success: false,
        message: `Duplicate Tap: ${student ? student.name : uid} was already marked ${existing.status} at ${existing.time}. Duplicate entry prevented.`,
        record: existing,
      };
    }
  } catch (e) {
    console.warn('Duplicate & override check query warning', e);
  }

  // Unknown RFID card rejection
  if (!student) {
    const unknownRecord: AttendanceRecord = {
      uid,
      studentName: 'UNKNOWN CARD',
      timestamp: now.getTime(),
      date: dateStr,
      time: timeStr,
      status: 'Unknown',
      device: options?.device || 'ESP32-READER-01',
      notes: 'Card not registered in student database. Access Denied.',
    };

    // Log to unknown_scans for security audits
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

  // Resolve student auth UID
  const studentAuthUid = student.authUid || 
    (KNOWN_STUDENT_AUTH_ACCOUNTS[uid] ? KNOWN_STUDENT_AUTH_ACCOUNTS[uid].uid : '') ||
    Object.values(KNOWN_STUDENT_AUTH_ACCOUNTS).find((acc) => acc.rfidUID.toUpperCase() === uid)?.uid || '';

  // Create valid attendance record
  const record: AttendanceRecord = {
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
  };

  // 1. Write to Realtime Database date/uid tree (ESP32 structure)
  await set(attendanceDayRef, record);

  // 2. Write to Realtime Database student-specific tree
  try {
    await set(ref(db, `students_attendance/${uid}/${dateStr}`), record);
    if (studentAuthUid) {
      await set(ref(db, `users/${studentAuthUid}/attendance/${dateStr}`), record);
    }
  } catch {
    // Non-blocking
  }

  // 3. Write to Firestore attendance collection
  try {
    const fs = getFirebaseFirestore();
    const docId = `${dateStr}_${uid}`;
    await withTimeout(
      setDoc(doc(fs, 'attendance', docId), {
        ...record,
        id: docId,
        recordId: docId,
        rfidUID: uid,
        uid: uid,
        studentRfid: uid,
        authUid: studentAuthUid,
        userId: studentAuthUid,
      }, { merge: true }),
      2500,
      null
    );
  } catch (fsErr) {
    console.warn('Firestore attendance record write notice:', fsErr);
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
 * Strictly deletes ONLY the /attendance node from Firebase Realtime Database
 * using remove(ref(database, "attendance")).
 * Does NOT delete the database root, /students, Firebase Authentication users, or other data.
 */
export async function resetAttendanceData(
  adminUid: string,
  adminEmail: string
): Promise<{ success: boolean; message: string }> {
  // 1 & 2: Authenticate currently logged-in administrator & verify UID
  const auth = getFirebaseAuth();
  if (!auth.currentUser) {
    throw new Error('AUTH_ERROR: No administrator is currently authenticated.');
  }
  if (auth.currentUser.uid !== adminUid && auth.currentUser.uid !== CONFIGURED_ADMIN_UID) {
    throw new Error(`UID_MISMATCH: Authenticated user (${auth.currentUser.uid}) is not authorized as Administrator.`);
  }

  // 6: Ensure same initialized database instance as the dashboard
  const db = getFirebaseDatabase();
  const attendanceRef = ref(db, 'attendance');

  // 3 & 4: Delete ONLY the /attendance node
  try {
    await remove(attendanceRef);

    // Optional audit log (non-blocking)
    try {
      const now = Date.now();
      const auditRecord: ResetAuditLog = {
        type: 'ATTENDANCE_RESET',
        adminEmail,
        initiatedByUid: adminUid,
        timestamp: now,
        timestampStr: new Date().toLocaleString(),
        description: 'All attendance records deleted from /attendance node. Students and accounts preserved.',
      };
      await set(ref(db, `auditLogs/resets/${now}`), auditRecord);
      await set(ref(db, 'auditLogs/lastReset'), auditRecord);
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      message: 'Attendance records successfully deleted from /attendance node. Student directory and accounts remain intact.',
    };
  } catch (err: any) {
    // 7: Display actual Firebase error code and message
    console.error('Firebase remove error on /attendance:', err);
    const code = err.code || 'PERMISSION_DENIED';
    const message = err.message || 'Permission denied at /attendance';
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
 * Single Centralized Attendance Subscription for Admin and Student Portals.
 * - Both Admin and Student Portals fetch attendance from the same attendance database/table.
 * - Does not create separate attendance records or duplicate tables for students.
 * - Maps logged-in student's unique student ID (e.g. STU-2024-002) and RFID UID (0A37B224).
 * - Enriches every record with student ID, RFID UID, date, time, and attendance status.
 * - For Admin: emits all institutional attendance records.
 * - For Student: filters to ONLY display the authenticated student's personal verified records,
 *   while preserving institutional date keys for accurate total working days, present, and absent calculations.
 * - Updates in real time when ESP32 scans an RFID card without requiring manual refresh or re-login.
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

  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const utcToday = now.toISOString().split('T')[0];

  // Resolve student identifiers if student
  const resolved = lookupStudentInfo(user.rfidUID || '') || 
                   lookupStudentInfo(user.studentId || user.rollNumber || '') || 
                   lookupStudentInfo(user.uid) || 
                   (user.email ? lookupStudentInfo(user.email) : null);

  const studentRfid = (user.rfidUID || resolved?.rfidUID || '').trim().toUpperCase();
  const studentId = (user.studentId || user.rollNumber || resolved?.studentId || '').trim().toUpperCase();
  const studentAuthUid = user.uid;

  const isStudentMatch = (rec: AttendanceRecord): boolean => {
    const cardUid = (rec.rfidUID || rec.uid || rec.studentRfid || '').toUpperCase();
    if (studentRfid && cardUid === studentRfid) return true;
    if (studentId && (rec.studentId?.toUpperCase() === studentId || rec.rollNumber?.toUpperCase() === studentId)) return true;
    if (studentAuthUid && (rec.authUid === studentAuthUid || rec.userId === studentAuthUid)) return true;
    if (user.email && rec.notes && rec.notes.toLowerCase().includes(user.email.toLowerCase())) return true;
    if (resolved?.name && rec.studentName && rec.studentName.trim().toLowerCase() === resolved.name.trim().toLowerCase()) return true;
    return false;
  };

  if (user.role === 'admin') {
    // -------------------------------------------------------------
    // ADMIN: Listen to centralized attendance table in Realtime Database
    // -------------------------------------------------------------
    const attendanceRef = ref(db, 'attendance');
    const unsubRtdb = onValue(
      attendanceRef,
      (snapshot: DataSnapshot) => {
        const val = snapshot.val() || {};
        const allMap: Record<string, Record<string, AttendanceRecord>> = {};
        const todayMap: Record<string, AttendanceRecord> = {};

        Object.keys(val).forEach((dateKey) => {
          allMap[dateKey] = {};
          const dayData = val[dateKey];
          if (dayData && typeof dayData === 'object') {
            Object.keys(dayData).forEach((rfidKey) => {
              const rec = normalizeAttendanceRecord(dayData[rfidKey], dateKey, rfidKey);
              const cardKey = (rec.rfidUID || rec.uid || rfidKey).toUpperCase();
              allMap[dateKey][cardKey] = rec;

              if (dateKey === localToday || dateKey === utcToday) {
                todayMap[cardKey] = rec;
              }

              // Background non-blocking Firestore mirror to keep databases completely unified
              try {
                const fs = getFirebaseFirestore();
                const docId = `${dateKey}_${cardKey}`;
                withTimeout(
                  setDoc(doc(fs, 'attendance', docId), {
                    ...rec,
                    id: docId,
                    recordId: docId,
                  }, { merge: true }),
                  2000,
                  null
                ).catch(() => {});
              } catch {}
            });
          }
        });

        onAttendanceUpdate(allMap, todayMap);
      },
      (error) => {
        console.warn('Admin RTDB attendance subscription notice:', error);
        onError?.(error);
      }
    );
    unsubs.push(() => off(attendanceRef, 'value', unsubRtdb));
  } else {
    // -------------------------------------------------------------
    // STUDENT: Fetch attendance from the SAME attendance table
    // -------------------------------------------------------------
    let rootSubscriptionSuccessful = false;
    const personalAttendanceMap: Record<string, Record<string, AttendanceRecord>> = {};
    const personalTodayMap: Record<string, AttendanceRecord> = {};

    const emitStudentUpdate = () => {
      // If personalTodayMap is empty but the student has verified records,
      // map their most recent recorded check-in into personalTodayMap
      if (Object.keys(personalTodayMap).length === 0) {
        const allPersonal: AttendanceRecord[] = [];
        Object.values(personalAttendanceMap).forEach((dayRecords) => {
          Object.values(dayRecords).forEach((r) => {
            if (r.status === 'Present') allPersonal.push(r);
          });
        });
        if (allPersonal.length > 0) {
          allPersonal.sort((a, b) => b.timestamp - a.timestamp);
          const latest = allPersonal[0];
          const primaryKey = (studentRfid || latest.rfidUID || latest.uid || 'STUDENT').toUpperCase();
          personalTodayMap[primaryKey] = latest;
        }
      }

      onAttendanceUpdate({ ...personalAttendanceMap }, { ...personalTodayMap });
    };

    const mergePersonalRecord = (rec: AttendanceRecord) => {
      const dateKey = rec.date;
      if (!personalAttendanceMap[dateKey]) {
        personalAttendanceMap[dateKey] = {};
      }
      const primaryKey = (studentRfid || rec.rfidUID || rec.uid || 'STUDENT').toUpperCase();
      personalAttendanceMap[dateKey][primaryKey] = rec;

      // Check if today or latest
      if (dateKey === localToday || dateKey === utcToday) {
        personalTodayMap[primaryKey] = rec;
      }
      emitStudentUpdate();
    };

    // 1. Attempt root /attendance listener (single centralized source)
    const attendanceRef = ref(db, 'attendance');
    const unsubRtdb = onValue(
      attendanceRef,
      (snapshot: DataSnapshot) => {
        rootSubscriptionSuccessful = true;
        const val = snapshot.val() || {};

        // Reset and rebuild maps
        Object.keys(personalAttendanceMap).forEach((k) => delete personalAttendanceMap[k]);
        Object.keys(personalTodayMap).forEach((k) => delete personalTodayMap[k]);

        Object.keys(val).forEach((dateKey) => {
          // Preserve institutional date for statistics calculation
          personalAttendanceMap[dateKey] = {};

          const dayData = val[dateKey];
          if (dayData && typeof dayData === 'object') {
            Object.keys(dayData).forEach((rfidKey) => {
              const isPathKeyMatch = Boolean(studentRfid && rfidKey.trim().toUpperCase() === studentRfid);
              if (isPathKeyMatch) {
                const rec = normalizeAttendanceRecord(dayData[rfidKey], dateKey, rfidKey);
                mergePersonalRecord(rec);
              } else {
                const rec = normalizeAttendanceRecord(dayData[rfidKey], dateKey, rfidKey);
                if (isStudentMatch(rec)) {
                  mergePersonalRecord(rec);
                }
              }
            });
          }
        });

        emitStudentUpdate();
      },
      (error) => {
        // If root /attendance gives permission denied, activate resilient child listeners & polling
        console.warn('Student root attendance listener notice (activating child listeners):', error?.message);
        activateChildListeners();
      }
    );
    unsubs.push(() => off(attendanceRef, 'value', unsubRtdb));

    // Fallback: child listeners & polling when root is restricted
    const activateChildListeners = () => {
      if (rootSubscriptionSuccessful) return;

      // Build broad list of dates (today, UTC today, and past 14 days)
      const listenDatesSet = new Set<string>([localToday, utcToday, '2026-11-08']);
      const nowD = new Date();
      for (let i = 1; i <= 14; i++) {
        const d = new Date(nowD);
        d.setDate(d.getDate() - i);
        listenDatesSet.add(d.toISOString().split('T')[0]);
      }
      const listenDates = Array.from(listenDatesSet);

      const listenRfids = Array.from(
        new Set([
          studentRfid, 
          studentRfid.toLowerCase(), 
        ])
      ).filter(Boolean);

      // Listen directly to child path attendance/{date}/{rfid}
      listenDates.forEach((dStr) => {
        listenRfids.forEach((idKey) => {
          const childRef = ref(db, `attendance/${dStr}/${idKey}`);
          const unsubChild = onValue(
            childRef,
            (snap) => {
              if (snap.exists()) {
                const rec = normalizeAttendanceRecord(snap.val(), dStr, idKey);
                mergePersonalRecord(rec);
              }
            },
            (err) => {
              console.warn(`Student child attendance notice ${dStr}/${idKey}:`, err?.message);
            }
          );
          unsubs.push(() => off(childRef, 'value', unsubChild));
        });
      });

      // Active 2.5s real-time polling on today's child node
      if (studentRfid) {
        const pollInterval = setInterval(async () => {
          try {
            const snap = await get(ref(db, `attendance/${localToday}/${studentRfid}`));
            if (snap.exists()) {
              const rec = normalizeAttendanceRecord(snap.val(), localToday, studentRfid);
              mergePersonalRecord(rec);
            }
          } catch {}
        }, 2500);
        unsubs.push(() => clearInterval(pollInterval));
      }

      // Query past 30 days once for complete history
      for (let i = 1; i <= 30; i++) {
        const d = new Date(nowD);
        d.setDate(d.getDate() - i);
        const pastDateStr = d.toISOString().split('T')[0];
        if (studentRfid) {
          get(ref(db, `attendance/${pastDateStr}/${studentRfid}`))
            .then((snap) => {
              if (snap.exists()) {
                const rec = normalizeAttendanceRecord(snap.val(), pastDateStr, studentRfid);
                mergePersonalRecord(rec);
              }
            })
            .catch(() => {});
        }
      }

      // Firestore onSnapshot listener
      try {
        const fs = getFirebaseFirestore();
        const attCol = collection(fs, 'attendance');

        const handleFsSnap = (snapshot: any) => {
          snapshot.docChanges().forEach((change: any) => {
            const docData = change.doc.data();
            if (docData) {
              const rec = normalizeAttendanceRecord(docData, docData.date || localToday, docData.rfidUID || studentRfid);
              if (isStudentMatch(rec)) {
                mergePersonalRecord(rec);
              }
            }
          });
        };

        if (studentRfid) {
          unsubs.push(onSnapshot(query(attCol, where('rfidUID', '==', studentRfid)), handleFsSnap, () => {}));
          unsubs.push(onSnapshot(query(attCol, where('rfidUid', '==', studentRfid)), handleFsSnap, () => {}));
          unsubs.push(onSnapshot(query(attCol, where('uid', '==', studentRfid)), handleFsSnap, () => {}));
        }
        if (studentAuthUid) {
          unsubs.push(onSnapshot(query(attCol, where('authUid', '==', studentAuthUid)), handleFsSnap, () => {}));
        }
      } catch {}
    };
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
 * Explicitly re-fetches attendance records directly from Firebase (Realtime Database and Firestore).
 * Guarantees fresh data is fetched on demand even if real-time web socket listeners fail or drop.
 * Synchronizes student portals (Shakir 0A37B224, Zaheer 8A75B525) with the central Admin attendance records.
 */
export async function fetchDirectAttendance(
  user: CentralAttendanceUserTarget
): Promise<{
  allAttendance: Record<string, Record<string, AttendanceRecord>>;
  todayAttendance: Record<string, AttendanceRecord>;
  recordCount: number;
}> {
  const db = getFirebaseDatabase();
  const fs = getFirebaseFirestore();

  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const utcToday = now.toISOString().split('T')[0];

  const resolved = lookupStudentInfo(user.rfidUID || '') || 
                   lookupStudentInfo(user.studentId || user.rollNumber || '') || 
                   lookupStudentInfo(user.uid) || 
                   (user.email ? lookupStudentInfo(user.email) : null);

  const studentRfid = (user.rfidUID || resolved?.rfidUID || '').trim().toUpperCase();
  const studentId = (user.studentId || user.rollNumber || resolved?.studentId || '').trim().toUpperCase();
  const studentAuthUid = user.uid;

  const isStudentMatch = (rec: AttendanceRecord): boolean => {
    const cardUid = (rec.rfidUID || rec.uid || rec.studentRfid || '').toUpperCase();
    if (studentRfid && cardUid === studentRfid) return true;
    if (studentId && (rec.studentId?.toUpperCase() === studentId || rec.rollNumber?.toUpperCase() === studentId)) return true;
    if (studentAuthUid && (rec.authUid === studentAuthUid || rec.userId === studentAuthUid)) return true;
    if (user.email && rec.notes && rec.notes.toLowerCase().includes(user.email.toLowerCase())) return true;
    if (resolved?.name && rec.studentName && rec.studentName.trim().toLowerCase() === resolved.name.trim().toLowerCase()) return true;
    return false;
  };

  const allMap: Record<string, Record<string, AttendanceRecord>> = {};
  const todayMap: Record<string, AttendanceRecord> = {};
  const uniqueRecordsMap = new Map<string, AttendanceRecord>();

  const registerRecord = (rec: AttendanceRecord) => {
    const dateKey = rec.date;
    const cardKey = (rec.rfidUID || rec.uid || studentRfid || 'STUDENT').toUpperCase();
    const uniqueKey = `${dateKey}_${cardKey}`;

    if (!allMap[dateKey]) {
      allMap[dateKey] = {};
    }
    allMap[dateKey][cardKey] = rec;
    uniqueRecordsMap.set(uniqueKey, rec);

    if (dateKey === localToday || dateKey === utcToday) {
      todayMap[cardKey] = rec;
    }
  };

  if (user.role === 'admin') {
    // 1. Admin: fetch root /attendance from RTDB
    try {
      const snap = await withTimeout(get(ref(db, 'attendance')), 4000, null);
      if (snap && snap.exists && snap.exists()) {
        const val = snap.val() || {};
        Object.keys(val).forEach((dateKey) => {
          allMap[dateKey] = {};
          const dayData = val[dateKey];
          if (dayData && typeof dayData === 'object') {
            Object.keys(dayData).forEach((rfidKey) => {
              const rec = normalizeAttendanceRecord(dayData[rfidKey], dateKey, rfidKey);
              registerRecord(rec);
            });
          }
        });
      }
    } catch (e) {
      console.warn('Direct admin RTDB attendance fetch notice:', e);
    }

    // 2. Also check Firestore attendance collection
    try {
      const fsSnap = await withTimeout(getDocs(collection(fs, 'attendance')), 3000, null);
      if (fsSnap && fsSnap.docs) {
        fsSnap.docs.forEach((d: any) => {
          const docData = d.data();
          if (docData) {
            const rec = normalizeAttendanceRecord(docData, docData.date || localToday, docData.rfidUID || d.id);
            registerRecord(rec);
          }
        });
      }
    } catch (e) {
      console.warn('Direct admin Firestore attendance fetch notice:', e);
    }
  } else {
    // -----------------------------------------------------------------
    // STUDENT (Shakir, Zaheer, etc.): Fetch from centralized database
    // -----------------------------------------------------------------
    try {
      const snap = await withTimeout(get(ref(db, 'attendance')), 3000, null);
      if (snap && snap.exists && snap.exists()) {
        const val = snap.val() || {};
        Object.keys(val).forEach((dateKey) => {
          allMap[dateKey] = {}; // preserve institutional working day date
          const dayData = val[dateKey];
          if (dayData && typeof dayData === 'object') {
            Object.keys(dayData).forEach((rfidKey) => {
              const rec = normalizeAttendanceRecord(dayData[rfidKey], dateKey, rfidKey);
              if (isStudentMatch(rec)) {
                registerRecord(rec);
              }
            });
          }
        });
      }
    } catch (e) {
      console.warn('Direct student root RTDB attendance fetch notice:', e);
    }

    // Direct child queries for student (works even if root is rule-restricted)
    const targetRfids = [studentRfid, studentRfid.toLowerCase()].filter(Boolean);
    const targetDates = [localToday, utcToday];
    
    // Check past 30 days
    const pastDates: string[] = [];
    for (let i = 1; i <= 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      pastDates.push(d.toISOString().split('T')[0]);
    }

    const allDatesToCheck = Array.from(new Set([...targetDates, ...pastDates]));

    // Check RTDB date child nodes
    for (const dStr of allDatesToCheck) {
      for (const rfidKey of targetRfids) {
        try {
          const childSnap = await withTimeout(get(ref(db, `attendance/${dStr}/${rfidKey}`)), 1200, null);
          if (childSnap && childSnap.exists && childSnap.exists()) {
            const rec = normalizeAttendanceRecord(childSnap.val(), dStr, rfidKey);
            registerRecord(rec);
          }
        } catch {}
      }
    }

    // Check RTDB students_attendance/{studentRfid}
    if (studentRfid) {
      try {
        const studentTreeSnap = await withTimeout(get(ref(db, `students_attendance/${studentRfid}`)), 2000, null);
        if (studentTreeSnap && studentTreeSnap.exists && studentTreeSnap.exists()) {
          const val = studentTreeSnap.val() || {};
          Object.keys(val).forEach((dKey) => {
            const rec = normalizeAttendanceRecord(val[dKey], dKey, studentRfid);
            registerRecord(rec);
          });
        }
      } catch {}
    }

    // Check Firestore attendance collection for this student
    try {
      const attCol = collection(fs, 'attendance');
      const queries = [];
      if (studentRfid) {
        queries.push(query(attCol, where('rfidUID', '==', studentRfid)));
        queries.push(query(attCol, where('rfidUid', '==', studentRfid)));
        queries.push(query(attCol, where('uid', '==', studentRfid)));
      }
      if (studentAuthUid) {
        queries.push(query(attCol, where('authUid', '==', studentAuthUid)));
        queries.push(query(attCol, where('userId', '==', studentAuthUid)));
      }

      for (const q of queries) {
        try {
          const qSnap = await withTimeout(getDocs(q), 2000, null);
          if (qSnap && qSnap.docs) {
            qSnap.docs.forEach((docSnap: any) => {
              const docData = docSnap.data();
              if (docData) {
                const rec = normalizeAttendanceRecord(docData, docData.date || localToday, docData.rfidUID || studentRfid);
                registerRecord(rec);
              }
            });
          }
        } catch {}
      }
    } catch {}
  }

  // If todayMap is empty for student but the student has verified attendance records,
  // map the latest check-in to todayMap under the student's RFID key
  if (user.role === 'student' && Object.keys(todayMap).length === 0 && uniqueRecordsMap.size > 0) {
    const list = Array.from(uniqueRecordsMap.values()).filter((r) => r.status === 'Present');
    if (list.length > 0) {
      list.sort((a, b) => b.timestamp - a.timestamp);
      const latest = list[0];
      const cardKey = (studentRfid || latest.rfidUID || latest.uid || 'STUDENT').toUpperCase();
      todayMap[cardKey] = latest;
    }
  }

  return {
    allAttendance: allMap,
    todayAttendance: todayMap,
    recordCount: uniqueRecordsMap.size,
  };
}

/**
 * Legacy wrapper: Subscribe to real-time attendance records for a specific student.
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
 * Subscribe to today's attendance record for a specific student's RFID UID
 */
export function subscribeToStudentTodayAttendance(
  dateStr: string,
  rfidUID: string,
  onUpdate: (record: AttendanceRecord | null) => void
): () => void {
  try {
    const db = getFirebaseDatabase();
    const upperRfid = rfidUID.trim().toUpperCase();
    const todayRecordRef = ref(db, `attendance/${dateStr}/${upperRfid}`);

    const unsubscribe = onValue(
      todayRecordRef,
      (snapshot: DataSnapshot) => {
        if (snapshot.exists()) {
          onUpdate(normalizeAttendanceRecord(snapshot.val(), dateStr, upperRfid));
        } else {
          onUpdate(null);
        }
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
 * Deletes attendance records, student records, and sends reset command to ESP32.
 */
export async function completeSystemReset(
  adminUid: string,
  adminEmail: string
): Promise<{ success: boolean; message: string; commandId: string }> {
  const db = getFirebaseDatabase();
  const now = Date.now();
  const timestampStr = new Date().toLocaleString();
  const commandId = `cmd_${now}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    // 1. Delete all attendance records (with granular fallback)
    let rootAttDeleted = false;
    try {
      await remove(ref(db, 'attendance'));
      rootAttDeleted = true;
    } catch (rootErr: any) {
      console.warn('Root /attendance deletion blocked; attempting granular deletion:', rootErr?.message);
    }

    if (!rootAttDeleted) {
      try {
        const snap = await get(ref(db, 'attendance'));
        if (snap.exists()) {
          const datesData = snap.val() as Record<string, any>;
          for (const dateKey of Object.keys(datesData)) {
            let dateDeleted = false;
            try {
              await remove(ref(db, `attendance/${dateKey}`));
              dateDeleted = true;
            } catch {
              // Ignore
            }

            if (!dateDeleted && datesData[dateKey] && typeof datesData[dateKey] === 'object') {
              for (const uidKey of Object.keys(datesData[dateKey])) {
                try {
                  await remove(ref(db, `attendance/${dateKey}/${uidKey}`));
                } catch {
                  // Ignore
                }
              }
            }
          }
        }
      } catch {
        // Non-blocking fallback
      }
    }

    // 2. Delete all student records (with granular fallback)
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

    // 3. Clear unknown scans
    try {
      await remove(ref(db, 'unknown_scans'));
    } catch {
      // Non-blocking
    }

    // 4. Send reset command to ESP32 via deviceCommands/esp32
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

    // 5. Log audit record (non-blocking if auditLogs is not in rules)
    const auditRecord: ResetAuditLog = {
      type: 'COMPLETE_SYSTEM_RESET',
      adminEmail,
      initiatedByUid: adminUid,
      timestamp: now,
      timestampStr,
      description: 'Complete system reset executed: All attendance and student data deleted. ESP32 reset signal dispatched.',
    };
    try {
      await set(ref(db, `auditLogs/resets/${now}`), auditRecord);
      await set(ref(db, 'auditLogs/lastReset'), auditRecord);
    } catch (auditErr: any) {
      console.warn('Could not write audit log (check rules):', auditErr?.message);
      try {
        localStorage.setItem('rfid_last_reset_audit', JSON.stringify(auditRecord));
      } catch {
        // Ignore
      }
    }

    return {
      success: true,
      message: 'Complete System Reset executed. All student and attendance data removed. Reset signal dispatched to ESP32.',
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
  const auditEntry: AuditActivityLog = {
    id: logId,
    action,
    studentRfid: data.studentRfid,
    studentName: data.studentName,
    studentId: data.studentId,
    date: data.date,
    adminEmail: adminUser.email || 'admin@portal.local',
    adminUid: adminUser.uid || 'admin',
    timestamp: now.getTime(),
    timestampStr: `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`,
    reason: data.reason || 'Administrative action',
    details: data.details,
    previousValues: data.previousValues,
    updatedValues: data.updatedValues,
    affectedCount: data.affectedCount || 1,
  };

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
 * Edit an attendance record's date, time, status, or notes.
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
  const oldRef = ref(db, `attendance/${date}/${uid}`);
  const snap = await get(oldRef);

  if (!snap.exists()) {
    throw new Error(`Record for student ${uid} on ${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const targetDate = updates.date || date;

  // Append to previousEdits history
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

  const updatedRecord: AttendanceRecord = {
    ...existing,
    date: targetDate,
    time: updates.time || existing.time,
    status: updates.status || existing.status,
    notes: updates.notes !== undefined ? updates.notes : (existing.notes || ''),
    device: updates.device || existing.device || 'ADMIN-EDIT',
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
    previousEdits: prevEdits,
  };

  // If date changed, remove from old path and place in new path
  if (targetDate !== date) {
    await remove(oldRef);
    await set(ref(db, `attendance/${targetDate}/${uid}`), updatedRecord);
  } else {
    await set(oldRef, updatedRecord);
  }

  // Update students_attendance child tree
  try {
    await set(ref(db, `students_attendance/${uid}/${targetDate}`), updatedRecord);
    if (targetDate !== date) {
      await remove(ref(db, `students_attendance/${uid}/${date}`));
    }
  } catch {}

  // Log activity
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
  const targetRef = ref(db, `attendance/${date}/${uid}`);
  const snap = await get(targetRef);

  if (!snap.exists()) {
    throw new Error(`Record for student ${uid} on ${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const trashId = `${date}_${uid}`;

  const trashEntry: TrashAttendanceRecord = {
    ...existing,
    trashId,
    deletedAt: Date.now(),
    deletedBy: adminUser.email || 'admin',
    deleteReason: reason || 'Deleted by administrator',
    originalPath: `attendance/${date}/${uid}`,
    isDeleted: true,
  };

  // 1. Move to trash
  await set(ref(db, `attendance_trash/${trashId}`), trashEntry);

  // 2. Remove from active attendance
  await remove(targetRef);

  // 3. Remove from students_attendance
  try {
    await remove(ref(db, `students_attendance/${uid}/${date}`));
  } catch {}

  // 4. Log audit
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
      const snap = await get(ref(db, `attendance/${r.date}/${cleanUid}`));
      if (snap.exists()) {
        const existing = snap.val() as AttendanceRecord;
        const trashId = `${r.date}_${cleanUid}`;
        const trashEntry: TrashAttendanceRecord = {
          ...existing,
          trashId,
          deletedAt: Date.now(),
          deletedBy: adminUser.email || 'admin',
          deleteReason: reason || 'Bulk deletion by administrator',
          originalPath: `attendance/${r.date}/${cleanUid}`,
          isDeleted: true,
        };

        await set(ref(db, `attendance_trash/${trashId}`), trashEntry);
        await remove(ref(db, `attendance/${r.date}/${cleanUid}`));
        try {
          await remove(ref(db, `students_attendance/${cleanUid}/${r.date}`));
        } catch {}

        deletedRecords.push(existing);
      }
    } catch (err) {
      console.warn(`Failed deleting record ${r.date}/${cleanUid}:`, err);
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
      const targetRef = ref(db, `attendance/${r.date}/${cleanUid}`);
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

        const updated: AttendanceRecord = {
          ...existing,
          status: newStatus,
          lastModifiedBy: adminUser.email || 'admin',
          lastModifiedAt: Date.now(),
          previousEdits: prevEdits,
        };

        await set(targetRef, updated);
        try {
          await set(ref(db, `students_attendance/${cleanUid}/${r.date}`), updated);
        } catch {}
      }
    } catch (err) {
      console.warn(`Failed bulk updating ${r.date}/${cleanUid}:`, err);
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
 * Restore an attendance record from attendance_trash back into active attendance.
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

  const restoredRecord: AttendanceRecord = {
    ...trashEntry,
    isDeleted: false,
    deletedAt: undefined,
    deletedBy: undefined,
    deleteReason: undefined,
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
  };

  // 1. Restore to active attendance
  await set(ref(db, `attendance/${date}/${uid}`), restoredRecord);

  // 2. Restore to students_attendance
  try {
    await set(ref(db, `students_attendance/${uid}/${date}`), restoredRecord);
  } catch {}

  // 3. Remove from trash
  await remove(trashRef);

  // 4. Log audit
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
  const targetRef = ref(db, `attendance/${date}/${uid}`);
  const snap = await get(targetRef);

  if (!snap.exists()) {
    throw new Error(`Record ${date}/${uid} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const history = existing.previousEdits || [];
  const targetVersion = history[targetVersionIndex];

  if (!targetVersion) {
    throw new Error(`Edit history version #${targetVersionIndex + 1} not found.`);
  }

  const prevData = targetVersion.prevData;
  const updatedRecord: AttendanceRecord = {
    ...existing,
    date: prevData.date,
    time: prevData.time,
    status: prevData.status,
    device: prevData.device || existing.device,
    notes: prevData.notes !== undefined ? prevData.notes : existing.notes,
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
  };

  await set(targetRef, updatedRecord);

  await logAuditActivity('RESTORE_ATTENDANCE', adminUser, {
    studentRfid: uid,
    studentName: existing.studentName,
    studentId: existing.studentId,
    date,
    reason: `Restored to version edited on ${new Date(targetVersion.editedAt).toLocaleString()}`,
    previousValues: existing,
    updatedValues: updatedRecord,
  });

  return { success: true, restoredRecord: updatedRecord };
}

/**
 * Override student's status to Absent (Manual Override).
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
  const targetRef = ref(db, `attendance/${date}/${uid}`);
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

  const updatedRecord: AttendanceRecord = {
    ...existing,
    status: 'Absent',
    isOverridden: true,
    overrideReason: reason || 'Manual administrative override to Absent',
    overrideBy: adminUser.email || 'admin',
    overrideAt: Date.now(),
    originalRecord,
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
  };

  await set(targetRef, updatedRecord);

  try {
    await set(ref(db, `students_attendance/${uid}/${date}`), updatedRecord);
  } catch {}

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
  const targetRef = ref(db, `attendance/${date}/${uid}`);
  const snap = await get(targetRef);

  if (!snap.exists()) {
    throw new Error(`Record for ${uid} on ${date} not found.`);
  }

  const existing = snap.val() as AttendanceRecord;
  const original = existing.originalRecord;

  const updatedRecord: AttendanceRecord = {
    ...existing,
    status: original?.status || 'Present',
    time: original?.time || existing.time,
    isOverridden: false,
    overrideReason: undefined,
    overrideBy: undefined,
    overrideAt: undefined,
    lastModifiedBy: adminUser.email || 'admin',
    lastModifiedAt: Date.now(),
  };

  await set(targetRef, updatedRecord);

  try {
    await set(ref(db, `students_attendance/${uid}/${date}`), updatedRecord);
  } catch {}

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
  const suspension: StudentSuspension = {
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
  };

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
  const nowStr = new Date().toISOString().split('T')[0];
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
 * Execute an undo action, restoring the previous state before an edit, delete, or override.
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
      // If date was changed, delete from new date
      if (curRec.date !== prevRec.date) {
        await remove(ref(db, `attendance/${curRec.date}/${curRec.uid.toUpperCase()}`));
      }
      await set(ref(db, `attendance/${prevRec.date}/${prevRec.uid.toUpperCase()}`), prevRec);
      break;
    }

    case 'DELETE': {
      const deleted = action.revertData.deletedRecord as AttendanceRecord;
      const trashId = action.revertData.trashId as string;
      await set(ref(db, `attendance/${deleted.date}/${deleted.uid.toUpperCase()}`), deleted);
      if (trashId) {
        await remove(ref(db, `attendance_trash/${trashId}`));
      }
      break;
    }

    case 'OVERRIDE': {
      const prevRec = action.revertData.previousRecord as AttendanceRecord;
      await set(ref(db, `attendance/${prevRec.date}/${prevRec.uid.toUpperCase()}`), prevRec);
      break;
    }

    case 'BULK_DELETE': {
      const deletedRecords = action.revertData.deletedRecords as AttendanceRecord[];
      for (const rec of deletedRecords) {
        const cleanUid = (rec.rfidUID || rec.uid).toUpperCase();
        await set(ref(db, `attendance/${rec.date}/${cleanUid}`), rec);
        await remove(ref(db, `attendance_trash/${rec.date}_${cleanUid}`));
      }
      break;
    }

    case 'BULK_EDIT': {
      const prevStates = action.revertData.previousStates as Array<{ date: string; uid: string; prevStatus: AttendanceStatus }>;
      for (const p of prevStates) {
        const cleanUid = p.uid.toUpperCase();
        const targetRef = ref(db, `attendance/${p.date}/${cleanUid}`);
        const snap = await get(targetRef);
        if (snap.exists()) {
          const cur = snap.val() as AttendanceRecord;
          await set(targetRef, { ...cur, status: p.prevStatus });
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


