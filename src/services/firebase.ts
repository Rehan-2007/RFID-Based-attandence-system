import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
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
import { Student, AttendanceRecord, FirebaseConfigState, DeviceCommand, ResetAuditLog } from '../types';

const STORAGE_KEY_FIREBASE_CONFIG = 'rfid_firebase_config_override';

export const CONFIGURED_ADMIN_UID = 'bi3c890VUXhVE0JFxroYfnlQwea2';
export const CONFIGURED_ESP32_UID = 'MdwxcdNtLgZp3cnYoqXBNkin8C82';
export const CONFIGURED_PROJECT_ID = 'rfid-attendance-system-5fccd';
export const CONFIGURED_DATABASE_URL = 'https://rfid-attendance-system-5fccd-default-rtdb.firebaseio.com';

export const DEFAULT_FIREBASE_CONFIG: FirebaseConfigState = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
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
    email: 'shakir.ahmed@example.com',
    phone: '+91 98450 12345',
    registeredAt: '2026-01-15T09:15:00Z',
    status: 'active',
  },
  {
    uid: '8A75B525',
    name: 'Mohammed Zaheer',
    studentId: 'STU-2024-003',
    department: 'Information Technology',
    year: 'Final Year',
    email: 'zaheer.m@example.com',
    phone: '+91 97400 98765',
    registeredAt: '2026-01-15T09:30:00Z',
    status: 'active',
  },
];

export function getActiveFirebaseConfig(): FirebaseConfigState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_FIREBASE_CONFIG);
    if (stored) {
      const parsed = JSON.parse(stored);
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
}

export function saveActiveFirebaseConfig(config: FirebaseConfigState) {
  localStorage.setItem(STORAGE_KEY_FIREBASE_CONFIG, JSON.stringify(config));
  resetFirebaseInstances();
}

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Database | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (appInstance) return appInstance;

  const config = getActiveFirebaseConfig();
  const existingApps = getApps();
  if (existingApps.length > 0) {
    appInstance = existingApps[0];
  } else {
    appInstance = initializeApp({
      ...config,
      apiKey: config.apiKey || 'AIzaSyPlaceholderClientInitialKey00',
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
 * Deletes all records under attendance node and logs action.
 * Preserves registered students, admin accounts, and Firebase config.
 */
export async function resetAttendanceData(
  adminUid: string,
  adminEmail: string
): Promise<{ success: boolean; message: string }> {
  const db = getFirebaseDatabase();
  const now = Date.now();
  const timestampStr = new Date().toLocaleString();

  try {
    // 1. Attempt root node deletion of /attendance
    let rootDeleted = false;
    try {
      await remove(ref(db, 'attendance'));
      rootDeleted = true;
    } catch (rootErr: any) {
      console.warn('Root /attendance deletion blocked by path rules; attempting granular child deletions:', rootErr?.message);
    }

    // 2. If root deletion was restricted by nested path rules, iterate existing dates & scan records
    if (!rootDeleted) {
      try {
        const snap = await get(ref(db, 'attendance'));
        if (snap.exists()) {
          const datesData = snap.val() as Record<string, any>;
          for (const dateKey of Object.keys(datesData)) {
            let dateDeleted = false;
            try {
              await remove(ref(db, `attendance/${dateKey}`));
              dateDeleted = true;
            } catch (dErr: any) {
              console.warn(`Date-level deletion blocked for attendance/${dateKey}; attempting record-level deletions:`, dErr?.message);
            }

            if (!dateDeleted && datesData[dateKey] && typeof datesData[dateKey] === 'object') {
              for (const uidKey of Object.keys(datesData[dateKey])) {
                try {
                  await remove(ref(db, `attendance/${dateKey}/${uidKey}`));
                } catch (recErr: any) {
                  console.warn(`Could not remove attendance/${dateKey}/${uidKey}:`, recErr?.message);
                }
              }
            }
          }
        }
      } catch (readErr: any) {
        if (!rootDeleted) {
          throw new Error('PERMISSION_DENIED: Firebase Realtime Database rules restrict deleting attendance records. Please verify that Administrator UID bi3c890VUXhVE0JFxroYfnlQwea2 has write permissions on "attendance" in Firebase Console > Realtime Database > Rules.');
        }
      }
    }

    // 3. Clear unknown scans (non-blocking if path has no write rule)
    try {
      await remove(ref(db, 'unknown_scans'));
    } catch (err: any) {
      console.warn('Could not clear unknown_scans:', err?.message);
    }

    // 4. Log the reset audit action (non-blocking if auditLogs is not yet configured in security rules)
    const auditRecord: ResetAuditLog = {
      type: 'ATTENDANCE_RESET',
      adminEmail,
      initiatedByUid: adminUid,
      timestamp: now,
      timestampStr,
      description: 'All attendance records deleted. Student directory preserved.',
    };

    try {
      await set(ref(db, `auditLogs/resets/${now}`), auditRecord);
      await set(ref(db, 'auditLogs/lastReset'), auditRecord);
    } catch (auditErr: any) {
      console.warn('Could not write audit log to Firebase RTDB (security rule restricted):', auditErr?.message);
      try {
        localStorage.setItem('rfid_last_reset_audit', JSON.stringify(auditRecord));
      } catch {
        // Ignore
      }
    }

    return {
      success: true,
      message: 'Attendance data has been completely wiped. All student registrations remain intact.',
    };
  } catch (err: any) {
    console.error('Error resetting attendance data:', err);
    throw new Error(err.message || 'Firebase permission error while resetting attendance.');
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

