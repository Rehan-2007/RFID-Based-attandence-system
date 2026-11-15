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
  Database,
  Edit2,
  Trash2,
  UserX,
  RotateCcw,
  History,
  CheckSquare,
  Square,
  Lock,
  Cpu,
  UserMinus,
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  Layers
} from 'lucide-react';
import { AttendanceRecord, AttendanceStatus, Student, TrashAttendanceRecord, AuditActivityLog } from '../types';
import { useAttendance } from '../context/AttendanceContext';
import { useAuth } from '../context/AuthContext';
import { EditAttendanceModal } from '../components/EditAttendanceModal';
import { OverrideAttendanceModal } from '../components/OverrideAttendanceModal';
import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { DeleteAttendanceByDateModal } from '../components/DeleteAttendanceByDateModal';
import { BulkStatusModal } from '../components/BulkStatusModal';
import { StudentSuspensionModal } from '../components/StudentSuspensionModal';
import { ESP32FirmwareGuideModal } from '../components/ESP32FirmwareGuideModal';
import { DatabaseMigrationModal } from '../components/DatabaseMigrationModal';
import { getISTTimestampDisplay } from '../utils/dateUtils';

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
    totalStudentsCount,
    trashRecords,
    auditLogs,
    suspensions,
    restoreTrashRecord,
    refreshAttendance,
    isRefreshing,
    workingDays,
    toggleHolidayDate,
    migrationInspection,
    unregisteredRecovery,
    todayStr,
    pendingTodayCount,
    attendanceDeadline,
    isAfterDeadline,
    isTodayHoliday
  } = useAttendance();

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | AttendanceStatus>('All');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedSemester, setSelectedSemester] = useState('All');
  const [activeTab, setActiveTab] = useState<'records' | 'trash' | 'audit' | 'security'>('records');

  // Multi-select for Bulk Operations
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Modal States
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [overrideRecord, setOverrideRecord] = useState<AttendanceRecord | null>(null);
  const [recordsToDelete, setRecordsToDelete] = useState<AttendanceRecord[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleteByDateModalOpen, setIsDeleteByDateModalOpen] = useState(false);
  const [dateDeleteNotice, setDateDeleteNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState(false);
  const [suspensionTargetStudent, setSuspensionTargetStudent] = useState<Student | null>(null);
  const [isFirmwareGuideOpen, setIsFirmwareGuideOpen] = useState(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);

  // Manual Check-in Modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualSelectedUid, setManualSelectedUid] = useState('');

  // Audit Log expanded items
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Get records for the selected date (strictly deduplicated by UID, excluding deleted)
  const recordsForDate: AttendanceRecord[] = useMemo(() => {
    const rawList = selectedDate === todayStr ? todayRecordsList : Object.values(allAttendance[selectedDate] || {});
    const map = new Map<string, AttendanceRecord>();
    rawList.forEach((rec) => {
      if (rec.isDeleted) return;
      const key = (rec.rfidUID || rec.uid || '').toUpperCase();
      if (key && !map.has(key)) {
        map.set(key, rec);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [selectedDate, todayStr, todayRecordsList, allAttendance]);

  // Unique departments & semesters from student directory
  const availableDepts = useMemo(() => {
    const set = new Set<string>();
    Object.values(students).forEach((s) => {
      if (s.department) set.add(s.department);
    });
    return ['All', ...Array.from(set).sort()];
  }, [students]);

  const availableSemesters = useMemo(() => {
    const set = new Set<string>();
    Object.values(students).forEach((s) => {
      if (s.semester) set.add(s.semester);
    });
    return ['All', ...Array.from(set).sort()];
  }, [students]);

  const isSelectedHoliday = Boolean(workingDays[selectedDate]?.isHoliday);
  const hasMigrationActionNeeded = Boolean(
    migrationInspection?.hasLegacyAttendance || unregisteredRecovery.length > 0
  );

  const findStudentForRecord = (rec: AttendanceRecord): Student | undefined => {
    const dbKey = (rec.studentDbId || '').trim();
    if (dbKey && students[dbKey]) return students[dbKey];
    const uidUpper = (rec.rfidUID || rec.uid || '').trim().toUpperCase();
    if (uidUpper && students[uidUpper]) return students[uidUpper];
    return Object.values(students).find(
      (s) =>
        (dbKey && s.studentDbId === dbKey) ||
        (uidUpper && (s.rfidUID || s.uid || '').trim().toUpperCase() === uidUpper)
    );
  };

  // Filtered list
  const filteredRecords = useMemo(() => {
    return recordsForDate.filter((rec) => {
      const q = searchQuery.toLowerCase().trim();
      const student = findStudentForRecord(rec);
      const name = rec.studentName || student?.name || '';
      const dept = rec.department || student?.department || '';
      const semester = student?.semester || '';

      const matchesSearch = 
        !q ||
        name.toLowerCase().includes(q) ||
        rec.uid.toLowerCase().includes(q) ||
        (rec.studentId && rec.studentId.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'All' || rec.status === statusFilter;
      const matchesDept = selectedDept === 'All' || dept === selectedDept;
      const matchesSemester = selectedSemester === 'All' || semester === selectedSemester;

      return matchesSearch && matchesStatus && matchesDept && matchesSemester;
    });
  }, [recordsForDate, searchQuery, statusFilter, selectedDept, selectedSemester, students]);

  // Stats for selected date (counting active students accurately)
  const activeUidSet = useMemo(() => {
    const set = new Set<string>();
    Object.values(students)
      .filter((s) => s.status === 'active' && !s.isSuspended)
      .forEach((s) => {
        if (s.studentDbId) set.add(s.studentDbId.trim());
        const rfid = (s.rfidUID || s.uid || '').trim().toUpperCase();
        if (rfid) set.add(rfid);
      });
    return set;
  }, [students]);

  const presentCountForDate = recordsForDate.filter(
    (r) => r.status === 'Present' && ((r.studentDbId && activeUidSet.has(r.studentDbId.trim())) || activeUidSet.has(r.uid.toUpperCase()))
  ).length;
  const absentCountForDate = recordsForDate.filter(
    (r) => r.status === 'Absent' && ((r.studentDbId && activeUidSet.has(r.studentDbId.trim())) || activeUidSet.has(r.uid.toUpperCase()))
  ).length;
  const percentageForDate = totalStudentsCount > 0 
    ? Math.round((presentCountForDate / totalStudentsCount) * 100) 
    : 0;

  // Selected records array
  const selectedRecordsArray = useMemo(() => {
    return filteredRecords.filter((r) => selectedKeys.has(`${r.date}_${r.uid}`));
  }, [filteredRecords, selectedKeys]);

  // Checkbox handlers
  const handleToggleSelectAll = () => {
    if (selectedKeys.size === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedKeys(new Set());
    } else {
      const next = new Set<string>();
      filteredRecords.forEach((r) => next.add(`${r.date}_${r.uid}`));
      setSelectedKeys(next);
    }
  };

  const handleToggleRow = (recordKey: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(recordKey)) {
        next.delete(recordKey);
      } else {
        next.add(recordKey);
      }
      return next;
    });
  };

  const handleManualCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSelectedUid) return;
    await scanRfidCard(manualSelectedUid, 'ADMIN-MANUAL-OVERRIDE');
    setIsManualModalOpen(false);
    setManualSelectedUid('');
  };

  const handleBulkDelete = () => {
    if (selectedRecordsArray.length === 0) return;
    setRecordsToDelete(selectedRecordsArray);
    setIsDeleteModalOpen(true);
  };

  const handleSingleDelete = (rec: AttendanceRecord) => {
    setRecordsToDelete([rec]);
    setIsDeleteModalOpen(true);
  };

  const handleOpenSuspension = (rec: AttendanceRecord) => {
    const student = findStudentForRecord(rec) || {
      studentDbId: rec.studentDbId,
      uid: rec.uid,
      rfidUID: rec.rfidUID || rec.uid,
      name: rec.studentName || 'Student',
      studentId: rec.studentId || 'N/A',
      department: rec.department || 'General',
      year: '1st Year',
      email: '',
      phone: '',
      registeredAt: new Date().toISOString(),
      status: 'active',
    };
    setSuspensionTargetStudent(student);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-400" />
            <span>Attendance Log & Control System</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time synchronization across Admin, Student Dashboards & ESP32 hardware
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => refreshAttendance()}
            disabled={isRefreshing}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Manual sync with Firebase"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync'}</span>
          </button>

          <button
            onClick={() => setIsMigrationModalOpen(true)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
              hasMigrationActionNeeded
                ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Inspect unified database schema, backup & migration center"
          >
            <Layers className={`w-3.5 h-3.5 ${hasMigrationActionNeeded ? 'text-amber-400' : 'text-emerald-400'}`} />
            <span>DB Migration</span>
            {hasMigrationActionNeeded && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-bold">
                {(migrationInspection?.legacyRecordCount || 0) + unregisteredRecovery.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsFirmwareGuideOpen(true)}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-cyan-500/30 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>ESP32 Firmware</span>
          </button>

          <button
            onClick={() => setIsManualModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>Manual Check-In</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setDateDeleteNotice(null);
                setIsDeleteByDateModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-red-600/15 hover:bg-red-600/25 text-red-300 hover:text-red-200 text-xs font-semibold border border-red-500/35 transition flex items-center gap-1.5 cursor-pointer"
              title="Permanently delete all attendance records for a specific date"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete Attendance by Date</span>
            </button>
          )}

          <button
            onClick={onOpenScanner}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 border border-blue-400/30 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Simulate ESP32 Tap</span>
          </button>
        </div>
      </div>

      {dateDeleteNotice && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150 ${
            dateDeleteNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-red-500/10 border-red-500/30 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {dateDeleteNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{dateDeleteNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setDateDeleteNotice(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition cursor-pointer"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Date & Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date Selector */}
        <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              Select Attendance Date
            </label>
            {isSelectedHoliday && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold">
                HOLIDAY
              </span>
            )}
          </div>
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedKeys(new Set());
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            {selectedDate === todayStr ? (
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Active Session
              </span>
            ) : (
              <span className="text-[10px] text-slate-500 font-mono">
                {isSelectedHoliday ? 'Excluded from % denominator' : 'Working Day'}
              </span>
            )}
            <button
              type="button"
              onClick={() => toggleHolidayDate(selectedDate, !isSelectedHoliday)}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer ${
                isSelectedHoliday
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
              }`}
              title={isSelectedHoliday ? 'Mark as Institutional Working Day' : 'Mark date as Holiday (excluded from attendance %)'}
            >
              {isSelectedHoliday ? 'Set Working Day' : 'Mark Holiday'}
            </button>
          </div>
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
            {selectedDate === todayStr && !isAfterDeadline && !isTodayHoliday && pendingTodayCount > 0
              ? `${pendingTodayCount} Pending before ${attendanceDeadline} IST`
              : absentCountForDate > 0
                ? `${absentCountForDate} marked Absent`
                : 'Verified present scans'}
          </span>
        </div>

        {/* Attendance Rate */}
        <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Turnout Rate
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-300 font-mono">
              {percentageForDate}%
            </span>
            <span className="text-xs text-slate-400">Attendance</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-800 mt-2 overflow-hidden">
            <div 
              className="h-full bg-cyan-400 rounded-full"
              style={{ width: `${percentageForDate}%` }}
            />
          </div>
        </div>

        {/* Trash & Deleted Count */}
        <div 
          onClick={() => setActiveTab('trash')}
          className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 hover:border-red-500/40 transition cursor-pointer shadow-lg"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
              Trash Bin Archive
            </span>
            <Trash2 className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-red-400 font-mono">
              {trashRecords.length}
            </span>
            <span className="text-xs text-slate-400">Deleted</span>
          </div>
          <span className="text-[10px] text-red-400/80 mt-1 block">
            Click to view & restore records
          </span>
        </div>
      </div>

      {/* Tabs & Filters Navigation */}
      <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 flex flex-col md:flex-row gap-3 items-center justify-between shadow-lg">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 p-1 rounded-xl border border-slate-800 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('records')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'records'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Attendance Records ({recordsForDate.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('trash')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'trash'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Trash Bin ({trashRecords.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit History ({auditLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'security'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Security Alerts ({unknownScans.length})</span>
          </button>
        </div>

        {/* Status, Department, Semester Filters & Search */}
        {activeTab === 'records' && (
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Department Filter */}
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500 max-w-[160px]"
            >
              {availableDepts.map((dept) => (
                <option key={dept} value={dept}>
                  {dept === 'All' ? 'All Departments' : dept}
                </option>
              ))}
            </select>

            {/* Semester Filter */}
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              {availableSemesters.map((sem) => (
                <option key={sem} value={sem}>
                  {sem === 'All' ? 'All Semesters' : sem}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500 font-mono"
            >
              <option value="All">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Late">Late</option>
              <option value="Excused">Excused</option>
            </select>

            {/* Search */}
            <div className="relative w-full sm:w-56">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                placeholder="Search student or UID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Floating Bulk Operations Toolbar when items are selected */}
      {activeTab === 'records' && selectedKeys.size > 0 && (
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-blue-500/40 shadow-xl flex items-center justify-between gap-4 animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-lg bg-blue-500 text-white font-mono text-xs font-bold flex items-center justify-center">
              {selectedKeys.size}
            </span>
            <span className="text-xs font-bold text-slate-100">
              Record{selectedKeys.size === 1 ? '' : 's'} Selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBulkStatusModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Change Status</span>
            </button>

            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>

            <button
              onClick={() => setSelectedKeys(new Set())}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Clear Selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MAIN TAB CONTENT */}
      {activeTab === 'records' && (
        <div className="rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
                      title="Select All"
                    >
                      {selectedKeys.size === filteredRecords.length && filteredRecords.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600" />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4">RFID UID</th>
                  <th className="py-3.5 px-4">Check-In Time</th>
                  <th className="py-3.5 px-4">Device</th>
                  <th className="py-3.5 px-4">Status & Locks</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <Radio className="w-8 h-8 mx-auto mb-2 opacity-40 text-blue-400" />
                      <p className="text-sm font-semibold text-slate-300">
                        No attendance records found for {selectedDate}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Use the simulator or scan via ESP32 RFID reader.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => {
                    const rowKey = `${rec.date}_${rec.uid}`;
                    const isSelected = selectedKeys.has(rowKey);
                    const student = findStudentForRecord(rec);
                    const displayName = rec.studentName || student?.name || 'Unknown';
                    const dept = rec.department || student?.department || '—';
                    const isSuspended = Boolean(
                      student?.status === 'suspended' || student?.isSuspended || (student?.activeSuspension?.status === 'active')
                    );
                    const isOverridden = Boolean(rec.isOverridden && rec.status === 'Absent');

                    return (
                      <tr 
                        key={rowKey}
                        className={`transition ${
                          isSelected ? 'bg-blue-950/20' : 'hover:bg-slate-850/50'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleRow(rowKey)}
                            className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600" />
                            )}
                          </button>
                        </td>

                        {/* Student */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600/30 to-indigo-600/30 border border-blue-500/30 flex items-center justify-center font-bold text-xs text-blue-300 shrink-0">
                              {displayName.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-slate-100">{displayName}</p>
                                {isSuspended && (
                                  <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                                    SUSPENDED
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400">
                                {rec.studentId || student?.studentId || 'N/A'} • {dept}
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

                        {/* Device */}
                        <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                          {rec.device || 'ESP32-RFID-01'}
                        </td>

                        {/* Status & Overrides */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold text-[11px] ${
                              rec.status === 'Present'
                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                : rec.status === 'Absent'
                                ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                                : rec.status === 'Late'
                                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                                : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400'
                            }`}>
                              {rec.status === 'Present' ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : rec.status === 'Absent' ? (
                                <UserX className="w-3 h-3" />
                              ) : (
                                <Clock className="w-3 h-3" />
                              )}
                              <span>{rec.status}</span>
                            </div>

                            {isOverridden && (
                              <div className="flex items-center gap-1 text-[10px] text-rose-400 font-mono">
                                <Lock className="w-2.5 h-2.5" />
                                <span title={rec.overrideReason}>Admin Override</span>
                              </div>
                            )}

                            {rec.previousEdits && rec.previousEdits.length > 0 && (
                              <div className="text-[10px] text-slate-500 font-mono">
                                Edited ({rec.previousEdits.length}x)
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Row Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit */}
                            <button
                              onClick={() => setEditingRecord(rec)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                              title="Edit date, time, status, or restore versions"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                            </button>

                            {/* Override to Absent / Manage Override */}
                            <button
                              onClick={() => setOverrideRecord(rec)}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                isOverridden
                                  ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400'
                              }`}
                              title={isOverridden ? 'View/Remove Administrative Override' : 'Override to Absent (Lock subsequent scans)'}
                            >
                              {isOverridden ? <Lock className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                            </button>

                            {/* Suspend Student Account */}
                            <button
                              onClick={() => handleOpenSuspension(rec)}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                isSuspended
                                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400'
                              }`}
                              title="Suspend student account (block RFID access)"
                            >
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => handleSingleDelete(rec)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition cursor-pointer"
                              title="Soft-delete record (recoverable)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRASH / DELETED RECORDS TAB */}
      {activeTab === 'trash' && (
        <div className="rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>Attendance Trash Bin Archive</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Deleted records are safely archived here and can be restored back to the attendance roster anytime.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono font-bold">
              {trashRecords.length} Archival Records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4">RFID UID</th>
                  <th className="py-3.5 px-4">Attendance Date</th>
                  <th className="py-3.5 px-4">Deletion Reason</th>
                  <th className="py-3.5 px-4">Deleted By</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {trashRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      <Trash2 className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-300">
                        The Trash Bin is empty.
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Any records deleted during administrative management will appear here for recovery.
                      </p>
                    </td>
                  </tr>
                ) : (
                  trashRecords.map((t) => (
                    <tr key={t.trashId} className="hover:bg-slate-850/50 transition">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-100">{t.studentName || t.uid}</p>
                        <p className="text-[11px] text-slate-400">{t.studentId || 'N/A'}</p>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-cyan-300">
                        {t.uid}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-200">
                        {t.date} at {t.time}
                      </td>

                      <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate">
                        {t.deleteReason || 'No reason specified'}
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        <div>{t.deletedBy}</div>
                        <div className="text-[10px] text-slate-500">{getISTTimestampDisplay(t.deletedAt)}</div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => restoreTrashRecord(t.trashId)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition flex items-center gap-1.5 ml-auto cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AUDIT HISTORY TAB */}
      {activeTab === 'audit' && (
        <div className="rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-purple-400" />
                <span>Administrative Activity & Audit Log</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Complete tamper-evident log of all attendance edits, deletions, overrides, and student suspensions.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-mono font-bold">
              {auditLogs.length} Events Logged
            </span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {auditLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30 text-purple-400" />
                <p className="text-sm font-semibold text-slate-300">No activity logs recorded yet.</p>
                <p className="text-xs text-slate-500 mt-1">Actions performed by admins will be tracked here in real-time.</p>
              </div>
            ) : (
              auditLogs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                return (
                  <div key={log.id} className="p-4 hover:bg-slate-900/40 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          log.action.includes('DELETE')
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : log.action.includes('OVERRIDE')
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : log.action.includes('RESTORE') || log.action.includes('UNDO')
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : log.action.includes('SUSPEND')
                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>

                        <div>
                          <p className="text-xs font-bold text-white">
                            {log.studentName ? `${log.studentName} (${log.studentRfid || ''})` : log.details || 'System Action'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Reason: <span className="text-slate-200">{log.reason || 'None specified'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right text-[11px] font-mono">
                          <p className="text-slate-300">{log.adminEmail}</p>
                          <p className="text-slate-500">{log.timestampStr}</p>
                        </div>

                        {(log.previousValues || log.updatedValues) && (
                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                            title="Inspect Values"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Diff viewer */}
                    {isExpanded && (
                      <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono animate-in fade-in duration-150">
                        <div>
                          <p className="text-rose-400 font-bold mb-1">Previous Values:</p>
                          <pre className="p-2 rounded bg-slate-900/80 text-[10px] text-slate-300 overflow-x-auto">
                            {JSON.stringify(log.previousValues, null, 2) || 'null'}
                          </pre>
                        </div>
                        <div>
                          <p className="text-emerald-400 font-bold mb-1">Updated Values:</p>
                          <pre className="p-2 rounded bg-slate-900/80 text-[10px] text-slate-300 overflow-x-auto">
                            {JSON.stringify(log.updatedValues, null, 2) || 'null'}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SECURITY ALERTS TAB */}
      {activeTab === 'security' && (
        <div className="rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Security Alerts & Rejected Scans</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Unknown card taps and unauthorized access attempts logged by ESP32 RFID nodes.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono font-bold">
              {unknownScans.length} Scans Logged
            </span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {unknownScans.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-30 text-amber-400" />
                <p className="text-sm font-semibold text-slate-300">No security alerts logged.</p>
                <p className="text-xs text-slate-500 mt-1">All scanned cards are registered and authorized.</p>
              </div>
            ) : (
              unknownScans.map((alert, idx) => (
                <div key={idx} className="p-4 hover:bg-slate-900/40 transition flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono font-bold">
                        ACCESS REJECTED
                      </span>
                      <span className="font-mono text-xs text-cyan-300 font-bold">
                        UID: {alert.uid}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      {alert.notes || 'Unknown card attempted check-in'}
                    </p>
                  </div>

                  <div className="text-right text-[11px] font-mono text-slate-400">
                    <p>{alert.date} {alert.time}</p>
                    <p className="text-slate-500">{alert.device || 'ESP32-HARDWARE'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Manual Check-in Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-2xl bg-[#0c1220] border border-slate-800 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-400" />
                <span>Administrative Check-In</span>
              </h3>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualCheckIn} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase">
                  Select Registered Student
                </label>
                <select
                  value={manualSelectedUid}
                  onChange={(e) => setManualSelectedUid(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Choose student --</option>
                  {Object.values(students).map((st) => (
                    <option key={st.uid} value={st.uid}>
                      {st.name} ({st.studentId}) • {st.uid}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-[11px] text-slate-400">
                This simulates an authorized administrative check-in override for the selected student.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20"
                >
                  Record Check-In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ALL MODALS */}
      <EditAttendanceModal
        record={editingRecord}
        isOpen={Boolean(editingRecord)}
        onClose={() => setEditingRecord(null)}
      />

      <OverrideAttendanceModal
        record={overrideRecord}
        isOpen={Boolean(overrideRecord)}
        onClose={() => setOverrideRecord(null)}
      />

      <DeleteConfirmationModal
        recordsToDelete={recordsToDelete}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setRecordsToDelete([]);
        }}
        onSuccess={() => setSelectedKeys(new Set())}
      />

      <BulkStatusModal
        selectedRecords={selectedRecordsArray}
        isOpen={isBulkStatusModalOpen}
        onClose={() => setIsBulkStatusModalOpen(false)}
        onSuccess={() => setSelectedKeys(new Set())}
      />

      <StudentSuspensionModal
        student={suspensionTargetStudent}
        isOpen={Boolean(suspensionTargetStudent)}
        onClose={() => setSuspensionTargetStudent(null)}
      />

      <ESP32FirmwareGuideModal
        isOpen={isFirmwareGuideOpen}
        onClose={() => setIsFirmwareGuideOpen(false)}
      />

      <DatabaseMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
      />

      <DeleteAttendanceByDateModal
        isOpen={isDeleteByDateModalOpen}
        initialDate={selectedDate}
        onClose={() => setIsDeleteByDateModalOpen(false)}
        onSuccess={(res) => {
          setSelectedDate(res.date);
          setSelectedKeys(new Set());
          setDateDeleteNotice({
            type: 'success',
            message: `${res.message} All dashboards, reports, and monthly percentages have been synchronized.`,
          });
        }}
      />
    </div>
  );
};
