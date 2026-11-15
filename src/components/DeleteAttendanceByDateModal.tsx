import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Trash2,
  Calendar,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  ArrowLeft,
  Users,
} from 'lucide-react';
import { useAttendance } from '../context/AttendanceContext';
import { useAuth } from '../context/AuthContext';
import { collectAttendanceRecordsForDate } from '../services/firebase';
import { formatISTDateFull, normalizeToISODate } from '../utils/dateUtils';

interface DeleteAttendanceByDateModalProps {
  isOpen: boolean;
  initialDate: string;
  onClose: () => void;
  onSuccess?: (result: { date: string; deletedCount: number; message: string }) => void;
}

export const DeleteAttendanceByDateModal: React.FC<DeleteAttendanceByDateModalProps> = ({
  isOpen,
  initialDate,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { students, allAttendance, todayStr, deleteAttendanceByDate } = useAttendance();

  const [targetDate, setTargetDate] = useState<string>(initialDate || todayStr);
  const [step, setStep] = useState<'preview' | 'confirm' | 'success'>('preview');
  const [reason, setReason] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    date: string;
    deletedCount: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTargetDate(normalizeToISODate(initialDate) || todayStr);
      setStep('preview');
      setReason('');
      setConfirmChecked(false);
      setConfirmText('');
      setErrorMsg(null);
      setSuccessResult(null);
      setIsDeleting(false);
    }
  }, [isOpen, initialDate, todayStr]);

  const normalizedTargetDate = useMemo(
    () => normalizeToISODate(targetDate),
    [targetDate]
  );

  // Recent recorded dates with active records (up to 6 quick chips)
  const recordedDatesSummary = useMemo(() => {
    const counts = new Map<string, number>();
    Object.values(students || {}).forEach((st) => {
      if (!st?.attendance) return;
      Object.entries(st.attendance).forEach(([attKey, rec]) => {
        if (!rec || rec.isDeleted) return;
        const d = normalizeToISODate(rec.date || attKey);
        if (!d) return;
        counts.set(d, (counts.get(d) || 0) + 1);
      });
    });

    // Fallback check on allAttendance in case any record is present in derived map
    Object.entries(allAttendance || {}).forEach(([dateKey, dayMap]) => {
      const d = normalizeToISODate(dateKey);
      if (!d || counts.has(d)) return;
      const activeCount = Object.values(dayMap || {}).filter((r) => r && !r.isDeleted).length;
      if (activeCount > 0) {
        counts.set(d, activeCount);
      }
    });

    return Array.from(counts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6);
  }, [students, allAttendance]);

  // Preview of all matching records for the selected date
  const previewMatches = useMemo(() => {
    if (!normalizedTargetDate) return [];
    return collectAttendanceRecordsForDate(students, normalizedTargetDate);
  }, [students, normalizedTargetDate]);

  const statusBreakdown = useMemo(() => {
    let present = 0;
    let absent = 0;
    let other = 0;
    previewMatches.forEach(({ record }) => {
      if (record.status === 'Present') present++;
      else if (record.status === 'Absent') absent++;
      else other++;
    });
    return { present, absent, other };
  }, [previewMatches]);

  if (!isOpen) return null;

  const isAdmin = user?.role === 'admin';
  const totalRecordsCount = previewMatches.length;
  const formattedFullDate = normalizedTargetDate
    ? formatISTDateFull(normalizedTargetDate)
    : 'Invalid date';

  const confirmPhraseValid =
    confirmChecked &&
    normalizedTargetDate !== null &&
    (confirmText.trim().toUpperCase() === 'DELETE' ||
      confirmText.trim() === normalizedTargetDate);

  const handleDateChange = (newDate: string) => {
    setTargetDate(newDate);
    setErrorMsg(null);
    setStep('preview');
    setConfirmChecked(false);
    setConfirmText('');
  };

  const handleProceedToConfirm = () => {
    setErrorMsg(null);
    if (!isAdmin) {
      setErrorMsg('Unauthorized: Only administrators can delete attendance by date.');
      return;
    }
    if (!normalizedTargetDate) {
      setErrorMsg('Please select a valid calendar date.');
      return;
    }
    if (totalRecordsCount === 0) {
      setErrorMsg(`No attendance records exist for ${normalizedTargetDate}.`);
      return;
    }
    setConfirmChecked(false);
    setConfirmText('');
    setStep('confirm');
  };

  const handleConfirmPermanentDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMsg('Unauthorized: Only administrators can delete attendance by date.');
      return;
    }
    if (!normalizedTargetDate) {
      setErrorMsg('Invalid target date.');
      return;
    }
    if (!confirmPhraseValid) {
      setErrorMsg(
        `Please check the confirmation box and type DELETE or ${normalizedTargetDate} to confirm.`
      );
      return;
    }

    setIsDeleting(true);
    setErrorMsg(null);

    const res = await deleteAttendanceByDate(
      normalizedTargetDate,
      reason.trim() || `Permanent deletion of all attendance for ${normalizedTargetDate}`
    );

    setIsDeleting(false);

    if (res.success) {
      setSuccessResult({
        date: res.date,
        deletedCount: res.deletedCount,
        message: res.message,
      });
      setStep('success');
      onSuccess?.({
        date: res.date,
        deletedCount: res.deletedCount,
        message: res.message,
      });
    } else {
      setErrorMsg(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#0c1220] border border-red-500/35 shadow-2xl shadow-black/80 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/35 flex items-center justify-center text-red-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Delete Attendance by Date</span>
                <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 font-mono text-[10px] font-bold">
                  ADMIN ONLY
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Permanently remove all attendance records for a specific calendar date
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {!isAdmin && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Access denied: Only authenticated administrators can perform date-based deletion.</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: DATE PICKER & PREVIEW */}
          {step === 'preview' && (
            <>
              {/* Calendar Date Picker */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div className="flex-1">
                    <label
                      htmlFor="delete-by-date-picker"
                      className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
                    >
                      <Calendar className="w-3.5 h-3.5 text-red-400" />
                      <span>Select Attendance Date</span>
                    </label>
                    <input
                      id="delete-by-date-picker"
                      type="date"
                      value={targetDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 sm:min-w-[200px]">
                    <span className="block text-[10px] font-mono text-slate-500 uppercase">
                      Records Found on Date
                    </span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span
                        className={`text-2xl font-black font-mono ${
                          totalRecordsCount > 0 ? 'text-red-400' : 'text-slate-500'
                        }`}
                      >
                        {totalRecordsCount}
                      </span>
                      <span className="text-xs text-slate-400">
                        {totalRecordsCount === 1 ? 'record' : 'records'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick recorded date selectors */}
                {recordedDatesSummary.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">
                      Dates with Recorded Attendance:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {recordedDatesSummary.map((item) => {
                        const isSelected = normalizedTargetDate === item.date;
                        return (
                          <button
                            key={item.date}
                            type="button"
                            onClick={() => handleDateChange(item.date)}
                            className={`px-2.5 py-1 rounded-lg font-mono text-[11px] border transition cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-red-500/20 border-red-500/50 text-red-300 font-bold'
                                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                            }`}
                          >
                            <span>{item.date}</span>
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px]">
                              {item.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Date Summary & Status Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block">Selected Date</span>
                  <span className="text-xs font-mono font-bold text-white mt-0.5 block truncate">
                    {normalizedTargetDate || 'Invalid'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block">Present</span>
                  <span className="text-sm font-mono font-bold text-emerald-400 mt-0.5 block">
                    {statusBreakdown.present}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block">Absent</span>
                  <span className="text-sm font-mono font-bold text-rose-400 mt-0.5 block">
                    {statusBreakdown.absent}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block">Late / Other</span>
                  <span className="text-sm font-mono font-bold text-amber-400 mt-0.5 block">
                    {statusBreakdown.other}
                  </span>
                </div>
              </div>

              {/* Records Preview Table */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Preview of Records for {formattedFullDate}</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">
                    {totalRecordsCount} total
                  </span>
                </div>

                <div className="max-h-52 overflow-y-auto rounded-xl bg-slate-950 border border-slate-800 divide-y divide-slate-800/60">
                  {totalRecordsCount === 0 ? (
                    <div className="py-8 px-4 text-center text-slate-500 text-xs">
                      <Calendar className="w-7 h-7 mx-auto mb-2 opacity-30 text-slate-400" />
                      <p className="font-semibold text-slate-300">
                        No attendance records found for {normalizedTargetDate || 'this date'}.
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Select another date from the calendar picker or quick list above.
                      </p>
                    </div>
                  ) : (
                    previewMatches.map(({ studentDbId, attendanceKey, record }) => (
                      <div
                        key={`${studentDbId}_${attendanceKey}`}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-900/50 transition"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-100 truncate">
                            {record.studentName || 'Registered Student'}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400 truncate">
                            {record.studentId || 'N/A'} • UID: <span className="text-cyan-300">{record.uid}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0 font-mono">
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-blue-400" />
                            {record.time || '--:--:--'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              record.status === 'Present'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : record.status === 'Absent'
                                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            }`}
                          >
                            {record.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Optional Audit Reason */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Deletion Reason (Logged to Audit Trail)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={`e.g. Incorrect hardware clock test on ${normalizedTargetDate || 'date'}, holiday correction...`}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Scope Restriction Banner */}
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/25 text-[11px] text-blue-200 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Safe Scope Protection:</strong> Only attendance records matching{' '}
                  <code className="text-cyan-300 font-mono">{normalizedTargetDate || 'selected date'}</code> will be deleted. Student profiles, RFID card UIDs, auth accounts, and attendance records on all other dates remain completely untouched.
                </div>
              </div>
            </>
          )}

          {/* STEP 2: ADDITIONAL CONFIRMATION POPUP STEP */}
          {step === 'confirm' && normalizedTargetDate && (
            <form id="confirm-date-delete-form" onSubmit={handleConfirmPermanentDelete} className="space-y-4">
              <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/40 space-y-2.5">
                <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>Confirm Permanent Attendance Deletion</span>
                </div>
                <p className="text-xs text-red-100/90 leading-relaxed">
                  You are about to <strong className="text-white">permanently delete</strong>{' '}
                  <strong className="text-red-300 font-mono">{totalRecordsCount}</strong> attendance{' '}
                  {totalRecordsCount === 1 ? 'record' : 'records'} for{' '}
                  <strong className="text-white">{formattedFullDate}</strong>{' '}
                  (<code className="text-cyan-300 font-mono">{normalizedTargetDate}</code>).
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-red-500/25">
                    <span className="text-[10px] text-slate-400 block">TARGET DATE</span>
                    <span className="text-white font-bold">{normalizedTargetDate}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-red-500/25">
                    <span className="text-[10px] text-slate-400 block">RECORDS TO DELETE</span>
                    <span className="text-red-400 font-bold">{totalRecordsCount}</span>
                  </div>
                </div>
                <p className="text-[11px] text-red-200/80">
                  This permanently removes the records from Firebase Realtime Database and immediately updates all Admin &amp; Student dashboards, reports, and monthly percentages. Deleted records will not reappear after refresh.
                </p>
              </div>

              {/* Additional Confirmation Step: Checkbox + Typed Phrase */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-red-500/40 transition">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-red-500 cursor-pointer"
                />
                <span className="text-xs text-slate-200 leading-relaxed">
                  I confirm that I want to permanently delete all{' '}
                  <strong className="text-red-400 font-mono">{totalRecordsCount}</strong> attendance{' '}
                  {totalRecordsCount === 1 ? 'record' : 'records'} for{' '}
                  <strong className="text-white font-mono">{normalizedTargetDate}</strong> while preserving all student profiles and RFID registrations.
                </span>
              </label>

              <div>
                <label className="block text-[11px] font-mono text-amber-400 uppercase tracking-wider mb-1.5">
                  Type <code className="px-1.5 py-0.5 rounded bg-slate-900 text-white">DELETE</code> or{' '}
                  <code className="px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300">{normalizedTargetDate}</code> to confirm *
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`Type DELETE or ${normalizedTargetDate}`}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-red-500"
                />
              </div>
            </form>
          )}

          {/* STEP 3: SUCCESS NOTIFICATION */}
          {step === 'success' && successResult && (
            <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-white">
                Attendance Deleted Permanently
              </h4>
              <p className="text-xs text-emerald-200 max-w-md mx-auto leading-relaxed">
                {successResult.message} All Admin statistics, Student dashboards, Attendance Reports, and Monthly Attendance Percentages have been synchronized.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between gap-3 shrink-0">
          {step === 'preview' && (
            <>
              <span className="text-[11px] font-mono text-slate-400">
                {totalRecordsCount > 0
                  ? `${totalRecordsCount} record${totalRecordsCount === 1 ? '' : 's'} queued for ${normalizedTargetDate}`
                  : 'Select a date with attendance records'}
              </span>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProceedToConfirm}
                  disabled={!isAdmin || !normalizedTargetDate || totalRecordsCount === 0}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/25 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {totalRecordsCount > 0
                      ? `Delete ${totalRecordsCount} Record${totalRecordsCount === 1 ? '' : 's'}`
                      : 'Delete'}
                  </span>
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep('preview');
                  setErrorMsg(null);
                }}
                disabled={isDeleting}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Preview</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="confirm-date-delete-form"
                  disabled={!confirmPhraseValid || isDeleting}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/25 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Permanently</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {step === 'success' && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
