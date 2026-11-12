import React, { useState } from 'react';
import { X, Trash2, AlertTriangle, Undo2, AlertCircle } from 'lucide-react';
import { AttendanceRecord } from '../types';
import { useAttendance } from '../context/AttendanceContext';

interface DeleteConfirmationModalProps {
  recordsToDelete: AttendanceRecord[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  recordsToDelete,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { deleteAttendance, bulkDeleteAttendanceRecords } = useAttendance();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setReason('');
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen || recordsToDelete.length === 0) return null;

  const isBulk = recordsToDelete.length > 1;

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('A reason is required for the audit log.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    let res;
    if (isBulk) {
      res = await bulkDeleteAttendanceRecords(
        recordsToDelete.map((r) => ({ date: r.date, uid: r.uid, studentName: r.studentName })),
        reason.trim()
      );
    } else {
      const single = recordsToDelete[0];
      res = await deleteAttendance(single.date, single.uid, reason.trim());
    }

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
      <div className="relative w-full max-w-md rounded-2xl bg-[#0c1220] border border-red-500/30 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isBulk ? `Delete ${recordsToDelete.length} Attendance Records` : 'Delete Attendance Record'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Soft-delete with recovery archive
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

        <form onSubmit={handleDelete} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-200/90 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Recoverable Soft-Delete</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Records will be removed from the active attendance roster and archived into the{' '}
              <strong className="text-white">Attendance Trash Bin</strong>. You can restore them anytime or click{' '}
              <strong className="text-cyan-300">Undo</strong> within 30 seconds.
            </p>
          </div>

          {/* List preview */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
              Target Record{isBulk ? 's' : ''}:
            </label>
            <div className="max-h-32 overflow-y-auto space-y-1 rounded-xl bg-slate-950 p-2.5 border border-slate-800">
              {recordsToDelete.map((r, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-slate-900/60 font-mono">
                  <span className="text-slate-200 font-semibold truncate">
                    {r.studentName || r.uid}
                  </span>
                  <span className="text-slate-400 text-[11px] shrink-0 ml-2">
                    {r.date} • {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-[11px] font-mono text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <span>Deletion Reason (Required for Audit Trail) *</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="e.g. Card tap error, testing scan, duplicate enrollment, invalid hardware read..."
              rows={2}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <div className="flex items-center gap-1 text-[11px] text-cyan-400 font-mono">
              <Undo2 className="w-3.5 h-3.5" />
              <span>30s Undo Enabled</span>
            </div>

            <div className="flex items-center gap-2">
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
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Deleting...' : isBulk ? `Delete ${recordsToDelete.length}` : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
