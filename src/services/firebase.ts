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
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  query as rtdbQuery,
  orderByChild,
  equalTo,
  limitToLast,
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
  MigrationProgress,
  MigrationCheckpoint,
  MigrationFailedItem,
  DashboardAggregates,
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
  normalizeToISODate,
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

export const RTDB_SECURITY_RULES_JSON = `{
  "rules": {
    ".read": false,
    ".write": false,

    "students": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".indexOn": ["rfidUID", "authUid", "studentId", "email", "status"],

      "$studentId": {
        ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82' || data.child('authUid').val() === auth.uid || root.child('users').child(auth.uid).child('studentDbId').val() === $studentId || root.child('users').child(auth.uid).child('rfidUID').val() === $studentId || root.child('auth_to_student').child(auth.uid).child('studentDbId').val() === $studentId || root.child('auth_to_student').child(auth.uid).val() === $studentId || (data.child('email').isString() && auth.token.email != null && data.child('email').val().toLowerCase() === auth.token.email.toLowerCase()))",
        ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",

        "attendance": {
          ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82' || data.parent().child('authUid').val() === auth.uid || root.child('users').child(auth.uid).child('studentDbId').val() === $studentId || root.child('users').child(auth.uid).child('rfidUID').val() === $studentId || root.child('auth_to_student').child(auth.uid).child('studentDbId').val() === $studentId || root.child('auth_to_student').child(auth.uid).val() === $studentId || (data.parent().child('email').isString() && auth.token.email != null && data.parent().child('email').val().toLowerCase() === auth.token.email.toLowerCase()))",
          ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",

          "$date": {
            ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82' || data.parent().parent().child('authUid').val() === auth.uid || root.child('users').child(auth.uid).child('studentDbId').val() === $studentId || root.child('users').child(auth.uid).child('rfidUID').val() === $studentId || root.child('auth_to_student').child(auth.uid).child('studentDbId').val() === $studentId || root.child('auth_to_student').child(auth.uid).val() === $studentId || (data.parent().parent().child('email').isString() && auth.token.email != null && data.parent().parent().child('email').val().toLowerCase() === auth.token.email.toLowerCase()))",
            ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || (auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82' && data.parent().parent().exists() && data.parent().parent().child('status').val() === 'active' && data.parent().parent().child('isSuspended').val() !== true && (!data.exists() || data.child('isOverridden').val() !== true)))",
            ".validate": "newData.hasChildren(['date', 'status', 'time', 'timestamp'])"
          }
        }
      }
    },

    "working_days": {
      ".read": "auth != null",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')"
    },

    "settings": {
      ".read": "auth != null",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "users": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      "$authUid": {
        ".read": "auth != null && (auth.uid === $authUid || auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        ".validate": "newData.hasChildren(['role']) && (newData.child('role').val() === 'admin' || newData.child('role').val() === 'student')"
      }
    },

    "auth_to_student": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      "$authUid": {
        ".read": "auth != null && (auth.uid === $authUid || auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
      }
    },

    "rfid_to_student": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "rfid_to_uid": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "attendance_trash": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".indexOn": ["deletedAt", "date"]
    },

    "audit_logs": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".indexOn": ["timestamp", "action"]
    },

    "auditLogs": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "suspensions": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      "$studentId": {
        ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || root.child('students').child($studentId).child('authUid').val() === auth.uid || root.child('users').child(auth.uid).child('studentDbId').val() === $studentId || root.child('users').child(auth.uid).child('rfidUID').val() === $studentId || root.child('auth_to_student').child(auth.uid).child('studentDbId').val() === $studentId || root.child('auth_to_student').child(auth.uid).val() === $studentId || (root.child('students').child($studentId).child('email').isString() && auth.token.email != null && root.child('students').child($studentId).child('email').val().toLowerCase() === auth.token.email.toLowerCase()))"
      }
    },

    "backups": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".indexOn": ["createdAt"]
    },

    "database_backups": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "migration_recovery": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "migration_status": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "deviceCommands": {
      "esp32": {
        ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
        ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')"
      }
    },

    "unknown_scans": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      ".indexOn": ["timestamp"]
    },

    "devices": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')"
    },

    "attendance": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "students_attendance": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    }
  }
}`;

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

// ============================================================================
// NETWORK OPTIMIZATION, DEDUPLICATION, RETRY BACKOFF & CONCURRENCY HELPERS
// ============================================================================

const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Deduplicates identical concurrent async requests so reconnects/re-renders never
 * stampede Firebase Realtime Database with redundant downloads.
 */
export function dedupeInFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const promise = Promise.resolve()
    .then(fn)
    .finally(() => {
      inFlightRequests.delete(key);
    });
  inFlightRequests.set(key, promise);
  return promise;
}

export function isTransientFirebaseError(err: any): boolean {
  const code = String(err?.code || '').toLowerCase();
  const msg = String(err?.message || '').toLowerCase();
  if (
    code.includes('permission') ||
    code === 'unauthenticated' ||
    code === 'unauthorized_uid' ||
    /permission_denied|permission denied|unauthorized_uid|invalid|validation/i.test(msg)
  ) {
    return false;
  }
  return (
    code.includes('network') ||
    code.includes('unavailable') ||
    code.includes('timeout') ||
    code === 'disconnected' ||
    /network|timed out|timeout|unavailable|offline|disconnected|econnreset|too_many/i.test(msg)
  );
}

/**
 * Exponential backoff retry wrapper strictly for transient network/timeout errors.
 * Never retries PERMISSION_DENIED or validation errors.
 */
export async function withRetryBackoff<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; baseDelayMs?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 180;
  let lastErr: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (attempt >= maxRetries || !isTransientFirebaseError(err)) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 80);
      const delayMs = baseDelayMs * Math.pow(2, attempt) + jitter;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

/**
 * Bounded concurrency worker pool for batched RTDB reads/writes without saturating sockets.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items || items.length === 0) return [];
  const results: R[] = new Array(items.length);
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const runners = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Splits a multi-location update object into safe chunks scoped cleanly inside a parent RTDB node.
 */
export async function updateInBatches(
  db: Database,
  basePath: string,
  updatesMap: Record<string, any>,
  chunkSize: number = 100
): Promise<number> {
  const entries = Object.entries(updatesMap);
  if (entries.length === 0) return 0;

  let written = 0;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunkObj: Record<string, any> = {};
    const slice = entries.slice(i, i + chunkSize);
    for (const [k, v] of slice) {
      chunkObj[k] = v === null ? null : stripUndefinedDeep(v);
    }
    const targetRef = ref(db, basePath);
    await withRetryBackoff(() => update(targetRef, chunkObj));
    written += slice.length;
  }
  return written;
}

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

  // 1. Fastest path: check live in-memory lookup / cache before any network round-trip
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

  // 2. Direct path & /rfid_to_student index lookup in parallel
  try {
    const [directRawSnap, directUpperSnap, idxSnap] = await Promise.all([
      withTimeout(get(ref(db, `students/${raw}`)), 2500, null),
      upper !== raw ? withTimeout(get(ref(db, `students/${upper}`)), 2500, null) : Promise.resolve(null),
      withTimeout(get(ref(db, `rfid_to_student/${upper}`)), 2500, null),
    ]);

    const hit =
      (directRawSnap && directRawSnap.exists && directRawSnap.exists() ? { id: raw, val: directRawSnap.val() } : null) ||
      (directUpperSnap && directUpperSnap.exists && directUpperSnap.exists() ? { id: upper, val: directUpperSnap.val() } : null);

    if (hit) {
      const st = hit.val as Student;
      const rfidUID = (st.rfidUID || st.uid || hit.id).trim().toUpperCase();
      return {
        studentDbId: hit.id,
        student: { ...st, studentDbId: hit.id, rfidUID, uid: rfidUID },
        rfidUID,
      };
    }

    if (idxSnap && idxSnap.exists && idxSnap.exists()) {
      const mapping = idxSnap.val();
      const targetDbId = typeof mapping === 'string' ? mapping : mapping?.studentDbId;
      if (targetDbId) {
        const stSnap = await withTimeout(get(ref(db, `students/${targetDbId}`)), 2500, null);
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

  // 3. Indexed RTDB query fallback on rfidUID / studentId (avoids downloading full /students tree)
  try {
    const qRfid = rtdbQuery(ref(db, 'students'), orderByChild('rfidUID'), equalTo(upper));
    const rfidSnap = await withTimeout(get(qRfid), 2500, null);
    if (rfidSnap && rfidSnap.exists && rfidSnap.exists()) {
      const entries = Object.entries(rfidSnap.val() as Record<string, Student>);
      if (entries.length > 0) {
        const [matchedKey, st] = entries[0];
        const rfidUID = (st.rfidUID || st.uid || upper).trim().toUpperCase();
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
export interface StudentSubscriptionDelta {
  type: 'initial' | 'added' | 'changed' | 'removed';
  studentDbId?: string;
  student?: Student;
}

function normalizeStudentNode(dbKey: string, rawSt: any): Student {
  const rfidUID = (rawSt.rfidUID || rawSt.uid || dbKey).toString().trim().toUpperCase();
  return {
    ...rawSt,
    studentDbId: dbKey,
    rfidUID,
    uid: rfidUID,
  };
}

/**
 * High-speed incremental student subscription:
 * 1. Hydrates once cleanly via get() (single initial render instead of N renders).
 * 2. Uses Firebase child listeners (onChildAdded, onChildChanged, onChildRemoved) so
 *    each RFID scan only normalizes & updates the ONE affected student record!
 * 3. Preserves object identity for all unaffected students to avoid downstream re-renders.
 */
export function subscribeToStudents(
  onSuccess: (students: Record<string, Student>, delta?: StudentSubscriptionDelta) => void,
  onError?: (err: Error) => void
) {
  let isDisposed = false;
  let hydrated = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const localMap: Record<string, Student> = {};
  const initialRawSignature = new Map<string, string>();
  let unsubAdded: (() => void) | null = null;
  let unsubChanged: (() => void) | null = null;
  let unsubRemoved: (() => void) | null = null;

  const syncCachedMap = (key: string, val?: Student) => {
    if (val) cachedStudentsMap[key] = val;
    else delete cachedStudentsMap[key];
  };

  try {
    const db = getFirebaseDatabase();
    const studentsRef = ref(db, 'students');

    const scheduleInitialEmit = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        if (isDisposed || hydrated) return;
        hydrated = true;
        onSuccess({ ...localMap }, { type: 'initial' });
      }, 24);
    };

    // Initial fast hydration via get()
    get(studentsRef)
      .then((snap) => {
        if (isDisposed) return;
        if (snap.exists()) {
          const val = snap.val();
          if (val && typeof val === 'object') {
            Object.entries(val).forEach(([dbKey, rawSt]: [string, any]) => {
              if (!rawSt || typeof rawSt !== 'object') return;
              const norm = normalizeStudentNode(dbKey, rawSt);
              localMap[dbKey] = norm;
              syncCachedMap(dbKey, norm);
              const attCount = norm.attendance ? Object.keys(norm.attendance).length : 0;
              initialRawSignature.set(dbKey, `${norm.rfidUID}|${norm.status}|${attCount}|${norm.authUid || ''}`);
            });
          }
        }
        hydrated = true;
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        Object.keys(cachedStudentsMap).forEach((k) => {
          if (!localMap[k]) delete cachedStudentsMap[k];
        });
        onSuccess({ ...localMap }, { type: 'initial' });
      })
      .catch((error) => {
        if (isDisposed) return;
        console.warn('Realtime Database students initial read error:', error);
        onError?.(error);
      });

    // Incremental child listeners: only affected student updates after initial hydration
    unsubAdded = onChildAdded(
      studentsRef,
      (snap: DataSnapshot) => {
        if (isDisposed) return;
        const dbKey = snap.key;
        const rawSt = snap.val();
        if (!dbKey || !rawSt || typeof rawSt !== 'object') return;
        const norm = normalizeStudentNode(dbKey, rawSt);
        const attCount = norm.attendance ? Object.keys(norm.attendance).length : 0;
        const sig = `${norm.rfidUID}|${norm.status}|${attCount}|${norm.authUid || ''}`;

        if (hydrated && localMap[dbKey] && initialRawSignature.get(dbKey) === sig) {
          // Skip redundant replay during initial listener attachment
          initialRawSignature.delete(dbKey);
          return;
        }
        initialRawSignature.delete(dbKey);
        localMap[dbKey] = norm;
        syncCachedMap(dbKey, norm);

        if (hydrated) {
          onSuccess({ ...localMap }, { type: 'added', studentDbId: dbKey, student: norm });
        } else {
          scheduleInitialEmit();
        }
      },
      (error) => {
        if (!isDisposed) {
          console.warn('Realtime Database students child_added error:', error);
          onError?.(error);
        }
      }
    );

    unsubChanged = onChildChanged(
      studentsRef,
      (snap: DataSnapshot) => {
        if (isDisposed) return;
        const dbKey = snap.key;
        const rawSt = snap.val();
        if (!dbKey || !rawSt || typeof rawSt !== 'object') return;
        const norm = normalizeStudentNode(dbKey, rawSt);
        initialRawSignature.delete(dbKey);
        localMap[dbKey] = norm;
        syncCachedMap(dbKey, norm);
        hydrated = true;
        onSuccess({ ...localMap }, { type: 'changed', studentDbId: dbKey, student: norm });
      },
      (error) => {
        if (!isDisposed) {
          console.warn('Realtime Database students child_changed error:', error);
          onError?.(error);
        }
      }
    );

    unsubRemoved = onChildRemoved(
      studentsRef,
      (snap: DataSnapshot) => {
        if (isDisposed) return;
        const dbKey = snap.key;
        if (!dbKey) return;
        initialRawSignature.delete(dbKey);
        delete localMap[dbKey];
        syncCachedMap(dbKey, undefined);
        hydrated = true;
        onSuccess({ ...localMap }, { type: 'removed', studentDbId: dbKey });
      },
      (error) => {
        if (!isDisposed) {
          console.warn('Realtime Database students child_removed error:', error);
          onError?.(error);
        }
      }
    );

    return () => {
      isDisposed = true;
      if (flushTimer) clearTimeout(flushTimer);
      try { if (unsubAdded) off(studentsRef, 'child_added', unsubAdded); } catch {}
      try { if (unsubChanged) off(studentsRef, 'child_changed', unsubChanged); } catch {}
      try { if (unsubRemoved) off(studentsRef, 'child_removed', unsubRemoved); } catch {}
    };
  } catch (error: any) {
    console.warn('Failed to subscribe to students:', error?.message || error);
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

  // Enforce duplicate RFID prevention via indexed lookup & in-memory map (zero full-tree downloads!)
  const idxSnap = await withTimeout(get(ref(db, `rfid_to_student/${newRfid}`)), 2500, null);
  if (idxSnap && idxSnap.exists && idxSnap.exists()) {
    const idxVal = idxSnap.val();
    const assignedDbId = typeof idxVal === 'string' ? idxVal : idxVal?.studentDbId;
    const isActiveIdx = typeof idxVal === 'string' ? true : idxVal?.active !== false;
    if (assignedDbId && assignedDbId !== studentDbId && isActiveIdx) {
      throw new Error(`RFID card ${newRfid} is already assigned to another student (${assignedDbId}). Unassign it before reassigning.`);
    }
  }

  for (const [k, other] of Object.entries(cachedStudentsMap)) {
    if (!other || k === studentDbId) continue;
    const otherRfid = (other.rfidUID || other.uid || k).trim().toUpperCase();
    if (otherRfid === newRfid && other.status !== 'inactive') {
      throw new Error(`RFID card ${newRfid} is already assigned to active student ${other.name} (${other.studentId}).`);
    }
  }

  try {
    const qRfid = rtdbQuery(ref(db, 'students'), orderByChild('rfidUID'), equalTo(newRfid));
    const qSnap = await withTimeout(get(qRfid), 2500, null);
    if (qSnap && qSnap.exists && qSnap.exists()) {
      for (const [k, other] of Object.entries(qSnap.val() as Record<string, Student>)) {
        if (other && k !== studentDbId && other.status !== 'inactive') {
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

  // Enforce duplicate prevention via /rfid_to_student + cached map + indexed RTDB queries (zero full /students scan)
  const [idxSnap, qRfidSnap, qRollSnap] = await Promise.all([
    withTimeout(get(ref(db, `rfid_to_student/${trimmedRfid}`)), 2500, null),
    withTimeout(get(rtdbQuery(ref(db, 'students'), orderByChild('rfidUID'), equalTo(trimmedRfid))), 2500, null).catch(() => null),
    withTimeout(get(rtdbQuery(ref(db, 'students'), orderByChild('studentId'), equalTo(trimmedRoll))), 2500, null).catch(() => null),
  ]);

  if (idxSnap && idxSnap.exists && idxSnap.exists()) {
    const val = idxSnap.val();
    const isActiveIdx = typeof val === 'string' ? true : val?.active !== false;
    if (isActiveIdx) {
      throw new Error(`RFID Card UID ${trimmedRfid} is already registered to an existing student.`);
    }
  }
  if (qRfidSnap && qRfidSnap.exists && qRfidSnap.exists()) {
    const first = Object.values(qRfidSnap.val() as Record<string, Student>)[0];
    if (first) {
      throw new Error(`A student (${first.name}) is already registered with RFID Card UID: ${trimmedRfid}`);
    }
  }
  if (qRollSnap && qRollSnap.exists && qRollSnap.exists()) {
    const first = Object.values(qRollSnap.val() as Record<string, Student>)[0];
    if (first) {
      throw new Error(`A student (${first.name}) is already registered with Roll Number: ${trimmedRoll}`);
    }
  }
  for (const [k, st] of Object.entries(cachedStudentsMap)) {
    if (!st) continue;
    const stRfid = (st.rfidUID || st.uid || k).trim().toUpperCase();
    if (stRfid === trimmedRfid) {
      throw new Error(`A student (${st.name}) is already registered with RFID Card UID: ${trimmedRfid}`);
    }
    if (st.studentId && st.studentId.trim().toUpperCase() === trimmedRoll.toUpperCase()) {
      throw new Error(`A student (${st.name}) is already registered with Roll Number: ${trimmedRoll}`);
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
  return dedupeInFlight('reconcileAllStudentMappings', async () => {
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

      // Parallel reads instead of 5 sequential round-trips
      const [
        studentsSnap,
        rtdbUsersSnap,
        a2sSnap,
        r2uSnap,
        r2sSnap,
        fsSnap,
      ] = await Promise.all([
        studentsMapOverride ? Promise.resolve(null) : withTimeout(get(ref(db, 'students')), 4000, null),
        withTimeout(get(ref(db, 'users')), 3000, null).catch(() => null),
        withTimeout(get(ref(db, 'auth_to_student')), 3000, null).catch(() => null),
        withTimeout(get(ref(db, 'rfid_to_uid')), 2500, null).catch(() => null),
        withTimeout(get(ref(db, 'rfid_to_student')), 2500, null).catch(() => null),
        withTimeout(getDocs(collection(fs, 'users')), 3000, null).catch(() => null),
      ]);

      const studentsMap =
        studentsMapOverride ||
        ((studentsSnap && studentsSnap.exists && studentsSnap.exists() ? studentsSnap.val() : {}) as Record<
          string,
          Student
        >);

      const rtdbUsersMap: Record<string, Partial<UserProfile>> =
        rtdbUsersSnap && rtdbUsersSnap.exists && rtdbUsersSnap.exists() ? rtdbUsersSnap.val() || {} : {};
      const authToStudentMap: Record<string, any> =
        a2sSnap && a2sSnap.exists && a2sSnap.exists() ? a2sSnap.val() || {} : {};
      const rfidToUidRaw: Record<string, any> =
        r2uSnap && r2uSnap.exists && r2uSnap.exists() ? r2uSnap.val() || {} : {};
      const rfidToStudentMap: Record<string, any> =
        r2sSnap && r2sSnap.exists && r2sSnap.exists() ? r2sSnap.val() || {} : {};

      const userRecordsByAuthUid: Record<string, Partial<UserProfile>> = {};
      const rfidToUidMap: Record<string, string> = {};

      Object.entries(rtdbUsersMap).forEach(([uid, u]) => {
        if (u && uid !== CONFIGURED_ADMIN_UID && u.role !== 'admin') {
          userRecordsByAuthUid[uid] = { ...u, uid };
        }
      });

      Object.entries(authToStudentMap).forEach(([uid, m]) => {
        if (!m || uid === CONFIGURED_ADMIN_UID) return;
        userRecordsByAuthUid[uid] = {
          ...(userRecordsByAuthUid[uid] || {}),
          uid,
          studentDbId: userRecordsByAuthUid[uid]?.studentDbId || m.studentDbId,
          rfidUID: userRecordsByAuthUid[uid]?.rfidUID || m.rfidUID,
          rollNumber: userRecordsByAuthUid[uid]?.rollNumber || m.rollNumber,
          email: userRecordsByAuthUid[uid]?.email || m.email,
          role: 'student',
        };
      });

      Object.entries(rfidToUidRaw).forEach(([rfid, val]) => {
        const authUid = typeof val === 'string' ? val : val?.authUid;
        if (authUid && typeof authUid === 'string') {
          rfidToUidMap[rfid.trim().toUpperCase()] = authUid.trim();
        }
      });

      const fsUsersMap: Record<string, Partial<UserProfile>> = {};
      if (fsSnap && fsSnap.docs) {
        fsSnap.docs.forEach((d) => {
          const data = d.data() as Partial<UserProfile>;
          if (data && d.id !== CONFIGURED_ADMIN_UID && data.role !== 'admin') {
            fsUsersMap[d.id] = data;
            userRecordsByAuthUid[d.id] = {
              ...(userRecordsByAuthUid[d.id] || {}),
              ...data,
              uid: d.id,
            };
          }
        });
      }

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

      // Stage ONLY changed paths (diff-based multi-location batches; 0 writes when already synced)
      const studentNodePatches: Record<string, any> = {};
      const rfidToStudentPatches: Record<string, any> = {};
      const usersPatches: Record<string, any> = {};
      const authToStudentPatches: Record<string, any> = {};
      const rfidToUidPatches: Record<string, any> = {};
      const firestoreUpdates: Array<{ uid: string; payload: UserProfile }> = [];

      const nowTs = Date.now();

      for (const [dbKey, st] of Object.entries(studentsMap || {})) {
        if (!st || typeof st !== 'object') continue;
        const rfidUID = (st.rfidUID || st.uid || dbKey).trim().toUpperCase();
        const candidates = findMatchingAuthCandidates(st, dbKey, rfidUID);

        if (candidates.length > 1) {
          ambiguousStudents.push(dbKey);
        }

        const resolvedAuthUid = candidates.length === 1 ? candidates[0] : (st.authUid || '').trim();

        if (!st.studentDbId) studentNodePatches[`${dbKey}/studentDbId`] = dbKey;
        if (!st.rfidUID && rfidUID) studentNodePatches[`${dbKey}/rfidUID`] = rfidUID;
        if (!st.uid && rfidUID) studentNodePatches[`${dbKey}/uid`] = rfidUID;
        if (resolvedAuthUid && !st.authUid) {
          studentNodePatches[`${dbKey}/authUid`] = resolvedAuthUid;
        }

        const expectedActive = st.status !== 'inactive';
        const existingR2S = rfidToStudentMap[rfidUID];
        const r2sMatches =
          existingR2S &&
          typeof existingR2S === 'object' &&
          existingR2S.studentDbId === dbKey &&
          (existingR2S.authUid || '') === (resolvedAuthUid || '') &&
          (existingR2S.rollNumber || '') === (st.studentId || '') &&
          existingR2S.active === expectedActive;

        if (!r2sMatches) {
          rfidToStudentPatches[rfidUID] = stripUndefinedDeep({
            rfidUID,
            studentDbId: dbKey,
            authUid: resolvedAuthUid || '',
            rollNumber: st.studentId || '',
            active: expectedActive,
            updatedAt: nowTs,
          });
        }

        if (resolvedAuthUid) {
          const existingU = userRecordsByAuthUid[resolvedAuthUid] || {};
          const resolvedEmail = (st.email || existingU.email || '').trim().toLowerCase();
          const profilePayload: UserProfile = stripUndefinedDeep({
            uid: resolvedAuthUid,
            studentDbId: dbKey,
            name: st.name || existingU.name || 'Student',
            email: resolvedEmail,
            rollNumber: st.studentId || existingU.rollNumber || '',
            department: st.department || existingU.department || '',
            year: st.year || existingU.year || '',
            semester: st.semester || existingU.semester || 'Semester 1',
            role: existingU.role === 'admin' ? 'admin' : 'student',
            rfidUID,
            phone: st.phone || existingU.phone || '',
            createdAt: existingU.createdAt || nowTs,
          });

          const existingRtdbU = rtdbUsersMap[resolvedAuthUid];
          const rtdbUserMatches =
            existingRtdbU &&
            existingRtdbU.studentDbId === profilePayload.studentDbId &&
            existingRtdbU.rfidUID === profilePayload.rfidUID &&
            existingRtdbU.role === profilePayload.role &&
            existingRtdbU.name === profilePayload.name &&
            existingRtdbU.email === profilePayload.email &&
            existingRtdbU.rollNumber === profilePayload.rollNumber;

          if (!rtdbUserMatches) {
            usersPatches[resolvedAuthUid] = profilePayload;
          }

          const existingA2S = authToStudentMap[resolvedAuthUid];
          const a2sMatches =
            existingA2S &&
            typeof existingA2S === 'object' &&
            existingA2S.studentDbId === dbKey &&
            existingA2S.rfidUID === rfidUID &&
            (existingA2S.rollNumber || '') === (st.studentId || '') &&
            (existingA2S.email || '') === resolvedEmail;

          if (!a2sMatches) {
            authToStudentPatches[resolvedAuthUid] = stripUndefinedDeep({
              authUid: resolvedAuthUid,
              studentDbId: dbKey,
              rfidUID,
              rollNumber: st.studentId || '',
              email: resolvedEmail,
              updatedAt: nowTs,
            });
          }

          if (rfidToUidMap[rfidUID] !== resolvedAuthUid) {
            rfidToUidPatches[`${rfidUID}/authUid`] = resolvedAuthUid;
          }

          const existingFsU = fsUsersMap[resolvedAuthUid];
          const fsMatches =
            existingFsU &&
            existingFsU.studentDbId === profilePayload.studentDbId &&
            existingFsU.rfidUID === profilePayload.rfidUID &&
            existingFsU.role === profilePayload.role &&
            existingFsU.email === profilePayload.email;

          if (!fsMatches) {
            firestoreUpdates.push({ uid: resolvedAuthUid, payload: profilePayload });
          }

          linkedCount++;
        }
      }

      // Execute ONLY non-empty scoped multi-location batches in parallel
      await Promise.all([
        updateInBatches(db, 'students', studentNodePatches, 100).catch(() => 0),
        updateInBatches(db, 'rfid_to_student', rfidToStudentPatches, 100).catch(() => 0),
        updateInBatches(db, 'users', usersPatches, 100).catch(() => 0),
        updateInBatches(db, 'auth_to_student', authToStudentPatches, 100).catch(() => 0),
        updateInBatches(db, 'rfid_to_uid', rfidToUidPatches, 100).catch(() => 0),
        firestoreUpdates.length > 0
          ? runWithConcurrency(firestoreUpdates, 6, async ({ uid, payload }) => {
              await withTimeout(setDoc(doc(fs, 'users', uid), payload, { merge: true }), 2000, null).catch(() => {});
            })
          : Promise.resolve([]),
      ]);

      return { linkedCount, ambiguousStudents };
    } catch (err) {
      console.warn('Reconcile student mappings notice:', err);
      return { linkedCount: 0, ambiguousStudents };
    }
  });
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

  // 2d. Fallback: check Firestore students collection where authUid == authUid
  if (!authMapping && !rtdbProfile && !firestoreProfile) {
    try {
      const stuQuery = query(collection(fs, 'students'), where('authUid', '==', authUid));
      const stuSnap = await withTimeoutReject(getDocs(stuQuery), 3500, 'Timed out querying Firestore students');
      if (!stuSnap.empty) {
        const firstDoc = stuSnap.docs[0];
        const data = firstDoc.data() || {};
        firestoreProfile = {
          uid: authUid,
          studentDbId: (data.studentDbId || firstDoc.id || '').toString().trim(),
          email: data.email || normalizedEmail || '',
          role: 'student',
          name: data.name || '',
          rollNumber: data.studentId || data.rollNumber || '',
          rfidUID: (data.rfidUID || data.uid || '').toString().trim().toUpperCase(),
          department: data.department || '',
          year: data.year || '',
          semester: data.semester || 'Semester 1',
          phone: data.phone || '',
          createdAt: Date.now(),
        };
      }
    } catch {
      // Non-fatal fallback
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
  const mappedDbId = typeof authMapping === 'string' ? authMapping : authMapping?.studentDbId;
  const mappedRfid = typeof authMapping === 'string' ? '' : authMapping?.rfidUID;

  let studentDbId = (
    mappedDbId ||
    rtdbProfile?.studentDbId ||
    firestoreProfile?.studentDbId ||
    ''
  ).toString().trim();

  let rfidUID = (
    mappedRfid ||
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
 * Subscribe in real-time to bounded recent audit logs (indexed on timestamp)
 */
export function subscribeToAuditLogs(
  onUpdate: (logs: AuditActivityLog[]) => void,
  limitCount: number = 200
): () => void {
  try {
    const db = getFirebaseDatabase();
    const logsQuery = rtdbQuery(ref(db, 'audit_logs'), orderByChild('timestamp'), limitToLast(limitCount));
    const unsubscribe = onValue(
      logsQuery,
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
    return () => off(logsQuery, 'value', unsubscribe);
  } catch {
    return () => {};
  }
}

/**
 * Subscribe in real-time to bounded recent deleted/trash attendance records (indexed on deletedAt)
 */
export function subscribeToTrashRecords(
  onUpdate: (records: TrashAttendanceRecord[]) => void,
  limitCount: number = 200
): () => void {
  try {
    const db = getFirebaseDatabase();
    const trashQuery = rtdbQuery(ref(db, 'attendance_trash'), orderByChild('deletedAt'), limitToLast(limitCount));
    const unsubscribe = onValue(
      trashQuery,
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
    return () => off(trashQuery, 'value', unsubscribe);
  } catch {
    return () => {};
  }
}

/**
 * Subscribe in real-time to bounded recent unknown RFID scans (indexed on timestamp)
 */
export function subscribeToUnknownScans(
  onUpdate: (scans: AttendanceRecord[]) => void,
  limitCount: number = 100
): () => void {
  try {
    const db = getFirebaseDatabase();
    const unknownQuery = rtdbQuery(ref(db, 'unknown_scans'), orderByChild('timestamp'), limitToLast(limitCount));
    const unsubscribe = onValue(
      unknownQuery,
      (snap) => {
        if (!snap.exists()) {
          onUpdate([]);
          return;
        }
        const val = snap.val() as Record<string, AttendanceRecord>;
        const list = Object.values(val).sort((a, b) => b.timestamp - a.timestamp);
        onUpdate(list);
      },
      () => {}
    );
    return () => off(unknownQuery, 'value', unsubscribe);
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
  const trashPatches: Record<string, any> = {};
  const studentNullPatches: Record<string, null> = {};
  const nowTs = Date.now();

  await runWithConcurrency(records, 12, async (r) => {
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
          deletedAt: nowTs,
          deletedBy: adminUser.email || 'admin',
          deleteReason: reason || 'Bulk deletion by administrator',
          originalPath: `students/${studentDbId}/attendance/${r.date}`,
          isDeleted: true,
        });

        trashPatches[trashId] = trashEntry;
        studentNullPatches[`${studentDbId}/attendance/${r.date}`] = null;
        deletedRecords.push({ ...existing, studentDbId });
      }
    } catch (err) {
      console.warn(`Failed preparing bulk delete for students/${studentDbId}/attendance/${r.date}:`, err);
    }
  });

  if (Object.keys(trashPatches).length > 0) {
    await updateInBatches(db, 'attendance_trash', trashPatches, 100);
  }
  if (Object.keys(studentNullPatches).length > 0) {
    await updateInBatches(db, 'students', studentNullPatches, 100);
  }

  await logAuditActivity('BULK_DELETE', adminUser, {
    reason,
    affectedCount: deletedRecords.length,
    details: `Bulk deleted ${deletedRecords.length} attendance records`,
    previousValues: deletedRecords.map((d) => ({ date: d.date, uid: d.uid, studentDbId: d.studentDbId, name: d.studentName })),
  });

  return { success: true, count: deletedRecords.length, deletedRecords };
}

export interface DateAttendanceMatch {
  studentDbId: string;
  attendanceKey: string;
  record: AttendanceRecord;
}

/**
 * Pure helper to collect all active attendance records across students for a given target date.
 * Handles canonical YYYY-MM-DD keys as well as alternate date formats normalized in IST.
 */
export function collectAttendanceRecordsForDate(
  studentsMap: Record<string, Student>,
  targetDateInput: string
): DateAttendanceMatch[] {
  const normalizedTarget = normalizeToISODate(targetDateInput);
  if (!normalizedTarget || !studentsMap) return [];

  const matches: DateAttendanceMatch[] = [];
  Object.entries(studentsMap).forEach(([dbKey, st]) => {
    if (!st || !st.attendance) return;
    const studentDbId = (st.studentDbId || dbKey).trim();
    const cardUid = (st.rfidUID || st.uid || dbKey).trim().toUpperCase();

    Object.entries(st.attendance).forEach(([attKey, rawRec]) => {
      if (!rawRec || rawRec.isDeleted) return;
      const keyDate = normalizeToISODate(attKey);
      const recDate = normalizeToISODate(rawRec.date);
      if (keyDate === normalizedTarget || recDate === normalizedTarget) {
        matches.push({
          studentDbId,
          attendanceKey: attKey,
          record: {
            ...rawRec,
            studentDbId,
            uid: (rawRec.rfidUID || rawRec.uid || cardUid).toString().trim().toUpperCase(),
            rfidUID: (rawRec.rfidUID || rawRec.uid || cardUid).toString().trim().toUpperCase(),
            studentName: rawRec.studentName || st.name,
            studentId: rawRec.studentId || st.studentId,
            department: rawRec.department || st.department,
            date: normalizedTarget,
          },
        });
      }
    });
  });

  return matches.sort((a, b) => (b.record.timestamp || 0) - (a.record.timestamp || 0));
}

/**
 * Permanently delete all attendance records for a specific calendar date across all students.
 * Uses scoped multi-location batch updates under /students & /attendance_trash so even 1,000+
 * students delete in milliseconds rather than 1,000 sequential round-trips.
 */
export async function deleteAttendanceByDate(
  dateInput: string,
  adminUser: { email?: string | null; uid?: string },
  reason: string = 'Permanent date-based attendance deletion'
): Promise<{
  success: boolean;
  date: string;
  deletedCount: number;
  deletedRecords: AttendanceRecord[];
}> {
  const verifiedAdmin = await verifyAdministratorAuth();
  if (adminUser.uid && verifiedAdmin.uid !== adminUser.uid && verifiedAdmin.uid !== CONFIGURED_ADMIN_UID) {
    throw new Error('Unauthorized: Authenticated user does not match administrator session.');
  }

  const normalizedDate = normalizeToISODate(dateInput);
  if (!normalizedDate) {
    throw new Error(`Invalid attendance date "${dateInput}". Expected a valid calendar date.`);
  }

  const db = getFirebaseDatabase();
  const studentsSnap = await runRtdbOp('GET', '/students', () => get(ref(db, 'students')));
  const liveStudentsMap = (studentsSnap.exists() ? studentsSnap.val() : {}) as Record<string, Student>;

  const targetsToRemove: Array<{ studentDbId: string; attendanceKey: string; record: AttendanceRecord }> = [];
  Object.entries(liveStudentsMap).forEach(([dbKey, st]) => {
    if (!st || !st.attendance) return;
    const cardUid = (st.rfidUID || st.uid || dbKey).trim().toUpperCase();
    Object.entries(st.attendance).forEach(([attKey, rawRec]) => {
      if (!rawRec) return;
      const keyDate = normalizeToISODate(attKey);
      const recDate = normalizeToISODate(rawRec.date);
      if (attKey === normalizedDate || keyDate === normalizedDate || recDate === normalizedDate) {
        targetsToRemove.push({
          studentDbId: dbKey,
          attendanceKey: attKey,
          record: {
            ...rawRec,
            studentDbId: dbKey,
            uid: (rawRec.rfidUID || rawRec.uid || cardUid).toString().trim().toUpperCase(),
            rfidUID: (rawRec.rfidUID || rawRec.uid || cardUid).toString().trim().toUpperCase(),
            studentName: rawRec.studentName || st.name,
            studentId: rawRec.studentId || st.studentId,
            department: rawRec.department || st.department,
            date: normalizedDate,
          },
        });
      }
    });
  });

  const deletedRecords: AttendanceRecord[] = [];
  const studentRemovalPatches: Record<string, null> = {};
  for (const item of targetsToRemove) {
    studentRemovalPatches[`${item.studentDbId}/attendance/${item.attendanceKey}`] = null;
    if (cachedStudentsMap[item.studentDbId]?.attendance) {
      delete cachedStudentsMap[item.studentDbId].attendance![item.attendanceKey];
    }
    if (!item.record.isDeleted) {
      deletedRecords.push(item.record);
    }
  }

  if (Object.keys(studentRemovalPatches).length > 0) {
    await runRtdbOp('UPDATE (Batch Remove)', '/students', () =>
      updateInBatches(db, 'students', studentRemovalPatches, 100)
    );
  }

  // Batched cleanup for attendance_trash, working_days, and legacy /attendance in parallel
  let trashCleanedCount = 0;
  await Promise.all([
    (async () => {
      try {
        const trashSnap = await get(ref(db, 'attendance_trash'));
        if (trashSnap.exists()) {
          const trashMap = trashSnap.val() as Record<string, TrashAttendanceRecord>;
          const trashNullPatches: Record<string, null> = {};
          for (const [trashKey, trashItem] of Object.entries(trashMap)) {
            const trashDate = normalizeToISODate(trashItem?.date);
            if (trashDate === normalizedDate || trashKey.startsWith(`${normalizedDate}_`)) {
              trashNullPatches[trashKey] = null;
              trashCleanedCount++;
            }
          }
          if (Object.keys(trashNullPatches).length > 0) {
            await updateInBatches(db, 'attendance_trash', trashNullPatches, 100);
          }
        }
      } catch (err) {
        console.warn(`Non-fatal notice cleaning attendance_trash for ${normalizedDate}:`, err);
      }
    })(),
    (async () => {
      try {
        const wdRef = ref(db, `working_days/${normalizedDate}`);
        const wdSnap = await get(wdRef);
        if (wdSnap.exists() && !wdSnap.val()?.isHoliday) {
          await remove(wdRef);
        }
      } catch (err) {
        console.warn(`Non-fatal notice cleaning working_days/${normalizedDate}:`, err);
      }
    })(),
    (async () => {
      try {
        const legacyRef = ref(db, `attendance/${normalizedDate}`);
        const legacySnap = await get(legacyRef);
        if (legacySnap.exists()) {
          await remove(legacyRef);
        }
      } catch {}
    })(),
  ]);

  await logAuditActivity('DELETE_ATTENDANCE_BY_DATE', { email: verifiedAdmin.email || adminUser.email, uid: verifiedAdmin.uid }, {
    date: normalizedDate,
    reason: reason.trim() || 'Permanent date-based attendance deletion',
    affectedCount: deletedRecords.length,
    details: `Permanently deleted ${deletedRecords.length} attendance record(s) for ${normalizedDate} (${trashCleanedCount} trash archive entries cleared)`,
    previousValues: deletedRecords.map((d) => ({
      studentDbId: d.studentDbId,
      uid: d.uid,
      name: d.studentName,
      status: d.status,
      time: d.time,
      date: d.date,
    })),
    updatedValues: null,
  });

  return {
    success: true,
    date: normalizedDate,
    deletedCount: deletedRecords.length,
    deletedRecords,
  };
}

/**
 * Bulk update attendance status for multiple records using batched multi-location updates.
 */
export async function bulkUpdateAttendanceStatus(
  records: Array<{ date: string; uid: string; studentDbId?: string; studentName?: string }>,
  newStatus: AttendanceStatus,
  reason: string,
  adminUser: { email?: string | null; uid?: string }
): Promise<{ success: boolean; count: number; previousStates: Array<{ date: string; uid: string; studentDbId: string; prevStatus: AttendanceStatus }> }> {
  const db = getFirebaseDatabase();
  const previousStates: Array<{ date: string; uid: string; studentDbId: string; prevStatus: AttendanceStatus }> = [];
  const studentPatches: Record<string, any> = {};
  const nowTs = Date.now();

  await runWithConcurrency(records, 12, async (r) => {
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
          editedAt: nowTs,
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
          lastModifiedAt: nowTs,
          previousEdits: prevEdits,
        });

        studentPatches[`${studentDbId}/attendance/${r.date}`] = updated;
      }
    } catch (err) {
      console.warn(`Failed preparing bulk update for students/${studentDbId}/attendance/${r.date}:`, err);
    }
  });

  if (Object.keys(studentPatches).length > 0) {
    await updateInBatches(db, 'students', studentPatches, 100);
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
 * legacy records immediately and triggers automatic background batched migration.
 * Skips heavy key sorting while active migration is running.
 */
export function subscribeToLegacyAttendanceChanges(
  onDetected: (info: { hasLegacy: boolean; recordCount: number; signature: string }) => void,
  onError?: (err: Error) => void
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  try {
    const db = getFirebaseDatabase();
    const attRef = ref(db, 'attendance');
    const unsubscribe = onValue(
      attRef,
      (snap) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (!snap.exists()) {
            onDetected({ hasLegacy: false, recordCount: 0, signature: '' });
            return;
          }
          const val = snap.val() as Record<string, Record<string, any>>;
          let recordCount = 0;
          let minKey = '';
          let maxKey = '';
          let latestTs = 0;
          Object.entries(val || {}).forEach(([dateKey, dayMap]) => {
            if (!dayMap || typeof dayMap !== 'object') return;
            Object.entries(dayMap).forEach(([uidKey, rawRec]) => {
              if (!rawRec || typeof rawRec !== 'object') return;
              recordCount++;
              const k = `${dateKey}:${uidKey}`;
              if (!minKey || k < minKey) minKey = k;
              if (!maxKey || k > maxKey) maxKey = k;
              const ts = Number((rawRec as any).timestamp || 0);
              if (ts > latestTs) latestTs = ts;
            });
          });
          onDetected({
            hasLegacy: recordCount > 0,
            recordCount,
            signature: recordCount > 0 ? `${recordCount}|${minKey}|${maxKey}|${latestTs}` : '',
          });
        }, 120);
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
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      off(attRef, 'value', unsubscribe);
    };
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

  const [
    studentsAttendanceVal,
    workingDaysVal,
    settingsVal,
    suspensionsVal,
    trashVal,
    auditVal,
    recoveryVal,
    usersVal,
    rfidToUidVal,
  ] = await Promise.all([
    safeGet('students_attendance'),
    safeGet('working_days'),
    safeGet('settings'),
    safeGet('suspensions'),
    safeGet('attendance_trash'),
    safeGet('audit_logs'),
    safeGet('migration_recovery'),
    safeGet('users'),
    safeGet('rfid_to_uid'),
  ]);

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
      working_days: workingDaysVal,
      settings: settingsVal,
      suspensions: suspensionsVal,
      attendance_trash: trashVal,
      audit_logs: auditVal,
      migration_recovery: recoveryVal,
      users: usersVal,
      rfid_to_uid: rfidToUidVal,
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

// ============================================================================
// ULTRA-FAST INCREMENTAL, CHECKPOINTED, BATCHED & PAUSABLE MIGRATION ENGINE
// ============================================================================

export const DEFAULT_MIGRATION_BATCH_SIZE = 100;
const MIGRATION_CHECKPOINT_PATH = 'migration_status/unified_students_v1';

let activeMigrationPromise: Promise<MigrationResult> | null = null;
const migrationControl = {
  pauseRequested: false,
};

export function pauseDatabaseMigration(): void {
  migrationControl.pauseRequested = true;
}

export function isMigrationPausedRequested(): boolean {
  return migrationControl.pauseRequested;
}

export async function getMigrationCheckpoint(): Promise<MigrationCheckpoint | null> {
  try {
    const db = getFirebaseDatabase();
    const snap = await withTimeout(get(ref(db, MIGRATION_CHECKPOINT_PATH)), 2500, null);
    if (snap && snap.exists && snap.exists()) {
      return snap.val() as MigrationCheckpoint;
    }
  } catch {}
  return null;
}

export async function clearMigrationCheckpoint(): Promise<void> {
  try {
    const db = getFirebaseDatabase();
    await remove(ref(db, MIGRATION_CHECKPOINT_PATH));
  } catch {}
}

/**
 * Pure incremental attendance record comparator: returns true when target already holds
 * an identical or newer/protected record so migration can skip writing & verifying it.
 */
export function isTargetAttendanceAlreadyUpToDate(existingAtTarget: any, candidateRec: AttendanceRecord): boolean {
  if (!existingAtTarget || typeof existingAtTarget !== 'object') return false;
  if (existingAtTarget.isOverridden || existingAtTarget.lastModifiedAt || existingAtTarget.isDeleted) {
    return true;
  }
  const existingTs = toEpochMs(existingAtTarget.timestamp, existingAtTarget.date, existingAtTarget.time);
  const incomingTs = toEpochMs(candidateRec.timestamp, candidateRec.date, candidateRec.time);
  const existingUid = normalizeRfidKey(existingAtTarget.rfidUID || existingAtTarget.uid || '');
  const candidateUid = normalizeRfidKey(candidateRec.rfidUID || candidateRec.uid || '');
  if (
    existingTs >= incomingTs &&
    existingTs > 0 &&
    existingAtTarget.date === candidateRec.date &&
    existingAtTarget.status === candidateRec.status &&
    (!candidateUid || existingUid === candidateUid)
  ) {
    return true;
  }
  return false;
}

export interface MigrationExecutionOptions {
  batchSize?: number;
  resume?: boolean;
  retryFailedOnly?: boolean;
  onProgress?: (progress: MigrationProgress) => void;
}

export async function runUnifiedDatabaseMigration(
  adminUser: { email?: string | null; uid?: string },
  options?: MigrationExecutionOptions
): Promise<MigrationResult> {
  if (activeMigrationPromise) {
    return activeMigrationPromise;
  }

  migrationControl.pauseRequested = false;
  activeMigrationPromise = executeUnifiedDatabaseMigrationInternal(adminUser, options).finally(() => {
    activeMigrationPromise = null;
  });
  return activeMigrationPromise;
}

export async function retryFailedMigrationRecords(
  adminUser: { email?: string | null; uid?: string },
  options?: Omit<MigrationExecutionOptions, 'retryFailedOnly'>
): Promise<MigrationResult> {
  return runUnifiedDatabaseMigration(adminUser, {
    ...options,
    resume: true,
    retryFailedOnly: true,
  });
}

async function executeUnifiedDatabaseMigrationInternal(
  adminUser: { email?: string | null; uid?: string },
  options?: MigrationExecutionOptions
): Promise<MigrationResult> {
  const db = getFirebaseDatabase();
  const startedAt = Date.now();
  const configuredBatchSize = Math.max(10, Math.min(250, options?.batchSize || DEFAULT_MIGRATION_BATCH_SIZE));
  const errors: string[] = [];
  const recordLogs: MigrationRecordLog[] = [];
  const MAX_UI_LOGS = 250;

  const pushLog = (entry: MigrationRecordLog) => {
    recordLogs.push(entry);
    if (recordLogs.length > MAX_UI_LOGS) {
      recordLogs.shift();
    }
  };

  let lastProgress: MigrationProgress = {
    status: 'running',
    phase: 'authenticating',
    totalLegacy: 0,
    alreadyMigrated: 0,
    pending: 0,
    succeeded: 0,
    failed: 0,
    unregistered: 0,
    currentBatch: 0,
    totalBatches: 0,
    batchSize: configuredBatchSize,
    progressPercent: 0,
    recordsPerSec: 0,
    durationMs: 0,
    verificationStatus: 'pending',
    message: 'Verifying Administrator Firebase Authentication...',
    logs: [],
  };

  const emitProgress = (patch: Partial<MigrationProgress>) => {
    const durationMs = Math.max(1, Date.now() - startedAt);
    const done =
      (patch.alreadyMigrated ?? lastProgress.alreadyMigrated) +
      (patch.succeeded ?? lastProgress.succeeded) +
      (patch.unregistered ?? lastProgress.unregistered);
    const total = patch.totalLegacy ?? lastProgress.totalLegacy;
    const processedInSession =
      (patch.succeeded ?? lastProgress.succeeded) + (patch.unregistered ?? lastProgress.unregistered);
    const recordsPerSec = Number(((processedInSession / durationMs) * 1000).toFixed(1));
    const progressPercent =
      total > 0 ? Math.min(100, Math.round((done / total) * 100)) : patch.status === 'completed' ? 100 : 0;

    lastProgress = {
      ...lastProgress,
      ...patch,
      durationMs,
      recordsPerSec,
      progressPercent,
      logs: [...recordLogs],
    };
    options?.onProgress?.(lastProgress);
  };

  emitProgress({ phase: 'authenticating' });

  // 1. Verify Firebase Authentication and Administrator UID match
  let verifiedAdmin: { uid: string; email: string | null; tokenVerified: boolean };
  try {
    verifiedAdmin = await verifyAdministratorAuth();
  } catch (authErr: any) {
    const opErr = authErr instanceof RtdbOperationError ? authErr : null;
    const msg = authErr?.message || 'Administrator authentication verification failed.';
    emitProgress({ status: 'error', phase: 'error', verificationStatus: 'failed', message: msg });
    return {
      success: false,
      message: `Migration aborted: ${msg}`,
      migratedCount: 0,
      skippedDuplicateCount: 0,
      unregisteredCount: 0,
      verifiedCount: 0,
      failedCount: 0,
      totalLegacyCount: 0,
      legacyRemoved: false,
      durationMs: Date.now() - startedAt,
      errors: [msg],
      failedOperation: opErr?.operation || 'AUTH_CHECK',
      failedPath: opErr?.path || '/auth/currentUser',
      recordLogs,
    };
  }

  emitProgress({ phase: 'inspecting', message: 'Reading /students, /attendance, and checkpoint state in parallel...' });

  // 2. Parallel reads of /students, /rfid_to_student, /attendance, /students_attendance, and existing checkpoint
  let rawStudents: Record<string, any> = {};
  let legacyAtt: Record<string, Record<string, any>> = {};
  let legacyStuAtt: Record<string, Record<string, any>> = {};
  let rfidIndexVal: Record<string, any> = {};
  let existingCheckpoint: MigrationCheckpoint | null = null;
  let hasRootAttendance = false;
  let hasLegacyStudentsAttendance = false;

  try {
    const [studentsSnap, attSnap, saSnap, idxSnap, cpSnap] = await Promise.all([
      runRtdbOp('GET', '/students', () =>
        withTimeoutReject(get(ref(db, 'students')), 7000, 'Timed out reading /students')
      ),
      runRtdbOp('GET', '/attendance', () =>
        withTimeoutReject(get(ref(db, 'attendance')), 7000, 'Timed out reading /attendance')
      ),
      withTimeout(get(ref(db, 'students_attendance')), 3500, null).catch(() => null),
      withTimeout(get(ref(db, 'rfid_to_student')), 3000, null).catch(() => null),
      withTimeout(get(ref(db, MIGRATION_CHECKPOINT_PATH)), 2500, null).catch(() => null),
    ]);

    rawStudents = studentsSnap.exists() ? studentsSnap.val() : {};
    hasRootAttendance = attSnap.exists();
    if (hasRootAttendance) legacyAtt = attSnap.val() || {};
    if (saSnap && saSnap.exists && saSnap.exists()) {
      hasLegacyStudentsAttendance = true;
      legacyStuAtt = saSnap.val() || {};
    }
    if (idxSnap && idxSnap.exists && idxSnap.exists()) {
      rfidIndexVal = idxSnap.val() || {};
    }
    if (cpSnap && cpSnap.exists && cpSnap.exists()) {
      existingCheckpoint = cpSnap.val() as MigrationCheckpoint;
    }
  } catch (err: any) {
    const opErr = err instanceof RtdbOperationError ? err : null;
    const msg = err?.message || 'Failed reading database sources';
    emitProgress({ status: 'error', phase: 'error', verificationStatus: 'failed', message: msg });
    return {
      success: false,
      message: `Migration aborted: ${msg}. Legacy /attendance was preserved.`,
      adminUid: verifiedAdmin.uid,
      migratedCount: 0,
      skippedDuplicateCount: 0,
      unregisteredCount: 0,
      verifiedCount: 0,
      failedCount: 0,
      totalLegacyCount: 0,
      legacyRemoved: false,
      durationMs: Date.now() - startedAt,
      failedOperation: opErr?.operation || 'GET',
      failedPath: opErr?.path || '/attendance',
      errors: [msg],
      recordLogs,
    };
  }

  // Build normalized O(1) lookup indices for student matching (eliminates O(N^2) linear .find()!)
  const studentRegistry: Record<string, Student> = {};
  const rfidToDbKey: Record<string, string> = {};
  const rollToStudent: Record<string, Student> = {};
  const authToStudentObj: Record<string, Student> = {};
  const emailToStudent: Record<string, Student> = {};
  const nameToStudent: Record<string, Student> = {};

  for (const [rawKey, rawStu] of Object.entries(rawStudents)) {
    if (!rawStu || typeof rawStu !== 'object') continue;
    const dbKey = rawKey.trim();
    const cardRfid = normalizeRfidKey(rawStu.rfidUID || rawStu.uid || dbKey);
    const normalizedStu: Student = stripUndefinedDeep({
      ...rawStu,
      studentDbId: dbKey,
      rfidUID: cardRfid,
      uid: cardRfid,
    });
    studentRegistry[dbKey] = normalizedStu;
    rfidToDbKey[cardRfid] = dbKey;
    if (normalizedStu.studentId) rollToStudent[normalizedStu.studentId.trim().toUpperCase()] = normalizedStu;
    if (normalizedStu.authUid) authToStudentObj[normalizedStu.authUid.trim()] = normalizedStu;
    if (normalizedStu.email) emailToStudent[normalizedStu.email.trim().toLowerCase()] = normalizedStu;
    if (normalizedStu.name) nameToStudent[normalizedStu.name.trim().toLowerCase()] = normalizedStu;
  }

  Object.entries(rfidIndexVal).forEach(([rfidKey, mapping]) => {
    const targetDbId = typeof mapping === 'string' ? mapping : mapping?.studentDbId;
    if (targetDbId && studentRegistry[targetDbId]) {
      rfidToDbKey[normalizeRfidKey(rfidKey)] = targetDbId;
    }
  });

  // Collect deduplicated legacy attendance entries
  const legacyPairs = new Map<string, { key: string; date: string; rawUid: string; normUid: string; rawRec: any }>();
  Object.entries(legacyAtt).forEach(([dateKey, dayMap]) => {
    if (!dayMap || typeof dayMap !== 'object') return;
    Object.entries(dayMap).forEach(([uidKey, rawRec]) => {
      if (!rawRec || typeof rawRec !== 'object') return;
      const normUid = normalizeRfidKey(rawRec.rfidUID || rawRec.uid || uidKey);
      const key = `${dateKey}::${normUid}`;
      legacyPairs.set(key, { key, date: dateKey, rawUid: uidKey, normUid, rawRec });
    });
  });

  Object.entries(legacyStuAtt).forEach(([uidKey, datesMap]) => {
    if (!datesMap || typeof datesMap !== 'object') return;
    Object.entries(datesMap).forEach(([dateKey, rawRec]) => {
      if (!rawRec || typeof rawRec !== 'object') return;
      const normUid = normalizeRfidKey(rawRec.rfidUID || rawRec.uid || uidKey);
      const key = `${dateKey}::${normUid}`;
      if (!legacyPairs.has(key)) {
        legacyPairs.set(key, { key, date: dateKey, rawUid: uidKey, normUid, rawRec });
      }
    });
  });

  const totalLegacyCount = legacyPairs.size;
  if (totalLegacyCount === 0) {
    emitProgress({
      status: 'completed',
      phase: 'completed',
      totalLegacy: 0,
      verificationStatus: 'verified',
      message: 'No pending legacy records detected.',
    });
    return {
      success: true,
      message: 'No legacy records found in /attendance. Database is already 100% unified.',
      adminUid: verifiedAdmin.uid,
      migratedCount: 0,
      skippedDuplicateCount: 0,
      alreadyMigratedCount: 0,
      unregisteredCount: 0,
      verifiedCount: 0,
      failedCount: 0,
      totalLegacyCount: 0,
      legacyRemoved: !hasRootAttendance,
      durationMs: Date.now() - startedAt,
      errors: [],
      recordLogs,
    };
  }

  // 3. Mandatory pre-migration backup under /backups (reuse verified checkpoint backup on resume)
  let backupPath = '';
  let rawBackupPath = '';
  let backupVerifiedCount = 0;
  let backupExpectedCount = totalLegacyCount;

  const canReuseCheckpointBackup =
    options?.resume &&
    existingCheckpoint?.backupPath &&
    existingCheckpoint.backupExpectedCount === totalLegacyCount &&
    existingCheckpoint.backupVerifiedCount === totalLegacyCount;

  if (canReuseCheckpointBackup && existingCheckpoint?.backupPath) {
    backupPath = existingCheckpoint.backupPath;
    rawBackupPath = backupPath.replace(/^\//, '');
    backupVerifiedCount = existingCheckpoint.backupVerifiedCount || totalLegacyCount;
    backupExpectedCount = existingCheckpoint.backupExpectedCount || totalLegacyCount;
  } else {
    emitProgress({
      phase: 'backing_up',
      totalLegacy: totalLegacyCount,
      message: `Creating verified pre-migration snapshot of ${totalLegacyCount} legacy records in /backups...`,
    });
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
      emitProgress({ status: 'error', phase: 'error', verificationStatus: 'failed', message: msg });
      return {
        success: false,
        message: 'Migration aborted: Pre-migration backup failed. Legacy /attendance was preserved.',
        adminUid: verifiedAdmin.uid,
        migratedCount: 0,
        skippedDuplicateCount: 0,
        unregisteredCount: 0,
        verifiedCount: 0,
        failedCount: 0,
        totalLegacyCount,
        legacyRemoved: false,
        durationMs: Date.now() - startedAt,
        failedOperation: opErr?.operation || 'BACKUP',
        failedPath: opErr?.path || '/backups',
        errors: [msg],
        recordLogs,
      };
    }
  }

  // 4. Compute Incremental Delta Queue (skip already migrated & checkpointed items)
  const completedKeysMap: Record<string, string> =
    options?.resume && existingCheckpoint?.completedKeys ? { ...existingCheckpoint.completedKeys } : {};
  const failedItemsSet = new Set<string>(
    options?.retryFailedOnly && existingCheckpoint?.failedItems
      ? existingCheckpoint.failedItems.map((f) => f.key)
      : []
  );

  interface WorkItem {
    key: string;
    date: string;
    normUid: string;
    kind: 'student' | 'recovery';
    targetDbId?: string;
    targetUid: string;
    destSubPath: string; // relative to /students or /migration_recovery/unregistered_attendance
    fullPath: string; // e.g. students/{id}/attendance/{date}
    payload: AttendanceRecord;
    isMerge: boolean;
  }

  const workQueue: WorkItem[] = [];
  const discoveredDates = new Set<string>();
  const failedItems: MigrationFailedItem[] = [];
  let alreadyMigratedCount = 0;
  let firstFailedOperation: string | undefined;
  let firstFailedPath: string | undefined;

  for (const entry of legacyPairs.values()) {
    const { key, date, normUid, rawRec } = entry;
    if (options?.retryFailedOnly && failedItemsSet.size > 0 && !failedItemsSet.has(key)) {
      alreadyMigratedCount++;
      continue;
    }

    // Check O(1) indices
    const targetStudent: Student | undefined =
      (rawRec.studentDbId && studentRegistry[rawRec.studentDbId]) ||
      (rfidToDbKey[normUid] && studentRegistry[rfidToDbKey[normUid]]) ||
      studentRegistry[normUid] ||
      (rawRec.studentId && rollToStudent[rawRec.studentId.toString().trim().toUpperCase()]) ||
      (rawRec.authUid && authToStudentObj[rawRec.authUid.trim()]) ||
      (rawRec.email && emailToStudent[rawRec.email.toString().trim().toLowerCase()]) ||
      ((rawRec.studentName || rawRec.name) && nameToStudent[(rawRec.studentName || rawRec.name).toString().trim().toLowerCase()]);

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
        failedItems.push({ key, date, uid: targetUid, targetPath: `/${destPath}`, error: validationErr });
        pushLog({ uid: targetUid, date, targetPath: `/${destPath}`, action: 'failed', message: validationErr });
        continue;
      }

      // Skip already migrated/identical/newer destination records without redundant write
      if (completedKeysMap[key] && existingAtTarget) {
        alreadyMigratedCount++;
        discoveredDates.add(date);
        continue;
      }

      if (existingAtTarget && isTargetAttendanceAlreadyUpToDate(existingAtTarget, normalizedRec)) {
        alreadyMigratedCount++;
        completedKeysMap[key] = destPath;
        discoveredDates.add(date);
        pushLog({
          uid: targetUid,
          date,
          targetPath: `/${destPath}`,
          action: 'merged',
          message: 'Already unified & verified in destination (skipped write)',
        });
        continue;
      }

      const finalPayload = existingAtTarget
        ? stripUndefinedDeep(mergeAttendanceEntries(existingAtTarget, normalizedRec))
        : normalizedRec;

      workQueue.push({
        key,
        date,
        normUid,
        kind: 'student',
        targetDbId,
        targetUid,
        destSubPath: `${targetDbId}/attendance/${date}`,
        fullPath: destPath,
        payload: finalPayload,
        isMerge: Boolean(existingAtTarget),
      });
    } else {
      const recPath = `migration_recovery/unregistered_attendance/${normUid}/${date}`;
      if (completedKeysMap[key]) {
        alreadyMigratedCount++;
        continue;
      }
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
      workQueue.push({
        key,
        date,
        normUid,
        kind: 'recovery',
        targetUid: normUid,
        destSubPath: `${normUid}/${date}`,
        fullPath: recPath,
        payload: normalizedUnreg,
        isMerge: false,
      });
    }
  }

  let currentBatchSize = configuredBatchSize;
  const estimatedBatches = workQueue.length > 0 ? Math.ceil(workQueue.length / currentBatchSize) : 0;

  emitProgress({
    phase: workQueue.length > 0 ? 'migrating_batch' : 'cleaning_legacy',
    totalLegacy: totalLegacyCount,
    alreadyMigrated: alreadyMigratedCount,
    pending: workQueue.length,
    succeeded: 0,
    failed: failedItems.length,
    unregistered: 0,
    currentBatch: 0,
    totalBatches: estimatedBatches,
    backupPath,
    verificationStatus: workQueue.length > 0 ? 'pending' : 'verified',
    message:
      workQueue.length > 0
        ? `Migrating ${workQueue.length} pending record(s) in batches of ${currentBatchSize} (${alreadyMigratedCount} already unified)...`
        : `All ${alreadyMigratedCount} records already unified; verifying legacy cleanup...`,
  });

  let migratedCount = 0;
  let skippedDuplicateCount = alreadyMigratedCount;
  let unregisteredCount = 0;
  let verifiedCount = alreadyMigratedCount;
  let lastCheckpointAt: number | undefined = existingCheckpoint?.lastCheckpointAt;
  let paused = false;

  const saveCheckpoint = async (
    status: MigrationCheckpoint['status'],
    currentBatch: number,
    totalBatches: number
  ) => {
    lastCheckpointAt = Date.now();
    // Guard RTDB node size: cap completedKeys persisted in checkpoint at 5,000 keys
    const keyEntries = Object.entries(completedKeysMap);
    const boundedCompletedKeys =
      keyEntries.length <= 5000
        ? completedKeysMap
        : Object.fromEntries(keyEntries.slice(keyEntries.length - 5000));

    const checkpointPayload: MigrationCheckpoint = stripUndefinedDeep({
      version: 'unified_students_v2_batched',
      status,
      backupPath,
      backupVerifiedCount,
      backupExpectedCount,
      totalLegacyCount,
      processedCount: verifiedCount,
      migratedCount,
      skippedCount: skippedDuplicateCount,
      unregisteredCount,
      verifiedCount,
      failedCount: failedItems.length,
      currentBatch,
      totalBatches,
      batchSize: currentBatchSize,
      completedKeys: boundedCompletedKeys,
      failedItems: failedItems.slice(0, 200),
      startedAt,
      lastCheckpointAt,
      ...(status === 'completed' ? { completedAt: lastCheckpointAt } : {}),
    });

    try {
      await withTimeout(set(ref(db, MIGRATION_CHECKPOINT_PATH), checkpointPayload), 2500, null);
    } catch {}
  };

  // 5. Execute Batched Multi-Location Writes (strictly scoped under /students & /migration_recovery)
  //    followed by Batch-Scoped Parity Verification + Persistent Checkpoints!
  let cursor = 0;
  let batchNum = 0;

  while (cursor < workQueue.length) {
    if (migrationControl.pauseRequested) {
      paused = true;
      await saveCheckpoint('paused', batchNum, Math.max(batchNum, estimatedBatches));
      emitProgress({
        status: 'paused',
        phase: 'paused',
        pending: Math.max(0, workQueue.length - cursor),
        lastCheckpointAt,
        verificationStatus: 'partial',
        message: `Migration paused at batch ${batchNum}. ${verifiedCount}/${totalLegacyCount} processed & saved in checkpoint.`,
      });
      break;
    }

    batchNum++;
    const slice = workQueue.slice(cursor, cursor + currentBatchSize);
    const remainingTotalBatches = batchNum + Math.ceil((workQueue.length - (cursor + slice.length)) / currentBatchSize);

    emitProgress({
      phase: 'migrating_batch',
      currentBatch: batchNum,
      totalBatches: remainingTotalBatches,
      pending: workQueue.length - cursor,
      message: `Writing batch ${batchNum}/${remainingTotalBatches} (${slice.length} records)...`,
    });

    const studentBatchUpdates: Record<string, any> = {};
    const recoveryBatchUpdates: Record<string, any> = {};
    const studentSlice: WorkItem[] = [];
    const recoverySlice: WorkItem[] = [];

    for (const item of slice) {
      if (item.kind === 'student') {
        studentBatchUpdates[item.destSubPath] = item.payload;
        studentSlice.push(item);
        discoveredDates.add(item.date);
      } else {
        recoveryBatchUpdates[item.destSubPath] = item.payload;
        recoverySlice.push(item);
      }
    }

    let batchWriteOk = true;
    try {
      if (studentSlice.length > 0) {
        await runRtdbOp('UPDATE (Batch /students)', '/students', () =>
          withRetryBackoff(() => update(ref(db, 'students'), stripUndefinedDeep(studentBatchUpdates)))
        );
      }
      if (recoverySlice.length > 0) {
        await runRtdbOp('UPDATE (Batch /migration_recovery)', '/migration_recovery/unregistered_attendance', () =>
          withRetryBackoff(() =>
            update(ref(db, 'migration_recovery/unregistered_attendance'), stripUndefinedDeep(recoveryBatchUpdates))
          )
        );
      }
    } catch (batchErr: any) {
      batchWriteOk = false;
      const opErr = batchErr instanceof RtdbOperationError ? batchErr : null;

      // Adaptive batch downgrade on transient/payload failure if batch > 25
      if (currentBatchSize > 25 && isTransientFirebaseError(batchErr)) {
        currentBatchSize = Math.max(25, Math.floor(currentBatchSize / 2));
        batchNum--;
        continue;
      }

      // Fallback per-item within failed slice so healthy records still commit & bad records are isolated
      for (const item of slice) {
        try {
          await runRtdbOp('SET', `/${item.fullPath}`, () => set(ref(db, item.fullPath), item.payload));
        } catch (singleErr: any) {
          const sOpErr = singleErr instanceof RtdbOperationError ? singleErr : opErr;
          const msg = singleErr?.message || 'Batch write failed';
          if (!firstFailedOperation) {
            firstFailedOperation = sOpErr?.operation || 'SET';
            firstFailedPath = sOpErr?.path || `/${item.fullPath}`;
          }
          errors.push(msg);
          failedItems.push({
            key: item.key,
            date: item.date,
            uid: item.targetUid,
            targetPath: `/${item.fullPath}`,
            error: msg,
          });
          pushLog({
            uid: item.targetUid,
            date: item.date,
            targetPath: `/${item.fullPath}`,
            action: 'failed',
            message: msg,
          });
        }
      }
    }

    // Verify ONLY the current batch (concurrent bounded verification read-backs)
    emitProgress({
      phase: 'verifying_batch',
      currentBatch: batchNum,
      totalBatches: remainingTotalBatches,
      verificationStatus: 'verifying',
      message: `Verifying batch ${batchNum}/${remainingTotalBatches} (${slice.length} records)...`,
    });

    const itemsToVerify = batchWriteOk
      ? slice
      : slice.filter((it) => !failedItems.some((f) => f.key === it.key));

    await runWithConcurrency(itemsToVerify, 16, async (item) => {
      try {
        const checkSnap = await withRetryBackoff(() =>
          runRtdbOp('GET (Verify Batch)', `/${item.fullPath}`, () =>
            withTimeoutReject(
              get(ref(db, item.fullPath)),
              5000,
              `Verification timed out at /${item.fullPath}`
            )
          )
        );
        if (!checkSnap.exists()) {
          throw new Error(`Missing verified record at /${item.fullPath}`);
        }
        const val = checkSnap.val() || {};
        const storedUid = normalizeRfidKey(val.uid || val.rfidUID || '');
        const storedDbId = (val.studentDbId || '').toString().trim();
        const idMatches =
          storedUid === item.targetUid ||
          (item.targetDbId && storedDbId === item.targetDbId);
        const hasValidFields =
          val.date === item.date &&
          idMatches &&
          Boolean(val.status) &&
          Boolean(val.time) &&
          typeof val.timestamp === 'number' &&
          val.timestamp > 0;

        if (!hasValidFields) {
          throw new Error(`Parity mismatch at /${item.fullPath} (uid=${storedUid}, date=${val.date || 'missing'})`);
        }

        verifiedCount++;
        completedKeysMap[item.key] = item.fullPath;

        if (item.kind === 'recovery') {
          unregisteredCount++;
          pushLog({
            uid: item.targetUid,
            date: item.date,
            targetPath: `/${item.fullPath}`,
            action: 'recovery',
            message: 'Archived & verified in recovery vault',
          });
        } else if (item.isMerge) {
          skippedDuplicateCount++;
          pushLog({
            uid: item.targetUid,
            date: item.date,
            targetPath: `/${item.fullPath}`,
            action: 'merged',
            message: 'Merged & verified without duplicate overwrite',
          });
        } else {
          migratedCount++;
          pushLog({
            uid: item.targetUid,
            date: item.date,
            targetPath: `/${item.fullPath}`,
            action: 'migrated',
            message: `Verified ${item.payload.time} (${item.payload.status})`,
          });
        }
      } catch (verifyErr: any) {
        const opErr = verifyErr instanceof RtdbOperationError ? verifyErr : null;
        const msg = verifyErr?.message || `Verification error at /${item.fullPath}`;
        if (!firstFailedOperation) {
          firstFailedOperation = opErr?.operation || 'VERIFY_PARITY';
          firstFailedPath = opErr?.path || `/${item.fullPath}`;
        }
        errors.push(msg);
        failedItems.push({
          key: item.key,
          date: item.date,
          uid: item.targetUid,
          targetPath: `/${item.fullPath}`,
          error: msg,
        });
        pushLog({
          uid: item.targetUid,
          date: item.date,
          targetPath: `/${item.fullPath}`,
          action: 'failed',
          message: msg,
        });
      }
    });

    cursor += slice.length;
    await saveCheckpoint('running', batchNum, remainingTotalBatches);

    emitProgress({
      phase: 'verifying_batch',
      alreadyMigrated: alreadyMigratedCount,
      pending: Math.max(0, workQueue.length - cursor),
      succeeded: migratedCount + Math.max(0, skippedDuplicateCount - alreadyMigratedCount),
      failed: failedItems.length,
      unregistered: unregisteredCount,
      currentBatch: batchNum,
      totalBatches: remainingTotalBatches,
      lastCheckpointAt,
      verificationStatus: failedItems.length > 0 ? 'partial' : 'verified',
      message: `Checkpoint saved after batch ${batchNum}/${remainingTotalBatches} (${verifiedCount}/${totalLegacyCount} verified).`,
    });
  }

  if (paused) {
    const durationMs = Math.max(1, Date.now() - startedAt);
    const recordsPerSec = Number((((migratedCount + unregisteredCount) / durationMs) * 1000).toFixed(1));
    return {
      success: false,
      paused: true,
      message: `Migration paused after checkpoint (${verifiedCount}/${totalLegacyCount} verified). Legacy /attendance preserved so you can resume anytime.`,
      adminUid: verifiedAdmin.uid,
      backupPath,
      backupVerifiedCount,
      backupExpectedCount,
      migratedCount,
      skippedDuplicateCount,
      alreadyMigratedCount,
      unregisteredCount,
      verifiedCount,
      failedCount: failedItems.length,
      totalLegacyCount,
      legacyRemoved: false,
      durationMs,
      recordsPerSec,
      lastCheckpointAt,
      errors,
      recordLogs,
    };
  }

  const isVerified = verifiedCount === totalLegacyCount && failedItems.length === 0 && errors.length === 0;
  let legacyRemoved = false;

  // 6. Sync newly migrated dates into working_days in a single batch and clean legacy ONLY on 100% parity
  if (discoveredDates.size > 0) {
    syncWorkingDaysFromDates(Array.from(discoveredDates)).catch(() => {});
  }

  if (isVerified) {
    emitProgress({
      phase: 'cleaning_legacy',
      message: '100% parity confirmed. Cleaning legacy /attendance node...',
    });
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
      } catch {}
    }

    if (rawBackupPath) {
      try {
        await update(ref(db, rawBackupPath), {
          migrationVerification: {
            completedAt: Date.now(),
            completedAtIst: getISTTimestampDisplay(),
            completedBy: verifiedAdmin.email || 'admin',
            completedByUid: verifiedAdmin.uid,
            migratedCount,
            skippedDuplicateCount,
            alreadyMigratedCount,
            unregisteredCount,
            verifiedCount,
            totalLegacyCount,
            legacyRemoved,
          },
        });
      } catch {}
    }

    await saveCheckpoint('completed', batchNum, Math.max(1, batchNum));
  } else {
    await saveCheckpoint('error', batchNum, Math.max(1, batchNum));
  }

  const durationMs = Math.max(1, Date.now() - startedAt);
  const studentSucceededInSession = migratedCount + Math.max(0, skippedDuplicateCount - alreadyMigratedCount);
  const processedInSession = studentSucceededInSession + unregisteredCount;
  const recordsPerSec = Number(((processedInSession / durationMs) * 1000).toFixed(1));
  const overallSuccess = isVerified && legacyRemoved && errors.length === 0;

  emitProgress({
    status: overallSuccess ? 'completed' : 'error',
    phase: overallSuccess ? 'completed' : 'error',
    pending: failedItems.length,
    succeeded: studentSucceededInSession,
    failed: failedItems.length,
    unregistered: unregisteredCount,
    lastCheckpointAt,
    verificationStatus: overallSuccess ? 'verified' : failedItems.length > 0 ? 'partial' : 'failed',
    message: overallSuccess
      ? `Migration verified (${verifiedCount}/${totalLegacyCount} confirmed, ${recordsPerSec} rec/sec).`
      : `Migration incomplete (${verifiedCount}/${totalLegacyCount} verified, ${failedItems.length} failed). Legacy preserved.`,
  });

  return {
    success: overallSuccess,
    paused: false,
    message: overallSuccess
      ? `Migration verified (${verifiedCount}/${totalLegacyCount} records confirmed in ${(durationMs / 1000).toFixed(2)}s @ ${recordsPerSec} rec/sec). Backup verified at ${backupPath} and legacy /attendance removed.`
      : isVerified && !legacyRemoved
      ? `All ${verifiedCount}/${totalLegacyCount} records migrated & verified, but legacy /attendance cleanup failed. Legacy records remain preserved.`
      : `Migration incomplete (${verifiedCount}/${totalLegacyCount} verified, ${failedItems.length} failed). Legacy /attendance was preserved.`,
    adminUid: verifiedAdmin.uid,
    backupPath,
    backupVerifiedCount,
    backupExpectedCount,
    migratedCount,
    skippedDuplicateCount,
    alreadyMigratedCount,
    unregisteredCount,
    verifiedCount,
    failedCount: failedItems.length,
    totalLegacyCount,
    legacyRemoved,
    durationMs,
    recordsPerSec,
    lastCheckpointAt,
    failedOperation: overallSuccess ? undefined : firstFailedOperation,
    failedPath: overallSuccess ? undefined : firstFailedPath,
    errors,
    recordLogs,
  };
}

/**
 * Pure + verifiable Dashboard aggregate calculator with consistency verification.
 * Used both for fast incremental KPI computation and rebuild/verification audits.
 */
export function computeDashboardAggregates(params: {
  studentsMap: Record<string, Student>;
  workingDays: Record<string, WorkingDayConfig>;
  todayStr: string;
  isAfterDeadline: boolean;
}): DashboardAggregates {
  const { studentsMap, workingDays, todayStr, isAfterDeadline } = params;
  const isTodayHoliday = Boolean(workingDays[todayStr]?.isHoliday);

  let totalActiveStudents = 0;
  let presentToday = 0;
  let explicitAbsentToday = 0;
  let totalHistoricalRecords = 0;
  const workingDateSet = new Set<string>();

  Object.entries(workingDays || {}).forEach(([d, cfg]) => {
    if (d && d <= todayStr && cfg && !cfg.isHoliday) {
      workingDateSet.add(d);
    }
  });

  Object.values(studentsMap || {}).forEach((st) => {
    if (!st) return;
    const isActive =
      st.status === 'active' &&
      !st.isSuspended &&
      !(st.activeSuspension && st.activeSuspension.status === 'active');
    if (isActive) totalActiveStudents++;

    if (st.attendance && typeof st.attendance === 'object') {
      Object.entries(st.attendance).forEach(([d, rec]) => {
        if (!rec || rec.isDeleted) return;
        totalHistoricalRecords++;
        if (d <= todayStr && !workingDays[d]?.isHoliday) {
          workingDateSet.add(d);
        }
        if (d === todayStr && isActive) {
          if (rec.status === 'Present') presentToday++;
          else if (rec.status === 'Absent') explicitAbsentToday++;
        }
      });
    }
  });

  const unscannedActive = Math.max(0, totalActiveStudents - presentToday - explicitAbsentToday);
  const pendingToday = isTodayHoliday || isAfterDeadline ? 0 : unscannedActive;
  const absentToday = isTodayHoliday
    ? explicitAbsentToday
    : isAfterDeadline
    ? explicitAbsentToday + unscannedActive
    : explicitAbsentToday;
  const attendanceRate = totalActiveStudents > 0 ? Math.round((presentToday / totalActiveStudents) * 100) : 0;

  return {
    updatedAt: Date.now(),
    todayStr,
    totalActiveStudents,
    presentToday,
    explicitAbsentToday,
    pendingToday,
    absentToday,
    attendanceRate,
    totalHistoricalRecords,
    verifiedWorkingDays: workingDateSet.size,
  };
}

/**
 * Rebuilds and persists verified dashboard aggregates under /settings/aggregates (admin-writable)
 * for instant cold-start checks & consistency verification.
 */
export async function rebuildAndVerifyAggregates(
  studentsMap: Record<string, Student>,
  workingDays: Record<string, WorkingDayConfig>,
  todayStr: string,
  isAfterDeadline: boolean
): Promise<DashboardAggregates> {
  const agg = computeDashboardAggregates({
    studentsMap,
    workingDays,
    todayStr,
    isAfterDeadline,
  });
  try {
    const db = getFirebaseDatabase();
    await withTimeout(set(ref(db, 'settings/aggregates'), stripUndefinedDeep(agg)), 2500, null);
  } catch {
    // Non-blocking cache persistence
  }
  return agg;
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


