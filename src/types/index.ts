export interface Student {
  uid: string; // RFID UID (e.g., '5AA5AB24')
  name: string;
  studentId: string; // (e.g., 'STU-2024-001')
  department: string;
  year: string;
  email: string;
  phone: string;
  registeredAt: string;
  avatar?: string;
  status: 'active' | 'inactive';
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

