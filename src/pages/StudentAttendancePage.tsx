import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  Cpu, 
  RotateCcw,
  CreditCard,
  AlertCircle,
  X,
  ShieldAlert,
  Ban
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAttendance } from '../context/AttendanceContext';
import { lookupStudentInfo } from '../services/firebase';

export const StudentAttendancePage: React.FC = () => {
  const { user } = useAuth();
  const { allAttendance, todayAttendance, refreshAttendance, isRefreshing } = useAttendance();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Present' | 'Absent'>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [refreshNotification, setRefreshNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Resilient student metadata resolution
  const resolvedInfo = useMemo(() => {
    return (
      lookupStudentInfo(user?.rfidUID || '') ||
      lookupStudentInfo(user?.studentId || user?.rollNumber || '') ||
      lookupStudentInfo(user?.uid || '') ||
      (user?.email ? lookupStudentInfo(user.email) : null) ||
      (user?.displayName ? lookupStudentInfo(user.displayName) : null)
    );
  }, [user]);

  const studentRfid = (user?.rfidUID || resolvedInfo?.rfidUID || '').trim().toUpperCase();
  const studentAuthUid = user?.uid;
  const studentEmail = user?.email?.toLowerCase();
  const studentRoll = (user?.studentId || user?.rollNumber || resolvedInfo?.studentId || '').trim();

  const now = new Date();
  const localTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const utcTodayStr = now.toISOString().split('T')[0];

  // Build daily records for every institutional recorded date
  const records = useMemo(() => {
    const dates = new Set<string>(Object.keys(allAttendance));
    dates.add(localTodayStr);
    dates.add(utcTodayStr);
    dates.add('2026-11-08');

    Object.values(todayAttendance).forEach((item) => {
      if (item?.date) dates.add(item.date);
    });

    const isMatchingStudent = (item: any): boolean => {
      if (!item) return false;
      const itemRfid = (item.rfidUID || item.uid || item.studentRfid || '')?.toString().trim().toUpperCase();
      if (studentRfid && itemRfid && itemRfid === studentRfid) return true;
      if (studentAuthUid && (item.authUid === studentAuthUid || item.userId === studentAuthUid)) return true;
      if (studentEmail && item.email && item.email.toLowerCase() === studentEmail) return true;
      const itemRoll = (item.studentId || item.rollNumber || '')?.toString().trim().toUpperCase();
      if (studentRoll && itemRoll && itemRoll === studentRoll.toUpperCase()) return true;
      const itemName = (item.studentName || item.name || '')?.toString().trim().toLowerCase();
      if (user?.displayName && itemName && (itemName === user.displayName.trim().toLowerCase() || itemName.includes(user.displayName.trim().toLowerCase()))) return true;
      if (resolvedInfo?.name && itemName && itemName.includes(resolvedInfo.name.trim().toLowerCase())) return true;
      return false;
    };

    const sortedDates = Array.from(dates).sort().reverse();

    return sortedDates.map((date) => {
      let isPresent = false;
      let time = '--:--:--';
      let device = 'ESP32-RFID-01';
      let isOverridden = false;
      let overrideReason = '';

      // 1. Check in allAttendance[date]
      if (allAttendance[date]) {
        const candidates = [
          studentRfid ? allAttendance[date][studentRfid] : undefined,
          studentRfid ? allAttendance[date][studentRfid.toLowerCase()] : undefined,
          studentAuthUid ? allAttendance[date][studentAuthUid] : undefined,
          ...Object.values(allAttendance[date]),
        ];
        for (const item of candidates) {
          if (item && isMatchingStudent(item)) {
            if (item.isDeleted) continue;
            if (item.status === 'Present') {
              isPresent = true;
              time = item.time || time;
              device = item.device || device;
              break;
            } else if (item.isOverridden) {
              isOverridden = true;
              overrideReason = item.overrideReason || '';
              time = item.time || time;
              device = item.device || device;
            }
          }
        }
      }

      // 2. Check in todayAttendance if this date matches
      if (!isPresent) {
        const todayCandidates = [
          studentRfid ? todayAttendance[studentRfid] : undefined,
          studentRfid ? todayAttendance[studentRfid.toLowerCase()] : undefined,
          studentAuthUid ? todayAttendance[studentAuthUid] : undefined,
          ...Object.values(todayAttendance),
        ];
        for (const item of todayCandidates) {
          if (item && isMatchingStudent(item)) {
            if (item.isDeleted) continue;
            if (item.status === 'Present' && (item.date === date || (!item.date && (date === localTodayStr || date === utcTodayStr)))) {
              isPresent = true;
              time = item.time || time;
              device = item.device || device;
              break;
            } else if (item.isOverridden) {
              isOverridden = true;
              overrideReason = item.overrideReason || '';
              time = item.time || time;
              device = item.device || device;
            }
          }
        }
      }

      return {
        date,
        time,
        status: isPresent ? ('Present' as const) : ('Absent' as const),
        isOverridden,
        overrideReason,
        device,
        studentUid: studentRfid || 'UNASSIGNED',
      };
    });
  }, [allAttendance, todayAttendance, studentRfid, studentAuthUid, studentEmail, studentRoll, user?.displayName, resolvedInfo?.name, localTodayStr, utcTodayStr]);

  // Unique available months for filter dropdown
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    records.forEach((r) => {
      months.add(r.date.substring(0, 7)); // YYYY-MM
    });
    return Array.from(months).sort().reverse();
  }, [records]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      if (statusFilter !== 'all' && rec.status !== statusFilter) {
        return false;
      }
      if (monthFilter !== 'all' && !rec.date.startsWith(monthFilter)) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesDate = rec.date.toLowerCase().includes(query);
        const matchesTime = rec.time.toLowerCase().includes(query);
        const matchesDevice = rec.device.toLowerCase().includes(query);
        const matchesStatus = rec.status.toLowerCase().includes(query);
        if (!matchesDate && !matchesTime && !matchesDevice && !matchesStatus) {
          return false;
        }
      }
      return true;
    });
  }, [records, statusFilter, monthFilter, searchQuery]);

  // Download personal CSV
  const handleExportCSV = () => {
    const headers = ['Date', 'Student Name', 'Roll Number', 'RFID Card UID', 'Check-in Time', 'Status', 'Reader Device'];
    const rows = filteredRecords.map((r) => [
      r.date,
      `"${user?.displayName || 'Student'}"`,
      `"${user?.studentId || ''}"`,
      r.studentUid,
      r.time,
      r.status,
      r.device,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `student_attendance_${user?.studentId || 'report'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleManualRefresh = async () => {
    const res = await refreshAttendance();
    setRefreshNotification({
      type: res.success ? 'success' : 'error',
      message: res.message,
    });
    setTimeout(() => {
      setRefreshNotification(null);
    }, 4500);
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#0c1220] border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-white tracking-tight">Personal Attendance Log</h2>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">
              Live Synced
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Historical log of all RFID check-in events recorded for your card ({studentRfid || 'Unassigned'})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {/* Explicit Manual Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer shadow-lg ${
              isRefreshing
                ? 'bg-slate-900 border-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-500/40 text-emerald-300 hover:text-emerald-200 shadow-emerald-950/40 active:scale-95'
            }`}
            title="Force re-fetch attendance records from Firebase Realtime Database and Firestore"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
            <span>{isRefreshing ? 'Refreshing from Firebase...' : 'Manual Refresh'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-400" />
            <span>Export My CSV</span>
          </button>
        </div>
      </div>

      {/* Manual Refresh Feedback Banner */}
      {refreshNotification && (
        <div
          className={`p-3.5 rounded-2xl flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-2 duration-200 border ${
            refreshNotification.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/40 border border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {refreshNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{refreshNotification.message}</span>
          </div>
          <button
            onClick={() => setRefreshNotification(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl bg-[#0c1220] border border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search date, time, device..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Month & Status Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                statusFilter === 'all' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('Present')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                statusFilter === 'Present' ? 'bg-emerald-600/30 text-emerald-300 font-semibold border border-emerald-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Present
            </button>
            <button
              onClick={() => setStatusFilter('Absent')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                statusFilter === 'Absent' ? 'bg-rose-600/30 text-rose-300 font-semibold border border-rose-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Absent
            </button>
          </div>

          {/* Month Selector */}
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Recorded Months</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Clear Filters */}
          {(searchQuery || statusFilter !== 'all' || monthFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setMonthFilter('all');
              }}
              title="Reset filters"
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Showing <strong className="text-white">{filteredRecords.length}</strong> of{' '}
          <strong className="text-white">{records.length}</strong> attendance records
        </span>
      </div>

      {/* Records Table */}
      <div className="rounded-3xl bg-[#0c1220] border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-900/50 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Day of Week</th>
                <th className="py-3.5 px-4">Check-in Time</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Reader Device</th>
                <th className="py-3.5 px-4">RFID UID</th>
                <th className="py-3.5 px-4 text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No matching attendance records found.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec, idx) => {
                  const dayName = new Date(rec.date).toLocaleDateString('en-US', { weekday: 'long' });
                  return (
                    <tr key={idx} className="hover:bg-slate-850/30 transition">
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                        {rec.date}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {dayName}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {rec.time}
                      </td>
                      <td className="py-3.5 px-4">
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
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Cpu className="w-3 h-3 text-slate-500" />
                          <span>{rec.device}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {rec.studentUid}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {rec.status === 'Present' ? (
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                            RFID VERIFIED
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-500">
                            NO SCAN
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
