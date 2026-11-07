import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Student, 
  AttendanceRecord, 
  DayStats, 
  StudentAttendanceSummary,
  DeviceCommand,
  ResetAuditLog,
  StudentRegistrationInput
} from '../types';
import { 
  subscribeToStudents, 
  subscribeToDateAttendance, 
  subscribeToAllAttendance, 
  subscribeToStudentAttendance,
  subscribeToStudentTodayAttendance,
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
  INITIAL_STUDENTS,
  CONFIGURED_ADMIN_UID
} from '../services/firebase';
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
  
  // Genuine Firebase State indicators
  isLoading: boolean;
  isDbConnected: boolean;
  dbErrorMessage: string | null;
  lastLiveEvent: LiveScanEvent | null;
  clearLastLiveEvent: () => void;

  // System Reset Telemetry
  lastResetLog: ResetAuditLog | null;
  latestDeviceCommand: DeviceCommand | null;
  
  // Actions
  addOrUpdateStudent: (student: Student) => Promise<void>;
  createStudentAccount: (input: StudentRegistrationInput) => Promise<{ authUid: string; student: Student }>;
  deleteStudent: (uid: string) => Promise<void>;
  scanRfidCard: (uid: string, device?: string) => Promise<{ success: boolean; message: string; record?: AttendanceRecord }>;
  seedDefaultStudents: () => Promise<void>;
  getStudentAttendanceSummary: (uid: string) => StudentAttendanceSummary;
  triggerAttendanceReset: (adminUid: string, adminEmail: string) => Promise<{ success: boolean; message: string }>;
  triggerCompleteSystemReset: (adminUid: string, adminEmail: string) => Promise<{ success: boolean; message: string; commandId: string }>;
  retryConnection: () => Promise<void>;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

export const AttendanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, refreshToken } = useAuth();
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [todayAttendance, setTodayAttendance] = useState<Record<string, AttendanceRecord>>({});
  const [allAttendance, setAllAttendance] = useState<Record<string, Record<string, AttendanceRecord>>>({});
  const [unknownScans, setUnknownScans] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [lastLiveEvent, setLastLiveEvent] = useState<LiveScanEvent | null>(null);
  const [lastResetLog, setLastResetLog] = useState<ResetAuditLog | null>(null);
  const [latestDeviceCommand, setLatestDeviceCommand] = useState<DeviceCommand | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

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

    if (user.role === 'admin') {
      // Admin: Listen to device commands & reset logs
      unsubscribeCmd = subscribeToDeviceCommands((cmd) => {
        setLatestDeviceCommand(cmd);
      });

      unsubscribeReset = subscribeToLastReset((log) => {
        setLastResetLog(log);
      });

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
        // Admin: Subscribe to today's attendance
        unsubscribeToday = subscribeToDateAttendance(
          todayStr,
          (data) => {
            setTodayAttendance(data || {});
            setIsLoading(false);
          },
          (error) => {
            console.warn('Realtime Database today attendance notice:', error);
          }
        );

        // Admin: Subscribe to all attendance records
        unsubscribeAll = subscribeToAllAttendance(
          (data) => {
            setAllAttendance(data || {});
            setIsLoading(false);
          },
          (error) => {
            console.warn('Realtime Database all attendance notice:', error);
          }
        );
      } catch (e: any) {
        console.warn('Attendance subscription error:', e);
        setIsLoading(false);
      }
    } else if (user.role === 'student' && user.rfidUID) {
      const studentRfid = user.rfidUID.trim().toUpperCase();

      // Student: Setup self student record only (no other students accessible)
      setStudents({
        [studentRfid]: {
          uid: studentRfid,
          name: user.displayName,
          studentId: user.studentId || '',
          department: user.department || 'General',
          year: user.year || '1st Year',
          semester: user.semester || '',
          email: user.email || '',
          phone: user.phone || '',
          registeredAt: new Date().toISOString(),
          status: 'active',
          authUid: user.uid,
        }
      });

      try {
        // Student: Subscribe strictly to their own today's attendance
        unsubscribeToday = subscribeToStudentTodayAttendance(
          todayStr,
          studentRfid,
          (record) => {
            setTodayAttendance(record ? { [studentRfid]: record } : {});
            setIsLoading(false);
          }
        );

        // Student: Subscribe strictly to their own historical attendance records
        unsubscribeAll = subscribeToStudentAttendance(
          studentRfid,
          (records) => {
            const personalAttendanceMap: Record<string, Record<string, AttendanceRecord>> = {};
            records.forEach((r) => {
              const dateKey = r.date;
              if (!personalAttendanceMap[dateKey]) {
                personalAttendanceMap[dateKey] = {};
              }
              personalAttendanceMap[dateKey][studentRfid] = r;
            });
            setAllAttendance(personalAttendanceMap);
            setIsLoading(false);
          }
        );
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
    };
  }, [user, todayStr, refreshToken, retryTrigger]);

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

  // Today records sorted by actual timestamp descending
  const todayRecordsList = useMemo(() => {
    return Object.values(todayAttendance).sort((a, b) => b.timestamp - a.timestamp);
  }, [todayAttendance]);

  // Actual count of active registered students in database
  const totalStudentsCount = studentsList.filter((s) => s.status !== 'inactive').length;
  
  // Actual present students today based on verified records in todayAttendance
  const presentTodayCount = useMemo(() => {
    let count = 0;
    for (const uid of Object.keys(todayAttendance)) {
      if (students[uid] && students[uid].status !== 'inactive') {
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
        dayPresent = Object.keys(allAttendance[dateKey]).filter(
          (uid) => students[uid] && students[uid].status !== 'inactive'
        ).length;
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
        dayPresent = Object.keys(allAttendance[dateKey]).filter(
          (uid) => students[uid] && students[uid].status !== 'inactive'
        ).length;
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
    const student = students[uid] || {
      uid,
      name: 'Unknown',
      studentId: 'N/A',
      department: 'N/A',
      year: 'N/A',
      email: '',
      phone: '',
      registeredAt: new Date().toISOString(),
      status: 'active',
    };

    // Calculate from actual recorded dates in allAttendance
    const allDates = Object.keys(allAttendance);
    const totalWorkingDays = Math.max(allDates.length, 1);
    let presentCount = 0;
    let lastSeen: string | undefined = undefined;

    // Check today's actual attendance
    if (todayAttendance[uid]) {
      presentCount++;
      lastSeen = `Today at ${todayAttendance[uid].time}`;
    }

    // Check historical actual records
    allDates.forEach((dateKey) => {
      if (dateKey !== todayStr && allAttendance[dateKey]?.[uid]) {
        presentCount++;
        if (!lastSeen) {
          lastSeen = `${dateKey} at ${allAttendance[dateKey][uid].time}`;
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
        isDbConnected,
        dbErrorMessage,
        lastLiveEvent,
        clearLastLiveEvent,
        lastResetLog,
        latestDeviceCommand,
        addOrUpdateStudent,
        createStudentAccount,
        deleteStudent,
        scanRfidCard,
        seedDefaultStudents,
        getStudentAttendanceSummary,
        triggerAttendanceReset,
        triggerCompleteSystemReset,
        retryConnection,
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
