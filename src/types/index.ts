export type UserRole = 'admin' | 'student';

export type AuthStatus = 
  | 'initializing'
  | 'authenticating'
  | 'loading_profile'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

export interface Student {
  uid: string; // RFID UID (e.g., '5AA5AB24')
  name: string;
  studentId: string; // Roll Number (e.g., 'STU-2024-001')
  department: string;
  year: string;
  semester?: string;
  email: string;
  phone: string;
  registeredAt: string;
  avatar?: string;
  status: 'active' | 'inactive';
  authUid?: string; // Associated Firebase Auth UID
}

export interface UserProfile {
  uid: string; // Firebase Auth UID
  name: string;
  email: string;
  rollNumber: string;
  department: string;
  year: string;
  semester: string;
  role: UserRole;
  rfidUID: string;
  createdAt: string | number;
  phone?: string;
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string;
  role: UserRole;
  rfidUID?: string;
  studentId?: string;
  rollNumber?: string;
  department?: string;
  year?: string;
  semester?: string;
  phone?: string;
  provider: 'firebase';
}

export interface StudentRegistrationInput {
  name: string;
  rollNumber: string;
  email: string;
  password?: string;
  department: string;
  year: string;
  semester: string;
  rfidUID: string;
  phone?: string;
}

export interface AttendanceRecord {
  uid: string; // RFID UID
  studentName?: string;
  studentId?: string;
  department?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  timestamp: number;
  status: 'Present' | 'Late' | 'Duplicate' | 'Unknown';
  device?: string; // e.g., 'ESP32-RFID-01'
  notes?: string;
}

export interface AttendanceFilter {
  date: string;
  searchQuery: string;
  department: string;
  status: string;
}

export interface DayStats {
  date: string;
  dayName: string;
  present: number;
  absent: number;
  total: number;
  percentage: number;
}

export interface StudentAttendanceSummary {
  student: Student;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  percentage: number;
  lastSeen?: string;
}

export interface ESP32DeviceConfig {
  deviceId: string;
  location: string;
  lastPing: number;
  status: 'online' | 'offline';
}

export interface FirebaseConfigState {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface DeviceCommand {
  command: 'none' | 'RESET_SYSTEM';
  commandId: string;
  timestamp: number;
  initiatedBy?: string;
  status?: 'PENDING' | 'ACKNOWLEDGED';
  acknowledgedAt?: number;
}

export interface ResetAuditLog {
  type: 'ATTENDANCE_RESET' | 'COMPLETE_SYSTEM_RESET';
  adminEmail: string;
  initiatedByUid?: string;
  timestamp: number;
  timestampStr: string;
  description?: string;
}
