import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Database,
  ShieldCheck,
  Download,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  UserPlus,
  Trash2,
  FolderArchive,
  Layers,
  Gauge,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAttendance } from '../context/AttendanceContext';
import { useAuth } from '../context/AuthContext';
import { CONFIGURED_ADMIN_UID, DEFAULT_MIGRATION_BATCH_SIZE } from '../services/firebase';
import { MigrationResult } from '../types';
import { getISTClockTime } from '../utils/dateUtils';

interface DatabaseMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDurationMs(ms?: number): string {
  if (!ms || ms <= 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export const DatabaseMigrationModal: React.FC<DatabaseMigrationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const {
    studentsList,
    migrationInspection,
    migrationProgress,
    migrationCheckpoint,
    unregisteredRecovery,
    refreshMigrationInspection,
    executeDatabaseMigration,
    pauseMigration,
    resumeMigration,
    retryFailedMigration,
    downloadDatabaseBackup,
    assignRecoveredRecords,
    dismissRecoveredRecords,
  } = useAttendance();

  const [isInspecting, setIsInspecting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_MIGRATION_BATCH_SIZE);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [assignTargets, setAssignTargets] = useState<Record<string, string>>({});
  const [resolvingUid, setResolvingUid] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsInspecting(true);
      refreshMigrationInspection().finally(() => setIsInspecting(false));
    }
  }, [isOpen, refreshMigrationInspection]);

  const isRunning = isMigrating || migrationProgress?.status === 'running';

  const metrics = useMemo(() => {
    const legacyTotal =
      migrationProgress?.totalLegacy ??
      migrationResult?.totalLegacyCount ??
      migrationCheckpoint?.totalLegacyCount ??
      migrationInspection?.legacyRecordCount ??
      0;

    const alreadyMigrated =
      migrationProgress?.alreadyMigrated ??
      migrationResult?.alreadyMigratedCount ??
      migrationCheckpoint?.skippedCount ??
      0;

    const succeeded =
      migrationProgress?.succeeded ??
      migrationResult?.migratedCount ??
      migrationCheckpoint?.migratedCount ??
      0;

    const unregistered =
      migrationProgress?.unregistered ??
      migrationResult?.unregisteredCount ??
      migrationCheckpoint?.unregisteredCount ??
      migrationInspection?.unregisteredCount ??
      0;

    const failed =
      migrationProgress?.failed ??
      migrationResult?.failedCount ??
      migrationCheckpoint?.failedCount ??
      0;

    const completedTotal = alreadyMigrated + succeeded + unregistered;
    const pending =
      migrationProgress?.pending ??
      Math.max(0, legacyTotal - completedTotal);

    const currentBatch = migrationProgress?.currentBatch ?? migrationCheckpoint?.currentBatch ?? 0;
    const totalBatches =
      migrationProgress?.totalBatches ??
      migrationCheckpoint?.totalBatches ??
      (legacyTotal > 0 ? Math.ceil(legacyTotal / batchSize) : 0);

    const progressPercent =
      migrationProgress?.progressPercent ??
      (legacyTotal > 0 ? Math.min(100, Math.round((completedTotal / legacyTotal) * 100)) : migrationInspection?.hasLegacyAttendance ? 0 : 100);

    const recordsPerSec =
      migrationProgress?.recordsPerSec ??
      migrationResult?.recordsPerSec ??
      0;

    const durationMs =
      migrationProgress?.durationMs ??
      migrationResult?.durationMs ??
      0;

    const lastCheckpointAt =
      migrationProgress?.lastCheckpointAt ??
      migrationResult?.lastCheckpointAt ??
      migrationCheckpoint?.lastCheckpointAt;

    const verificationStatus: 'pending' | 'verifying' | 'verified' | 'partial' | 'failed' =
      migrationProgress?.verificationStatus ??
      (migrationResult
        ? migrationResult.success
          ? 'verified'
          : migrationResult.paused
            ? 'partial'
            : 'failed'
        : migrationCheckpoint?.status === 'completed'
          ? 'verified'
          : migrationCheckpoint?.status === 'paused'
            ? 'partial'
            : migrationCheckpoint?.status === 'error'
              ? 'failed'
              : migrationInspection?.hasLegacyAttendance
                ? 'pending'
                : 'verified');

    const logs =
      (migrationProgress?.logs && migrationProgress.logs.length > 0 ? migrationProgress.logs : undefined) ||
      migrationResult?.recordLogs ||
      [];

    return {
      legacyTotal,
      alreadyMigrated,
      pending,
      succeeded,
      failed,
      unregistered,
      currentBatch,
      totalBatches,
      progressPercent,
      recordsPerSec,
      durationMs,
      lastCheckpointAt,
      verificationStatus,
      logs,
    };
  }, [migrationProgress, migrationResult, migrationCheckpoint, migrationInspection, batchSize]);

  if (!isOpen) return null;

  const canResume =
    !isRunning &&
    (migrationProgress?.status === 'paused' ||
      migrationCheckpoint?.status === 'paused' ||
      migrationResult?.paused ||
      (metrics.pending > 0 && (migrationCheckpoint?.processedCount ?? 0) > 0));

  const hasFailedRecords =
    !isRunning &&
    (metrics.failed > 0 || (migrationCheckpoint?.failedItems?.length ?? 0) > 0);

  const handleRefresh = async () => {
    setIsInspecting(true);
    setErrorMsg(null);
    await refreshMigrationInspection();
    setIsInspecting(false);
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    setErrorMsg(null);
    setBackupMessage(null);
    try {
      const res = await downloadDatabaseBackup();
      setBackupMessage(
        `Verified backup saved to ${res.backupPath} (${res.verifiedRecordCount}/${res.expectedRecordCount} legacy records confirmed) and downloaded as ${res.filename}.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Backup failed.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleMigrationResult = (res: MigrationResult) => {
    setMigrationResult(res);
    if (!res.success && !res.paused) {
      if (res.failedOperation || res.failedPath) {
        setErrorMsg(
          `Operation "${res.failedOperation || 'MIGRATION'}" failed at path "${res.failedPath || 'unknown'}": ${
            res.errors.join(' | ') || res.message
          }`
        );
      } else if (res.errors.length > 0) {
        setErrorMsg(res.errors.join(' | '));
      } else {
        setErrorMsg(res.message);
      }
    }
  };

  const handleRunMigration = async (resume = false) => {
    setIsMigrating(true);
    setErrorMsg(null);
    setMigrationResult(null);
    try {
      const res = resume
        ? await resumeMigration(batchSize)
        : await executeDatabaseMigration({ batchSize, resume: false });
      handleMigrationResult(res);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Migration execution failed.');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleRetryFailed = async () => {
    setIsMigrating(true);
    setErrorMsg(null);
    try {
      const res = await retryFailedMigration(batchSize);
      handleMigrationResult(res);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Retrying failed records encountered an error.');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleAssignRecovery = async (unregisteredUid: string) => {
    const targetUid = assignTargets[unregisteredUid];
    if (!targetUid) return;
    setResolvingUid(unregisteredUid);
    setErrorMsg(null);
    try {
      await assignRecoveredRecords(unregisteredUid, targetUid);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed assigning recovered attendance.');
    } finally {
      setResolvingUid(null);
    }
  };

  const handleDismissRecovery = async (unregisteredUid: string) => {
    setResolvingUid(unregisteredUid);
    setErrorMsg(null);
    try {
      await dismissRecoveredRecords(unregisteredUid);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed dismissing recovered records.');
    } finally {
      setResolvingUid(null);
    }
  };

  const recoveryItems =
    unregisteredRecovery.length > 0
      ? unregisteredRecovery
      : migrationInspection?.unregisteredGroups || [];

  const verificationBadgeClass =
    metrics.verificationStatus === 'verified'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : metrics.verificationStatus === 'verifying'
        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
        : metrics.verificationStatus === 'partial'
          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          : metrics.verificationStatus === 'failed'
            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
            : 'bg-slate-800 text-slate-300 border-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="relative w-full max-w-4xl rounded-3xl bg-[#0c1220] border border-cyan-500/30 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex flex-wrap items-center gap-2">
                <span>Unified Database Migration & Recovery Center</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">
                  students/&#123;UID&#125;/attendance
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Batched, checkpointed, pausable, and idempotent migration from legacy root attendance/ into unified students/
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer disabled:opacity-40"
            title={isRunning ? 'Pause migration before closing' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Schema Comparison Visual */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block mb-1">
                Legacy Schema
              </span>
              <code className="text-[11px] font-mono text-slate-300 block leading-relaxed">
                /attendance/&#123;DATE&#125;/&#123;UID&#125;<br />
                /students/&#123;UID&#125;
              </code>
            </div>

            <div className="flex flex-col items-center justify-center text-cyan-400 gap-1">
              <ArrowRight className="w-5 h-5 hidden md:block" />
              <span className="text-[10px] font-mono uppercase text-slate-400">
                100% Parity Batched Merge
              </span>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
              <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold block mb-1">
                Unified Target Schema
              </span>
              <code className="text-[11px] font-mono text-emerald-200 block leading-relaxed">
                /students/&#123;UID&#125;/attendance/&#123;DATE&#125;
              </code>
            </div>
          </div>

          {/* Live Inspection Metrics */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-bold text-slate-200 flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span>Live Database Inspection</span>
                </h4>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                    user?.role === 'admin' || (migrationInspection?.authenticatedUid ?? user?.uid) === CONFIGURED_ADMIN_UID
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  }`}
                >
                  Auth UID: {migrationInspection?.authenticatedUid ?? user?.uid ?? 'Not Signed In'}
                  {user?.role === 'admin' || (migrationInspection?.authenticatedUid ?? user?.uid) === CONFIGURED_ADMIN_UID
                    ? ' (Admin Verified)'
                    : ' (Mismatch)'}
                </span>
              </div>
              <button
                onClick={handleRefresh}
                disabled={isInspecting || isRunning}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isInspecting ? 'animate-spin' : ''}`} />
                <span>Re-Scan RTDB</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <span className="text-[10px] font-mono text-slate-400 uppercase block">
                  Registered Students
                </span>
                <span className="text-xl font-black text-white font-mono">
                  {migrationInspection?.studentCount ?? studentsList.length}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <span className="text-[10px] font-mono text-slate-400 uppercase block">
                  Unified Records
                </span>
                <span className="text-xl font-black text-emerald-400 font-mono">
                  {migrationInspection?.alreadyUnifiedCount ?? 0}
                </span>
              </div>

              <div
                className={`p-3.5 rounded-xl border ${
                  migrationInspection?.hasLegacyAttendance
                    ? 'bg-amber-950/20 border-amber-500/40'
                    : 'bg-slate-900/90 border-slate-800'
                }`}
              >
                <span className="text-[10px] font-mono text-slate-400 uppercase block">
                  Legacy /attendance
                </span>
                <span
                  className={`text-xl font-black font-mono ${
                    migrationInspection?.hasLegacyAttendance ? 'text-amber-400' : 'text-slate-400'
                  }`}
                >
                  {migrationInspection?.legacyRecordCount ?? 0}
                </span>
              </div>

              <div
                className={`p-3.5 rounded-xl border ${
                  recoveryItems.length > 0
                    ? 'bg-rose-950/20 border-rose-500/40'
                    : 'bg-slate-900/90 border-slate-800'
                }`}
              >
                <span className="text-[10px] font-mono text-slate-400 uppercase block">
                  Unregistered Recovery
                </span>
                <span
                  className={`text-xl font-black font-mono ${
                    recoveryItems.length > 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {recoveryItems.reduce((acc, g) => acc + g.recordCount, 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Migration Performance Dashboard */}
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-slate-200 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-cyan-400" />
                <span>Migration Performance Dashboard</span>
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${verificationBadgeClass}`}>
                  Verification: {metrics.verificationStatus}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono text-cyan-300">
                  {metrics.progressPercent}% Complete
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full h-2.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    metrics.verificationStatus === 'failed'
                      ? 'bg-rose-500'
                      : migrationProgress?.status === 'paused'
                        ? 'bg-amber-500'
                        : 'bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, metrics.progressPercent))}%` }}
                />
              </div>
              {migrationProgress?.message && (
                <p className="text-[11px] font-mono text-slate-300 truncate" title={migrationProgress.message}>
                  {migrationProgress.message}
                </p>
              )}
            </div>

            {/* 11 Performance Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-[11px] font-mono">
              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <span className="text-[9px] text-slate-400 uppercase block">Total Legacy</span>
                <span className="text-sm font-black text-white">{metrics.legacyTotal}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <span className="text-[9px] text-slate-400 uppercase block">Already Migrated</span>
                <span className="text-sm font-black text-cyan-300">{metrics.alreadyMigrated}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <span className="text-[9px] text-slate-400 uppercase block">Pending</span>
                <span className="text-sm font-black text-amber-300">{metrics.pending}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <span className="text-[9px] text-slate-400 uppercase block">Succeeded</span>
                <span className="text-sm font-black text-emerald-400">{metrics.succeeded}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <span className="text-[9px] text-slate-400 uppercase block">Failed</span>
                <span className={`text-sm font-black ${metrics.failed > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {metrics.failed}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px] font-mono">
              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <span className="text-[9px] text-slate-400 uppercase block">Current Batch</span>
                <span className="text-xs font-bold text-slate-200">
                  {metrics.currentBatch} / {metrics.totalBatches} ({batchSize}/batch)
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <span className="text-[9px] text-slate-400 uppercase block">Processing Speed</span>
                <span className="text-xs font-bold text-cyan-300">{metrics.recordsPerSec} rec/sec</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <span className="text-[9px] text-slate-400 uppercase block">Duration</span>
                <span className="text-xs font-bold text-slate-200">{formatDurationMs(metrics.durationMs)}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <span className="text-[9px] text-slate-400 uppercase flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> Last Checkpoint
                </span>
                <span className="text-xs font-bold text-emerald-300">
                  {metrics.lastCheckpointAt ? getISTClockTime(metrics.lastCheckpointAt) : 'None yet'}
                </span>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {(errorMsg || migrationInspection?.inspectionError) && (
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <p className="font-mono text-[11px] break-all leading-relaxed">
                  {errorMsg || migrationInspection?.inspectionError}
                </p>
                {migrationResult && !migrationResult.success && (migrationResult.failedOperation || migrationResult.failedPath) && (
                  <p className="text-[10px] font-mono text-rose-300/90">
                    Failed Operation: <strong>{migrationResult.failedOperation || 'N/A'}</strong> • Failed Path:{' '}
                    <strong>{migrationResult.failedPath || 'N/A'}</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          {backupMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{backupMessage}</span>
            </div>
          )}

          {migrationResult && (
            <div
              className={`p-4 rounded-2xl border space-y-3 ${
                migrationResult.success
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  : migrationResult.paused
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                    : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2 font-bold">
                <div className="flex items-center gap-2">
                  {migrationResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : migrationResult.paused ? (
                    <Pause className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{migrationResult.message}</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/30 shrink-0">
                  {migrationResult.legacyRemoved ? 'Legacy /attendance Cleaned' : 'Legacy Preserved'}
                </span>
              </div>

              {migrationResult.backupPath && (
                <div className="px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10 text-[11px] font-mono flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Backup Path: <strong className="text-cyan-300">{migrationResult.backupPath}</strong>
                  </span>
                  <span>
                    Backup Verified:{' '}
                    <strong>
                      {migrationResult.backupVerifiedCount ?? 0}/{migrationResult.backupExpectedCount ?? 0}
                    </strong>{' '}
                    records
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono pt-1">
                <div className="p-2 rounded bg-black/30">
                  Migrated: <strong>{migrationResult.migratedCount}</strong>
                </div>
                <div className="p-2 rounded bg-black/30">
                  Already Synced: <strong>{migrationResult.skippedDuplicateCount}</strong>
                </div>
                <div className="p-2 rounded bg-black/30">
                  Recovery Vault: <strong>{migrationResult.unregisteredCount}</strong>
                </div>
                <div className="p-2 rounded bg-black/30">
                  Verified: <strong>{migrationResult.verifiedCount}/{migrationResult.totalLegacyCount}</strong>
                </div>
              </div>

              {migrationResult.errors && migrationResult.errors.length > 0 && (
                <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-[11px] font-mono text-rose-200 space-y-1">
                  <p className="font-bold text-rose-300">Reported Errors ({migrationResult.errors.length}):</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {migrationResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action Controls */}
          <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="font-bold text-white">Migration Controls &amp; Checkpointed Execution</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Multi-location batch updates with backup verification, automatic pause/resume checkpoints, and retry support.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-[10px] font-mono uppercase text-slate-400">Batch Size:</label>
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  disabled={isRunning}
                  className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs font-mono disabled:opacity-50"
                >
                  <option value={50}>50 rec</option>
                  <option value={100}>100 rec</option>
                  <option value={200}>200 rec</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleRunMigration(false)}
                disabled={isRunning}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold shadow-lg shadow-emerald-500/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>
                  {isRunning
                    ? 'Migrating Batches...'
                    : migrationInspection?.hasLegacyAttendance
                      ? 'Start Migration'
                      : 'Verify Unified Tree'}
                </span>
              </button>

              {isRunning && (
                <button
                  onClick={pauseMigration}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
              )}

              {canResume && (
                <button
                  onClick={() => handleRunMigration(true)}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume</span>
                </button>
              )}

              {hasFailedRecords && (
                <button
                  onClick={handleRetryFailed}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Failed ({metrics.failed || migrationCheckpoint?.failedItems?.length || 0})</span>
                </button>
              )}

              <button
                onClick={handleBackup}
                disabled={isBackingUp || isRunning}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className={`w-3.5 h-3.5 text-cyan-400 ${isBackingUp ? 'animate-bounce' : ''}`} />
                <span>{isBackingUp ? 'Backing up...' : 'Download JSON Backup'}</span>
              </button>

              <button
                onClick={() => setShowLogs((prev) => !prev)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer ml-auto"
              >
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>View Migration Logs ({metrics.logs.length})</span>
                {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showLogs && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                {migrationCheckpoint?.failedItems && migrationCheckpoint.failedItems.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30 space-y-1 font-mono text-[10px]">
                    <p className="font-bold text-rose-300 uppercase">
                      Checkpoint Failed Items ({migrationCheckpoint.failedItems.length})
                    </p>
                    {migrationCheckpoint.failedItems.map((fi) => (
                      <div key={fi.key} className="text-rose-200 flex items-center justify-between gap-2">
                        <span>
                          {fi.uid} • {fi.date} ({fi.targetPath})
                        </span>
                        <span className="truncate max-w-[240px]" title={fi.error}>
                          {fi.error}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {metrics.logs.length === 0 ? (
                  <p className="text-[11px] font-mono text-slate-500 py-2">
                    No migration record logs recorded in this session yet.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1 font-mono text-[10px]">
                    {metrics.logs.map((log, i) => (
                      <div
                        key={`${log.uid}-${log.date}-${i}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-black/35 border border-white/10"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`px-1.5 py-0.5 rounded uppercase font-bold ${
                              log.action === 'migrated'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : log.action === 'merged'
                                  ? 'bg-cyan-500/20 text-cyan-300'
                                  : log.action === 'recovery'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {log.action}
                          </span>
                          <span className="text-white font-semibold">{log.uid}</span>
                          <span className="text-slate-400">{log.date}</span>
                        </div>
                        <span className="text-slate-400 truncate max-w-[280px]" title={log.message || log.targetPath}>
                          {log.message || log.targetPath}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Unregistered Recovery Queue */}
          {recoveryItems.length > 0 && (
            <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderArchive className="w-4 h-4 text-rose-400" />
                  <h4 className="font-bold text-white">
                    Unregistered Legacy Card Recovery ({recoveryItems.length} Card{recoveryItems.length === 1 ? '' : 's'})
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-rose-300">
                  migration_recovery/unregistered_attendance/
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                These legacy attendance records belonged to RFID UIDs not currently matched in <code className="font-mono text-cyan-300">students/</code>. They were preserved instead of discarded so you can assign them to an existing student.
              </p>

              <div className="space-y-2.5">
                {recoveryItems.map((group) => (
                  <div
                    key={group.uid}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-300">{group.uid}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300">
                          {group.recordCount} record{group.recordCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {group.sampleName ? `Legacy Name: ${group.sampleName} • ` : ''}
                        Dates: {Object.keys(group.records).join(', ')}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={assignTargets[group.uid] || ''}
                        onChange={(e) =>
                          setAssignTargets((prev) => ({ ...prev, [group.uid]: e.target.value }))
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                      >
                        <option value="">-- Assign to Student --</option>
                        {studentsList.map((s) => (
                          <option key={s.studentDbId || s.uid} value={s.studentDbId || s.uid}>
                            {s.name} ({s.rfidUID || s.uid})
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleAssignRecovery(group.uid)}
                        disabled={!assignTargets[group.uid] || resolvingUid === group.uid}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Assign</span>
                      </button>

                      <button
                        onClick={() => handleDismissRecovery(group.uid)}
                        disabled={resolvingUid === group.uid}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600/30 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                        title="Discard recovery records"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status Footer Banner */}
          {!migrationInspection?.hasLegacyAttendance && recoveryItems.length === 0 && (
            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-emerald-300">Database is 100% Unified</p>
                <p className="text-[11px] text-slate-400">
                  All student profiles and attendance records are consolidated under <code className="font-mono text-cyan-300">students/&#123;RFID_UID&#125;/attendance/&#123;DATE&#125;</code> with no legacy root <code className="font-mono">attendance/</code> records remaining.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-500">
            /backups Stored: {migrationInspection?.backupCount ?? 0}
          </span>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-40"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
