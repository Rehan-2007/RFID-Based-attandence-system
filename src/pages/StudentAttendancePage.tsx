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
  CreditCard
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAttendance } from '../context/AttendanceContext';

export const StudentAttendancePage: React.FC = () => {
  const { user } = useAuth();
  const { allAttendance, todayAttendance } = useAttendance();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Present' | 'Absent'>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  const studentRfid = user?.rfidUID;

  // Build daily records for every institutional recorded date
  const records = useMemo(() => {
    const dates = new Set<string>(Object.keys(allAttendance));
    const todayStr = new Date().toISOString().split('T')[0];
    dates.add(todayStr);

    const sortedDates = Array.from(dates).sort().reverse();

    return sortedDates.map((date) => {
      let isPresent = false;
      let time = '--:--:--';
      let device = 'ESP32-RFID-01';

      if (studentRfid) {
        if (allAttendance[date] && allAttendance[date][studentRfid]) {
          const rec = allAttendance[date][studentRfid];
          if (rec.status === 'Present') {
            isPresent = true;
            time = rec.time || '--:--:--';
            device = rec.device || device;
          }
        } else if (date === todayStr && todayAttendance[studentRfid]) {
          const rec = todayAttendance[studentRfid];
          if (rec.status === 'Present') {
            isPresent = true;
            time = rec.time || '--:--:--';
            device = rec.device || device;
          }
        }
      }

      return {
        date,
        time,
        status: isPresent ? ('Present' as const) : ('Absent' as const),
        device,
        studentUid: studentRfid || 'UNASSIGNED',
      };
    });
  }, [allAttendance, todayAttendance, studentRfid]);

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

  return (
    <div className="space-y-6">
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#0c1220] border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Personal Attendance Log</h2>
          <p className="text-xs text-slate-400">
            Complete historical log of all RFID check-in events recorded for your card ({studentRfid || 'Unassigned'})
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-emerald-400" />
          <span>Export My CSV</span>
        </button>
      </div>

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
