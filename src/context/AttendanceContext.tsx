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
  TrashAttendanceRecord
} from '../types';
import { 
  subscribeToStudents, 
  subscribeToDateAttendance, 
  subscribeToAllAttendance, 
  subscribeToStudentAttendance,
  subscribeToStudentTodayAttendance,
  subscribeToCentralAttendance,
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
  INITIAL_STUDENTS,
  CONFIGURED_ADMIN_UID
} from '../services/firebase';
import { ref, onValue, off, DataSnapshot } from 'firebase/database';
import { useAuth } from './AuthContext';

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
  
  // Dashboard Metrics (Calculated strictly from actual database records)
  totalStudentsCount: number;
  presentTodayCount: number;
  absentTodayCount: number;
  todayPercentage: number;
  weeklyStats: DayStats[];
  monthlyStats: DayStats[];
  
  // Telemetry & Refresh
  isLoading: boolean;
  isDbConnected: boolean;
  isRefreshing: boolean;
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
  
  // Existing Actions
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
  const [todayAttendance, setTodayAttendance] = useState<Record<string, AttendanceRecord>>({});
  const [allAttendance, setAllAttendance] = useState<Record<string, Record<string, AttendanceRecord>>>({});
  const [unknownScans, setUnknownScans] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [lastLiveEvent, setLastLiveEvent] = useState<LiveScanEvent | null>(null);
  const [lastResetLog, setLastResetLog] = useState<ResetAuditLog | null>(null);
  const [latestDeviceCommand, setLatestDeviceCommand] = useState<DeviceCommand | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Admin Attendance Control & Audit states
  const [trashRecords, setTrashRecords] = useState<TrashAttendanceRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditActivityLog[]>([]);
  const [suspensions, setSuspensions] = useState<Record<string, StudentSuspension[]>>({});
  const [activeUndo, setActiveUndo] = useState<UndoAction | null>(null);
  const [undoTimeRemaining, setUndoTimeRemaining] = useState<number>(0);

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
    setDbErrorMessage(null);
    try {
      await refreshToken();
    } catch {
      // Ignore
    }
    setRetryTrigger((prev) => prev + 1);
  }, [refreshToken]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Listen to actual Firebase Realtime Database for Authenticated Admin or Student
  useEffect(() => {
    // 1. Guard: Never query unauthenticated
    if (!user) {
      setStudents({});
      setTodayAttendance({});
      setAllAttendance({});
      setTrashRecords([]);
      setAuditLogs([]);
      setSuspensions({});
      setIsLoading(false);
      setIsDbConnected(false);
      setDbErrorMessage(null);
      return;
    }

    setIsLoading(true);
    setDbErrorMessage(null);

    // 2. Genuine Firebase connection state listener via .info/connected
    const unsubscribeConn = subscribeToConnectionStatus((connected) => {
      setIsDbConnected(connected && !dbErrorMessage);
    });

    let unsubscribeCmd = () => {};
    let unsubscribeReset = () => {};
    let unsubscribeStudents = () => {};
    let unsubscribeToday = () => {};
    let unsubscribeAll = () => {};
    let unsubscribeAudit = () => {};
    let unsubscribeTrash = () => {};
    let unsubscribeSusp = () => {};

    if (user.role === 'admin') {
      // Admin: Listen to device commands & reset logs
      unsubscribeCmd = subscribeToDeviceCommands((cmd) => {
        setLatestDeviceCommand(cmd);
      });

      unsubscribeReset = subscribeToLastReset((log) => {
        setLastResetLog(log);
      });

      // Admin Attendance Control listeners: Audit logs, Trash, Suspensions
      unsubscribeAudit = subscribeToAuditLogs((logs) => {
        setAuditLogs(logs);
      });

      unsubscribeTrash = subscribeToTrashRecords((records) => {
        setTrashRecords(records);
      });

      unsubscribeSusp = subscribeToSuspensions((suspMap) => {
        setSuspensions(suspMap);
      });

      // Check and automatically reactivate any expired student suspensions
      checkAndReactivateExpiredSuspensions().catch(() => {});

      try {
        // Admin: Real-time subscription to 'students' node
        unsubscribeStudents = subscribeToStudents(
          (data) => {
            setDbErrorMessage(null);
            setIsDbConnected(true);
            if (data && Object.keys(data).length > 0) {
              setStudents(data);
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
            console.warn('Realtime Database students listener error:', error);
            const errMsg = error.message || 'Error connecting to /students node';
            setDbErrorMessage(errMsg);
            setIsDbConnected(false);
            setIsLoading(false);
          }
        );
      } catch (e: any) {
        console.warn('Students listener error:', e);
      }

      try {
        // Admin: Centralized attendance subscription
        unsubscribeAll = subscribeToCentralAttendance(
          {
            role: 'admin',
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          },
          (allData, todayData) => {
            setAllAttendance(allData || {});
            setTodayAttendance(todayData || {});
            setIsLoading(false);
            setIsDbConnected(true);
            setDbErrorMessage(null);
          },
          (error) => {
            console.warn('Realtime Database admin central attendance notice:', error);
            setIsLoading(false);
          }
        );
      } catch (e: any) {
        console.warn('Attendance subscription error:', e);
        setIsLoading(false);
      }
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

      // Student: Setup self student record only (no other students accessible)
      const selfStudent: Student = {
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

      setStudents({
        [studentRfid || studentAuthUid]: selfStudent,
      });

      // Update listener to filter attendance records by matching the current user's 'rfidUid'
      // directly against the attendance database path keys (attendance/{DATE}/{RFID_UID})
      try {
        const db = getFirebaseDatabase();
        const localTodayStr = new Date().toISOString().split('T')[0];
        const now = new Date();
        const localFormattedToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const personalAttendanceMap: Record<string, Record<string, AttendanceRecord>> = {};
        const personalTodayMap: Record<string, AttendanceRecord> = {};

        const emitStudentUpdate = () => {
          if (Object.keys(personalTodayMap).length === 0) {
            const allRecords: AttendanceRecord[] = [];
            Object.values(personalAttendanceMap).forEach((dayMap) => {
              Object.values(dayMap).forEach((rec) => {
                if (rec.status === 'Present') allRecords.push(rec);
              });
            });
            if (allRecords.length > 0) {
              allRecords.sort((a, b) => b.timestamp - a.timestamp);
              personalTodayMap[studentRfid] = allRecords[0];
            }
          }

          setAllAttendance({ ...personalAttendanceMap });
          setTodayAttendance({ ...personalTodayMap });
          setIsLoading(false);
          setIsDbConnected(true);
          setDbErrorMessage(null);
        };

        const updateRecordForStudent = (rec: AttendanceRecord) => {
          const dateKey = rec.date;
          if (!personalAttendanceMap[dateKey]) {
            personalAttendanceMap[dateKey] = {};
          }
          personalAttendanceMap[dateKey][studentRfid] = rec;
          if (dateKey === localTodayStr || dateKey === localFormattedToday) {
            personalTodayMap[studentRfid] = rec;
          }
          emitStudentUpdate();
        };

        // 1. Root attendance listener:
        // Filter attendance records by matching current user's rfidUid directly against attendance database path keys
        const attendanceRef = ref(db, 'attendance');
        const unsubRoot = onValue(
          attendanceRef,
          (snapshot: DataSnapshot) => {
            const val = snapshot.val() || {};
            Object.keys(personalAttendanceMap).forEach((k) => delete personalAttendanceMap[k]);
            Object.keys(personalTodayMap).forEach((k) => delete personalTodayMap[k]);

            Object.keys(val).forEach((dateKey) => {
              personalAttendanceMap[dateKey] = {};
              const dayData = val[dateKey];
              if (dayData && typeof dayData === 'object') {
                // Match current user's rfidUid directly against the attendance database path keys
                Object.keys(dayData).forEach((pathKey) => {
                  const normalizedPathKey = pathKey.trim().toUpperCase();
                  if (studentRfid && normalizedPathKey === studentRfid) {
                    const rec = normalizeAttendanceRecord(dayData[pathKey], dateKey, pathKey);
                    personalAttendanceMap[dateKey][studentRfid] = rec;
                    if (dateKey === localTodayStr || dateKey === localFormattedToday) {
                      personalTodayMap[studentRfid] = rec;
                    }
                  }
                });
              }
            });

            emitStudentUpdate();
          },
          (error) => {
            console.warn('Realtime Database root attendance listener notice:', error?.message);
          }
        );

        // 2. Direct child path listeners specifically targeting attendance/{date}/{rfidUid}
        // Guarantees real-time instant update when ESP32 uploads a scan to attendance/{date}/{rfid}
        const studentChildCleanups: (() => void)[] = [];
        const listenDates = new Set<string>([localTodayStr, localFormattedToday, '2026-11-08']);
        for (let i = 1; i <= 14; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          listenDates.add(d.toISOString().split('T')[0]);
        }

        if (studentRfid) {
          listenDates.forEach((dStr) => {
            const childRef = ref(db, `attendance/${dStr}/${studentRfid}`);
            const unsubChild = onValue(
              childRef,
              (snap) => {
                if (snap.exists()) {
                  const rec = normalizeAttendanceRecord(snap.val(), dStr, studentRfid);
                  updateRecordForStudent(rec);
                }
              },
              (err) => {
                console.warn(`Direct child listener notice for ${dStr}/${studentRfid}:`, err?.message);
              }
            );
            studentChildCleanups.push(() => off(childRef, 'value', unsubChild));
          });
        }

        // 3. Fallback centralized subscription for cross-database syncing
        const unsubFallback = subscribeToCentralAttendance(
          {
            role: 'student',
            uid: studentAuthUid,
            studentId: studentRoll,
            rollNumber: studentRoll,
            rfidUID: studentRfid,
            email: user.email,
            displayName: user.displayName || resolved?.name,
          },
          (allData, todayData) => {
            let hasNew = false;
            if (allData && Object.keys(allData).length > 0) {
              Object.keys(allData).forEach((dateKey) => {
                if (!personalAttendanceMap[dateKey]) {
                  personalAttendanceMap[dateKey] = {};
                }
                const dayMap = allData[dateKey];
                if (dayMap && dayMap[studentRfid]) {
                  personalAttendanceMap[dateKey][studentRfid] = dayMap[studentRfid];
                  hasNew = true;
                }
              });
            }
            if (todayData && todayData[studentRfid]) {
              personalTodayMap[studentRfid] = todayData[studentRfid];
              hasNew = true;
            }
            if (hasNew) {
              emitStudentUpdate();
            }
          },
          (error) => {
            console.warn('Realtime Database student central attendance notice:', error);
          }
        );

        unsubscribeAll = () => {
          off(attendanceRef, 'value', unsubRoot);
          studentChildCleanups.forEach((cleanup) => {
            try {
              cleanup();
            } catch {}
          });
          try {
            unsubFallback();
          } catch {}
        };
      } catch (e: any) {
        console.warn('Student attendance subscription error:', e);
        setIsLoading(false);
      }
    }

    return () => {
      unsubscribeConn();
      unsubscribeCmd();
      unsubscribeReset();
      unsubscribeStudents();
      unsubscribeToday();
      unsubscribeAll();
      unsubscribeAudit();
      unsubscribeTrash();
      unsubscribeSusp();
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

  // Actual count of active registered students in database
  const totalStudentsCount = studentsList.filter((s) => s.status !== 'inactive').length;
  
  // Actual present students today based on verified records in todayAttendance
  const presentTodayCount = useMemo(() => {
    let count = 0;
    for (const uid of Object.keys(todayAttendance)) {
      const rec = todayAttendance[uid];
      if (rec && rec.status === 'Present' && !rec.isDeleted && students[uid] && students[uid].status !== 'inactive') {
        count++;
      }
    }
    return count;
  }, [todayAttendance, students]);

  // Actual absent students today
  const absentTodayCount = Math.max(0, totalStudentsCount - presentTodayCount);

  // Actual attendance percentage calculated strictly from database records
  const todayPercentage = useMemo(() => {
    if (totalStudentsCount === 0) return 0;
    return Math.round((presentTodayCount / totalStudentsCount) * 100);
  }, [presentTodayCount, totalStudentsCount]);

  // Weekly Stats (last 7 days) strictly calculated from actual database records without fake numbers
  const weeklyStats: DayStats[] = useMemo(() => {
    const days: DayStats[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const totalCount = Math.max(totalStudentsCount, 1);

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const dayName = dayNames[d.getDay()];

      let dayPresent = 0;
      if (dateKey === todayStr) {
        dayPresent = presentTodayCount;
      } else if (allAttendance[dateKey]) {
        dayPresent = Object.keys(allAttendance[dateKey]).filter((uid) => {
          const rec = allAttendance[dateKey][uid];
          return rec && rec.status === 'Present' && !rec.isDeleted && students[uid] && students[uid].status !== 'inactive';
        }).length;
      }

      const calculatedPresent = dayPresent;
      const calculatedAbsent = Math.max(0, totalStudentsCount - calculatedPresent);
      const percentage = totalStudentsCount > 0 ? Math.round((calculatedPresent / totalStudentsCount) * 100) : 0;

      days.push({
        date: dateKey,
        dayName,
        present: calculatedPresent,
        absent: calculatedAbsent,
        total: totalCount,
        percentage,
      });
    }

    return days;
  }, [allAttendance, todayStr, presentTodayCount, totalStudentsCount, students]);

  // Monthly Stats (last 30 days) strictly calculated from actual database records
  const monthlyStats: DayStats[] = useMemo(() => {
    const days: DayStats[] = [];
    const totalCount = Math.max(totalStudentsCount, 1);

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const label = `${d.getDate()}/${d.getMonth() + 1}`;

      let dayPresent = 0;
      if (dateKey === todayStr) {
        dayPresent = presentTodayCount;
      } else if (allAttendance[dateKey]) {
        dayPresent = Object.keys(allAttendance[dateKey]).filter((uid) => {
          const rec = allAttendance[dateKey][uid];
          return rec && rec.status === 'Present' && !rec.isDeleted && students[uid] && students[uid].status !== 'inactive';
        }).length;
      }

      const calculatedPresent = dayPresent;
      const calculatedAbsent = Math.max(0, totalStudentsCount - calculatedPresent);
      const percentage = totalStudentsCount > 0 ? Math.round((calculatedPresent / totalStudentsCount) * 100) : 0;

      days.push({
        date: dateKey,
        dayName: label,
        present: calculatedPresent,
        absent: calculatedAbsent,
        total: totalCount,
        percentage,
      });
    }

    return days;
  }, [allAttendance, todayStr, presentTodayCount, totalStudentsCount, students]);

  // Student CRUD (Writes directly to Firebase Realtime Database)
  const addOrUpdateStudent = useCallback(async (student: Student) => {
    const formatted = {
      ...student,
      uid: student.uid.trim().toUpperCase(),
    };

    setStudents((prev) => ({
      ...prev,
      [formatted.uid]: formatted,
    }));

    try {
      await fbSaveStudent(formatted);
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

  // Process RFID card scan (used by hardware and test endpoint)
  const scanRfidCard = useCallback(async (uidInput: string, device: string = 'ESP32-RFID-01') => {
    const uid = uidInput.trim().toUpperCase();
    const result = await recordAttendanceScan(uid, {
      device,
      studentsLookup: students,
    });

    if (result.record) {
      if (result.record.status === 'Present') {
        setTodayAttendance((prev) => ({
          ...prev,
          [uid]: result.record!,
        }));
        setAllAttendance((prev) => ({
          ...prev,
          [result.record!.date]: {
            ...(prev[result.record!.date] || {}),
            [uid]: result.record!,
          },
        }));
      } else if (result.record.status === 'Unknown') {
        setUnknownScans((prev) => [result.record!, ...prev.slice(0, 49)]);
      }
    }

    setLastLiveEvent({
      record: result.record || {
        uid,
        timestamp: Date.now(),
        date: todayStr,
        time: new Date().toTimeString().split(' ')[0],
        status: result.success ? 'Present' : 'Unknown',
      },
      success: result.success,
      message: result.message,
    });

    return result;
  }, [students, todayStr]);

  const clearLastLiveEvent = useCallback(() => {
    setLastLiveEvent(null);
  }, []);

  // Seed default 3 students into Firebase Realtime Database
  const seedDefaultStudents = useCallback(async () => {
    for (const student of INITIAL_STUDENTS) {
      await addOrUpdateStudent(student);
    }
  }, [addOrUpdateStudent]);

  // Actual summary calculated for each student from real database records
  const getStudentAttendanceSummary = useCallback((uid: string): StudentAttendanceSummary => {
    const resolvedInfo = lookupStudentInfo(uid) || lookupStudentInfo(uid.toUpperCase());
    const targetRfid = (resolvedInfo?.rfidUID || uid).trim().toUpperCase();
    const targetRoll = resolvedInfo?.studentId;

    const student = students[targetRfid] || students[uid] || {
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

    // Helper to check if a record matches this student
    const isMatchingRecord = (rec: AttendanceRecord | undefined): boolean => {
      if (!rec) return false;
      const recCard = (rec.rfidUID || rec.uid || '').toUpperCase();
      if (targetRfid && recCard === targetRfid) return true;
      if (targetRoll && (rec.studentId?.toUpperCase() === targetRoll.toUpperCase() || rec.rollNumber?.toUpperCase() === targetRoll.toUpperCase())) return true;
      return false;
    };

    // Calculate from actual recorded dates in allAttendance
    const allDates = Object.keys(allAttendance);
    const totalWorkingDays = Math.max(allDates.length, 1);
    let presentCount = 0;
    let lastSeen: string | undefined = undefined;

    // Check today's actual attendance: strictly index by targetRfid, or match
    const todayRec = todayAttendance[targetRfid] || todayAttendance[targetRfid.toLowerCase()] || Object.values(todayAttendance).find(isMatchingRecord);
    if (todayRec && todayRec.status === 'Present') {
      presentCount++;
      lastSeen = `Today at ${todayRec.time}`;
    }

    // Check historical actual records: strictly index by targetRfid, or match
    allDates.forEach((dateKey) => {
      if (dateKey !== todayStr && allAttendance[dateKey]) {
        const dayMap = allAttendance[dateKey];
        const dayRec = dayMap[targetRfid] || dayMap[targetRfid.toLowerCase()] || Object.values(dayMap).find(isMatchingRecord);
        if (dayRec && dayRec.status === 'Present') {
          presentCount++;
          if (!lastSeen) {
            lastSeen = `${dateKey} at ${dayRec.time}`;
          }
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
  }, [students, allAttendance, todayAttendance, todayStr]);

  // System Reset Handlers
  const triggerAttendanceReset = useCallback(async (adminUid: string, adminEmail: string) => {
    const res = await resetAttendanceData(adminUid, adminEmail);
    // Immediately clear local state
    setTodayAttendance({});
    setAllAttendance({});
    setUnknownScans([]);
    setLastLiveEvent(null);
    return res;
  }, []);

  const triggerCompleteSystemReset = useCallback(async (adminUid: string, adminEmail: string) => {
    const res = await completeSystemReset(adminUid, adminEmail);
    // Immediately clear local students & attendance state
    setStudents({});
    setTodayAttendance({});
    setAllAttendance({});
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
  const editAttendance = useCallback(async (
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
  }, [user, registerUndo]);

  const deleteAttendance = useCallback(async (
    date: string,
    uid: string,
    reason: string
  ): Promise<{ success: boolean; message: string }> => {
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
  }, [user, registerUndo]);

  const bulkDeleteAttendanceRecords = useCallback(async (
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
  }, [user, registerUndo]);

  const bulkUpdateStatus = useCallback(async (
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
  }, [user, registerUndo]);

  const restoreTrashRecord = useCallback(async (trashId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await restoreDeletedAttendance(trashId, { email: user?.email, uid: user?.uid });
      return { success: true, message: `Successfully restored attendance record for ${res.restoredRecord.studentName || res.restoredRecord.uid}.` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed restoring record.' };
    }
  }, [user]);

  const restoreVersion = useCallback(async (date: string, uid: string, versionIndex: number): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await restorePreviousAttendance(date, uid, versionIndex, { email: user?.email, uid: user?.uid });
      return { success: true, message: `Reverted attendance to previous version.` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed reverting to version.' };
    }
  }, [user]);

  const overrideToAbsent = useCallback(async (date: string, uid: string, reason: string): Promise<{ success: boolean; message: string }> => {
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
  }, [user, registerUndo]);

  const removeOverride = useCallback(async (date: string, uid: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await removeAttendanceOverride(date, uid, { email: user?.email, uid: user?.uid });
      return { success: true, message: `Removed override for ${res.updatedRecord.studentName || uid} and restored Present status.` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed removing override.' };
    }
  }, [user]);

  const suspendStudentAccount = useCallback(async (
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
  }, [user]);

  const unsuspendStudentAccount = useCallback(async (studentRfid: string, reason: string): Promise<{ success: boolean; message: string }> => {
    try {
      await unsuspendStudent(studentRfid, reason, { email: user?.email, uid: user?.uid });
      return { success: true, message: `Student unsuspended. RFID attendance restored.` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed unsuspending student.' };
    }
  }, [user]);

  // Manual Re-fetch & Sync directly from Firebase
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

      setAllAttendance(result.allAttendance);
      setTodayAttendance(result.todayAttendance);
      setIsDbConnected(true);
      setDbErrorMessage(null);

      const msg = `Synchronized ${result.recordCount} attendance record${result.recordCount === 1 ? '' : 's'} with Firebase.`;
      return { success: true, count: result.recordCount, message: msg };
    } catch (err: any) {
      console.warn('Manual refresh notice:', err);
      return { 
        success: false, 
        count: 0, 
        message: err?.message || 'Failed to re-fetch attendance from Firebase.' 
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
        totalStudentsCount,
        presentTodayCount,
        absentTodayCount,
        todayPercentage,
        weeklyStats,
        monthlyStats,
        isLoading,
        isRefreshing,
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
