import React, { useMemo } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  TrendingUp, 
  CreditCard, 
  Clock, 
  Cpu, 
  GraduationCap, 
  User, 
  Mail, 
  Building2,
  CalendarDays,
  RotateCcw,
  ShieldAlert,
  AlertTriangle,
  Ban
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useAttendance } from '../context/AttendanceContext';
import { StudentTab } from '../components/StudentSidebar';
import { getISTYearMonthDay } from '../utils/dateUtils';

interface StudentDashboardPageProps {
  onNavigateTab: (tab: StudentTab) => void;
}

export const StudentDashboardPage: React.FC<StudentDashboardPageProps> = ({ onNavigateTab }) => {
  const { user } = useAuth();
  const {
    allAttendance,
    todayAttendance,
    refreshAttendance,
    isRefreshing,
    isLoading,
    isDbConnected,
    dbErrorMessage,
    dbDiagnostic,
    retryConnection,
    studentsList,
    suspensions,
    applicableWorkingDates,
    workingDays,
    todayStr,
    attendanceDeadline,
    isAfterDeadline,
    isTodayHoliday,
  } = useAttendance();

  // Dynamically match live synced student profile (no hardcoded fallback)
  const studentProfile = useMemo(() => {
    return (
      studentsList.find(
        (s) =>
          (user?.studentDbId && s.studentDbId === user.studentDbId) ||
          (user?.rfidUID && (s.rfidUID || s.uid || '').toUpperCase() === user.rfidUID.toUpperCase()) ||
          (user?.uid && s.authUid === user.uid)
      ) ||
      studentsList[0] ||
      null
    );
  }, [studentsList, user]);

  const studentRfid = (studentProfile?.rfidUID || studentProfile?.uid || user?.rfidUID || '').trim().toUpperCase();
  const studentDbId = (studentProfile?.studentDbId || user?.studentDbId || studentRfid).trim();
  const studentAuthUid = user?.uid;
  const studentEmail = (studentProfile?.email || user?.email || '').toLowerCase() || undefined;
  const studentRoll = (studentProfile?.studentId || user?.studentId || user?.rollNumber || '').trim();
  const studentNameDisplay = studentProfile?.name || user?.displayName || 'Student';

  const activeSuspension = useMemo(() => {
    if (studentProfile?.activeSuspension && studentProfile.status === 'suspended') {
      return studentProfile.activeSuspension;
    }
    const studentSuspList =
      (studentDbId ? suspensions[studentDbId] : undefined) ||
      (studentRfid ? suspensions[studentRfid] : undefined) ||
      [];
    return studentSuspList.find(
      (s: any) => s.status === 'active' && s.endDate >= todayStr
    );
  }, [studentProfile, suspensions, studentDbId, studentRfid, todayStr]);

  const isSuspended = Boolean(activeSuspension || studentProfile?.status === 'suspended' || studentProfile?.isSuspended);

  // Extract all attendance records for this student with resilient multi-identifier matching
  const studentRecords = useMemo(() => {
    const recordsMap = new Map<string, { 
      date: string; 
      time: string; 
      timestamp: number; 
      device: string; 
      status: string;
      isOverridden?: boolean;
      overrideReason?: string;
    }>();

    // Helper to test if a record belongs to this student
    const isMatchingStudent = (item: any): boolean => {
      if (!item) return false;
      const itemDbId = (item.studentDbId || '')?.toString().trim();
      if (studentDbId && itemDbId && itemDbId === studentDbId) return true;
      const itemRfid = (item.rfidUID || item.uid || item.studentRfid || '')?.toString().trim().toUpperCase();
      if (studentRfid && itemRfid && itemRfid === studentRfid) return true;
      if (studentAuthUid && (item.authUid === studentAuthUid || item.userId === studentAuthUid)) return true;
      if (studentEmail && item.email && item.email.toLowerCase() === studentEmail) return true;
      const itemRoll = (item.studentId || item.rollNumber || '')?.toString().trim().toUpperCase();
      if (studentRoll && itemRoll && itemRoll === studentRoll.toUpperCase()) return true;
      return false;
    };

    // 1. Scan all dates in allAttendance
    const dateKeys = Object.keys(allAttendance).sort();
    dateKeys.forEach((date) => {
      const dayData = allAttendance[date];
      if (dayData) {
        const candidates = [
          studentDbId ? dayData[studentDbId] : undefined,
          studentRfid ? dayData[studentRfid] : undefined,
          studentRfid ? dayData[studentRfid.toLowerCase()] : undefined,
          studentAuthUid ? dayData[studentAuthUid] : undefined,
          ...Object.values(dayData),
        ];

        for (const item of candidates) {
          if (item && isMatchingStudent(item)) {
            if (item.isDeleted) continue;

            const dateVal = item.date || date;
            recordsMap.set(dateVal, {
              date: dateVal,
              time: item.time || '',
              timestamp: item.timestamp || new Date(`${dateVal}T12:00:00+05:30`).getTime(),
              device: item.device || 'ESP32-RFID-01',
              status: item.status || 'Present',
              isOverridden: Boolean(item.isOverridden),
              overrideReason: item.overrideReason || '',
            });
            break;
          }
        }
      }
    });

    // 2. Also check todayAttendance (strictly for todayStr)
    const todayCandidates = [
      studentDbId ? todayAttendance[studentDbId] : undefined,
      studentRfid ? todayAttendance[studentRfid] : undefined,
      studentRfid ? todayAttendance[studentRfid.toLowerCase()] : undefined,
      studentAuthUid ? todayAttendance[studentAuthUid] : undefined,
      ...Object.values(todayAttendance),
    ];

    for (const item of todayCandidates) {
      if (item && isMatchingStudent(item)) {
        if (item.isDeleted) continue;
        const dateVal = item.date || todayStr;
        if (dateVal === todayStr) {
          recordsMap.set(dateVal, {
            date: dateVal,
            time: item.time || '',
            timestamp: item.timestamp || Date.now(),
            device: item.device || 'ESP32-RFID-01',
            status: item.status || 'Present',
            isOverridden: Boolean(item.isOverridden),
            overrideReason: item.overrideReason || '',
          });
        }
        break;
      }
    }

    return Array.from(recordsMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [allAttendance, todayAttendance, studentDbId, studentRfid, studentAuthUid, studentEmail, studentRoll, todayStr]);

  // Total applicable institutional working days (excludes holidays & future dates)
  const allRecordedDates = useMemo(() => {
    return applicableWorkingDates.filter((d) => !workingDays[d]?.isHoliday && d <= todayStr);
  }, [applicableWorkingDates, workingDays, todayStr]);

  // Strictly match TODAY's IST record (never fall back to a past scan)
  const todayRecord = useMemo(() => {
    const matchRecord = studentRecords.find((r) => r.date === todayStr);
    if (matchRecord) return matchRecord;

    const todayCandidates = [
      studentDbId ? todayAttendance[studentDbId] : undefined,
      studentRfid ? todayAttendance[studentRfid] : undefined,
      studentRfid ? todayAttendance[studentRfid.toLowerCase()] : undefined,
      studentAuthUid ? todayAttendance[studentAuthUid] : undefined,
      ...Object.values(todayAttendance),
    ];
    for (const item of todayCandidates) {
      if (
        item &&
        !item.isDeleted &&
        (item.date === todayStr || !item.date) &&
        ((studentDbId && item.studentDbId === studentDbId) ||
          (studentRfid && (item.rfidUID?.toUpperCase() === studentRfid || item.uid?.toUpperCase() === studentRfid)) ||
          (studentAuthUid && (item.authUid === studentAuthUid || item.userId === studentAuthUid)))
      ) {
        return {
          date: item.date || todayStr,
          time: item.time || '',
          timestamp: item.timestamp || Date.now(),
          device: item.device || 'ESP32-RFID-01',
          status: item.status || 'Present',
          isOverridden: Boolean(item.isOverridden),
          overrideReason: item.overrideReason || '',
        };
      }
    }

    return null;
  }, [studentRecords, todayAttendance, todayStr, studentDbId, studentRfid, studentAuthUid]);

  const isPresentToday = Boolean(todayRecord && todayRecord.status === 'Present');
  const isExplicitAbsentToday = Boolean(todayRecord && todayRecord.status === 'Absent');
  const isPendingToday = !isPresentToday && !isExplicitAbsentToday && !isTodayHoliday && !isAfterDeadline;
  const isAbsentToday = isExplicitAbsentToday || (!isPresentToday && !isTodayHoliday && isAfterDeadline);
  const latestPresentScan = useMemo(
    () => studentRecords.find((r) => r.status === 'Present') || null,
    [studentRecords]
  );

  // Never classify today as absent while the attendance window is still open
  const evaluatedWorkingDates = useMemo(() => {
    return allRecordedDates.filter((d) => {
      if (d < todayStr) return true;
      if (d === todayStr) {
        return isPresentToday || isExplicitAbsentToday || isAfterDeadline;
      }
      return false;
    });
  }, [allRecordedDates, todayStr, isPresentToday, isExplicitAbsentToday, isAfterDeadline]);

  const totalWorkingDays = evaluatedWorkingDates.length;
  const presentDays = evaluatedWorkingDates.filter((dateKey) =>
    studentRecords.some((r) => r.date === dateKey && r.status === 'Present')
  ).length;
  const absentDays = Math.max(0, totalWorkingDays - presentDays);
  const attendanceRate = totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 100) : 0;

  // Monthly breakdown for Chart (IST year/month)
  const monthlyChartData = useMemo(() => {
    const monthsMap: Record<string, { month: string; Present: number; Absent: number }> = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const { year: istYear, month: istMonth } = getISTYearMonthDay();
    for (let i = 3; i >= 0; i--) {
      const d = new Date(Date.UTC(istYear, istMonth - 1 - i, 1));
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const label = `${monthNames[m]} ${y}`;
      monthsMap[key] = { month: label, Present: 0, Absent: 0 };
    }

    evaluatedWorkingDates.forEach((date) => {
      if (workingDays[date]?.isHoliday) return;
      const monthKey = date.substring(0, 7);
      if (monthsMap[monthKey]) {
        const isPresent = studentRecords.some((r) => r.date === date && r.status === 'Present');
        if (isPresent) {
          monthsMap[monthKey].Present += 1;
        } else {
          monthsMap[monthKey].Absent += 1;
        }
      }
    });

    return Object.values(monthsMap);
  }, [evaluatedWorkingDates, workingDays, studentRecords]);

  // Donut chart data
  const donutData = useMemo(() => {
    if (totalWorkingDays === 0) {
      return [{ name: 'No Data', value: 1, color: '#334155' }];
    }
    return [
      { name: 'Present', value: presentDays, color: '#10b981' },
      { name: 'Absent', value: absentDays, color: '#f43f5e' },
    ];
  }, [presentDays, absentDays, totalWorkingDays]);

  return (
    <div className="space-y-6">
      {/* Firebase Connection / Permission / Missing UID Diagnostic Banner */}
      {(dbErrorMessage || (!isLoading && !isDbConnected)) && (
        <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-rose-300">
                {dbErrorMessage
                  ? `Firebase Sync Diagnostic (${dbDiagnostic.label})`
                  : 'Realtime Database Disconnected'}
              </p>
              <p className="font-mono text-[11px] text-rose-200/90 break-all">
                {dbErrorMessage || dbDiagnostic?.message || 'Realtime listener is offline. Reconnecting to Firebase RTDB...'}
              </p>
            </div>
          </div>
          <button
            onClick={() => retryConnection()}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry Sync</span>
          </button>
        </div>
      )}

      {/* Student Account Suspension Alert Banner */}
      {isSuspended && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-950/60 via-red-950/40 to-slate-900 border border-amber-500/40 text-amber-200 shadow-xl flex items-start gap-3.5 animate-in fade-in slide-in-from-top-2">
          <div className="p-2 rounded-2xl bg-amber-500/20 text-amber-400 shrink-0 border border-amber-500/30">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-amber-300">
                Attendance Account Suspended
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/30">
                {activeSuspension?.duration || 'Active Suspension'}
              </span>
            </div>
            <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
              Your RFID attendance recording privileges are currently suspended 
              {activeSuspension?.endDate ? ` until ${activeSuspension.endDate}` : ''}. 
              Card scans on institutional hardware readers will be rejected during this period.
            </p>
            {activeSuspension?.reason && (
              <p className="text-xs text-slate-300 mt-2 bg-black/40 p-2.5 rounded-xl border border-amber-500/20 font-mono">
                <strong className="text-amber-400">Official Reason:</strong> {activeSuspension.reason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Student Profile Hero Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d1527] via-[#0a0f1d] to-[#070b14] border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-500 flex items-center justify-center text-white text-2xl font-extrabold shadow-xl shadow-emerald-500/20 border border-emerald-400/30 shrink-0">
              {studentNameDisplay.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  {studentNameDisplay}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-semibold text-emerald-400">
                  Student Account
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-emerald-400" />
                <span>Roll No: <strong className="text-slate-200 font-mono">{studentRoll || 'N/A'}</strong></span>
                <span className="text-slate-600">&bull;</span>
                <span>{studentProfile?.department || user?.department || 'Department of Technology'}</span>
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2 text-[11px]">
                {(studentProfile?.year || user?.year) && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60 flex items-center gap-1">
                    <CalendarDays className="w-3 h-3 text-cyan-400" />
                    <span>{studentProfile?.year || user?.year}</span>
                  </span>
                )}
                {(studentProfile?.semester || user?.semester) && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60">
                    {studentProfile?.semester || user?.semester}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 font-mono flex items-center gap-1">
                  <CreditCard className="w-3 h-3 text-emerald-400" />
                  <span>Card UID: {studentRfid || 'Unassigned'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Today Check-in Status Pill (Strictly IST Today) */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex flex-col items-start sm:items-end justify-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-1">
              Today&apos;s Status ({todayStr} IST)
            </span>
            {isTodayHoliday ? (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
                <span className="text-sm font-bold text-amber-300">HOLIDAY</span>
              </div>
            ) : isPresentToday ? (
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span className="text-sm font-bold text-emerald-400">PRESENT</span>
                <span className="text-xs text-slate-400 font-mono">({todayRecord?.time})</span>
              </div>
            ) : isAbsentToday ? (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
                <span className="text-sm font-bold text-rose-400">
                  {todayRecord?.isOverridden ? 'ABSENT (OVERRIDE)' : 'ABSENT'}
                </span>
              </div>
            ) : isPendingToday ? (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span className="text-sm font-bold text-amber-300">PENDING</span>
                <span className="text-[11px] text-slate-400 font-mono">(Cutoff {attendanceDeadline} IST)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400"></span>
                <span className="text-sm font-bold text-slate-300">NOT SCANNED</span>
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-1">
              {isTodayHoliday
                ? workingDays[todayStr]?.label || 'Non-working institutional day'
                : isPresentToday
                  ? `Verified via ${todayRecord?.device || 'ESP32-RFID-01'}`
                  : isAbsentToday
                    ? todayRecord?.overrideReason || `Attendance window closed at ${attendanceDeadline} IST`
                    : 'Tap your registered RFID card at the reader'}
            </p>
            {!isPresentToday && latestPresentScan && (
              <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                Last recorded scan: {latestPresentScan.date} at {latestPresentScan.time}
              </p>
            )}
            <button
              onClick={() => refreshAttendance()}
              disabled={isRefreshing}
              className={`mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition cursor-pointer ${
                isRefreshing
                  ? 'bg-slate-900 border-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-800/90 hover:bg-slate-750 border-slate-700 text-emerald-300 hover:text-emerald-200'
              }`}
              title="Re-fetch attendance records directly from Firebase"
            >
              <RotateCcw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Attendance'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Working Days */}
        <div className="p-5 rounded-2xl bg-[#0c1220] border border-slate-800/80 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Recorded Days
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white font-mono">{totalWorkingDays}</span>
            <span className="text-xs text-slate-500">working days</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Recorded by RFID hardware</p>
        </div>

        {/* Present Days */}
        <div className="p-5 rounded-2xl bg-[#0c1220] border border-slate-800/80 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Present Days
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-400 font-mono">{presentDays}</span>
            <span className="text-xs text-slate-500">attended</span>
          </div>
          <p className="mt-2 text-[11px] text-emerald-400/80 flex items-center gap-1">
            <span>Verified RFID check-ins</span>
          </p>
        </div>

        {/* Absent Days */}
        <div className="p-5 rounded-2xl bg-[#0c1220] border border-slate-800/80 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Absent Days
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-rose-400 font-mono">{absentDays}</span>
            <span className="text-xs text-slate-500">missed</span>
          </div>
          <p className="mt-2 text-[11px] text-rose-400/80">No scan logged on date</p>
        </div>

        {/* Attendance Percentage */}
        <div className="p-5 rounded-2xl bg-[#0c1220] border border-slate-800/80 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Attendance Rate
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white font-mono">{attendanceRate}%</span>
            <span className={`text-xs font-semibold ${attendanceRate >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {attendanceRate >= 75 ? 'Good standing' : 'Needs attention'}
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-3 w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                attendanceRate >= 75 ? 'bg-emerald-500' : attendanceRate >= 60 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, attendanceRate)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Attendance Chart */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-[#0c1220] border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Monthly Attendance Trend</h3>
              <p className="text-xs text-slate-400">Present vs Absent days over recent months</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-300">Present</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-slate-300">Absent</span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    borderColor: '#334155', 
                    borderRadius: '0.75rem', 
                    color: '#f8fafc',
                    fontSize: '12px'
                  }} 
                />
                <Bar dataKey="Present" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Absent" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ratio Donut Chart */}
        <div className="p-6 rounded-3xl bg-[#0c1220] border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Overall Attendance Ratio</h3>
            <p className="text-xs text-slate-400">Total institutional presence breakdown</p>
          </div>

          <div className="h-52 w-full flex items-center justify-center relative my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {donutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    borderColor: '#334155', 
                    borderRadius: '0.75rem', 
                    color: '#f8fafc',
                    fontSize: '12px'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-extrabold text-white font-mono">{attendanceRate}%</span>
              <span className="text-[10px] text-slate-400 uppercase font-mono">Present</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800/80">
            <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-center">
              <p className="text-[10px] text-emerald-400 font-semibold uppercase">Present</p>
              <p className="text-base font-bold text-white font-mono">{presentDays} days</p>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-500/20 text-center">
              <p className="text-[10px] text-rose-400 font-semibold uppercase">Absent</p>
              <p className="text-base font-bold text-white font-mono">{absentDays} days</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Scans & Quick Actions */}
      <div className="p-6 rounded-3xl bg-[#0c1220] border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">Recent Personal Attendance Scans</h3>
          </div>
          <button
            onClick={() => onNavigateTab('attendance')}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition cursor-pointer"
          >
            View Full History &rarr;
          </button>
        </div>

        {studentRecords.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-dashed border-slate-800">
            <CreditCard className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-medium">
              {dbDiagnostic.code === 'empty_records'
                ? 'Attendance records are currently empty'
                : 'No RFID attendance scans recorded yet'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              When your RFID card ({studentRfid || 'UID'}) is scanned at the hardware terminal, it will appear here automatically in real time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Time</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Hardware Device</th>
                  <th className="py-3 px-3 text-right">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {studentRecords.slice(0, 5).map((rec, idx) => (
                  <tr key={idx} className="hover:bg-slate-850/30 transition">
                    <td className="py-3 px-3 font-mono text-slate-200">
                      {rec.date}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {rec.time}
                    </td>
                    <td className="py-3 px-3">
                      {rec.status === 'Present' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold text-[11px] border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Present</span>
                        </span>
                      ) : rec.isOverridden ? (
                        <span 
                          title={rec.overrideReason ? `Admin Override: ${rec.overrideReason}` : 'Overridden by Administrator'}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 font-semibold text-[11px] border border-rose-500/30"
                        >
                          <Ban className="w-3 h-3 text-rose-400" />
                          <span>Absent (Admin Override)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-semibold text-[11px] border border-rose-500/20">
                          <XCircle className="w-3 h-3" />
                          <span>Absent</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Cpu className="w-3 h-3 text-slate-500" />
                        <span>{rec.device}</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-[11px] text-emerald-400/80 font-mono">
                      RFID-VERIFIED
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
