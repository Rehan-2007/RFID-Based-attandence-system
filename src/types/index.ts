export type UserRole = 'admin' | 'student';

export type AuthStatus = 
  | 'initializing'
  | 'authenticating'
  | 'loading_profile'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

export type DbDiagnosticCode =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'auth_expired'
  | 'permission_denied'
  | 'not_registered'
  | 'mapping_missing'
  | 'empty_records';

export interface DbDiagnosticState {
  code: DbDiagnosticCode;
  label: string;
  message: string;
  path?: string;
  operation?: string;
}

export interface Student {
  uid: string; // Hardware RFID Card UID (e.g., 'A1B2C3D4')
  studentDbId?: string; // Stable key under /students/{studentDbId}
  rfidUID?: string; // Normalized hardware RFID Card UID
  name: string;
  studentId: string; // Roll Number
  department: string;
  year: string;
  semester?: string;
  email: string;
  phone: string;
  registeredAt: string;
  avatar?: string;
  status: 'active' | 'inactive' | 'suspended';
  authUid?: string; // Associated Firebase Auth UID
  isSuspended?: boolean;
  activeSuspension?: StudentSuspension;
  attendance?: Record<string, AttendanceRecord>; // Unified nested attendance history keyed by YYYY-MM-DD
}

export interface UserProfile {
  uid: string; // Firebase Auth UID
  studentDbId?: string; // Stable key under /students/{studentDbId}
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
  studentDbId?: string;
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

export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Excused' | 'Duplicate' | 'Unknown';

export interface StudentSuspension {
  id: string;
  studentDbId?: string;
  studentRfid: string;
  studentName: string;
  studentId: string;
  duration: '1_day' | '1_week' | '1_month' | 'custom';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  reason: string;
  suspendedBy: string; // admin email
  createdAt: number;
  status: 'active' | 'expired' | 'revoked';
  revokedAt?: number;
  revokedBy?: string;
  revocationReason?: string;
}

export interface AttendanceEditHistory {
  editedAt: number;
  editedBy: string;
  reason?: string;
  prevData: {
    date: string;
    time: string;
    status: AttendanceStatus;
    device?: string;
    notes?: string;
  };
}

export interface AttendanceRecord {
  uid: string; // RFID UID
  studentDbId?: string; // Key under /students/{studentDbId}
  studentUID?: string;
  rfidUID?: string;
  studentRfid?: string;
  authUid?: string;
  userId?: string;
  studentName?: string;
  studentId?: string; // Roll number
  rollNumber?: string;
  department?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  timestamp: number;
  status: AttendanceStatus;
  source?: string; // 'rfid_scanner' | 'admin_manual' | 'admin_edit' | 'admin_override' | 'migration'
  device?: string; // e.g., 'ESP32-RFID-01'
  notes?: string;

  // Manual Override System
  isOverridden?: boolean;
  overrideReason?: string;
  overrideBy?: string;
  overrideAt?: number;
  originalRecord?: {
    status: AttendanceStatus;
    time: string;
    timestamp: number;
    device?: string;
  };

  // Soft Delete & Trash
  isDeleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
  deleteReason?: string;

  // Edit History & Restoration
  previousEdits?: AttendanceEditHistory[];
  lastModifiedBy?: string;
  lastModifiedAt?: number;
}

export interface TrashAttendanceRecord extends AttendanceRecord {
  trashId: string;
  deletedAt: number;
  deletedBy: string;
  deleteReason?: string;
  originalPath: string;
}

export interface AuditActivityLog {
  id: string;
  action: 
    | 'EDIT_ATTENDANCE'
    | 'DELETE_ATTENDANCE'
    | 'DELETE_ATTENDANCE_BY_DATE'
    | 'RESTORE_ATTENDANCE'
    | 'OVERRIDE_ATTENDANCE'
    | 'REMOVE_OVERRIDE'
    | 'BULK_STATUS_CHANGE'
    | 'BULK_DELETE'
    | 'BULK_RESTORE'
    | 'SUSPEND_STUDENT'
    | 'UNSUSPEND_STUDENT'
    | 'UNDO_OPERATION'
    | 'DATABASE_MIGRATION'
    | 'STUDENT_UPDATE';
  studentRfid?: string;
  studentName?: string;
  studentId?: string;
  date?: string;
  adminEmail: string;
  adminUid: string;
  timestamp: number;
  timestampStr: string;
  reason?: string;
  details?: string;
  previousValues?: any;
  updatedValues?: any;
  affectedCount?: number;
}

export interface UndoAction {
  id: string;
  type: 'EDIT' | 'DELETE' | 'OVERRIDE' | 'BULK_DELETE' | 'BULK_EDIT' | 'REMOVE_OVERRIDE';
  description: string;
  timestamp: number;
  expiresAt: number; // now + 30000ms
  revertData: any;
  executed: boolean;
}

export interface WorkingDayConfig {
  date: string;
  isHoliday?: boolean;
  label?: string;
  updatedAt?: number;
}

export interface UnregisteredAttendanceGroup {
  uid: string;
  records: Record<string, AttendanceRecord>;
  recordCount: number;
  sampleName?: string;
}

export interface MigrationInspection {
  hasLegacyAttendance: boolean;
  legacyDateCount: number;
  legacyRecordCount: number;
  studentCount: number;
  alreadyUnifiedCount: number;
  unregisteredCount: number;
  unregisteredGroups: UnregisteredAttendanceGroup[];
  backupCount: number;
  migrationCompletedAt?: number;
  legacyKeysSample: string[];
  authenticatedUid?: string | null;
  isAuthorizedAdmin?: boolean;
  inspectionError?: string;
}

export interface MigrationRecordLog {
  uid: string;
  date: string;
  targetPath: string;
  action: 'migrated' | 'merged' | 'recovery' | 'failed';
  message?: string;
}

export type MigrationRunStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

export type MigrationPhase =
  | 'idle'
  | 'authenticating'
  | 'inspecting'
  | 'backing_up'
  | 'migrating_batch'
  | 'verifying_batch'
  | 'cleaning_legacy'
  | 'paused'
  | 'completed'
  | 'error';

export interface MigrationFailedItem {
  key: string;
  date: string;
  uid: string;
  targetPath: string;
  error: string;
}

export interface MigrationCheckpoint {
  version: string;
  status: MigrationRunStatus;
  backupPath?: string;
  backupVerifiedCount?: number;
  backupExpectedCount?: number;
  totalLegacyCount: number;
  processedCount: number;
  migratedCount: number;
  skippedCount: number;
  unregisteredCount: number;
  verifiedCount: number;
  failedCount: number;
  currentBatch: number;
  totalBatches: number;
  batchSize: number;
  completedKeys: Record<string, string>;
  failedItems: MigrationFailedItem[];
  startedAt?: number;
  lastCheckpointAt?: number;
  completedAt?: number;
}

export interface MigrationProgress {
  status: MigrationRunStatus;
  phase: MigrationPhase;
  totalLegacy: number;
  alreadyMigrated: number;
  pending: number;
  succeeded: number;
  failed: number;
  unregistered: number;
  currentBatch: number;
  totalBatches: number;
  batchSize: number;
  progressPercent: number;
  recordsPerSec: number;
  durationMs: number;
  lastCheckpointAt?: number;
  verificationStatus: 'pending' | 'verifying' | 'verified' | 'partial' | 'failed';
  backupPath?: string;
  message?: string;
  logs: MigrationRecordLog[];
}

export interface MigrationResult {
  success: boolean;
  paused?: boolean;
  message: string;
  adminUid?: string;
  backupPath?: string;
  backupVerifiedCount?: number;
  backupExpectedCount?: number;
  migratedCount: number;
  skippedDuplicateCount: number;
  alreadyMigratedCount?: number;
  unregisteredCount: number;
  verifiedCount: number;
  failedCount?: number;
  totalLegacyCount: number;
  legacyRemoved: boolean;
  durationMs?: number;
  recordsPerSec?: number;
  lastCheckpointAt?: number;
  failedOperation?: string;
  failedPath?: string;
  errors: string[];
  recordLogs?: MigrationRecordLog[];
}

export interface AutoMigrationStatus {
  status: 'idle' | 'migrating' | 'paused' | 'success' | 'error';
  message?: string;
  result?: MigrationResult;
  progress?: MigrationProgress;
  updatedAt?: number;
}

export interface DashboardAggregates {
  updatedAt: number;
  todayStr: string;
  totalActiveStudents: number;
  presentToday: number;
  explicitAbsentToday: number;
  pendingToday: number;
  absentToday: number;
  attendanceRate: number;
  totalHistoricalRecords: number;
  verifiedWorkingDays: number;
}

export interface AttendanceSettings {
  deadlineTime: string; // HH:mm in Asia/Kolkata, e.g. '10:30'
  updatedAt?: number;
  updatedBy?: string;
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
  pending?: number;
  isHoliday?: boolean;
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

export type DiagnosticSeverity = 'ok' | 'warning' | 'critical';

export type DiagnosticCategory =
  | 'permissions'
  | 'missing_profiles'
  | 'incorrect_roles'
  | 'missing_mappings'
  | 'ambiguous_mappings'
  | 'invalid_rfid'
  | 'incorrect_paths'
  | 'missing_attendance';

export interface DatabaseDiagnosticIssue {
  id: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  title: string;
  description: string;
  path?: string;
  studentDbId?: string;
  authUid?: string;
  rfidUID?: string;
  canAutoRepair?: boolean;
  repairAction?: string;
}

export interface UnlinkedUserProfileEntry {
  uid: string;
  email?: string;
  name?: string;
  role?: string;
  studentDbId?: string;
  rfidUID?: string;
  rollNumber?: string;
}

export interface DatabaseValidationReport {
  checkedAt: number;
  adminUid: string;
  adminEmail?: string | null;
  permissionChecks: Array<{
    path: string;
    operation: string;
    allowed: boolean;
    error?: string;
  }>;
  summary: {
    totalStudents: number;
    totalUserProfiles: number;
    totalAuthMappings: number;
    totalRfidMappings: number;
    missingUserProfiles: number;
    incorrectRoles: number;
    missingMappings: number;
    ambiguousMappings: number;
    invalidRfids: number;
    incorrectPaths: number;
    missingAttendanceIssues: number;
    permissionErrors: number;
  };
  issues: DatabaseDiagnosticIssue[];
  unlinkedUserProfiles: UnlinkedUserProfileEntry[];
}

export type LeaderboardPeriod = 'overall' | 'weekly' | 'monthly' | 'semester';

export type AchievementId =
  | 'perfect_attendance'
  | 'streak_7'
  | 'streak_30'
  | 'regular_student'
  | 'attendance_champion';

export interface AchievementBadge {
  id: AchievementId;
  title: string;
  description: string;
  icon: 'trophy' | 'flame' | 'star' | 'gem';
  criteriaLabel: string;
}

export interface LeaderboardEntry {
  studentDbId: string;
  rank: number;
  name: string;
  studentId: string; // Roll number
  avatar?: string;
  department: string;
  year: string;
  semester: string;
  presentDays: number;
  totalWorkingDays: number;
  absentDays: number;
  attendancePercentage: number;
  currentStreak: number;
  longestStreak: number;
  consistencyScore: number;
  regularityScore: number;
  achievements: AchievementBadge[];
  isTodayPresent?: boolean;
}

export interface LeaderboardSnapshot {
  period: LeaderboardPeriod;
  periodLabel: string;
  startDate: string;
  endDate: string;
  updatedAt: number;
  totalEligibleStudents: number;
  totalWorkingDays: number;
  entries: LeaderboardEntry[];
}

export interface LeaderboardHistoricalSnapshot {
  snapshotDate: string;
  updatedAt: number;
  period: LeaderboardPeriod;
  totalStudents: number;
  topEntries: LeaderboardEntry[];
}

export interface LeaderboardConfig {
  enabled: boolean;
  updatedAt?: number;
  updatedBy?: string;
}

