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
  UnregisteredAttendanceGroup,
} from '../types';
import {
  subscribeToStudents,
  subscribeToWorkingDays,
  setWorkingDayStatus,
  syncWorkingDaysFromDates,
  computeApplicableWorkingDates,
  fetchDirectAttendance,
  linkExistingStudentProfilesInFirestore,
  subscribeToConnectionStatus,
  subscribeToDeviceCommands,
  subscribeToLastReset,
  saveStudent as fbSaveStudent,
  deleteStudent as fbDeleteStudent,
  recordAttendanceScan,
  seedInitialStudentsIfEmpty,
  resetAttendanceData,
  completeSystemReset,
  registerStudentAccount,
  lookupStudentInfo,
  normalizeAttendanceRecord,
  getFirebaseDatabase,
  subscribeToAuditLogs,
  subscribeToTrashRecords,
  subscribeToSuspensions,
  updateAttendanceRecord,
  deleteAttendanceRecord,
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
  exportCompleteDatabaseBackup,
  runUnifiedDatabaseMigration,
  subscribeToMigrationRecovery,
  assignRecoveredAttendanceToStudent,
  deleteRecoveredAttendance,
  DEFAULT_ATTENDANCE_DEADLINE,
  subscribeToAttendanceSettings,
  saveAttendanceSettings,
  INITIAL_STUDENTS,
} from '../services/firebase';
import { ref, onValue, off, DataSnapshot } from 'firebase/database';
import { useAuth } from './AuthContext';
import {
  getISTDateStr,
  getISTTimeStr,
  getPastISTDates,
  isAfterISTDeadline,
  isValidDeadlineHHMM,
} from '../utils/dateUtils';

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
  unregisteredRecovery: UnregisteredAttendanceGroup[];
  toggleHolidayDate: (date: string, isHoliday: boolean, label?: string) => Promise<void>;
  refreshMigrationInspection: () => Promise<MigrationInspection | null>;
  executeDatabaseMigration: () => Promise<MigrationResult>;
  downloadDatabaseBackup: () => Promise<{ backupPath: string; filename: string }>;
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
  seedDefaultStudents: () => Promise<void>;
  getStudentAttendanceSummary: (uid: string) => StudentAttendanceSummary;
  triggerAttendanceReset: (adminUid: string, adminEmail: string) => Promise<{ success: boolean; message: string }>;
  triggerCompleteSystemReset: (adminUid: string, adminEmail: string) => Promise<{ success: boolean; message: string; commandId: string }>;
  retryConnection: () => Promise<void>;
  refreshAttendance: () => Promise<{ success: boolean; count: number; message: string }>;
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
  const [unregisteredRecovery, setUnregisteredRecovery] = useState<UnregisteredAttendanceGroup[]>([]);

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

  // Derive allAttendance & todayAttendance directly from unified students/{RFID_UID}/attendance/{DATE}
  const { allAttendance, todayAttendance } = useMemo(() => {
    const allMap: Record<string, Record<string, AttendanceRecord>> = {};
    const todayMap: Record<string, AttendanceRecord> = {};

    // Ensure non-holiday working_days entries exist in allMap keys for consistent working day counts
    Object.entries(workingDays || {}).forEach(([dateKey, cfg]) => {
      if (cfg && !cfg.isHoliday && dateKey <= todayStr && !allMap[dateKey]) {
        allMap[dateKey] = {};
      }
    });

    Object.entries(students || {}).forEach(([rfidKey, st]) => {
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

        if (dateKey === todayStr) {
          todayMap[cardUid] = rec;
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
      setUnregisteredRecovery([]);
      setIsLoading(false);
      setIsDbConnected(false);
      setLastSyncedAt(null);
      dbErrorRef.current = null;
      setDbErrorMessage(null);
      return;
    }

    setIsLoading(true);
    dbErrorRef.current = null;
    setDbErrorMessage(null);

    const unsubscribeConn = subscribeToConnectionStatus((connected) => {
      if (connected) {
        setIsDbConnected(!dbErrorRef.current);
        if (wasDisconnectedRef.current) {
          wasDisconnectedRef.current = false;
          // Re-sync after reconnection so missed updates reconcile immediately
          fetchDirectAttendance({
            role: user.role,
            uid: user.uid,
            studentId: user.studentId || user.rollNumber,
            rollNumber: user.studentId || user.rollNumber,
            rfidUID: user.rfidUID,
            email: user.email,
            displayName: user.displayName,
          })
            .then((res) => {
              if (res.workingDays) setWorkingDays(res.workingDays);
              setLastSyncedAt(Date.now());
            })
            .catch(() => {});
        }
      } else {
        wasDisconnectedRef.current = true;
        setIsDbConnected(false);
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
        () => {}
      )
    );

    if (user.role === 'admin') {
      unsubs.push(subscribeToDeviceCommands((cmd) => setLatestDeviceCommand(cmd)));
      unsubs.push(subscribeToLastReset((log) => setLastResetLog(log)));
      unsubs.push(subscribeToAuditLogs((logs) => setAuditLogs(logs)));
      unsubs.push(subscribeToTrashRecords((records) => setTrashRecords(records)));
      unsubs.push(subscribeToSuspensions((suspMap) => setSuspensions(suspMap)));
      unsubs.push(subscribeToMigrationRecovery((groups) => setUnregisteredRecovery(groups)));

      // Unknown scans listener
      try {
        const db = getFirebaseDatabase();
        const unknownRef = ref(db, 'unknown_scans');
        const unsubUnknown = onValue(
          unknownRef,
          (snap) => {
            if (!snap.exists()) {
              setUnknownScans([]);
              return;
            }
            const val = snap.val() as Record<string, AttendanceRecord>;
            const list = Object.values(val).sort((a, b) => b.timestamp - a.timestamp);
            setUnknownScans(list);
          },
          () => {}
        );
        unsubs.push(() => off(unknownRef, 'value', unsubUnknown));
      } catch {}

      checkAndReactivateExpiredSuspensions().catch(() => {});

      // Inspect legacy data so admin sees live migration banner if /attendance exists
      inspectLegacyDatabase()
        .then((insp) => setMigrationInspection(insp))
        .catch(() => {});

      // Single unified Admin listener on /students (contains profile + nested attendance)
      unsubs.push(
        subscribeToStudents(
          (data) => {
            dbErrorRef.current = null;
            setDbErrorMessage(null);
            setIsDbConnected(true);
            setLastSyncedAt(Date.now());
            if (data && Object.keys(data).length > 0) {
              const normalizedMap: Record<string, Student> = {};
              const discoveredDates = new Set<string>();
              Object.entries(data).forEach(([k, st]) => {
                if (!st) return;
                const upperUid = (st.uid || k).trim().toUpperCase();
                normalizedMap[upperUid] = { ...st, uid: upperUid };
                if (st.attendance) {
                  Object.keys(st.attendance).forEach((d) => discoveredDates.add(d));
                }
              });
              setStudents(normalizedMap);
              if (discoveredDates.size > 0) {
                syncWorkingDaysFromDates(Array.from(discoveredDates)).catch(() => {});
              }
            } else {
              seedInitialStudentsIfEmpty().then(() => {
                const map: Record<string, Student> = {};
                INITIAL_STUDENTS.forEach((st) => {
                  map[st.uid] = st;
                });
                setStudents(map);
              });
            }
            setIsLoading(false);
          },
          (error) => {
            console.warn('Realtime Database unified students listener error:', error);
            const msg = error.message || 'Error connecting to /students node';
            dbErrorRef.current = msg;
            setDbErrorMessage(msg);
            setIsDbConnected(false);
            setIsLoading(false);
          }
        )
      );
    } else if (user.role === 'student') {
      const resolved =
        lookupStudentInfo(user.rfidUID || '') ||
        lookupStudentInfo(user.studentId || user.rollNumber || '') ||
        lookupStudentInfo(user.uid) ||
        (user.email ? lookupStudentInfo(user.email) : null) ||
        (user.displayName ? lookupStudentInfo(user.displayName) : null);

      const studentRfid = (user.rfidUID || resolved?.rfidUID || '').trim().toUpperCase();
      const studentRoll = (user.studentId || user.rollNumber || resolved?.studentId || '').trim();
      const studentAuthUid = user.uid;

      const fallbackSelf: Student = {
        uid: studentRfid || studentAuthUid,
        name: user.displayName || resolved?.name || 'Student',
        studentId: studentRoll || 'STU-000',
        department: user.department || resolved?.department || 'General',
        year: user.year || 'Final Year',
        semester: user.semester || 'Semester 8',
        email: user.email || '',
        phone: user.phone || '',
        registeredAt: new Date().toISOString(),
        status: 'active',
        authUid: studentAuthUid,
      };

      setStudents({ [studentRfid || studentAuthUid]: fallbackSelf });

      if (studentRfid) {
        try {
          const db = getFirebaseDatabase();
          const studentRef = ref(db, `students/${studentRfid}`);
          const unsubSelf = onValue(
            studentRef,
            (snapshot: DataSnapshot) => {
              if (snapshot.exists()) {
                const val = snapshot.val() as Student;
                setStudents({
                  [studentRfid]: {
                    ...fallbackSelf,
                    ...val,
                    uid: studentRfid,
                  },
                });
              }
              dbErrorRef.current = null;
              setIsLoading(false);
              setIsDbConnected(true);
              setDbErrorMessage(null);
              setLastSyncedAt(Date.now());
            },
            (err) => {
              console.warn(`Student unified listener notice (students/${studentRfid}):`, err?.message);
              const msg = err?.message || 'Permission notice reading personal student node.';
              dbErrorRef.current = msg;
              setDbErrorMessage(msg);
              setIsDbConnected(false);
              setIsLoading(false);
            }
          );
          unsubs.push(() => off(studentRef, 'value', unsubSelf));
        } catch {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    }

    return () => {
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

  // Initial effect: link student accounts into Firestore users collection
  useEffect(() => {
    linkExistingStudentProfilesInFirestore().catch((err) => {
      console.warn('Background Firestore profile linking notice:', err);
    });
  }, []);

  // Students list derived strictly from students state
  const studentsList = useMemo(() => {
    return Object.values(students).sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  // Shared Total Applicable Working Days (excludes holidays & future dates)
  const applicableWorkingDates = useMemo(() => {
    return computeApplicableWorkingDates(allAttendance, workingDays, todayStr);
  }, [allAttendance, workingDays, todayStr]);

  // Today records sorted by actual timestamp descending (strictly deduplicated by UID, excluding deleted)
  const todayRecordsList = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    Object.values(todayAttendance).forEach((rec) => {
      if (rec.isDeleted) return;
      const key = (rec.rfidUID || rec.uid || '').toUpperCase();
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

  const activeUidSet = useMemo(() => {
    return new Set(activeStudentsList.map((s) => s.uid.trim().toUpperCase()));
  }, [activeStudentsList]);

  const totalStudentsCount = activeStudentsList.length;

  const isTodayHoliday = useMemo(() => {
    return Boolean(workingDays[todayStr]?.isHoliday);
  }, [workingDays, todayStr]);

  const isAfterDeadline = useMemo(() => {
    return isAfterISTDeadline(attendanceDeadline, clockTick);
  }, [attendanceDeadline, clockTick]);

  const { presentTodayCount, explicitAbsentTodayCount } = useMemo(() => {
    let present = 0;
    let explicitAbsent = 0;

    for (const uid of Object.keys(todayAttendance)) {
      const upper = uid.trim().toUpperCase();
      const rec = todayAttendance[uid];
      if (!rec || rec.isDeleted || !activeUidSet.has(upper)) continue;

      if (rec.status === 'Present') {
        present++;
      } else if (rec.status === 'Absent') {
        explicitAbsent++;
      }
    }

    return { presentTodayCount: present, explicitAbsentTodayCount: explicitAbsent };
  }, [todayAttendance, activeUidSet]);

  const unscannedActiveCount = Math.max(0, totalStudentsCount - presentTodayCount - explicitAbsentTodayCount);

  // Never classify pending students as absent before the configured attendance deadline
  const pendingTodayCount = useMemo(() => {
    if (isTodayHoliday || isAfterDeadline) return 0;
    return unscannedActiveCount;
  }, [isTodayHoliday, isAfterDeadline, unscannedActiveCount]);

  const absentTodayCount = useMemo(() => {
    if (isTodayHoliday) return explicitAbsentTodayCount;
    return isAfterDeadline ? explicitAbsentTodayCount + unscannedActiveCount : explicitAbsentTodayCount;
  }, [isTodayHoliday, isAfterDeadline, explicitAbsentTodayCount, unscannedActiveCount]);

  const todayPercentage = useMemo(() => {
    if (totalStudentsCount === 0) return 0;
    return Math.round((presentTodayCount / totalStudentsCount) * 100);
  }, [presentTodayCount, totalStudentsCount]);

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
        Object.entries(dayMap).forEach(([uid, rec]) => {
          const upper = uid.trim().toUpperCase();
          if (!rec || rec.isDeleted || !activeUidSet.has(upper)) return;
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
  }, [allAttendance, todayAttendance, workingDays, todayStr, totalStudentsCount, activeUidSet, isAfterDeadline]);

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
        Object.entries(dayMap).forEach(([uid, rec]) => {
          const upper = uid.trim().toUpperCase();
          if (!rec || rec.isDeleted || !activeUidSet.has(upper)) return;
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
  }, [allAttendance, todayAttendance, workingDays, todayStr, totalStudentsCount, activeUidSet, isAfterDeadline]);

  // Student CRUD
  const addOrUpdateStudent = useCallback(async (student: Student) => {
    const formattedUid = student.uid.trim().toUpperCase();
    setStudents((prev) => {
      const existing = prev[formattedUid];
      return {
        ...prev,
        [formattedUid]: {
          ...student,
          uid: formattedUid,
          attendance: student.attendance || existing?.attendance,
        },
      };
    });

    try {
      await fbSaveStudent({ ...student, uid: formattedUid });
    } catch (e: any) {
      console.warn('Realtime database write error:', e);
      setDbErrorMessage(e?.message || 'Failed to save student to Firebase');
    }
  }, []);

  const createStudentAccount = useCallback(async (input: StudentRegistrationInput) => {
    const res = await registerStudentAccount(input);
    setStudents((prev) => ({
      ...prev,
      [res.student.uid]: res.student,
    }));
    return res;
  }, []);

  const deleteStudent = useCallback(async (uid: string) => {
    const upper = uid.trim().toUpperCase();
    setStudents((prev) => {
      const updated = { ...prev };
      delete updated[upper];
      return updated;
    });

    try {
      await fbDeleteStudent(upper);
    } catch (e: any) {
      console.warn('Realtime database delete error:', e);
      setDbErrorMessage(e?.message || 'Failed to delete student from Firebase');
    }
  }, []);

  // Process RFID card scan -> stores in students/{UID}/attendance/{DATE}
  const scanRfidCard = useCallback(
    async (uidInput: string, device: string = 'ESP32-RFID-01') => {
      const uid = uidInput.trim().toUpperCase();
      const result = await recordAttendanceScan(uid, {
        device,
        studentsLookup: students,
      });

      if (result.record) {
        if (result.record.status === 'Present') {
          setStudents((prev) => {
            const target = prev[uid];
            if (!target) return prev;
            return {
              ...prev,
              [uid]: {
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
          timestamp: Date.now(),
          date: todayStr,
          time: getISTTimeStr(),
          status: result.success ? 'Present' : 'Unknown',
        },
        success: result.success,
        message: result.message,
      });

      return result;
    },
    [students, todayStr]
  );

  const clearLastLiveEvent = useCallback(() => {
    setLastLiveEvent(null);
  }, []);

  const seedDefaultStudents = useCallback(async () => {
    for (const student of INITIAL_STUDENTS) {
      await addOrUpdateStudent(student);
    }
  }, [addOrUpdateStudent]);

  // Unified Attendance Percentage Formula: (Present Days / Total Applicable Working Days) * 100
  const getStudentAttendanceSummary = useCallback(
    (uid: string): StudentAttendanceSummary => {
      const resolvedInfo = lookupStudentInfo(uid) || lookupStudentInfo(uid.toUpperCase());
      const targetRfid = (resolvedInfo?.rfidUID || uid).trim().toUpperCase();
      const targetRoll = resolvedInfo?.studentId;

      const student = students[targetRfid] ||
        students[uid] || {
          uid: targetRfid,
          name: resolvedInfo?.name || 'Unknown',
          studentId: targetRoll || 'N/A',
          department: resolvedInfo?.department || 'N/A',
          year: 'Final Year',
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
          allAttendance[dateKey]?.[targetRfid] ||
          allAttendance[dateKey]?.[targetRfid.toLowerCase()];

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
      const insp = await inspectLegacyDatabase();
      setMigrationInspection(insp);
      return insp;
    } catch {
      return null;
    }
  }, []);

  const executeDatabaseMigration = useCallback(async (): Promise<MigrationResult> => {
    const res = await runUnifiedDatabaseMigration({ email: user?.email, uid: user?.uid });
    await refreshMigrationInspection();
    return res;
  }, [user, refreshMigrationInspection]);

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
    return { backupPath: backup.backupPath, filename: backup.filename };
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
      const resolved =
        lookupStudentInfo(user.rfidUID || '') ||
        lookupStudentInfo(user.studentId || user.rollNumber || '') ||
        lookupStudentInfo(user.uid) ||
        (user.email ? lookupStudentInfo(user.email) : null);
      const studentRfid = (user.rfidUID || resolved?.rfidUID || '').trim().toUpperCase();

      const result = await fetchDirectAttendance({
        role: user.role,
        uid: user.uid,
        studentId: user.studentId || user.rollNumber || resolved?.studentId,
        rollNumber: user.studentId || user.rollNumber || resolved?.studentId,
        rfidUID: studentRfid || user.rfidUID,
        email: user.email,
        displayName: user.displayName || resolved?.name,
      });

      if (result.workingDays) {
        setWorkingDays(result.workingDays);
      }

      if (user.role === 'student' && result.studentNode && studentRfid) {
        setStudents((prev) => ({
          ...prev,
          [studentRfid]: {
            ...(prev[studentRfid] || {}),
            ...result.studentNode!,
            uid: studentRfid,
          },
        }));
      } else if (user.role === 'admin') {
        const db = getFirebaseDatabase();
        const { get } = await import('firebase/database');
        const snap = await get(ref(db, 'students'));
        if (snap.exists()) {
          const val = snap.val() as Record<string, Student>;
          const normalizedMap: Record<string, Student> = {};
          Object.entries(val).forEach(([k, st]) => {
            if (!st) return;
            const upper = (st.uid || k).trim().toUpperCase();
            normalizedMap[upper] = { ...st, uid: upper };
          });
          setStudents(normalizedMap);
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
      return {
        success: false,
        count: 0,
        message: err?.message || 'Failed to re-fetch attendance from Firebase.',
      };
    } finally {
      setIsRefreshing(false);
    }
  }, [user]);

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
        unregisteredRecovery,
        toggleHolidayDate,
        refreshMigrationInspection,
        executeDatabaseMigration,
        downloadDatabaseBackup,
        assignRecoveredRecords,
        dismissRecoveredRecords,
        editAttendance,
        deleteAttendance,
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
        seedDefaultStudents,
        getStudentAttendanceSummary,
        triggerAttendanceReset,
        triggerCompleteSystemReset,
        retryConnection,
        refreshAttendance,
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
