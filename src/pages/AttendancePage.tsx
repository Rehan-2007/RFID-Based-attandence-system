import React, { useState, useMemo } from 'react';
import { 
  ClipboardCheck, 
  Search, 
  Calendar, 
  Filter, 
  Radio, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  UserCheck, 
  UserPlus, 
  Sparkles,
  ArrowRight,
  Database
} from 'lucide-react';
import { AttendanceRecord, Student } from '../types';
import { useAttendance } from '../context/AttendanceContext';

interface AttendancePageProps {
  onOpenScanner: () => void;
  onNavigateToStudents: () => void;
}

export const AttendancePage: React.FC<AttendancePageProps> = ({ 
  onOpenScanner, 
  onNavigateToStudents 
}) => {
  const { 
    todayRecordsList, 
    allAttendance, 
    students, 
    unknownScans, 
    scanRfidCard,
    totalStudentsCount 
  } = useAttendance();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Present' | 'Unknown'>('All');
  const [activeTab, setActiveTab] = useState<'records' | 'security'>('records');

  // Manual Check-in Modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualSelectedUid, setManualSelectedUid] = useState('');

  // Get records for the selected date
  const recordsForDate: AttendanceRecord[] = useMemo(() => {
    if (selectedDate === todayStr) {
      return todayRecordsList;
    }
    const dayMap = allAttendance[selectedDate] || {};
    return Object.values(dayMap).sort((a, b) => b.timestamp - a.timestamp);
  }, [selectedDate, todayStr, todayRecordsList, allAttendance]);

  // Filtered list
  const filteredRecords = useMemo(() => {
    return recordsForDate.filter((rec) => {
      const q = searchQuery.toLowerCase().trim();
      const name = rec.studentName || students[rec.uid]?.name || '';
      const matchesSearch = 
        name.toLowerCase().includes(q) ||
        rec.uid.toLowerCase().includes(q) ||
        (rec.studentId && rec.studentId.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'All' || rec.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [recordsForDate, searchQuery, statusFilter, students]);

  // Stats for selected date
  const presentCountForDate = recordsForDate.filter((r) => r.status === 'Present').length;
  const percentageForDate = totalStudentsCount > 0 
    ? Math.round((presentCountForDate / totalStudentsCount) * 100) 
    : 0;

  const handleManualCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSelectedUid) return;
    await scanRfidCard(manualSelectedUid, 'ADMIN-MANUAL-OVERRIDE');
    setIsManualModalOpen(false);
    setManualSelectedUid('');
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-400" />
            <span>Attendance Log & Telemetry</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Auto-synced from ESP32 & Firebase Realtime Database: <span className="font-mono text-cyan-400">attendance/{selectedDate}/*</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>Manual Check-In</span>
          </button>

          <button
            onClick={onOpenScanner}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 border border-blue-400/30 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Simulate ESP32 Tap</span>
          </button>
        </div>
      </div>

      {/* Date & Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date Selector */}
        <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg">
          <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1.5">
            Select Attendance Date
          </label>
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
          {selectedDate === todayStr && (
            <span className="text-[10px] text-emerald-400 font-mono mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Active Session
            </span>
          )}
        </div>

        {/* Present on Date */}
        <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Present Students
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400 font-mono">
              {presentCountForDate}
            </span>
            <span className="text-xs text-slate-400">/ {totalStudentsCount} Total</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">
            Verified RFID scans
          </span>
        </div>

        {/* Attendance Rate */}
        <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Attendance Rate
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-300 font-mono">
              {percentageForDate}%
            </span>
            <span className="text-xs text-slate-400">Turnout</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-800 mt-2 overflow-hidden">
            <div 
              className="h-full bg-cyan-400 rounded-full"
              style={{ width: `${percentageForDate}%` }}
            />
          </div>
        </div>

        {/* Unknown / Security Alerts Count */}
        <div 
          onClick={() => setActiveTab('security')}
          className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 hover:border-amber-500/40 transition cursor-pointer shadow-lg"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
              Unknown Card Scans
            </span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-amber-400 font-mono">
              {unknownScans.length}
            </span>
            <span className="text-xs text-slate-400">Rejected</span>
          </div>
          <span className="text-[10px] text-amber-400/80 mt-1 block">
            Click to inspect security log
          </span>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 flex flex-col md:flex-row gap-3 items-center justify-between shadow-lg">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 bg-slate-900/90 p-1 rounded-xl border border-slate-800 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('records')}
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 ${
              activeTab === 'records'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Attendance Records ({recordsForDate.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 ${
              activeTab === 'security'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
            <span>Security Alerts ({unknownScans.length})</span>
          </button>
        </div>

        {/* Search */}
        {activeTab === 'records' && (
          <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Search className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              placeholder="Search by student or UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}
      </div>

      {/* Main Tab Content */}
      {activeTab === 'records' ? (
        <div className="rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4">RFID UID</th>
                  <th className="py-3.5 px-4">Check-In Time</th>
                  <th className="py-3.5 px-4">Hardware Node</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Duplicate Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      <Radio className="w-8 h-8 mx-auto mb-2 opacity-40 text-blue-400" />
                      <p className="text-sm font-semibold text-slate-300">
                        No attendance records for {selectedDate}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Tap an RFID card via ESP32 hardware reader or use the simulator.
                      </p>
                      <button
                        onClick={onOpenScanner}
                        className="mt-3 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
                      >
                        Tap Card Now
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => {
                    const student = students[rec.uid];
                    const displayName = rec.studentName || student?.name || 'Unknown';
                    const dept = rec.department || student?.department || '—';

                    return (
                      <tr 
                        key={`${rec.date}-${rec.uid}`}
                        className="hover:bg-slate-850/50 transition"
                      >
                        {/* Student */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600/30 to-indigo-600/30 border border-blue-500/30 flex items-center justify-center font-bold text-xs text-blue-300 shrink-0">
                              {displayName.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-100">
                                {displayName}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {dept}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* RFID UID */}
                        <td className="py-3.5 px-4 font-mono font-bold text-cyan-300">
                          {rec.uid}
                        </td>

                        {/* Check-In Time */}
                        <td className="py-3.5 px-4 font-mono text-slate-200">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-400" />
                            <span>{rec.time}</span>
                          </div>
                        </td>

                        {/* Hardware Device */}
                        <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                          {rec.device || 'ESP32-RFID-01'}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{rec.status}</span>
                          </div>
                        </td>

                        {/* Duplicate Rule */}
                        <td className="py-3.5 px-4 text-right">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                            Enforced (1 tap/day)
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Security Tab: Unknown RFID Scans */
        <div className="rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Security Alerts: Unrecognized RFID Cards</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Unknown cards are strictly prevented from gaining attendance to protect integrity.
              </p>
            </div>
            <button
              onClick={onNavigateToStudents}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Go to Student Registration</span>
            </button>
          </div>

          {unknownScans.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400 opacity-80" />
              <p className="text-sm font-semibold text-slate-200">No Security Breaches</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                All scans logged so far matched verified student RFID UIDs in the database.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {unknownScans.map((alert, idx) => (
                <div
                  key={`${alert.uid}-${idx}`}
                  className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-mono">
                          UID: {alert.uid}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          ACCESS REJECTED
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {alert.notes || 'Unregistered card tapped on hardware reader.'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-mono text-slate-300">
                      {alert.time}
                    </p>
                    <button
                      onClick={onNavigateToStudents}
                      className="mt-1 text-[11px] text-blue-400 hover:underline flex items-center gap-1 justify-end"
                    >
                      <span>Assign Card to Student</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual Check-in Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div 
            className="w-full max-w-md bg-[#0d1322] border border-slate-700/80 rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
              <UserCheck className="w-5 h-5 text-blue-400" />
              <span>Manual Student Attendance Override</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Use for students who forgot their physical RFID card.
            </p>

            <form onSubmit={handleManualCheckIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Select Enrolled Student *
                </label>
                <select
                  required
                  value={manualSelectedUid}
                  onChange={(e) => setManualSelectedUid(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Choose Student --</option>
                  {Object.values(students).map((st) => (
                    <option key={st.uid} value={st.uid}>
                      {st.name} ({st.uid}) - {st.department}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!manualSelectedUid}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-md shadow-blue-600/30"
                >
                  Mark Present
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
