import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Calendar, Clock, AlertTriangle, UserMinus, History, CheckCircle2 } from 'lucide-react';
import { Student, StudentSuspension } from '../types';
import { useAttendance } from '../context/AttendanceContext';

interface StudentSuspensionModalProps {
  student: Student | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const StudentSuspensionModal: React.FC<StudentSuspensionModalProps> = ({
  student,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { suspendStudentAccount, unsuspendStudentAccount, suspensions } = useAttendance();

  const [duration, setDuration] = useState<'1_day' | '1_week' | '1_month' | 'custom'>('1_day');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [unsuspendReason, setUnsuspendReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'manage' | 'history'>('manage');

  // Compute start and end dates based on duration selection
  useEffect(() => {
    const today = new Date();
    const startStr = today.toISOString().split('T')[0];
    setStartDate(startStr);

    const end = new Date(today);
    if (duration === '1_day') {
      end.setDate(end.getDate() + 1);
    } else if (duration === '1_week') {
      end.setDate(end.getDate() + 7);
    } else if (duration === '1_month') {
      end.setMonth(end.getMonth() + 1);
    }
    // If custom, leave endDate as is or set default 3 days
    if (duration !== 'custom') {
      setEndDate(end.toISOString().split('T')[0]);
    } else if (!endDate) {
      end.setDate(end.getDate() + 3);
      setEndDate(end.toISOString().split('T')[0]);
    }
  }, [duration, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setUnsuspendReason('');
      setErrorMsg(null);
      setActiveTab('manage');
    }
  }, [isOpen]);

  if (!isOpen || !student) return null;

  const isCurrentlySuspended = Boolean(
    student.status === 'suspended' || student.isSuspended || (student.activeSuspension && student.activeSuspension.status === 'active')
  );

  const studentSuspensionHistory: StudentSuspension[] = (suspensions && suspensions[student.uid]) || [];

  const handleSuspend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('Please specify a suspension reason (required).');
      return;
    }
    if (endDate <= startDate) {
      setErrorMsg('Suspension end date must be after start date.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await suspendStudentAccount(
      student.uid,
      duration,
      startDate,
      endDate,
      reason.trim()
    );

    setIsSubmitting(false);

    if (res.success) {
      onSuccess?.();
      onClose();
    } else {
      setErrorMsg(res.message);
    }
  };

  const handleUnsuspend = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await unsuspendStudentAccount(
      student.uid,
      unsuspendReason.trim() || 'Manual unsuspension by administrator'
    );

    setIsSubmitting(false);

    if (res.success) {
      onSuccess?.();
      onClose();
    } else {
      setErrorMsg(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl bg-[#0c1220] border border-amber-500/30 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isCurrentlySuspended 
                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400' 
                : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
            }`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{isCurrentlySuspended ? 'Student Suspension Active' : 'Suspend Student Account'}</span>
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {student.name} • UID: <span className="text-cyan-400">{student.uid}</span> ({student.studentId})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="px-5 pt-3 flex gap-2 border-b border-slate-800/60 bg-slate-950/50">
          <button
            type="button"
            onClick={() => setActiveTab('manage')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              activeTab === 'manage'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Suspension Controls
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Suspension History ({studentSuspensionHistory.length})</span>
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {errorMsg}
            </div>
          )}

          {activeTab === 'manage' ? (
            isCurrentlySuspended ? (
              /* Currently Suspended View & Manual Unsuspend */
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-slate-300 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-rose-400">
                    <ShieldAlert className="w-4 h-4" />
                    <span>RFID Attendance Scanning Blocked</span>
                  </div>
                  <p>
                    <strong className="text-white">{student.name}</strong> is actively suspended until{' '}
                    <span className="font-mono text-cyan-300 font-bold">{student.activeSuspension?.endDate || 'specified date'}</span>.
                  </p>
                  {student.activeSuspension?.reason && (
                    <p className="italic text-slate-400 border-l-2 border-rose-400/50 pl-2">
                      Reason: &ldquo;{student.activeSuspension.reason}&rdquo;
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">
                    The ESP32 RFID hardware reader will reject scans from this student's card with an ACCESS DENIED alert until the suspension ends or is manually revoked.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-slate-200">
                    Manual Reactivation / Unsuspend:
                  </h4>
                  <input
                    type="text"
                    value={unsuspendReason}
                    onChange={(e) => setUnsuspendReason(e.target.value)}
                    placeholder="Reason for early unsuspension (optional)..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />

                  <button
                    type="button"
                    onClick={handleUnsuspend}
                    disabled={isSubmitting}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSubmitting ? 'Reactivating...' : 'Manually Unsuspend Student'}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* New Suspension Form */
              <form onSubmit={handleSuspend} className="space-y-4">
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 space-y-1">
                  <p className="font-bold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Attendance Prohibition Notice</span>
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    While suspended, the student cannot record attendance via ESP32 RFID scans. Scans will be rejected with a suspension alert. Once the suspension expires, the account is automatically reactivated.
                  </p>
                </div>

                {/* Duration Presets */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">
                    Suspension Duration
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: '1_day', label: '1 Day' },
                      { id: '1_week', label: '1 Week' },
                      { id: '1_month', label: '1 Month' },
                      { id: 'custom', label: 'Custom' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setDuration(item.id as any)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer text-center ${
                          duration === item.id
                            ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                      End Date {duration !== 'custom' && '(Calculated)'}
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      disabled={duration !== 'custom'}
                      required
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-amber-500 disabled:opacity-75"
                    />
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-[11px] font-mono text-amber-400 uppercase tracking-wider mb-1.5">
                    Suspension Reason (Required) *
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    placeholder="e.g. Disciplinary infraction, pending investigation, academic misconduct..."
                    rows={3}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Enforcing...' : 'Enforce Suspension'}</span>
                  </button>
                </div>
              </form>
            )
          ) : (
            /* History Tab */
            <div className="space-y-3">
              {studentSuspensionHistory.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No suspension history found for this student.
                </div>
              ) : (
                studentSuspensionHistory.map((susp) => (
                  <div
                    key={susp.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        susp.status === 'active'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          : susp.status === 'expired'
                          ? 'bg-slate-800 text-slate-400 border border-slate-700'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {susp.status}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {susp.startDate} → {susp.endDate}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200">
                      Reason: <span className="text-slate-300 font-medium">{susp.reason}</span>
                    </p>

                    <p className="text-[10px] text-slate-500 font-mono">
                      Issued by {susp.suspendedBy} on {new Date(susp.createdAt).toLocaleDateString()}
                      {susp.revokedAt && ` • Revoked on ${new Date(susp.revokedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
