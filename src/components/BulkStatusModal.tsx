import React, { useState } from 'react';
import { X, CheckSquare, AlertCircle, Save } from 'lucide-react';
import { AttendanceRecord, AttendanceStatus } from '../types';
import { useAttendance } from '../context/AttendanceContext';

interface BulkStatusModalProps {
  selectedRecords: AttendanceRecord[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const BulkStatusModal: React.FC<BulkStatusModalProps> = ({
  selectedRecords,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { bulkUpdateStatus } = useAttendance();
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('Present');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setNewStatus('Present');
      setReason('');
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen || selectedRecords.length === 0) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('Please state a reason for this bulk status change.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await bulkUpdateStatus(
      selectedRecords.map((r) => ({ date: r.date, uid: r.uid, studentName: r.studentName })),
      newStatus,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-2xl bg-[#0c1220] border border-blue-500/30 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Bulk Update Attendance Status
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {selectedRecords.length} records selected
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* New Status Selection */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">
              Select New Status for all {selectedRecords.length} records:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['Present', 'Absent', 'Late', 'Excused'] as AttendanceStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setNewStatus(st)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center justify-center gap-2 ${
                    newStatus === st
                      ? st === 'Present'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                        : st === 'Absent'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-400 font-bold'
                        : st === 'Late'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold'
                        : 'bg-indigo-500/20 border-indigo-500 text-indigo-400 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span>{st}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Selected records list */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
              Selected Students ({selectedRecords.length}):
            </label>
            <div className="max-h-28 overflow-y-auto space-y-1 rounded-xl bg-slate-950 p-2.5 border border-slate-800">
              {selectedRecords.map((r, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-0.5 px-1 font-mono text-slate-300">
                  <span className="truncate">{r.studentName || r.uid}</span>
                  <span className="text-[11px] text-slate-500">{r.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-[11px] font-mono text-amber-400 uppercase tracking-wider mb-1.5">
              Modification Reason (Required for Audit Trail) *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="e.g. Mass attendance adjustment for university event, weather emergency, seminar check-in..."
              rows={2}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
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
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Updating...' : `Apply to ${selectedRecords.length} records`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
