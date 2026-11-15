import React, { useState, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Edit2, 
  Trash2, 
  Radio, 
  Check, 
  Copy, 
  X, 
  AlertTriangle,
  Mail,
  Phone,
  BookOpen,
  Calendar,
  Filter,
  CheckCircle2,
  UserX,
  ShieldAlert,
  Link2,
  UserCheck,
  Trophy,
  Flame
} from 'lucide-react';
import { Student } from '../types';
import { useAttendance } from '../context/AttendanceContext';
import { StudentSuspensionModal } from '../components/StudentSuspensionModal';
import { linkAuthUidToStudent, provisionAuthForExistingStudent } from '../services/firebase';

interface StudentsPageProps {
  onOpenScanner: () => void;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ onOpenScanner }) => {
  const { 
    studentsList, 
    addOrUpdateStudent, 
    createStudentAccount,
    deleteStudent, 
    todayAttendance,
    scanRfidCard,
    isAfterDeadline,
    isTodayHoliday,
    attendanceDeadline,
    retryConnection,
    getStudentLeaderboardStats
  } = useAttendance();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [suspensionStudent, setSuspensionStudent] = useState<Student | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [authRecoveryUid, setAuthRecoveryUid] = useState('');
  const [authRecoveryPassword, setAuthRecoveryPassword] = useState('');
  const [isLinkingAuth, setIsLinkingAuth] = useState(false);
  const [authRecoverySuccess, setAuthRecoverySuccess] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState<Partial<Student & { password?: string; createAuthAccount?: boolean }>>({
    uid: '',
    name: '',
    studentId: '',
    department: 'Computer Science & Engineering',
    year: '1st Year',
    semester: 'Semester 1',
    email: '',
    phone: '',
    status: 'active',
    password: '',
    createAuthAccount: true,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const departments = [
    'All',
    'Computer Science & Engineering',
    'Electronics & Communication',
    'Information Technology',
    'Mechanical Engineering',
    'Civil Engineering',
  ];

  const filteredStudents = useMemo(() => {
    return studentsList.filter((st) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery = 
        st.name.toLowerCase().includes(q) ||
        st.uid.toLowerCase().includes(q) ||
        st.studentId.toLowerCase().includes(q) ||
        st.department.toLowerCase().includes(q) ||
        st.email.toLowerCase().includes(q);

      const matchesDept = selectedDept === 'All' || st.department === selectedDept;

      return matchesQuery && matchesDept;
    });
  }, [studentsList, searchQuery, selectedDept]);

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setFormData({
      uid: '',
      name: '',
      studentId: `STU-2024-00${studentsList.length + 1}`,
      department: 'Computer Science & Engineering',
      year: '1st Year',
      semester: 'Semester 1',
      email: '',
      phone: '',
      status: 'active',
      password: '',
      createAuthAccount: true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({ 
      ...student, 
      semester: student.semester || 'Semester 1',
      createAuthAccount: false,
      password: '',
    });
    setAuthRecoveryUid('');
    setAuthRecoveryPassword('');
    setAuthRecoverySuccess(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleLinkExistingAuthUid = async () => {
    if (!editingStudent || !authRecoveryUid.trim()) return;
    const targetDbId = editingStudent.studentDbId || editingStudent.uid;
    setIsLinkingAuth(true);
    setFormError(null);
    setAuthRecoverySuccess(null);
    try {
      const res = await linkAuthUidToStudent(targetDbId, authRecoveryUid.trim(), formData.email?.trim() || undefined);
      setEditingStudent({ ...editingStudent, authUid: res.authUid });
      setAuthRecoveryUid('');
      setAuthRecoverySuccess(`Linked Auth UID ${res.authUid} to existing student ${targetDbId}.`);
      await retryConnection();
    } catch (err: any) {
      setFormError(err?.message || 'Failed linking Auth UID to student.');
    } finally {
      setIsLinkingAuth(false);
    }
  };

  const handleProvisionAuthForExisting = async () => {
    if (!editingStudent || authRecoveryPassword.trim().length < 6) {
      setFormError('Password must be at least 6 characters to provision a login for this student.');
      return;
    }
    const targetDbId = editingStudent.studentDbId || editingStudent.uid;
    setIsLinkingAuth(true);
    setFormError(null);
    setAuthRecoverySuccess(null);
    try {
      const res = await provisionAuthForExistingStudent(
        targetDbId,
        authRecoveryPassword.trim(),
        formData.email?.trim() || undefined
      );
      setEditingStudent({ ...editingStudent, authUid: res.authUid, email: res.email });
      setFormData((prev) => ({ ...prev, email: res.email }));
      setAuthRecoveryPassword('');
      setAuthRecoverySuccess(`Provisioned login (${res.email}) & linked Auth UID ${res.authUid}.`);
      await retryConnection();
    } catch (err: any) {
      setFormError(err?.message || 'Failed provisioning Firebase Auth login.');
    } finally {
      setIsLinkingAuth(false);
    }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const uid = formData.uid?.trim().toUpperCase();
    const name = formData.name?.trim();
    const studentId = formData.studentId?.trim();
    const email = formData.email?.trim() || '';
    const password = formData.password?.trim() || '';

    if (!uid || !name || !studentId) {
      setFormError('Please fill in RFID UID, Student Name, and Student ID.');
      return;
    }

    // Check duplicate RFID UID against other students
    const currentEditKey = editingStudent?.studentDbId || editingStudent?.uid;
    if (
      studentsList.some(
        (s) => (s.studentDbId || s.uid) !== currentEditKey && s.uid.toUpperCase() === uid
      )
    ) {
      setFormError(`A student is already registered with RFID UID: ${uid}`);
      return;
    }

    // If creating a Firebase Auth portal account
    if (!editingStudent && formData.createAuthAccount) {
      if (!email) {
        setFormError('An email address is required to create a Student Portal login account.');
        return;
      }
      if (!password || password.length < 6) {
        setFormError('Initial student password must be at least 6 characters.');
        return;
      }

      setIsSaving(true);
      try {
        await createStudentAccount({
          name,
          rollNumber: studentId,
          email,
          password,
          department: formData.department || 'Computer Science & Engineering',
          year: formData.year || '1st Year',
          semester: formData.semester || 'Semester 1',
          rfidUID: uid,
          phone: formData.phone || '',
        });
        setIsSaving(false);
        setIsModalOpen(false);
        return;
      } catch (err: any) {
        setIsSaving(false);
        setFormError(err.message || 'Failed to create student account.');
        return;
      }
    }

    const studentToSave: Student = {
      studentDbId: editingStudent?.studentDbId,
      uid,
      rfidUID: uid,
      name,
      studentId,
      department: formData.department || 'General',
      year: formData.year || '1st Year',
      semester: formData.semester || 'Semester 1',
      email: formData.email || '',
      phone: formData.phone || '',
      registeredAt: editingStudent ? editingStudent.registeredAt : new Date().toISOString(),
      status: (formData.status as 'active' | 'inactive') || 'active',
      authUid: editingStudent?.authUid,
    };

    setIsSaving(true);
    try {
      await addOrUpdateStudent(studentToSave);
      setIsSaving(false);
      setIsModalOpen(false);
    } catch (err: any) {
      setIsSaving(false);
      setFormError(err.message || 'Failed to save student.');
    }
  };

  const handleConfirmDelete = async () => {
    if (studentToDelete) {
      try {
        await deleteStudent(studentToDelete.studentDbId || studentToDelete.uid);
        setStudentToDelete(null);
      } catch (err: any) {
        setFormError(err?.message || 'Failed to delete student from Firebase.');
        setStudentToDelete(null);
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUid(text);
    setTimeout(() => setCopiedUid(null), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Header and Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <span>Student & RFID Registry</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Registered RFID cards map directly to physical ESP32 attendance hardware
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 border border-blue-400/30 transition flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 flex flex-col md:flex-row gap-3 items-center justify-between shadow-lg">
        <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search by Name, UID, Student ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        <div className="w-full md:w-auto flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedDept === dept
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {dept === 'All' ? 'All Departments' : dept.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Students Table */}
      <div className="rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Student</th>
                <th className="py-3.5 px-4">RFID UID</th>
                <th className="py-3.5 px-4">Department & Year</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4">Today Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-semibold text-slate-300">No students found</p>
                    <p className="text-xs text-slate-500 mt-1">Try adjusting your search criteria or register a new student.</p>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => {
                  const dbKey = st.studentDbId || st.uid;
                  const todayRecord = todayAttendance[dbKey] || todayAttendance[st.uid];
                  const isPresent = Boolean(todayRecord && !todayRecord.isDeleted && todayRecord.status === 'Present');
                  const isAbsentMarked = Boolean(todayRecord && !todayRecord.isDeleted && todayRecord.status === 'Absent');
                  const isSuspended = st.status === 'suspended' || Boolean(st.isSuspended);

                  return (
                    <tr 
                      key={dbKey}
                      className={`hover:bg-slate-850/50 transition group ${isSuspended ? 'bg-amber-950/15' : ''}`}
                    >
                      {/* Name & ID */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSuspended 
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' 
                              : 'bg-gradient-to-tr from-blue-600/30 to-indigo-600/30 border-blue-500/30 text-blue-300'
                          }`}>
                            {st.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-100 group-hover:text-blue-300 transition">
                                {st.name}
                              </p>
                              {isSuspended && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-mono text-[10px] font-bold">
                                  <ShieldAlert className="w-2.5 h-2.5" />
                                  <span>SUSPENDED</span>
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <p className="text-[11px] font-mono text-slate-400">
                                {st.studentId}
                              </p>
                              {st.authUid ? (
                                <span
                                  title={`Auth UID: ${st.authUid}`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[9px]"
                                >
                                  <UserCheck className="w-2.5 h-2.5" />
                                  <span>Auth Linked</span>
                                </span>
                              ) : (
                                <span
                                  title="No Firebase Auth UID linked yet"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono text-[9px]"
                                >
                                  <Link2 className="w-2.5 h-2.5" />
                                  <span>Unlinked</span>
                                </span>
                              )}
                              {(() => {
                                const lbStats = getStudentLeaderboardStats(dbKey);
                                if (!lbStats) return null;
                                return (
                                  <span
                                    title={
                                      lbStats.achievements.length > 0
                                        ? `Achievements: ${lbStats.achievements.map((a) => a.title).join(', ')}`
                                        : 'Regularity & streak summary'
                                    }
                                    className="inline-flex items-center gap-1.5 text-[10px] font-mono text-amber-300"
                                  >
                                    <Trophy className="w-2.5 h-2.5" />
                                    <span>#{lbStats.rank}</span>
                                    <span>·</span>
                                    <Flame className="w-2.5 h-2.5 text-orange-400" />
                                    <span className="text-orange-300">{lbStats.currentStreak}d</span>
                                    {lbStats.achievements.length > 0 && (
                                      <>
                                        <span>·</span>
                                        <span className="text-cyan-300">{lbStats.achievements.length} badge{lbStats.achievements.length === 1 ? '' : 's'}</span>
                                      </>
                                    )}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* RFID UID */}
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-cyan-300 font-mono font-bold text-xs">
                          <Radio className="w-3 h-3 text-cyan-400" />
                          <span>{st.uid}</span>
                          <button
                            onClick={() => copyToClipboard(st.uid)}
                            title="Copy UID"
                            className="text-slate-500 hover:text-white transition"
                          >
                            {copiedUid === st.uid ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Dept & Year */}
                      <td className="py-3.5 px-4">
                        <p className="text-slate-300 font-medium">{st.department}</p>
                        <p className="text-[11px] text-slate-500">{st.year}</p>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <p className="text-slate-300 flex items-center gap-1.5 text-[11px]">
                            <Mail className="w-3 h-3 text-slate-500" />
                            <span className="truncate max-w-[150px]">{st.email || '—'}</span>
                          </p>
                          <p className="text-slate-400 flex items-center gap-1.5 text-[10px] font-mono">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>{st.phone || '—'}</span>
                          </p>
                        </div>
                      </td>

                      {/* Today Status */}
                      <td className="py-3.5 px-4">
                        {isSuspended ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium">
                            <UserX className="w-3 h-3 text-amber-400" />
                            <span>Suspended ({st.activeSuspension?.duration || 'Active'})</span>
                          </div>
                        ) : isPresent ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Present ({todayRecord?.time})</span>
                          </div>
                        ) : isAbsentMarked ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 font-medium">
                            <UserX className="w-3 h-3" />
                            <span>{todayRecord?.isOverridden ? 'Absent (Override)' : 'Absent'}</span>
                          </div>
                        ) : isTodayHoliday ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-medium">
                            <span>Holiday</span>
                          </div>
                        ) : isAfterDeadline ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 font-medium">
                            <span>Absent (After {attendanceDeadline})</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 font-medium">
                            <span>Pending</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Quick Simulate Tap */}
                          <button
                            onClick={() => scanRfidCard(st.uid)}
                            disabled={isSuspended}
                            title={isSuspended ? 'Student is suspended - attendance blocked' : `Tap ${st.name}'s card on ESP32`}
                            className={`p-1.5 rounded-lg border transition ${
                              isSuspended
                                ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                                : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30'
                            }`}
                          >
                            <Radio className="w-3.5 h-3.5" />
                          </button>

                          {/* Suspend / Unsuspend */}
                          <button
                            onClick={() => setSuspensionStudent(st)}
                            title={isSuspended ? 'Manage or Unsuspend Student' : 'Suspend Student Account'}
                            className={`p-1.5 rounded-lg border transition ${
                              isSuspended
                                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => handleOpenEdit(st)}
                            title="Edit Student Info"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setStudentToDelete(st)}
                            title="Delete Student"
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
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

      {/* Add / Edit Student Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div 
            className="w-full max-w-lg max-h-[90vh] flex flex-col bg-[#0d1322] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span>{editingStudent ? 'Edit Student Details' : 'Register New Student'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* RFID UID */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  RFID UID (Hardware Hex Code) *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="e.g. A1B2C3D4"
                    value={formData.uid}
                    onChange={(e) => setFormData({ ...formData, uid: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs focus:outline-none focus:border-blue-500 uppercase"
                  />
                  <span className="absolute right-3 top-2.5 text-[10px] font-mono text-slate-500">
                    HEX
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Unique RFID Card Identifier read by RC522 reader.
                </p>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Full Student Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Student ID & Year & Semester */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Student ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. STU-2024-001"
                    value={formData.studentId}
                    onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Academic Year
                  </label>
                  <select
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="Final Year">Final Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Semester
                  </label>
                  <select
                    value={formData.semester}
                    onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="Semester 1">Semester 1</option>
                    <option value="Semester 2">Semester 2</option>
                    <option value="Semester 3">Semester 3</option>
                    <option value="Semester 4">Semester 4</option>
                    <option value="Semester 5">Semester 5</option>
                    <option value="Semester 6">Semester 6</option>
                    <option value="Semester 7">Semester 7</option>
                    <option value="Semester 8">Semester 8</option>
                  </select>
                </div>
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Department
                </label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="Computer Science & Engineering">Computer Science & Engineering</option>
                  <option value="Electronics & Communication">Electronics & Communication</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Mechanical Engineering">Mechanical Engineering</option>
                  <option value="Civil Engineering">Civil Engineering</option>
                </select>
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Email Address {!editingStudent && formData.createAuthAccount ? '*' : ''}
                  </label>
                  <input
                    type="email"
                    required={!editingStudent && Boolean(formData.createAuthAccount)}
                    placeholder="student@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Existing Student Auth Mapping & Account Recovery (when editing) */}
              {editingStudent && (
                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-slate-400">
                      DB Key: <strong className="text-cyan-300">{editingStudent.studentDbId || editingStudent.uid}</strong>
                    </span>
                    <span className={editingStudent.authUid ? 'text-emerald-400' : 'text-amber-300'}>
                      Auth UID: <strong>{editingStudent.authUid || 'Not linked yet'}</strong>
                    </span>
                  </div>

                  {authRecoverySuccess && (
                    <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-[11px] flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{authRecoverySuccess}</span>
                    </div>
                  )}

                  {!editingStudent.authUid && (
                    <div className="space-y-2.5 pt-1 border-t border-slate-800">
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Link an existing Firebase Auth UID or create a new portal login for this student without overwriting their RFID card or attendance history.
                      </p>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          placeholder="Paste existing Firebase Auth UID..."
                          value={authRecoveryUid}
                          onChange={(e) => setAuthRecoveryUid(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="button"
                          onClick={handleLinkExistingAuthUid}
                          disabled={isLinkingAuth || !authRecoveryUid.trim()}
                          className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 shrink-0"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Link UID</span>
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="password"
                          placeholder="Or set new password (min 6 chars)..."
                          value={authRecoveryPassword}
                          onChange={(e) => setAuthRecoveryPassword(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={handleProvisionAuthForExisting}
                          disabled={isLinkingAuth || authRecoveryPassword.trim().length < 6}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 shrink-0"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Create Login</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Create Firebase Auth Portal Account Option (for new students) */}
              {!editingStudent && (
                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.createAuthAccount)}
                      onChange={(e) => setFormData({ ...formData, createAuthAccount: e.target.checked })}
                      className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-white">
                      Create Student Portal Login Account
                    </span>
                  </label>

                  {formData.createAuthAccount && (
                    <div className="space-y-1.5 pt-1 animate-in fade-in">
                      <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                        Initial Portal Password *
                      </label>
                      <input
                        type="password"
                        required={formData.createAuthAccount}
                        placeholder="Minimum 6 characters"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                      />
                      <p className="text-[10px] text-slate-400">
                        The student will log in to their student portal using their email and this password.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md shadow-blue-600/30 cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingStudent ? 'Update Student' : 'Register Student'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div 
            className="w-full max-w-md bg-[#0d1322] border border-rose-500/30 rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">
              Delete Student Record?
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Are you sure you want to remove <strong className="text-white">{studentToDelete.name}</strong> (UID: <span className="font-mono text-cyan-300">{studentToDelete.uid}</span>)?
              Their profile will be permanently removed from Firebase Realtime Database.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setStudentToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-md shadow-rose-600/30 cursor-pointer"
              >
                Delete Student
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Suspension Modal */}
      {suspensionStudent && (
        <StudentSuspensionModal
          isOpen={Boolean(suspensionStudent)}
          onClose={() => setSuspensionStudent(null)}
          student={suspensionStudent}
        />
      )}
    </div>
  );
};
