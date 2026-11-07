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
  UserRole
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
};

export const KNOWN_STUDENTS_BY_EMAIL: Record<string, typeof KNOWN_STUDENT_AUTH_ACCOUNTS[string]> = {
  'zaheer@gmail.com': KNOWN_STUDENT_AUTH_ACCOUNTS['K0umaWs1dbMWbOsCuWzC5pH7BGe2'],
  'shakir@gmail.com': KNOWN_STUDENT_AUTH_ACCOUNTS['rUyNTxxi8tYnv3314Jc9poaiKHA3'],
};

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
        if (val) {
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

  // Check for duplicate on the same day
  try {
    const existingSnap = await get(attendanceDayRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.val() as AttendanceRecord;
      return {
        success: false,
        message: `Duplicate Tap: ${student ? student.name : uid} was already marked Present at ${existing.time}. Duplicate entry prevented.`,
        record: existing,
      };
    }
  } catch (e) {
    console.warn('Duplicate check query warning', e);
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

  // Create valid attendance record
  const record: AttendanceRecord = {
    uid,
    studentName: student.name,
    studentId: student.studentId,
    department: student.department,
    date: dateStr,
    time: timeStr,
    timestamp: now.getTime(),
    status: 'Present',
    device: options?.device || 'ESP32-RFID-01',
  };

  await set(attendanceDayRef, record);

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

/**
 * Subscribe to attendance records for a specific student's RFID UID
 */
export function subscribeToStudentAttendance(
  rfidUID: string,
  onUpdate: (records: AttendanceRecord[]) => void
) {
  try {
    const db = getFirebaseDatabase();
    const attendanceRef = ref(db, 'attendance');
    const upperRfid = rfidUID.trim().toUpperCase();

    const unsubscribe = onValue(
      attendanceRef,
      (snapshot: DataSnapshot) => {
        const val = snapshot.val();
        const studentRecords: AttendanceRecord[] = [];

        if (val) {
          // Structure: attendance/YYYY-MM-DD/RFID_UID/
          Object.keys(val).forEach((dateKey) => {
            const dayRecords = val[dateKey];
            if (dayRecords && dayRecords[upperRfid]) {
              studentRecords.push(dayRecords[upperRfid]);
            }
          });
        }

        // Sort descending by timestamp
        studentRecords.sort((a, b) => b.timestamp - a.timestamp);
        onUpdate(studentRecords);
      },
      (error) => {
        console.warn('Realtime Database student attendance subscription notice:', error);
      }
    );

    return () => off(attendanceRef, 'value', unsubscribe);
  } catch (e) {
    console.warn('Failed subscribing to student attendance:', e);
    return () => {};
  }
}

/**
 * Subscribe to today's attendance record for a specific student's RFID UID
 */
export function subscribeToStudentTodayAttendance(
  dateStr: string,
  rfidUID: string,
  onUpdate: (record: AttendanceRecord | null) => void
) {
  try {
    const db = getFirebaseDatabase();
    const upperRfid = rfidUID.trim().toUpperCase();
    const todayRecordRef = ref(db, `attendance/${dateStr}/${upperRfid}`);

    const unsubscribe = onValue(
      todayRecordRef,
      (snapshot: DataSnapshot) => {
        if (snapshot.exists()) {
          onUpdate(snapshot.val() as AttendanceRecord);
        } else {
          onUpdate(null);
        }
      },
      (error) => {
        console.warn('Realtime Database student today attendance listener notice:', error);
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

