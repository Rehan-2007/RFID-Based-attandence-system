import React, { useState } from 'react';
import { X, Edit2, Calendar, Clock, CheckCircle2, History, AlertCircle, Save, RotateCcw } from 'lucide-react';
import { AttendanceRecord, AttendanceStatus } from '../types';
import { useAttendance } from '../context/AttendanceContext';
import { getISTTimestampDisplay } from '../utils/dateUtils';

interface EditAttendanceModalProps {
  record: AttendanceRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EditAttendanceModal: React.FC<EditAttendanceModalProps> = ({
  record,
  isOpen,
  onClose,
}) => {
  const { editAttendance, restoreVersion } = useAttendance();

  const [date, setDate] = useState(record?.date || '');
  const [time, setTime] = useState(record?.time || '');
  const [status, setStatus] = useState<AttendanceStatus>(record?.status || 'Present');
  const [notes, setNotes] = useState(record?.notes || '');
  const [device, setDevice] = useState(record?.device || 'ADMIN-EDIT');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Sync state when record changes
  React.useEffect(() => {
    if (record) {
      setDate(record.date);
      setTime(record.time);
      setStatus(record.status);
      setNotes(record.notes || '');
      setDevice(record.device || 'ADMIN-EDIT');
      setReason('');
      setErrorMsg(null);
      setShowHistory(false);
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('An administrative reason is required for modification audit logs.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await editAttendance(
      record.date,
      record.uid,
      {
        date,
        time,
        status,
        notes,
        device,
      },
      reason.trim()
    );

    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMsg(res.message);
    }
  };

  const handleRestoreVersion = async (index: number) => {
    setIsSubmitting(true);
    const res = await restoreVersion(record.date, record.uid, index);
    setIsSubmitting(false);
    if (res.success) {
      onClose();
    } else {
      setErrorMsg(res.message);
    }
  };

  const previousEdits = record.previousEdits || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl bg-[#0c1220] border border-slate-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Edit Attendance Record
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {record.studentName || 'Student'} • UID: <span className="text-cyan-400">{record.uid}</span>
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

        {/* Tab Toggle: Edit Form vs History */}
        {previousEdits.length > 0 && (
          <div className="px-5 pt-3 flex gap-2 border-b border-slate-800/60 bg-slate-950/50">
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
                !showHistory
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Edit Fields
            </button>
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                showHistory
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Version History ({previousEdits.length})</span>
            </button>
          </div>
        )}

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!showHistory ? (
            <form id="edit-attendance-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Date */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    Attendance Date
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Time */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    Check-In Time
                  </label>
                  <div className="relative">
                    <input
                      type="time"
                      step="1"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Attendance Status
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['Present', 'Absent', 'Late', 'Excused'] as AttendanceStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        status === st
                          ? st === 'Present'
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : st === 'Absent'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                            : st === 'Late'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                            : 'bg-indigo-500/20 border-indigo-500 text-indigo-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hardware Device */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Hardware Device Label
                </label>
                <input
                  type="text"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  placeholder="e.g. ESP32-RFID-01"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Administrative Reason (Required) */}
              <div>
                <label className="block text-[11px] font-mono text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <span>Modification Reason (Required for Audit Trail) *</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  placeholder="e.g. Corrected timestamp based on physical sign-in sheet, medical excuse submitted, etc."
                  rows={2}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Optional Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional context or notes..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </form>
          ) : (
            /* Version History List */
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                You can restore any previous version of this attendance record:
              </p>
              {previousEdits.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        item.prevData.status === 'Present'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {item.prevData.status}
                      </span>
                      <span className="text-xs font-mono text-slate-200">
                        {item.prevData.date} at {item.prevData.time}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      Reason: <span className="text-slate-300">{item.reason || 'None provided'}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      Edited by {item.editedBy} • {getISTTimestampDisplay(item.editedAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRestoreVersion(idx)}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold transition flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!showHistory && (
          <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              Changes will be recorded with 30s Undo support.
            </span>

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
                form="edit-attendance-form"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
