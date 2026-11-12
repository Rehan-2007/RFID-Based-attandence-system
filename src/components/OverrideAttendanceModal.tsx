import React, { useState } from 'react';
import { X, UserX, AlertTriangle, Lock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { AttendanceRecord } from '../types';
import { useAttendance } from '../context/AttendanceContext';

interface OverrideAttendanceModalProps {
  record: AttendanceRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OverrideAttendanceModal: React.FC<OverrideAttendanceModalProps> = ({
  record,
  isOpen,
  onClose,
}) => {
  const { overrideToAbsent, removeOverride } = useAttendance();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (record) {
      setReason('');
      setErrorMsg(null);
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const isAlreadyOverridden = Boolean(record.isOverridden && record.status === 'Absent');

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('Please state a reason for marking this student Absent (required).');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await overrideToAbsent(record.date, record.uid, reason.trim());
    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMsg(res.message);
    }
  };

  const handleRemoveOverride = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await removeOverride(record.date, record.uid);
    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMsg(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-2xl bg-[#0c1220] border border-rose-500/30 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isAlreadyOverridden ? 'Administrative Override Active' : 'Manual Override: Mark Absent'}
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {record.studentName || 'Student'} • {record.date}
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

        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {errorMsg}
            </div>
          )}

          {isAlreadyOverridden ? (
            /* Currently Overridden Status & Option to Remove */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-slate-300 space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-400">
                  <Lock className="w-4 h-4" />
                  <span>Attendance Override Locked</span>
                </div>
                <p>
                  This student was manually marked <strong className="text-white">Absent</strong> by administrator{' '}
                  <span className="font-mono text-cyan-300">{record.overrideBy || 'Admin'}</span>.
                </p>
                {record.overrideReason && (
                  <p className="italic text-slate-400 border-l-2 border-rose-400/50 pl-2">
                    &ldquo;{record.overrideReason}&rdquo;
                  </p>
                )}
                <p className="text-[11px] text-slate-400">
                  Subsequent RFID card taps on this date are blocked from changing the status back to Present.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
                <p className="font-semibold text-slate-200 mb-1">Original Scan Data Preserved:</p>
                <div className="font-mono text-[11px] text-slate-400">
                  Time: {record.originalRecord?.time || record.time} • Device: {record.originalRecord?.device || record.device || 'ESP32'}
                </div>
              </div>

              <button
                type="button"
                onClick={handleRemoveOverride}
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Restoring...' : 'Remove Override & Restore Present'}</span>
              </button>
            </div>
          ) : (
            /* Confirmation to mark Absent */
            <form onSubmit={handleApplyOverride} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Administrative Lock Enforcement</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Changing status to <strong className="text-white">Absent</strong> will lock the record for{' '}
                  <span className="font-mono text-white">{record.date}</span>. Subsequent RFID card taps by this student on this day will be blocked and will NOT override your decision.
                </p>
                <p className="text-[11px] text-amber-300/80">
                  Original scan time ({record.time}) remains safely preserved and can be restored anytime.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-rose-400 uppercase tracking-wider mb-1.5">
                  Reason for Override (Required) *
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  placeholder="e.g. Left campus before attendance cutoff, unauthorized absence, disciplinary reason..."
                  rows={3}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
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
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Applying...' : 'Lock as Absent'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
