import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Calendar, 
  Users, 
  CheckCircle2, 
  XCircle, 
  Percent, 
  Filter, 
  ArrowDownToLine, 
  Sparkles,
  Search,
  Award
} from 'lucide-react';
import { useAttendance } from '../context/AttendanceContext';
import { StudentAttendanceSummary } from '../types';

export const ReportsPage: React.FC = () => {
  const { 
    studentsList, 
    allAttendance, 
    todayAttendance, 
    getStudentAttendanceSummary, 
    totalStudentsCount 
  } = useAttendance();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly' | 'student-wise'>('daily');
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedDept, setSelectedDept] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const departments = [
    'All',
    'Computer Science & Engineering',
    'Electronics & Communication',
    'Information Technology',
    'Mechanical Engineering',
    'Civil Engineering',
  ];

  // Calculate student summaries
  const studentSummaries: StudentAttendanceSummary[] = useMemo(() => {
    return studentsList.map((st) => getStudentAttendanceSummary(st.uid));
  }, [studentsList, getStudentAttendanceSummary]);

  // Filtered student summaries
  const filteredSummaries = useMemo(() => {
    return studentSummaries.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        item.student.name.toLowerCase().includes(q) ||
        item.student.uid.toLowerCase().includes(q) ||
        item.student.studentId.toLowerCase().includes(q);

      const matchesDept = selectedDept === 'All' || item.student.department === selectedDept;

      return matchesSearch && matchesDept;
    });
  }, [studentSummaries, searchQuery, selectedDept]);

  // Aggregate stats
  const averagePercentage = useMemo(() => {
    if (studentSummaries.length === 0) return 0;
    const sum = studentSummaries.reduce((acc, curr) => acc + curr.percentage, 0);
    return Math.round(sum / studentSummaries.length);
  }, [studentSummaries]);

  const topStudent = useMemo(() => {
    if (studentSummaries.length === 0) return null;
    return [...studentSummaries].sort((a, b) => b.percentage - a.percentage)[0];
  }, [studentSummaries]);

  // Records for daily report
  const dailyRecords = useMemo(() => {
    const recordsMap = selectedDate === todayStr ? todayAttendance : (allAttendance[selectedDate] || {});
    return Object.values(recordsMap).filter((rec) => {
      const student = studentsList.find((s) => s.uid === rec.uid);
      const dept = rec.department || student?.department || '';
      const matchesDept = selectedDept === 'All' || dept === selectedDept;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        (rec.studentName || '').toLowerCase().includes(q) ||
        rec.uid.toLowerCase().includes(q);
      return matchesDept && matchesSearch;
    });
  }, [selectedDate, todayStr, todayAttendance, allAttendance, selectedDept, searchQuery, studentsList]);

  // CSV Export Function compatible with Microsoft Excel
  const exportToExcelCSV = () => {
    let csvRows: string[] = [];
    let filename = `RFID_Attendance_Report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`;

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    if (reportType === 'student-wise') {
      // Header
      csvRows.push([
        'Student ID',
        'Student Name',
        'RFID UID',
        'Department',
        'Academic Year',
        'Total Working Days',
        'Present Days',
        'Absent Days',
        'Attendance Percentage',
        'Standing',
        'Last Seen Attendance',
      ].map(escapeCsv).join(','));

      // Rows
      filteredSummaries.forEach((s) => {
        const standing = s.percentage >= 75 ? 'Good Standing' : s.percentage >= 60 ? 'Warning' : 'Critical Shortage';
        csvRows.push([
          s.student.studentId,
          s.student.name,
          s.student.uid,
          s.student.department,
          s.student.year,
          s.totalDays,
          s.presentDays,
          s.absentDays,
          `${s.percentage}%`,
          standing,
          s.lastSeen || 'No Record',
        ].map(escapeCsv).join(','));
      });
    } else {
      // Daily, Weekly, or Monthly record log export
      csvRows.push([
        'Date',
        'Time',
        'Student Name',
        'RFID UID',
        'Student ID',
        'Department',
        'Status',
        'Hardware Device ID',
      ].map(escapeCsv).join(','));

      if (reportType === 'daily') {
        dailyRecords.forEach((r) => {
          csvRows.push([
            r.date,
            r.time,
            r.studentName || 'Unknown',
            r.uid,
            r.studentId || 'N/A',
            r.department || 'N/A',
            r.status,
            r.device || 'ESP32-RFID-01',
          ].map(escapeCsv).join(','));
        });
      } else {
        // Multi-day export (Weekly / Monthly)
        const daysLimit = reportType === 'weekly' ? 7 : 30;
        const allDates = Object.keys(allAttendance).sort().reverse().slice(0, daysLimit);
        
        // Also include today
        const datesToExport = Array.from(new Set([todayStr, ...allDates])).sort().reverse();

        datesToExport.forEach((d) => {
          const dayMap = d === todayStr ? todayAttendance : (allAttendance[d] || {});
          Object.values(dayMap).forEach((r) => {
            csvRows.push([
              r.date,
              r.time,
              r.studentName || 'Unknown',
              r.uid,
              r.studentId || 'N/A',
              r.department || 'N/A',
              r.status,
              r.device || 'ESP32-RFID-01',
            ].map(escapeCsv).join(','));
          });
        });
      }
    }

    // Prepend UTF-8 BOM (\uFEFF) so Microsoft Excel opens it with proper encoding
    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Export Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <span>Attendance Reports & Excel CSV Export</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Generate compliant attendance sheets with UTF-8 BOM encoding for Microsoft Excel
          </p>
        </div>

        <button
          onClick={exportToExcelCSV}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 border border-emerald-400/30 transition flex items-center gap-2 cursor-pointer"
        >
          <ArrowDownToLine className="w-4 h-4" />
          <span>Export to Excel (.CSV)</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Enrolled Students
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">
              {totalStudentsCount}
            </span>
            <span className="text-xs text-slate-400">Total</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Active across all batches</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Average Attendance Rate
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-400 font-mono">
              {averagePercentage}%
            </span>
            <span className="text-xs text-slate-400">Overall</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-800 mt-2 overflow-hidden">
            <div 
              className="h-full bg-cyan-400 rounded-full"
              style={{ width: `${averagePercentage}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Top Attendant
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <Award className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-sm font-bold text-slate-100 truncate">
              {topStudent ? topStudent.student.name : '—'}
            </p>
          </div>
          <span className="text-[10px] font-mono text-amber-300 mt-1 block">
            {topStudent ? `${topStudent.percentage}% Attendance Rate` : 'No data'}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Excel Compatibility
          </span>
          <div className="flex items-center gap-2 text-emerald-400 mt-1 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>UTF-8 BOM Formatted</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">
            Direct open in MS Excel & Google Sheets
          </span>
        </div>
      </div>

      {/* Report Type Selector & Filters */}
      <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 space-y-4 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Report Mode Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 overflow-x-auto">
            <button
              onClick={() => setReportType('daily')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                reportType === 'daily'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Daily Report
            </button>
            <button
              onClick={() => setReportType('weekly')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                reportType === 'weekly'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Weekly Report (7 Days)
            </button>
            <button
              onClick={() => setReportType('monthly')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                reportType === 'monthly'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly Report (30 Days)
            </button>
            <button
              onClick={() => setReportType('student-wise')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                reportType === 'student-wise'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Student-Wise Summary
            </button>
          </div>

          {/* Date Picker if Daily */}
          {reportType === 'daily' && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>

        {/* Search & Department Filters */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between pt-3 border-t border-slate-800/80">
          <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Search className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              placeholder="Filter by name or UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="w-full md:w-auto flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            {departments.map((dept) => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  selectedDept === dept
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {dept === 'All' ? 'All Depts' : dept.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reports Display Table */}
      <div className="rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          {reportType === 'student-wise' ? (
            /* Student-Wise Aggregate Table */
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4">RFID UID</th>
                  <th className="py-3.5 px-4">Department</th>
                  <th className="py-3.5 px-4">Present / Total Days</th>
                  <th className="py-3.5 px-4">Percentage</th>
                  <th className="py-3.5 px-4">Standing</th>
                  <th className="py-3.5 px-4 text-right">Last Scan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredSummaries.map((s) => {
                  const isGood = s.percentage >= 75;
                  const isWarning = s.percentage >= 60 && s.percentage < 75;

                  return (
                    <tr key={s.student.uid} className="hover:bg-slate-850/50 transition">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-100">{s.student.name}</p>
                        <p className="text-[11px] font-mono text-slate-400">{s.student.studentId}</p>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-cyan-300">
                        {s.student.uid}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {s.student.department}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-200">
                        <span className="text-emerald-400 font-bold">{s.presentDays}</span> / {s.totalDays} days
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold">
                        <span className={isGood ? 'text-emerald-400' : isWarning ? 'text-amber-400' : 'text-rose-400'}>
                          {s.percentage}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full border ${
                            isGood
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : isWarning
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {isGood ? 'Good Standing' : isWarning ? 'Warning (<75%)' : 'Critical Shortage'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-400 text-[11px]">
                        {s.lastSeen || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* Daily / Period Records Table */
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Time</th>
                  <th className="py-3.5 px-4">Student Name</th>
                  <th className="py-3.5 px-4">RFID UID</th>
                  <th className="py-3.5 px-4">Department</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Hardware Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {dailyRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-semibold text-slate-300">No report records found</p>
                      <p className="text-xs text-slate-500 mt-1">Try selecting another date or check your filters.</p>
                    </td>
                  </tr>
                ) : (
                  dailyRecords.map((r, i) => (
                    <tr key={`${r.date}-${r.uid}-${i}`} className="hover:bg-slate-850/50 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {r.date}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-cyan-300">
                        {r.time}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-100">
                        {r.studentName || 'Student'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {r.uid}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {r.department || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-400 text-[11px]">
                        {r.device || 'ESP32-RFID-01'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
