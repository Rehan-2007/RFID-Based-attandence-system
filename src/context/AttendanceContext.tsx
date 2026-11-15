import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Student,
  AttendanceRecord,
  DayStats,
  StudentAttendanceSummary,
  DeviceCommand,
  ResetAuditLog,
  StudentRegistrationInput,
  AttendanceStatus,
  StudentSuspension,
  AuditActivityLog,
  UndoAction,
  TrashAttendanceRecord,
  WorkingDayConfig,
  MigrationInspection,
  MigrationResult,
  MigrationProgress,
  MigrationCheckpoint,
  DashboardAggregates,
  AutoMigrationStatus,
  UnregisteredAttendanceGroup,
  DbDiagnosticState,
  LeaderboardPeriod,
  LeaderboardEntry,
  LeaderboardSnapshot,
  LeaderboardHistoricalSnapshot,
  LeaderboardConfig,
} from '../types';
import {
  subscribeToStudents,
  subscribeToWorkingDays,
  setWorkingDayStatus,
  syncWorkingDaysFromDates,
  computeApplicableWorkingDates,
  fetchDirectAttendance,
  reconcileAllStudentMappings,
  subscribeToConnectionStatus,
  subscribeToDeviceCommands,
  subscribeToLastReset,
  saveStudent as fbSaveStudent,
  deleteStudent as fbDeleteStudent,
  recordAttendanceScan,
  resetAttendanceData,
  completeSystemReset,
  registerStudentAccount,
  lookupStudentInfo,
  resolveStudentDbIdFromMap,
  classifyFirebaseError,
  normalizeAttendanceRecord,
  getFirebaseDatabase,
  subscribeToAuditLogs,
  subscribeToTrashRecords,
  subscribeToUnknownScans,
  subscribeToSuspensions,
  subscribeToStudentSuspensions,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  deleteAttendanceByDate as fbDeleteAttendanceByDate,
  bulkDeleteAttendance,
  bulkUpdateAttendanceStatus,
  restoreDeletedAttendance,
  restorePreviousAttendance,
  overrideAttendanceToAbsent,
  removeAttendanceOverride,
  suspendStudent,
  unsuspendStudent,
  checkAndReactivateExpiredSuspensions,
  executeUndoAction,
  inspectLegacyDatabase,
  subscribeToLegacyAttendanceChanges,
  exportCompleteDatabaseBackup,
  runUnifiedDatabaseMigration,
  pauseDatabaseMigration,
  isMigrationPausedRequested,
  getMigrationCheckpoint,
  retryFailedMigrationRecords,
  computeDashboardAggregates,
  rebuildAndVerifyAggregates,
  dedupeInFlight,
  subscribeToMigrationRecovery,
  assignRecoveredAttendanceToStudent,
  deleteRecoveredAttendance,
  DEFAULT_ATTENDANCE_DEADLINE,
  subscribeToAttendanceSettings,
  saveAttendanceSettings,
  subscribeToLeaderboardConfig,
  saveLeaderboardConfig,
  subscribeToLeaderboardSnapshots,
  subscribeToLeaderboardHistory,
  syncLeaderboardSnapshotsToRtdb,
} from '../services/firebase';
import { ref, get, onValue, off, DataSnapshot } from 'firebase/database';
import { useAuth } from './AuthContext';
import {
  getISTDateStr,
  getISTTimeStr,
  getPastISTDates,
  isAfterISTDeadline,
  isValidDeadlineHHMM,
  normalizeToISODate,
} from '../utils/dateUtils';
import {
  computeLeaderboardSnapshot,
  computeLeaderboardSignature,
  mergeStudentLiveEntryIntoSnapshot,
} from '../utils/leaderboardUtils';

interface LiveScanEvent {
  record: AttendanceRecord;
  success: boolean;
  message: string;
}

interface AttendanceContextType {
  students: Record<string, Student>;
  studentsList: Student[];
  todayAttendance: Record<string, AttendanceRecord>;
  todayRecordsList: AttendanceRecord[];
  allAttendance: Record<string, Record<string, AttendanceRecord>>;
  unknownScans: AttendanceRecord[];
  workingDays: Record<string, WorkingDayConfig>;
  applicableWorkingDates: string[];

  // Dashboard Metrics (Calculated strictly from unified students/*/attendance records)
  todayStr: string;
  attendanceDeadline: string;
  isAfterDeadline: boolean;
  isTodayHoliday: boolean;
  totalStudentsCount: number;
  presentTodayCount: number;
  absentTodayCount: number;
  pendingTodayCount: number;
  todayPercentage: number;
  weeklyStats: DayStats[];
  monthlyStats: DayStats[];
  updateAttendanceDeadline: (deadlineTime: string) => Promise<{ success: boolean; message: string }>;

  // Telemetry & Refresh
  isLoading: boolean;
  isDbConnected: boolean;
  isRefreshing: boolean;
  lastSyncedAt: number | null;
  dbErrorMessage: string | null;
  dbDiagnostic: DbDiagnosticState;
  lastLiveEvent: LiveScanEvent | null;
  clearLastLiveEvent: () => void;

  // System Reset Telemetry
  lastResetLog: ResetAuditLog | null;
  latestDeviceCommand: DeviceCommand | null;

  // Admin Attendance Control & Audit
  trashRecords: TrashAttendanceRecord[];
  auditLogs: AuditActivityLog[];
  suspensions: Record<string, StudentSuspension[]>;
  activeUndo: UndoAction | null;
  undoTimeRemaining: number;
  triggerUndo: () => Promise<{ success: boolean; message: string }>;
  dismissUndo: () => void;

  // Migration & Holiday Calendar Controls
  migrationInspection: MigrationInspection | null;
  migrationProgress: MigrationProgress | null;
  migrationCheckpoint: MigrationCheckpoint | null;
  dashboardAggregates: DashboardAggregates;
  autoMigrationStatus: AutoMigrationStatus;
  dismissAutoMigrationStatus: () => void;
  unregisteredRecovery: UnregisteredAttendanceGroup[];
  toggleHolidayDate: (date: string, isHoliday: boolean, label?: string) => Promise<void>;
  refreshMigrationInspection: () => Promise<MigrationInspection | null>;
  executeDatabaseMigration: (options?: { batchSize?: number; resume?: boolean }) => Promise<MigrationResult>;
  pauseMigration: () => void;
  resumeMigration: (batchSize?: number) => Promise<MigrationResult>;
  retryFailedMigration: (batchSize?: number) => Promise<MigrationResult>;
  rebuildVerifiedAggregates: () => Promise<DashboardAggregates>;
  downloadDatabaseBackup: () => Promise<{
    backupPath: string;
    filename: string;
    verifiedRecordCount: number;
    expectedRecordCount: number;
  }>;
  assignRecoveredRecords: (
    unregisteredUid: string,
    targetStudentUid: string
  ) => Promise<{ success: boolean; assignedCount: number }>;
  dismissRecoveredRecords: (unregisteredUid: string) => Promise<void>;

  // Admin Operations
  editAttendance: (
    date: string,
    uid: string,
    updates: { date?: string; time?: string; status?: AttendanceStatus; notes?: string; device?: string },
    reason: string
  ) => Promise<{ success: boolean; message: string }>;
  deleteAttendance: (
    date: string,
    uid: string,
    reason: string
  ) => Promise<{ success: boolean; message: string }>;
  deleteAttendanceByDate: (
    date: string,
    reason?: string
  ) => Promise<{ success: boolean; date: string; deletedCount: number; message: string }>;
  bulkDeleteAttendanceRecords: (
    records: Array<{ date: string; uid: string; studentName?: string }>,
    reason: string
  ) => Promise<{ success: boolean; count: number; message: string }>;
  bulkUpdateStatus: (
    records: Array<{ date: string; uid: string; studentName?: string }>,
    newStatus: AttendanceStatus,
    reason: string
  ) => Promise<{ success: boolean; count: number; message: string }>;
  restoreTrashRecord: (trashId: string) => Promise<{ success: boolean; message: string }>;
  restoreVersion: (date: string, uid: string, versionIndex: number) => Promise<{ success: boolean; message: string }>;
  overrideToAbsent: (date: string, uid: string, reason: string) => Promise<{ success: boolean; message: string }>;
  removeOverride: (date: string, uid: string) => Promise<{ success: boolean; message: string }>;
  suspendStudentAccount: (
    studentRfid: string,
    duration: '1_day' | '1_week' | '1_month' | 'custom',
    startDate: string,
    endDate: string,
    reason: string
  ) => Promise<{ success: boolean; message: string }>;
  unsuspendStudentAccount: (studentRfid: string, reason: string) => Promise<{ success: boolean; message: string }>;

  // Student & Scan Actions
  addOrUpdateStudent: (student: Student) => Promise<void>;
  createStudentAccount: (input: StudentRegistrationInput) => Promise<{ authUid: string; student: Student }>;
  deleteStudent: (uid: string) => Promise<void>;
  scanRfidCard: (uid: string, device?: string) => Promise<{ success: boolean; message: string; record?: AttendanceRecord }>;
  getStudentAttendanceSummary: (uid: string) => StudentAttendanceSummary;
  triggerAttendanceReset: (adminUid: string, adminEmail: string) => Promise<{ success: boolean; message: string }>;
  triggerCompleteSystemReset: (adminUid: string, adminEmail: string) => Promise<{ success: boolean; message: string; commandId: string }>;
  retryConnection: () => Promise<void>;
  refreshAttendance: () => Promise<{ success: boolean; count: number; message: string }>;

  // Attendance Leaderboard & Regularity Ranking
  leaderboardEnabled: boolean;
  leaderboardConfig: LeaderboardConfig;
  leaderboardSnapshots: Record<LeaderboardPeriod, LeaderboardSnapshot>;
  leaderboardHistory: LeaderboardHistoricalSnapshot[];
  getLeaderboardForPeriod: (period: LeaderboardPeriod) => LeaderboardSnapshot;
  toggleLeaderboardEnabled: (enabled: boolean) => Promise<{ success: boolean; message: string }>;
  myLeaderboardStats: LeaderboardEntry | null;
  getStudentLeaderboardStats: (studentDbIdOrUid: string, period?: LeaderboardPeriod) => LeaderboardEntry | null;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

export const AttendanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, refreshToken } = useAuth();
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [workingDays, setWorkingDays] = useState<Record<string, WorkingDayConfig>>({});
  const [unknownScans, setUnknownScans] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [dbDiagnostic, setDbDiagnostic] = useState<DbDiagnosticState>({
    code: 'connecting',
    label: 'SYNCING',
    message: 'Connecting to Firebase Realtime Database...',
  });
  const [lastLiveEvent, setLastLiveEvent] = useState<LiveScanEvent | null>(null);
  const [lastResetLog, setLastResetLog] = useState<ResetAuditLog | null>(null);
  const [latestDeviceCommand, setLatestDeviceCommand] = useState<DeviceCommand | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [attendanceDeadline, setAttendanceDeadline] = useState<string>(DEFAULT_ATTENDANCE_DEADLINE);
  const [todayStr, setTodayStr] = useState<string>(() => getISTDateStr());
  const [clockTick, setClockTick] = useState<number>(() => Date.now());

  const dbErrorRef = React.useRef<string | null>(null);
  const wasDisconnectedRef = React.useRef<boolean>(false);

  // Admin Attendance Control & Audit states
  const [trashRecords, setTrashRecords] = useState<TrashAttendanceRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditActivityLog[]>([]);
  const [suspensions, setSuspensions] = useState<Record<string, StudentSuspension[]>>({});
  const [activeUndo, setActiveUndo] = useState<UndoAction | null>(null);
  const [undoTimeRemaining, setUndoTimeRemaining] = useState<number>(0);

  // Migration & Recovery states
  const [migrationInspection, setMigrationInspection] = useState<MigrationInspection | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [migrationCheckpoint, setMigrationCheckpoint] = useState<MigrationCheckpoint | null>(null);
  const [autoMigrationStatus, setAutoMigrationStatus] = useState<AutoMigrationStatus>({ status: 'idle' });
  const [unregisteredRecovery, setUnregisteredRecovery] = useState<UnregisteredAttendanceGroup[]>([]);

  // Attendance Leaderboard states
  const [leaderboardConfig, setLeaderboardConfig] = useState<LeaderboardConfig>({ enabled: true });
  const [rtdbLeaderboardSnapshots, setRtdbLeaderboardSnapshots] = useState<
    Partial<Record<LeaderboardPeriod, LeaderboardSnapshot>>
  >({});
  const [leaderboardHistory, setLeaderboardHistory] = useState<LeaderboardHistoricalSnapshot[]>([]);

  const autoMigrationInFlightRef = React.useRef<boolean>(false);
  const lastAutoMigrationSigRef = React.useRef<string>('');
  const authLinksSyncedRef = React.useRef<boolean>(false);
  const migrationProgressRef = React.useRef<MigrationProgress | null>(null);
  const syncedDatesSetRef = React.useRef<Set<string>>(new Set());
  const lastLeaderboardSyncSigRef = React.useRef<string>('');
  // Incremental WeakMap cache: only newly changed Student objects re-run normalizeAttendanceRecord
  const normalizedAttendanceCacheRef = React.useRef<WeakMap<Student, Record<string, AttendanceRecord>>>(
    new WeakMap()
  );

  const dismissAutoMigrationStatus = useCallback(() => {
    setAutoMigrationStatus({ status: 'idle' });
  }, []);

  // 30-Second live countdown timer for undo action
  useEffect(() => {
    if (!activeUndo) return;
    const interval = setInterval(() => {
      setUndoTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setActiveUndo(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeUndo]);

  const retryConnection = useCallback(async () => {
    setIsLoading(true);
    dbErrorRef.current = null;
    setDbErrorMessage(null);
    try {
      await refreshToken();
    } catch {
      // Ignore
    }
    setRetryTrigger((prev) => prev + 1);
  }, [refreshToken]);

  // Automatic midnight IST rollover & 30-second deadline clock tick
  useEffect(() => {
    const syncClock = () => {
      const nextToday = getISTDateStr();
      setTodayStr((prev) => (prev !== nextToday ? nextToday : prev));
      setClockTick(Date.now());
    };
    const interval = setInterval(syncClock, 30000);
    window.addEventListener('focus', syncClock);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', syncClock);
    };
  }, []);

  // Derive allAttendance & todayAttendance incrementally from unified students/{studentDbId}/attendance/{DATE}
  // Using a WeakMap keyed by Student reference guarantees O(1) reuse for all unaffected students on live scans.
  const { allAttendance, todayAttendance } = useMemo(() => {
    const allMap: Record<string, Record<string, AttendanceRecord>> = {};
    const todayMap: Record<string, AttendanceRecord> = {};
    const cache = normalizedAttendanceCacheRef.current;

    // Ensure non-holiday working_days entries exist in allMap keys for consistent working day counts
    Object.entries(workingDays || {}).forEach(([dateKey, cfg]) => {
      if (cfg && !cfg.isHoliday && dateKey <= todayStr && !allMap[dateKey]) {
        allMap[dateKey] = {};
      }
    });

    Object.entries(students || {}).forEach(([dbKey, st]) => {
      if (!st || !st.attendance) return;
      const studentDbId = (st.studentDbId || dbKey).trim();

      let perDateNorm = cache.get(st);
      if (!perDateNorm) {
        perDateNorm = {};
        const cardUid = (st.rfidUID || st.uid || dbKey).trim().toUpperCase();
        Object.entries(st.attendance).forEach(([dateKey, rawRec]) => {
          if (!rawRec || rawRec.isDeleted) return;
          perDateNorm![dateKey] = normalizeAttendanceRecord(
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
        cache.set(st, perDateNorm);
      }

      Object.entries(perDateNorm).forEach(([dateKey, rec]) => {
        if (!allMap[dateKey]) allMap[dateKey] = {};
        allMap[dateKey][studentDbId] = rec;
        if (dateKey === todayStr) {
          todayMap[studentDbId] = rec;
        }
      });
    });

    return { allAttendance: allMap, todayAttendance: todayMap };
  }, [students, workingDays, todayStr]);

  // Listen to unified Firebase Realtime Database structure for Authenticated Admin or Student
  useEffect(() => {
    if (!user) {
      setStudents({});
      setWorkingDays({});
      setUnknownScans([]);
      setTrashRecords([]);
      setAuditLogs([]);
      setSuspensions({});
      setMigrationInspection(null);
      setMigrationProgress(null);
      setMigrationCheckpoint(null);
      setAutoMigrationStatus({ status: 'idle' });
      setUnregisteredRecovery([]);
      setRtdbLeaderboardSnapshots({});
      setLeaderboardHistory([]);
      setIsLoading(false);
      setIsDbConnected(false);
      setLastSyncedAt(null);
      dbErrorRef.current = null;
      lastAutoMigrationSigRef.current = '';
      lastLeaderboardSyncSigRef.current = '';
      authLinksSyncedRef.current = false;
      syncedDatesSetRef.current.clear();
      migrationProgressRef.current = null;
      setDbErrorMessage(null);
      setDbDiagnostic({
        code: 'connecting',
        label: 'SYNCING',
        message: 'Awaiting authentication...',
      });
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    dbErrorRef.current = null;
    setDbErrorMessage(null);
    setDbDiagnostic({
      code: 'connecting',
      label: 'SYNCING',
      message: 'Connecting to Firebase Realtime Database...',
    });

    const unsubscribeConn = subscribeToConnectionStatus((connected) => {
      if (!isMounted) return;
      if (connected) {
        setIsDbConnected(!dbErrorRef.current);
        if (wasDisconnectedRef.current) {
          wasDisconnectedRef.current = false;
          // Active child/value listeners auto-sync on RTDB reconnect; only do full fallback fetch if needed
          if (dbErrorRef.current) {
            dedupeInFlight(`reconnect_resync_${user.uid}`, () =>
              fetchDirectAttendance({
                role: user.role,
                uid: user.uid,
                studentDbId: user.studentDbId,
                studentId: user.studentId || user.rollNumber,
                rollNumber: user.studentId || user.rollNumber,
                rfidUID: user.rfidUID,
                email: user.email,
                displayName: user.displayName,
              })
            )
              .then((res) => {
                if (!isMounted) return;
                if (res.workingDays) setWorkingDays(res.workingDays);
                if (user.role === 'student' && res.studentNode) {
                  const dbKey = (res.studentNode.studentDbId || user.studentDbId || res.studentNode.uid || '').trim();
                  if (dbKey) {
                    setStudents({
                      [dbKey]: { ...res.studentNode, studentDbId: dbKey },
                    });
                  }
                }
                dbErrorRef.current = null;
                setDbErrorMessage(null);
                setIsDbConnected(true);
                setLastSyncedAt(Date.now());
              })
              .catch((err) => {
                if (!isMounted) return;
                const diag = classifyFirebaseError(err);
                dbErrorRef.current = diag.message;
                setDbErrorMessage(diag.message);
                setDbDiagnostic(diag);
                setIsDbConnected(false);
              });
          } else {
            setLastSyncedAt(Date.now());
          }
        }
      } else {
        wasDisconnectedRef.current = true;
        setIsDbConnected(false);
        if (!dbErrorRef.current) {
          setDbDiagnostic({
            code: 'disconnected',
            label: 'OFFLINE',
            message: 'Firebase Realtime Database is disconnected. Check internet connectivity.',
          });
        }
      }
    });

    const unsubs: (() => void)[] = [];

    // Shared attendance settings (deadlineTime in IST)
    unsubs.push(
      subscribeToAttendanceSettings((settings) => {
        if (settings?.deadlineTime && isValidDeadlineHHMM(settings.deadlineTime)) {
          setAttendanceDeadline(settings.deadlineTime);
        } else {
          setAttendanceDeadline(DEFAULT_ATTENDANCE_DEADLINE);
        }
      })
    );

    // Shared working_days listener
    unsubs.push(
      subscribeToWorkingDays(
        (wd) => {
          setWorkingDays(wd || {});
          setLastSyncedAt(Date.now());
        },
        (err) => {
          console.warn('Working days listener error:', err?.message);
        }
      )
    );

    // Shared Leaderboard Config listener (snapshots & history attach conditionally in dedicated effect)
    unsubs.push(
      subscribeToLeaderboardConfig((cfg) => {
        if (isMounted) setLeaderboardConfig(cfg);
      })
    );

    if (user.role === 'admin') {
      unsubs.push(subscribeToDeviceCommands((cmd) => setLatestDeviceCommand(cmd)));
      unsubs.push(subscribeToLastReset((log) => setLastResetLog(log)));
      unsubs.push(subscribeToAuditLogs((logs) => setAuditLogs(logs)));
      unsubs.push(subscribeToTrashRecords((records) => setTrashRecords(records)));
      unsubs.push(subscribeToSuspensions((suspMap) => setSuspensions(suspMap)));
      unsubs.push(subscribeToMigrationRecovery((groups) => setUnregisteredRecovery(groups)));

      // Bounded & indexed unknown scans listener (top 100 latest)
      unsubs.push(
        subscribeToUnknownScans((list) => {
          if (isMounted) setUnknownScans(list);
        })
      );

      checkAndReactivateExpiredSuspensions().catch(() => {});

      // Inspect legacy, backup & checkpoint state on initialization
      Promise.all([inspectLegacyDatabase().catch(() => null), getMigrationCheckpoint().catch(() => null)]).then(
        ([insp, cp]) => {
          if (!isMounted) return;
          if (insp) setMigrationInspection(insp);
          setMigrationCheckpoint(cp);
          if (cp && cp.status === 'paused') {
            setAutoMigrationStatus({
              status: 'paused',
              message: `Migration paused at checkpoint (${cp.migratedCount + cp.skippedCount}/${cp.totalLegacyCount} processed). Resume anytime.`,
              updatedAt: Date.now(),
            });
          }
        }
      );

      // Real-time automatic legacy /attendance listener -> auto-backups, migrates in batches, verifies, & cleans up
      unsubs.push(
        subscribeToLegacyAttendanceChanges(
          async (info) => {
            if (!isMounted) return;
            if (!info.hasLegacy || info.recordCount === 0) {
              lastAutoMigrationSigRef.current = '';
              if (!autoMigrationInFlightRef.current) {
                inspectLegacyDatabase()
                  .then((insp) => {
                    if (isMounted) setMigrationInspection(insp);
                  })
                  .catch(() => {});
              }
              return;
            }

            if (
              autoMigrationInFlightRef.current ||
              lastAutoMigrationSigRef.current === info.signature ||
              isMigrationPausedRequested()
            ) {
              return;
            }

            const existingCheckpoint = await getMigrationCheckpoint().catch(() => null);
            if (!isMounted) return;
            if (existingCheckpoint) setMigrationCheckpoint(existingCheckpoint);
            if (existingCheckpoint?.status === 'paused') {
              return;
            }

            autoMigrationInFlightRef.current = true;
            lastAutoMigrationSigRef.current = info.signature;
            setAutoMigrationStatus({
              status: 'migrating',
              message: `Detected ${info.recordCount} legacy attendance record${info.recordCount === 1 ? '' : 's'} at /attendance. Backing up and migrating in high-speed batches...`,
              updatedAt: Date.now(),
            });

            try {
              const res = await runUnifiedDatabaseMigration(
                { email: user.email, uid: user.uid },
                {
                  resume: true,
                  onProgress: (progress) => {
                    if (!isMounted) return;
                    migrationProgressRef.current = progress;
                    setMigrationProgress(progress);
                    setAutoMigrationStatus({
                      status:
                        progress.status === 'paused'
                          ? 'paused'
                          : progress.status === 'error'
                            ? 'error'
                            : progress.status === 'completed'
                              ? 'success'
                              : 'migrating',
                      message: progress.message,
                      progress,
                      updatedAt: Date.now(),
                    });
                  },
                }
              );
              if (!isMounted) return;
              const [insp, cp] = await Promise.all([
                inspectLegacyDatabase().catch(() => null),
                getMigrationCheckpoint().catch(() => null),
              ]);
              if (isMounted) {
                if (insp) setMigrationInspection(insp);
                setMigrationCheckpoint(cp);
                setAutoMigrationStatus({
                  status: res.paused ? 'paused' : res.success ? 'success' : 'error',
                  message: res.message,
                  result: res,
                  progress: migrationProgressRef.current || undefined,
                  updatedAt: Date.now(),
                });
              }
            } catch (err: any) {
              if (!isMounted) return;
              setAutoMigrationStatus({
                status: 'error',
                message: err?.message || 'Automatic migration failed.',
                updatedAt: Date.now(),
              });
            } finally {
              autoMigrationInFlightRef.current = false;
            }
          },
          (err) => {
            console.warn('Legacy attendance watcher error:', err?.message);
          }
        )
      );

      // Incremental unified Admin listener on /students (preserves object identity of untouched students)
      unsubs.push(
        subscribeToStudents(
          (data, delta) => {
            if (!isMounted) return;
            dbErrorRef.current = null;
            setDbErrorMessage(null);
            setIsDbConnected(true);
            setLastSyncedAt(Date.now());

            const hasStudents = Boolean(data && Object.keys(data).length > 0);
            setStudents(hasStudents ? data : {});

            if (hasStudents) {
              setDbDiagnostic({
                code: 'connected',
                label: 'SYNCED',
                message: 'Live real-time sync active across student directory and attendance.',
              });

              if (!authLinksSyncedRef.current) {
                authLinksSyncedRef.current = true;
                reconcileAllStudentMappings(data).catch(() => {});
              }

              // Sync only newly discovered dates instead of re-scanning all students on every single scan
              const newlyDiscoveredDates: string[] = [];
              if (delta && (delta.type === 'added' || delta.type === 'changed') && delta.student?.attendance) {
                Object.keys(delta.student.attendance).forEach((d) => {
                  if (!syncedDatesSetRef.current.has(d)) {
                    syncedDatesSetRef.current.add(d);
                    newlyDiscoveredDates.push(d);
                  }
                });
              } else if (!delta || delta.type === 'initial') {
                Object.values(data).forEach((st) => {
                  if (!st?.attendance) return;
                  Object.keys(st.attendance).forEach((d) => {
                    if (!syncedDatesSetRef.current.has(d)) {
                      syncedDatesSetRef.current.add(d);
                      newlyDiscoveredDates.push(d);
                    }
                  });
                });
              }
              if (newlyDiscoveredDates.length > 0) {
                syncWorkingDaysFromDates(newlyDiscoveredDates).catch(() => {});
              }
            } else {
              setDbDiagnostic({
                code: 'empty_records',
                label: 'SYNCED',
                message: 'Connected to Firebase. No students are registered in the database yet.',
              });
            }
            setIsLoading(false);
          },
          (error) => {
            if (!isMounted) return;
            console.warn('Realtime Database unified students listener error:', error);
            const diag = classifyFirebaseError(error, 'Error connecting to /students node');
            dbErrorRef.current = diag.message;
            setDbErrorMessage(diag.message);
            setDbDiagnostic(diag);
            setIsDbConnected(false);
            setIsLoading(false);
          }
        )
      );
    } else if (user.role === 'student') {
      const attachStudentListeners = (studentDbId: string, cardRfidHint?: string) => {
        const studentRoll = (user.studentId || user.rollNumber || '').trim();
        const studentAuthUid = user.uid;
        const fallbackRfid = (cardRfidHint || user.rfidUID || studentDbId).trim().toUpperCase();

        const fallbackSelf: Student = {
          studentDbId,
          uid: fallbackRfid,
          rfidUID: fallbackRfid,
          name: user.displayName || 'Student',
          studentId: studentRoll || 'STU-000',
          department: user.department || 'General',
          year: user.year || '',
          semester: user.semester || 'Semester 1',
          email: user.email || '',
          phone: user.phone || '',
          registeredAt: new Date().toISOString(),
          status: 'active',
          authUid: studentAuthUid,
        };

        try {
          const db = getFirebaseDatabase();
          const studentRef = ref(db, `students/${studentDbId}`);
          const unsubSelf = onValue(
            studentRef,
            (snapshot: DataSnapshot) => {
              if (!isMounted) return;
              if (snapshot.exists()) {
                const val = snapshot.val() as Student;
                const activeRfid = (val.rfidUID || val.uid || fallbackRfid).trim().toUpperCase();
                setStudents({
                  [studentDbId]: {
                    ...fallbackSelf,
                    ...val,
                    studentDbId,
                    rfidUID: activeRfid,
                    uid: activeRfid,
                  },
                });
                const attEntries = Object.values(val.attendance || {}).filter((r) => r && !r.isDeleted);
                dbErrorRef.current = null;
                setDbErrorMessage(null);
                setIsDbConnected(true);
                setDbDiagnostic(
                  attEntries.length === 0
                    ? {
                        code: 'empty_records',
                        label: 'SYNCED',
                        message: 'Connected to Firebase. No attendance records have been recorded yet.',
                      }
                    : {
                        code: 'connected',
                        label: 'SYNCED',
                        message: 'Live real-time sync active on your student attendance node.',
                      }
                );
              } else {
                setStudents({});
                const msg = `Student record not registered at /students/${studentDbId}. Contact your administrator.`;
                dbErrorRef.current = msg;
                setDbErrorMessage(msg);
                setIsDbConnected(true);
                setDbDiagnostic({
                  code: 'not_registered',
                  label: 'UNREGISTERED',
                  message: msg,
                  path: `/students/${studentDbId}`,
                });
              }
              setIsLoading(false);
              setLastSyncedAt(Date.now());
            },
            (err: any) => {
              if (!isMounted) return;
              const diag = classifyFirebaseError(err);
              const detailedMsg = `[${diag.label}] Listener failed at "/students/${studentDbId}": ${diag.message}`;
              console.warn(detailedMsg);
              dbErrorRef.current = detailedMsg;
              setDbErrorMessage(detailedMsg);
              setDbDiagnostic({ ...diag, message: detailedMsg, path: `/students/${studentDbId}` });
              setIsDbConnected(false);
              setIsLoading(false);
            }
          );
          unsubs.push(() => off(studentRef, 'value', unsubSelf));

          // Also subscribe to student's own suspension history node (/suspensions/{studentDbId})
          unsubs.push(
            subscribeToStudentSuspensions(studentDbId, (list) => {
              if (isMounted) {
                setSuspensions({ [studentDbId]: list });
              }
            })
          );
        } catch (err: any) {
          if (isMounted) {
            const diag = classifyFirebaseError(err);
            dbErrorRef.current = diag.message;
            setDbErrorMessage(diag.message);
            setDbDiagnostic(diag);
            setIsDbConnected(false);
            setIsLoading(false);
          }
        }
      };

      const resolvedStudentDbId = (user.studentDbId || '').trim();
      const resolvedCardRfid = (user.rfidUID || resolvedStudentDbId).trim().toUpperCase();

      if (resolvedStudentDbId) {
        attachStudentListeners(resolvedStudentDbId, resolvedCardRfid);
      } else {
        // Dynamically resolve mapping via /auth_to_student/{authUid} and /users/{authUid}
        (async () => {
          try {
            const db = getFirebaseDatabase();
            const [mapSnap, userSnap] = await Promise.all([
              get(ref(db, `auth_to_student/${user.uid}`)),
              get(ref(db, `users/${user.uid}`)),
            ]);
            if (!isMounted) return;
            const mapVal = mapSnap.exists() ? mapSnap.val() : null;
            const userVal = userSnap.exists() ? userSnap.val() : null;
            const mapDbId = typeof mapVal === 'string' ? mapVal : mapVal?.studentDbId;
            const mapRfid = typeof mapVal === 'string' ? '' : mapVal?.rfidUID;
            const foundDbId = (mapDbId || userVal?.studentDbId || mapRfid || userVal?.rfidUID || '').trim();
            const foundRfid = (mapRfid || userVal?.rfidUID || foundDbId).trim().toUpperCase();

            if (foundDbId) {
              attachStudentListeners(foundDbId, foundRfid);
            } else {
              const msg = `Student mapping missing for account "${user.email || user.uid}". Ask an administrator to link your Student Database ID and RFID Card.`;
              dbErrorRef.current = msg;
              setDbErrorMessage(msg);
              setDbDiagnostic({
                code: 'mapping_missing',
                label: 'UNMAPPED',
                message: msg,
                path: `/auth_to_student/${user.uid}`,
              });
              setIsDbConnected(false);
              setIsLoading(false);
            }
          } catch (err: any) {
            if (!isMounted) return;
            const diag = classifyFirebaseError(err);
            dbErrorRef.current = diag.message;
            setDbErrorMessage(diag.message);
            setDbDiagnostic({
              ...diag,
              path: `/auth_to_student/${user.uid}`,
            });
            setIsDbConnected(false);
            setIsLoading(false);
          }
        })();
      }
    }

    return () => {
      isMounted = false;
      unsubscribeConn();
      unsubs.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
    };
  }, [user, todayStr, refreshToken, retryTrigger]);

  // Periodic check to reactivate expired suspensions
  useEffect(() => {
    if (user?.role !== 'admin') return;
    const interval = setInterval(() => {
      checkAndReactivateExpiredSuspensions().catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // Students list derived strictly from students state
  const studentsList = useMemo(() => {
    return Object.values(students).sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  // Shared Total Applicable Working Days (excludes holidays & future dates)
  const applicableWorkingDates = useMemo(() => {
    return computeApplicableWorkingDates(allAttendance, workingDays, todayStr);
  }, [allAttendance, workingDays, todayStr]);

  // Today records sorted by actual timestamp descending (strictly deduplicated by studentDbId/UID, excluding deleted)
  const todayRecordsList = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    Object.values(todayAttendance).forEach((rec) => {
      if (rec.isDeleted) return;
      const key = (rec.studentDbId || rec.rfidUID || rec.uid || '').trim();
      if (key && !map.has(key)) {
        map.set(key, rec);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [todayAttendance]);

  // Active registered students only (excludes inactive & currently suspended students)
  const activeStudentsList = useMemo(() => {
    return studentsList.filter(
      (s) =>
        s.status === 'active' &&
        !s.isSuspended &&
        !(s.activeSuspension && s.activeSuspension.status === 'active')
    );
  }, [studentsList]);

  const activeDbIdSet = useMemo(() => {
    const set = new Set<string>();
    activeStudentsList.forEach((s) => {
      const dbId = (s.studentDbId || '').trim();
      const rfid = (s.rfidUID || s.uid || '').trim().toUpperCase();
      if (dbId) set.add(dbId);
      if (rfid) set.add(rfid);
    });
    return set;
  }, [activeStudentsList]);

  const totalStudentsCount = activeStudentsList.length;

  const isTodayHoliday = useMemo(() => {
    return Boolean(workingDays[todayStr]?.isHoliday);
  }, [workingDays, todayStr]);

  const isAfterDeadline = useMemo(() => {
    return isAfterISTDeadline(attendanceDeadline, clockTick);
  }, [attendanceDeadline, clockTick]);

  const dashboardAggregates = useMemo(
    () =>
      computeDashboardAggregates({
        studentsMap: students,
        workingDays,
        todayStr,
        isAfterDeadline,
      }),
    [students, workingDays, todayStr, isAfterDeadline]
  );

  const presentTodayCount = dashboardAggregates.presentToday;
  const pendingTodayCount = dashboardAggregates.pendingToday;
  const absentTodayCount = dashboardAggregates.absentToday;
  const todayPercentage = dashboardAggregates.attendanceRate;

  // Weekly Stats (last 7 IST days, respecting holidays & today's pending window)
  const weeklyStats: DayStats[] = useMemo(() => {
    const pastDates = getPastISTDates(7, todayStr);
    const totalCount = Math.max(totalStudentsCount, 1);

    return pastDates.map(({ date: dateKey, dayName }) => {
      const isHoliday = Boolean(workingDays[dateKey]?.isHoliday);
      let dayPresent = 0;
      let dayExplicitAbsent = 0;

      if (!isHoliday) {
        const dayMap = dateKey === todayStr ? todayAttendance : allAttendance[dateKey] || {};
        Object.entries(dayMap).forEach(([key, rec]) => {
          const cleanKey = key.trim();
          if (!rec || rec.isDeleted || (!activeDbIdSet.has(cleanKey) && !activeDbIdSet.has(cleanKey.toUpperCase()))) return;
          if (rec.status === 'Present') dayPresent++;
          else if (rec.status === 'Absent') dayExplicitAbsent++;
        });
      }

      const dayPending =
        dateKey === todayStr && !isHoliday && !isAfterDeadline
          ? Math.max(0, totalStudentsCount - dayPresent - dayExplicitAbsent)
          : 0;
      const calculatedAbsent = isHoliday
        ? dayExplicitAbsent
        : dateKey === todayStr && !isAfterDeadline
          ? dayExplicitAbsent
          : Math.max(dayExplicitAbsent, totalStudentsCount - dayPresent);
      const percentage =
        !isHoliday && totalStudentsCount > 0 ? Math.round((dayPresent / totalStudentsCount) * 100) : 0;

      return {
        date: dateKey,
        dayName,
        present: dayPresent,
        absent: calculatedAbsent,
        pending: dayPending,
        isHoliday,
        total: totalCount,
        percentage,
      };
    });
  }, [allAttendance, todayAttendance, workingDays, todayStr, totalStudentsCount, activeDbIdSet, isAfterDeadline]);

  // Monthly Stats (last 30 IST days, respecting holidays & today's pending window)
  const monthlyStats: DayStats[] = useMemo(() => {
    const pastDates = getPastISTDates(30, todayStr);
    const totalCount = Math.max(totalStudentsCount, 1);

    return pastDates.map(({ date: dateKey, shortLabel }) => {
      const isHoliday = Boolean(workingDays[dateKey]?.isHoliday);
      let dayPresent = 0;
      let dayExplicitAbsent = 0;

      if (!isHoliday) {
        const dayMap = dateKey === todayStr ? todayAttendance : allAttendance[dateKey] || {};
        Object.entries(dayMap).forEach(([key, rec]) => {
          const cleanKey = key.trim();
          if (!rec || rec.isDeleted || (!activeDbIdSet.has(cleanKey) && !activeDbIdSet.has(cleanKey.toUpperCase()))) return;
          if (rec.status === 'Present') dayPresent++;
          else if (rec.status === 'Absent') dayExplicitAbsent++;
        });
      }

      const dayPending =
        dateKey === todayStr && !isHoliday && !isAfterDeadline
          ? Math.max(0, totalStudentsCount - dayPresent - dayExplicitAbsent)
          : 0;
      const calculatedAbsent = isHoliday
        ? dayExplicitAbsent
        : dateKey === todayStr && !isAfterDeadline
          ? dayExplicitAbsent
          : Math.max(dayExplicitAbsent, totalStudentsCount - dayPresent);
      const percentage =
        !isHoliday && totalStudentsCount > 0 ? Math.round((dayPresent / totalStudentsCount) * 100) : 0;

      return {
        date: dateKey,
        dayName: shortLabel,
        present: dayPresent,
        absent: calculatedAbsent,
        pending: dayPending,
        isHoliday,
        total: totalCount,
        percentage,
      };
    });
  }, [allAttendance, todayAttendance, workingDays, todayStr, totalStudentsCount, activeDbIdSet, isAfterDeadline]);

  // Student CRUD
  const addOrUpdateStudent = useCallback(
    async (student: Student) => {
      const formattedUid = (student.rfidUID || student.uid).trim().toUpperCase();
      const saved = await fbSaveStudent({
        ...student,
        uid: formattedUid,
        rfidUID: formattedUid,
      });
      const targetKey = (saved.studentDbId || formattedUid).trim();
      setStudents((prev) => ({
        ...prev,
        [targetKey]: {
          ...prev[targetKey],
          ...saved,
        },
      }));
    },
    []
  );

  const createStudentAccount = useCallback(async (input: StudentRegistrationInput) => {
    const res = await registerStudentAccount(input);
    const dbKey = (res.student.studentDbId || res.student.uid).trim();
    setStudents((prev) => ({
      ...prev,
      [dbKey]: res.student,
    }));
    return res;
  }, []);

  const deleteStudent = useCallback(
    async (idOrUid: string) => {
      const matchedKey = resolveStudentDbIdFromMap(idOrUid, students) || idOrUid.trim();
      let previousSnapshot: Student | undefined;
      setStudents((prev) => {
        previousSnapshot = prev[matchedKey];
        const updated = { ...prev };
        delete updated[matchedKey];
        return updated;
      });

      try {
        await fbDeleteStudent(matchedKey);
      } catch (e: any) {
        console.warn('Realtime database delete error:', e);
        if (previousSnapshot) {
          setStudents((prev) => ({
            ...prev,
            [matchedKey]: previousSnapshot!,
          }));
        }
        const errMsg = e?.message || `Failed to delete student at /students/${matchedKey}`;
        dbErrorRef.current = errMsg;
        setDbErrorMessage(errMsg);
        throw e;
      }
    },
    [students]
  );

  // Process RFID card scan -> resolves card to studentDbId and stores in students/{studentDbId}/attendance/{DATE}
  const scanRfidCard = useCallback(
    async (uidInput: string, device: string = 'ESP32-RFID-01') => {
      const uid = uidInput.trim().toUpperCase();
      try {
        const result = await recordAttendanceScan(uid, {
          device,
          studentsLookup: students,
        });

        if (result.record) {
          if (result.record.status === 'Present') {
            const targetKey =
              result.record.studentDbId ||
              resolveStudentDbIdFromMap(uid, students) ||
              uid;
            setStudents((prev) => {
              const target = prev[targetKey];
              if (!target) return prev;
              return {
                ...prev,
                [targetKey]: {
                  ...target,
                  attendance: {
                    ...(target.attendance || {}),
                    [result.record!.date]: result.record!,
                  },
                },
              };
            });
          } else if (result.record.status === 'Unknown') {
            setUnknownScans((prev) => [result.record!, ...prev.slice(0, 49)]);
          }
        }

        setLastLiveEvent({
          record: result.record || {
            uid,
            studentUID: uid,
            timestamp: Date.now(),
            date: todayStr,
            time: getISTTimeStr(),
            status: result.success ? 'Present' : 'Unknown',
            source: 'rfid_scanner',
          },
          success: result.success,
          message: result.message,
        });

        return result;
      } catch (err: any) {
        const diag = classifyFirebaseError(err, `Failed writing attendance scan for UID ${uid}`);
        dbErrorRef.current = diag.message;
        setDbErrorMessage(diag.message);
        setDbDiagnostic(diag);
        const failRes = {
          success: false,
          message: diag.message,
        };
        setLastLiveEvent({
          record: {
            uid,
            studentUID: uid,
            timestamp: Date.now(),
            date: todayStr,
            time: getISTTimeStr(),
            status: 'Unknown',
            source: 'rfid_scanner',
          },
          success: false,
          message: diag.message,
        });
        return failRes;
      }
    },
    [students, todayStr]
  );

  const clearLastLiveEvent = useCallback(() => {
    setLastLiveEvent(null);
  }, []);

  // Unified Attendance Percentage Formula: (Present Days / Total Applicable Working Days) * 100
  const getStudentAttendanceSummary = useCallback(
    (idOrUid: string): StudentAttendanceSummary => {
      const dbKey = resolveStudentDbIdFromMap(idOrUid, students) || idOrUid.trim();
      const resolvedInfo = lookupStudentInfo(dbKey) || lookupStudentInfo(idOrUid);
      const targetRfid = (resolvedInfo?.rfidUID || idOrUid).trim().toUpperCase();

      const student = students[dbKey] ||
        students[targetRfid] || {
          studentDbId: dbKey,
          uid: targetRfid,
          rfidUID: targetRfid,
          name: resolvedInfo?.name || 'Unknown',
          studentId: resolvedInfo?.studentId || 'N/A',
          department: resolvedInfo?.department || 'N/A',
          year: 'N/A',
          email: resolvedInfo?.email || '',
          phone: '',
          registeredAt: new Date().toISOString(),
          status: 'active',
        };

      const totalWorkingDays = applicableWorkingDates.length;
      let presentCount = 0;
      let lastSeen: string | undefined = undefined;
      let latestTimestamp = 0;

      const studentAttMap = student.attendance || {};

      applicableWorkingDates.forEach((dateKey) => {
        const rec =
          studentAttMap[dateKey] ||
          allAttendance[dateKey]?.[dbKey] ||
          allAttendance[dateKey]?.[targetRfid];

        if (rec && !rec.isDeleted && rec.status === 'Present') {
          presentCount++;
          const ts = rec.timestamp || 0;
          if (ts >= latestTimestamp) {
            latestTimestamp = ts;
            lastSeen = dateKey === todayStr ? `Today at ${rec.time}` : `${dateKey} at ${rec.time}`;
          }
        }
      });

      const percentage = totalWorkingDays > 0 ? Math.round((presentCount / totalWorkingDays) * 100) : 0;

      return {
        student,
        totalDays: totalWorkingDays,
        presentDays: presentCount,
        absentDays: Math.max(0, totalWorkingDays - presentCount),
        percentage,
        lastSeen,
      };
    },
    [students, allAttendance, applicableWorkingDates, todayStr]
  );

  // Holiday, Deadline & Migration Handlers
  const updateAttendanceDeadline = useCallback(
    async (deadlineTime: string): Promise<{ success: boolean; message: string }> => {
      try {
        const saved = await saveAttendanceSettings(deadlineTime, user?.email || undefined);
        setAttendanceDeadline(saved.deadlineTime);
        setClockTick(Date.now());
        return { success: true, message: `Attendance deadline updated to ${saved.deadlineTime} IST.` };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed to update attendance deadline.' };
      }
    },
    [user?.email]
  );

  const toggleHolidayDate = useCallback(async (date: string, isHoliday: boolean, label?: string) => {
    await setWorkingDayStatus(date, isHoliday, label);
    setWorkingDays((prev) => ({
      ...prev,
      [date]: {
        date,
        isHoliday,
        label: label || (isHoliday ? 'Holiday / Non-Working Day' : 'Institutional Working Day'),
        updatedAt: Date.now(),
      },
    }));
  }, []);

  const refreshMigrationInspection = useCallback(async (): Promise<MigrationInspection | null> => {
    try {
      const [insp, cp] = await Promise.all([
        inspectLegacyDatabase(),
        getMigrationCheckpoint().catch(() => null),
      ]);
      setMigrationInspection(insp);
      setMigrationCheckpoint(cp);
      return insp;
    } catch {
      return null;
    }
  }, []);

  const executeDatabaseMigration = useCallback(
    async (options?: { batchSize?: number; resume?: boolean }): Promise<MigrationResult> => {
      autoMigrationInFlightRef.current = true;
      try {
        const res = await runUnifiedDatabaseMigration(
          { email: user?.email, uid: user?.uid },
          {
            batchSize: options?.batchSize,
            resume: options?.resume,
            onProgress: (progress) => {
              migrationProgressRef.current = progress;
              setMigrationProgress(progress);
              setAutoMigrationStatus({
                status:
                  progress.status === 'paused'
                    ? 'paused'
                    : progress.status === 'error'
                      ? 'error'
                      : progress.status === 'completed'
                        ? 'success'
                        : 'migrating',
                message: progress.message,
                progress,
                updatedAt: Date.now(),
              });
            },
          }
        );
        const [insp, cp] = await Promise.all([
          inspectLegacyDatabase().catch(() => null),
          getMigrationCheckpoint().catch(() => null),
        ]);
        if (insp) setMigrationInspection(insp);
        setMigrationCheckpoint(cp);
        setAutoMigrationStatus({
          status: res.paused ? 'paused' : res.success ? 'success' : 'error',
          message: res.message,
          result: res,
          progress: migrationProgressRef.current || undefined,
          updatedAt: Date.now(),
        });
        return res;
      } finally {
        autoMigrationInFlightRef.current = false;
      }
    },
    [user]
  );

  const pauseMigration = useCallback(() => {
    pauseDatabaseMigration();
    setMigrationProgress((prev) =>
      prev
        ? {
            ...prev,
            status: 'paused',
            phase: 'paused',
            message: 'Pause requested — committing current batch & checkpoint safely...',
          }
        : prev
    );
    setAutoMigrationStatus((prev) => ({
      ...prev,
      status: 'paused',
      message: 'Pause requested — saving current batch checkpoint...',
      updatedAt: Date.now(),
    }));
  }, []);

  const resumeMigration = useCallback(
    async (batchSize?: number): Promise<MigrationResult> => {
      return executeDatabaseMigration({ batchSize, resume: true });
    },
    [executeDatabaseMigration]
  );

  const retryFailedMigration = useCallback(
    async (batchSize?: number): Promise<MigrationResult> => {
      autoMigrationInFlightRef.current = true;
      try {
        const res = await retryFailedMigrationRecords(
          { email: user?.email, uid: user?.uid },
          {
            batchSize,
            onProgress: (progress) => {
              migrationProgressRef.current = progress;
              setMigrationProgress(progress);
              setAutoMigrationStatus({
                status:
                  progress.status === 'paused'
                    ? 'paused'
                    : progress.status === 'error'
                      ? 'error'
                      : progress.status === 'completed'
                        ? 'success'
                        : 'migrating',
                message: progress.message,
                progress,
                updatedAt: Date.now(),
              });
            },
          }
        );
        const [insp, cp] = await Promise.all([
          inspectLegacyDatabase().catch(() => null),
          getMigrationCheckpoint().catch(() => null),
        ]);
        if (insp) setMigrationInspection(insp);
        setMigrationCheckpoint(cp);
        setAutoMigrationStatus({
          status: res.paused ? 'paused' : res.success ? 'success' : 'error',
          message: res.message,
          result: res,
          progress: migrationProgressRef.current || undefined,
          updatedAt: Date.now(),
        });
        return res;
      } finally {
        autoMigrationInFlightRef.current = false;
      }
    },
    [user]
  );

  const rebuildVerifiedAggregates = useCallback(async () => {
    return rebuildAndVerifyAggregates(students, workingDays, todayStr, isAfterDeadline);
  }, [students, workingDays, todayStr, isAfterDeadline]);

  const downloadDatabaseBackup = useCallback(async () => {
    const backup = await exportCompleteDatabaseBackup({ email: user?.email, uid: user?.uid });
    const blob = new Blob([backup.jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', backup.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    await refreshMigrationInspection();
    return {
      backupPath: backup.backupPath,
      filename: backup.filename,
      verifiedRecordCount: backup.verifiedRecordCount,
      expectedRecordCount: backup.expectedRecordCount,
    };
  }, [user, refreshMigrationInspection]);

  const assignRecoveredRecords = useCallback(
    async (unregisteredUid: string, targetStudentUid: string) => {
      const res = await assignRecoveredAttendanceToStudent(unregisteredUid, targetStudentUid, {
        email: user?.email,
        uid: user?.uid,
      });
      await refreshMigrationInspection();
      return res;
    },
    [user, refreshMigrationInspection]
  );

  const dismissRecoveredRecords = useCallback(
    async (unregisteredUid: string) => {
      await deleteRecoveredAttendance(unregisteredUid, { email: user?.email, uid: user?.uid });
      await refreshMigrationInspection();
    },
    [user, refreshMigrationInspection]
  );

  // System Reset Handlers
  const triggerAttendanceReset = useCallback(async (adminUid: string, adminEmail: string) => {
    const res = await resetAttendanceData(adminUid, adminEmail);
    setStudents((prev) => {
      const next: Record<string, Student> = {};
      Object.entries(prev).forEach(([k, st]) => {
        const { attendance: _removed, ...rest } = st;
        next[k] = rest;
      });
      return next;
    });
    setWorkingDays({});
    setUnknownScans([]);
    setLastLiveEvent(null);
    return res;
  }, []);

  const triggerCompleteSystemReset = useCallback(async (adminUid: string, adminEmail: string) => {
    const res = await completeSystemReset(adminUid, adminEmail);
    setStudents({});
    setWorkingDays({});
    setUnknownScans([]);
    setLastLiveEvent(null);
    return res;
  }, []);

  // Undo management
  const registerUndo = useCallback((action: UndoAction) => {
    setActiveUndo(action);
    setUndoTimeRemaining(30);
  }, []);

  const dismissUndo = useCallback(() => {
    setActiveUndo(null);
    setUndoTimeRemaining(0);
  }, []);

  const triggerUndo = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    if (!activeUndo || activeUndo.executed) {
      return { success: false, message: 'No active undo action available or already executed.' };
    }
    try {
      activeUndo.executed = true;
      const res = await executeUndoAction(activeUndo, { email: user?.email, uid: user?.uid });
      setActiveUndo(null);
      setUndoTimeRemaining(0);
      return res;
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to revert action.' };
    }
  }, [activeUndo, user]);

  // Admin Attendance Control Operations
  const editAttendance = useCallback(
    async (
      date: string,
      uid: string,
      updates: { date?: string; time?: string; status?: AttendanceStatus; notes?: string; device?: string },
      reason: string
    ): Promise<{ success: boolean; message: string }> => {
      try {
        const res = await updateAttendanceRecord(date, uid, updates, reason, { email: user?.email, uid: user?.uid });
        registerUndo({
          id: `undo_edit_${Date.now()}`,
          type: 'EDIT',
          description: `Modified attendance for ${res.updatedRecord.studentName || uid}`,
          timestamp: Date.now(),
          expiresAt: Date.now() + 30000,
          revertData: {
            previousRecord: res.previousRecord,
            updatedRecord: res.updatedRecord,
          },
          executed: false,
        });
        return { success: true, message: `Successfully updated attendance for ${res.updatedRecord.studentName || uid}.` };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed to update attendance record.' };
      }
    },
    [user, registerUndo]
  );

  const deleteAttendance = useCallback(
    async (date: string, uid: string, reason: string): Promise<{ success: boolean; message: string }> => {
      try {
        const res = await deleteAttendanceRecord(date, uid, reason, { email: user?.email, uid: user?.uid });
        registerUndo({
          id: `undo_del_${Date.now()}`,
          type: 'DELETE',
          description: `Deleted attendance record for ${res.deletedRecord.studentName || uid}`,
          timestamp: Date.now(),
          expiresAt: Date.now() + 30000,
          revertData: {
            deletedRecord: res.deletedRecord,
            trashId: res.trashId,
          },
          executed: false,
        });
        return { success: true, message: `Record deleted and moved to Trash.` };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed to delete attendance record.' };
      }
    },
    [user, registerUndo]
  );

  const deleteAttendanceByDate = useCallback(
    async (
      date: string,
      reason?: string
    ): Promise<{ success: boolean; date: string; deletedCount: number; message: string }> => {
      const normalized = normalizeToISODate(date) || date;
      if (!user || user.role !== 'admin') {
        return {
          success: false,
          date: normalized,
          deletedCount: 0,
          message: 'Unauthorized: Only administrators can delete attendance by date.',
        };
      }
      try {
        const res = await fbDeleteAttendanceByDate(
          normalized,
          { email: user.email, uid: user.uid },
          reason
        );

        // Immediately synchronize in-memory students, workingDays, and trash state
        setStudents((prev) => {
          const next: Record<string, Student> = {};
          Object.entries(prev).forEach(([dbKey, st]) => {
            if (!st) return;
            if (!st.attendance) {
              next[dbKey] = st;
              return;
            }
            const filteredAtt: Record<string, AttendanceRecord> = {};
            Object.entries(st.attendance).forEach(([attKey, rec]) => {
              const keyDate = normalizeToISODate(attKey);
              const recDate = normalizeToISODate(rec?.date);
              if (attKey !== res.date && keyDate !== res.date && recDate !== res.date) {
                filteredAtt[attKey] = rec;
              }
            });
            next[dbKey] = { ...st, attendance: filteredAtt };
          });
          return next;
        });

        setWorkingDays((prev) => {
          if (!prev[res.date] || prev[res.date]?.isHoliday) return prev;
          const next = { ...prev };
          delete next[res.date];
          return next;
        });

        setTrashRecords((prev) =>
          prev.filter(
            (t) =>
              normalizeToISODate(t.date) !== res.date &&
              !t.trashId.startsWith(`${res.date}_`)
          )
        );

        setActiveUndo((prev) => {
          if (!prev) return null;
          const revertDate = prev.revertData?.deletedRecord?.date || prev.revertData?.prevRecord?.date;
          if (revertDate && normalizeToISODate(revertDate) === res.date) return null;
          return prev;
        });

        setLastSyncedAt(Date.now());

        return {
          success: true,
          date: res.date,
          deletedCount: res.deletedCount,
          message: `Permanently deleted ${res.deletedCount} attendance record${res.deletedCount === 1 ? '' : 's'} for ${res.date}.`,
        };
      } catch (err: any) {
        return {
          success: false,
          date: normalized,
          deletedCount: 0,
          message: err?.message || `Failed to delete attendance records for ${normalized}.`,
        };
      }
    },
    [user]
  );

  const bulkDeleteAttendanceRecords = useCallback(
    async (
      records: Array<{ date: string; uid: string; studentName?: string }>,
      reason: string
    ): Promise<{ success: boolean; count: number; message: string }> => {
      try {
        const res = await bulkDeleteAttendance(records, reason, { email: user?.email, uid: user?.uid });
        registerUndo({
          id: `undo_bulk_del_${Date.now()}`,
          type: 'BULK_DELETE',
          description: `Bulk deleted ${res.count} attendance records`,
          timestamp: Date.now(),
          expiresAt: Date.now() + 30000,
          revertData: {
            deletedRecords: res.deletedRecords,
          },
          executed: false,
        });
        return { success: true, count: res.count, message: `Successfully deleted ${res.count} records (recoverable in Trash).` };
      } catch (err: any) {
        return { success: false, count: 0, message: err?.message || 'Failed bulk deletion.' };
      }
    },
    [user, registerUndo]
  );

  const bulkUpdateStatus = useCallback(
    async (
      records: Array<{ date: string; uid: string; studentName?: string }>,
      newStatus: AttendanceStatus,
      reason: string
    ): Promise<{ success: boolean; count: number; message: string }> => {
      try {
        const res = await bulkUpdateAttendanceStatus(records, newStatus, reason, { email: user?.email, uid: user?.uid });
        registerUndo({
          id: `undo_bulk_status_${Date.now()}`,
          type: 'BULK_EDIT',
          description: `Changed status to ${newStatus} for ${res.count} records`,
          timestamp: Date.now(),
          expiresAt: Date.now() + 30000,
          revertData: {
            previousStates: res.previousStates,
          },
          executed: false,
        });
        return { success: true, count: res.count, message: `Successfully updated ${res.count} records to ${newStatus}.` };
      } catch (err: any) {
        return { success: false, count: 0, message: err?.message || 'Failed bulk status update.' };
      }
    },
    [user, registerUndo]
  );

  const restoreTrashRecord = useCallback(
    async (trashId: string): Promise<{ success: boolean; message: string }> => {
      try {
        const res = await restoreDeletedAttendance(trashId, { email: user?.email, uid: user?.uid });
        return { success: true, message: `Successfully restored attendance record for ${res.restoredRecord.studentName || res.restoredRecord.uid}.` };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed restoring record.' };
      }
    },
    [user]
  );

  const restoreVersion = useCallback(
    async (date: string, uid: string, versionIndex: number): Promise<{ success: boolean; message: string }> => {
      try {
        await restorePreviousAttendance(date, uid, versionIndex, { email: user?.email, uid: user?.uid });
        return { success: true, message: `Reverted attendance to previous version.` };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed reverting to version.' };
      }
    },
    [user]
  );

  const overrideToAbsent = useCallback(
    async (date: string, uid: string, reason: string): Promise<{ success: boolean; message: string }> => {
      try {
        const res = await overrideAttendanceToAbsent(date, uid, reason, { email: user?.email, uid: user?.uid });
        registerUndo({
          id: `undo_override_${Date.now()}`,
          type: 'OVERRIDE',
          description: `Overrode ${res.updatedRecord.studentName || uid} to Absent`,
          timestamp: Date.now(),
          expiresAt: Date.now() + 30000,
          revertData: {
            previousRecord: res.previousRecord,
          },
          executed: false,
        });
        return { success: true, message: `Marked ${res.updatedRecord.studentName || uid} as Absent (Override Locked).` };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed overriding attendance.' };
      }
    },
    [user, registerUndo]
  );

  const removeOverride = useCallback(
    async (date: string, uid: string): Promise<{ success: boolean; message: string }> => {
      try {
        const res = await removeAttendanceOverride(date, uid, { email: user?.email, uid: user?.uid });
        return { success: true, message: `Removed override for ${res.updatedRecord.studentName || uid} and restored Present status.` };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed removing override.' };
      }
    },
    [user]
  );

  const suspendStudentAccount = useCallback(
    async (
      studentRfid: string,
      duration: '1_day' | '1_week' | '1_month' | 'custom',
      startDate: string,
      endDate: string,
      reason: string
    ): Promise<{ success: boolean; message: string }> => {
      try {
        const res = await suspendStudent(studentRfid, duration, startDate, endDate, reason, { email: user?.email, uid: user?.uid });
        return { success: true, message: `Student ${res.suspension.studentName} suspended until ${endDate}. RFID attendance disabled.` };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed suspending student.' };
      }
    },
    [user]
  );

  const unsuspendStudentAccount = useCallback(
    async (studentRfid: string, reason: string): Promise<{ success: boolean; message: string }> => {
      try {
        await unsuspendStudent(studentRfid, reason, { email: user?.email, uid: user?.uid });
        return { success: true, message: `Student unsuspended. RFID attendance restored.` };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed unsuspending student.' };
      }
    },
    [user]
  );

  // Manual Re-fetch directly from unified Firebase students node
  const refreshAttendance = useCallback(async (): Promise<{ success: boolean; count: number; message: string }> => {
    if (!user) {
      return { success: false, count: 0, message: 'User not authenticated' };
    }
    setIsRefreshing(true);
    try {
      let studentDbId = (user.studentDbId || user.rfidUID || '').trim();
      let studentRfid = (user.rfidUID || studentDbId).trim().toUpperCase();

      if (user.role === 'student' && !studentDbId) {
        const db = getFirebaseDatabase();
        const [mapSnap, userSnap] = await Promise.all([
          get(ref(db, `auth_to_student/${user.uid}`)),
          get(ref(db, `users/${user.uid}`)),
        ]);
        const mapVal = mapSnap.exists() ? mapSnap.val() : null;
        const userVal = userSnap.exists() ? userSnap.val() : null;
        studentDbId = (mapVal?.studentDbId || userVal?.studentDbId || mapVal?.rfidUID || userVal?.rfidUID || '').trim();
        studentRfid = (mapVal?.rfidUID || userVal?.rfidUID || studentDbId).trim().toUpperCase();
      }

      const result = await fetchDirectAttendance({
        role: user.role,
        uid: user.uid,
        studentDbId,
        studentId: user.studentId || user.rollNumber,
        rollNumber: user.studentId || user.rollNumber,
        rfidUID: studentRfid || user.rfidUID,
        email: user.email,
        displayName: user.displayName,
      });

      if (result.workingDays) {
        setWorkingDays(result.workingDays);
      }

      if (user.role === 'student' && studentDbId) {
        if (result.studentNode) {
          setStudents({
            [studentDbId]: {
              ...result.studentNode,
              studentDbId,
            },
          });
          setDbDiagnostic(
            result.recordCount === 0
              ? {
                  code: 'empty_records',
                  label: 'SYNCED',
                  message: 'Connected to Firebase. Attendance records are currently empty for this student.',
                }
              : {
                  code: 'connected',
                  label: 'SYNCED',
                  message: 'Real-time synchronization active.',
                }
          );
        } else {
          setStudents({});
          setDbDiagnostic({
            code: 'not_registered',
            label: 'UNREGISTERED',
            message: `Student record not found at /students/${studentDbId}.`,
            path: `/students/${studentDbId}`,
          });
        }
      } else if (user.role === 'admin') {
        const db = getFirebaseDatabase();
        const snap = await get(ref(db, 'students'));
        if (snap.exists()) {
          const val = snap.val() as Record<string, Student>;
          const normalizedMap: Record<string, Student> = {};
          Object.entries(val).forEach(([k, st]) => {
            if (!st) return;
            const rfid = (st.rfidUID || st.uid || k).trim().toUpperCase();
            normalizedMap[k] = { ...st, studentDbId: k, rfidUID: rfid, uid: rfid };
          });
          setStudents(normalizedMap);
          setDbDiagnostic({
            code: 'connected',
            label: 'SYNCED',
            message: 'Live real-time sync active.',
          });
        } else {
          setStudents({});
          setDbDiagnostic({
            code: 'empty_records',
            label: 'SYNCED',
            message: 'Connected to Firebase. No students registered yet.',
          });
        }
      }

      dbErrorRef.current = null;
      setIsDbConnected(true);
      setDbErrorMessage(null);
      setLastSyncedAt(Date.now());

      const msg = `Synchronized ${result.recordCount} attendance record${result.recordCount === 1 ? '' : 's'} with unified Firebase database.`;
      return { success: true, count: result.recordCount, message: msg };
    } catch (err: any) {
      console.warn('Manual refresh notice:', err);
      const diag = classifyFirebaseError(err, 'Failed to re-fetch attendance from Firebase.');
      dbErrorRef.current = diag.message;
      setDbErrorMessage(diag.message);
      setDbDiagnostic(diag);
      return {
        success: false,
        count: 0,
        message: diag.message,
      };
    } finally {
      setIsRefreshing(false);
    }
  }, [user]);

  // ============================================================================
  // REAL-TIME ATTENDANCE LEADERBOARD & REGULARITY RANKING ENGINE
  // ============================================================================
  useEffect(() => {
    if (!user || (user.role !== 'admin' && !leaderboardConfig.enabled)) {
      setRtdbLeaderboardSnapshots({});
      setLeaderboardHistory([]);
      return;
    }

    let active = true;
    const unsubSnaps = subscribeToLeaderboardSnapshots((snaps) => {
      if (active) setRtdbLeaderboardSnapshots(snaps);
    });
    const unsubHist = subscribeToLeaderboardHistory((hist) => {
      if (active) setLeaderboardHistory(hist);
    });

    return () => {
      active = false;
      unsubSnaps();
      unsubHist();
    };
  }, [user, leaderboardConfig.enabled]);

  const adminComputedSnapshots = useMemo<Record<LeaderboardPeriod, LeaderboardSnapshot> | null>(() => {
    if (user?.role !== 'admin') return null;
    return {
      overall: computeLeaderboardSnapshot({
        studentsMap: students,
        allAttendance,
        workingDays,
        todayStr,
        isAfterDeadline,
        period: 'overall',
      }),
      weekly: computeLeaderboardSnapshot({
        studentsMap: students,
        allAttendance,
        workingDays,
        todayStr,
        isAfterDeadline,
        period: 'weekly',
      }),
      monthly: computeLeaderboardSnapshot({
        studentsMap: students,
        allAttendance,
        workingDays,
        todayStr,
        isAfterDeadline,
        period: 'monthly',
      }),
      semester: computeLeaderboardSnapshot({
        studentsMap: students,
        allAttendance,
        workingDays,
        todayStr,
        isAfterDeadline,
        period: 'semester',
      }),
    };
  }, [user?.role, students, allAttendance, workingDays, todayStr, isAfterDeadline]);

  // Debounced auto-sync of precomputed non-PII snapshots & daily history from Admin -> /settings/leaderboard
  useEffect(() => {
    if (user?.role !== 'admin' || isLoading || !adminComputedSnapshots) return;
    if (Object.keys(students).length === 0) return;

    const nextSig = computeLeaderboardSignature(adminComputedSnapshots);
    if (nextSig === lastLeaderboardSyncSigRef.current) return;

    const timer = setTimeout(() => {
      syncLeaderboardSnapshotsToRtdb(adminComputedSnapshots, todayStr)
        .then(() => {
          lastLeaderboardSyncSigRef.current = nextSig;
        })
        .catch(() => {});
    }, 300);

    return () => clearTimeout(timer);
  }, [user?.role, isLoading, adminComputedSnapshots, students, todayStr]);

  const leaderboardSnapshots = useMemo<Record<LeaderboardPeriod, LeaderboardSnapshot>>(() => {
    if (adminComputedSnapshots) {
      return adminComputedSnapshots;
    }

    const currentStudent =
      studentsList.find(
        (s) =>
          (user?.studentDbId && s.studentDbId === user.studentDbId) ||
          (user?.rfidUID && (s.rfidUID || s.uid || '').toUpperCase() === user.rfidUID.toUpperCase()) ||
          (user?.uid && s.authUid === user.uid)
      ) ||
      studentsList[0] ||
      null;
    const currentDbId = (currentStudent?.studentDbId || user?.studentDbId || '').trim();

    const periods: LeaderboardPeriod[] = ['overall', 'weekly', 'monthly', 'semester'];
    const result = {} as Record<LeaderboardPeriod, LeaderboardSnapshot>;

    periods.forEach((p) => {
      const sharedSnap = rtdbLeaderboardSnapshots[p];
      if (sharedSnap) {
        result[p] = currentStudent
          ? mergeStudentLiveEntryIntoSnapshot({
              snapshot: sharedSnap,
              student: currentStudent,
              studentDbId: currentDbId,
              allAttendance,
              workingDays,
              todayStr,
              isAfterDeadline,
            })
          : sharedSnap;
      } else {
        result[p] = computeLeaderboardSnapshot({
          studentsMap: students,
          allAttendance,
          workingDays,
          todayStr,
          isAfterDeadline,
          period: p,
        });
      }
    });

    return result;
  }, [
    adminComputedSnapshots,
    rtdbLeaderboardSnapshots,
    students,
    studentsList,
    user?.studentDbId,
    user?.rfidUID,
    user?.uid,
    allAttendance,
    workingDays,
    todayStr,
    isAfterDeadline,
  ]);

  const getLeaderboardForPeriod = useCallback(
    (period: LeaderboardPeriod): LeaderboardSnapshot => {
      return leaderboardSnapshots[period] || leaderboardSnapshots.overall;
    },
    [leaderboardSnapshots]
  );

  const myLeaderboardStats = useMemo<LeaderboardEntry | null>(() => {
    if (!user || user.role !== 'student') return null;
    const entries = leaderboardSnapshots.overall?.entries || [];
    const targetDbId = (user.studentDbId || '').trim();
    const targetRoll = (user.studentId || user.rollNumber || '').trim().toUpperCase();
    return (
      entries.find(
        (e) =>
          (targetDbId && e.studentDbId === targetDbId) ||
          (targetRoll && (e.studentId || '').toUpperCase() === targetRoll)
      ) || null
    );
  }, [user, leaderboardSnapshots]);

  const getStudentLeaderboardStats = useCallback(
    (studentDbIdOrUid: string, period: LeaderboardPeriod = 'overall'): LeaderboardEntry | null => {
      const target = (studentDbIdOrUid || '').trim();
      if (!target) return null;
      const entries = leaderboardSnapshots[period]?.entries || [];
      const resolvedDbId = resolveStudentDbIdFromMap(target, students) || target;
      return (
        entries.find(
          (e) =>
            e.studentDbId === resolvedDbId ||
            e.studentDbId === target ||
            (e.studentId || '').toUpperCase() === target.toUpperCase()
        ) || null
      );
    },
    [leaderboardSnapshots, students]
  );

  const toggleLeaderboardEnabled = useCallback(
    async (enabled: boolean): Promise<{ success: boolean; message: string }> => {
      if (user?.role !== 'admin') {
        return { success: false, message: 'Only administrators can change leaderboard visibility.' };
      }
      try {
        const saved = await saveLeaderboardConfig(enabled, user?.email || undefined);
        setLeaderboardConfig(saved);
        return {
          success: true,
          message: enabled
            ? 'Student Attendance Leaderboard is now enabled.'
            : 'Student Attendance Leaderboard has been disabled for students.',
        };
      } catch (err: any) {
        return {
          success: false,
          message: err?.message || 'Failed updating leaderboard visibility setting.',
        };
      }
    },
    [user?.role, user?.email]
  );

  return (
    <AttendanceContext.Provider
      value={{
        students,
        studentsList,
        todayAttendance,
        todayRecordsList,
        allAttendance,
        unknownScans,
        workingDays,
        applicableWorkingDates,
        todayStr,
        attendanceDeadline,
        isAfterDeadline,
        isTodayHoliday,
        totalStudentsCount,
        presentTodayCount,
        absentTodayCount,
        pendingTodayCount,
        todayPercentage,
        weeklyStats,
        monthlyStats,
        updateAttendanceDeadline,
        isLoading,
        isRefreshing,
        lastSyncedAt,
        isDbConnected,
        dbErrorMessage,
        dbDiagnostic,
        lastLiveEvent,
        clearLastLiveEvent,
        lastResetLog,
        latestDeviceCommand,
        trashRecords,
        auditLogs,
        suspensions,
        activeUndo,
        undoTimeRemaining,
        triggerUndo,
        dismissUndo,
        migrationInspection,
        migrationProgress,
        migrationCheckpoint,
        dashboardAggregates,
        autoMigrationStatus,
        dismissAutoMigrationStatus,
        unregisteredRecovery,
        toggleHolidayDate,
        refreshMigrationInspection,
        executeDatabaseMigration,
        pauseMigration,
        resumeMigration,
        retryFailedMigration,
        rebuildVerifiedAggregates,
        downloadDatabaseBackup,
        assignRecoveredRecords,
        dismissRecoveredRecords,
        editAttendance,
        deleteAttendance,
        deleteAttendanceByDate,
        bulkDeleteAttendanceRecords,
        bulkUpdateStatus,
        restoreTrashRecord,
        restoreVersion,
        overrideToAbsent,
        removeOverride,
        suspendStudentAccount,
        unsuspendStudentAccount,
        addOrUpdateStudent,
        createStudentAccount,
        deleteStudent,
        scanRfidCard,
        getStudentAttendanceSummary,
        triggerAttendanceReset,
        triggerCompleteSystemReset,
        retryConnection,
        refreshAttendance,
        leaderboardEnabled: leaderboardConfig.enabled,
        leaderboardConfig,
        leaderboardSnapshots,
        leaderboardHistory,
        getLeaderboardForPeriod,
        toggleLeaderboardEnabled,
        myLeaderboardStats,
        getStudentLeaderboardStats,
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
};

export const useAttendance = () => {
  const context = useContext(AttendanceContext);
  if (!context) {
    throw new Error('useAttendance must be used within an AttendanceProvider');
  }
  return context;
};
