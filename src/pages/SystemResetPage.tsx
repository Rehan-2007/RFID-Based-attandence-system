import React, { useState } from 'react';
import { 
  AlertTriangle, 
  Trash2, 
  RotateCcw, 
  ShieldAlert, 
  Lock, 
  CheckCircle2, 
  X, 
  Cpu, 
  Clock, 
  History, 
  Radio, 
  FileText, 
  Eye, 
  EyeOff, 
  RefreshCw,
  AlertOctagon,
  Database,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAttendance } from '../context/AttendanceContext';
import { reverifyAdminPassword } from '../services/firebase';

type ResetTarget = 'attendance' | 'system' | null;

export const SystemResetPage: React.FC = () => {
  const { user } = useAuth();
  const { 
    triggerAttendanceReset, 
    triggerCompleteSystemReset, 
    lastResetLog, 
    latestDeviceCommand,
    isDbConnected 
  } = useAttendance();

  // Modal State
  const [activeModal, setActiveModal] = useState<ResetTarget>(null);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const expectedPhrase = activeModal === 'attendance' ? 'RESET ATTENDANCE' : 'RESET SYSTEM';
  const isPhraseMatched = typedConfirmation.trim() === expectedPhrase;

  const handleOpenModal = (target: ResetTarget) => {
    setActiveModal(target);
    setTypedConfirmation('');
    setAdminPassword('');
    setShowPassword(false);
    setErrorMessage(null);
    setProgressStep('');
  };

  const handleCloseModal = () => {
    if (isProcessing) return;
    setActiveModal(null);
    setTypedConfirmation('');
    setAdminPassword('');
    setErrorMessage(null);
    setProgressStep('');
  };

  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) {
      setErrorMessage('No active administrator session detected.');
      return;
    }

    if (!isPhraseMatched) {
      setErrorMessage(`Please type exactly "${expectedPhrase}" to confirm.`);
      return;
    }

    if (!adminPassword.trim()) {
      setErrorMessage('Please enter your administrator password.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Step 1: Re-authenticate administrator
      setProgressStep('Verifying administrator credentials...');
      const authCheck = await reverifyAdminPassword(user.email, adminPassword);
      if (!authCheck.success) {
        throw new Error(authCheck.error || 'Password verification failed. Access denied.');
      }

      // Step 2: Execute requested reset
      if (activeModal === 'attendance') {
        setProgressStep('Deleting all Firebase attendance records & clearing logs...');
        const result = await triggerAttendanceReset(user.uid, user.email);
        setSuccessMessage(result.message);
      } else if (activeModal === 'system') {
        setProgressStep('Executing full system wipe and dispatching ESP32 reset signal...');
        const result = await triggerCompleteSystemReset(user.uid, user.email);
        setSuccessMessage(result.message);
      }

      // Complete
      setProgressStep('');
      setActiveModal(null);
      setTypedConfirmation('');
      setAdminPassword('');
    } catch (err: any) {
      console.error('Reset execution error:', err);
      setErrorMessage(err.message || 'An error occurred during reset.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-rose-500" />
              <span>System Reset & Disaster Recovery</span>
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase font-bold">
              Restricted
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Cryptographically verified administrator controls for database purge and remote ESP32 hardware reset
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
          <Database className="w-3.5 h-3.5 text-cyan-400" />
          <span>Realtime DB:</span>
          <span className={isDbConnected ? 'text-emerald-400 font-mono font-semibold' : 'text-amber-400 font-mono'}>
            {isDbConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>
      </div>

      {/* Global Success Notification */}
      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-200 text-xs flex items-start justify-between gap-3 shadow-lg animate-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-white uppercase tracking-wider text-[11px]">
                System Operation Successful
              </p>
              <p className="mt-0.5 text-emerald-300 leading-relaxed">
                {successMessage}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-emerald-900/40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Telemetry Overview: Last Reset & ESP32 Remote State */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Last Reset Audit Card */}
        <div className="p-5 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
              Last Database Reset Event
            </span>
            {lastResetLog ? (
              <div className="mt-1">
                <p className="text-sm font-bold text-white truncate">
                  {lastResetLog.type === 'ATTENDANCE_RESET' ? 'Attendance Purge' : 'Full System Reset'}
                </p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {lastResetLog.timestampStr} &bull; By: {lastResetLog.adminEmail}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                No system reset has been recorded yet in auditLogs/lastReset.
              </p>
            )}
          </div>
        </div>

        {/* ESP32 Remote Command State Card */}
        <div className="p-5 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                ESP32 Hardware Remote Channel
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                latestDeviceCommand?.status === 'PENDING'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}>
                {latestDeviceCommand?.status || 'IDLE'}
              </span>
            </div>
            <p className="text-xs text-slate-200 font-mono mt-1 truncate">
              Path: <span className="text-cyan-400">deviceCommands/esp32</span>
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 font-mono truncate">
              {latestDeviceCommand?.command === 'RESET_SYSTEM' 
                ? `Active Command: ${latestDeviceCommand.commandId} (${latestDeviceCommand.status})` 
                : 'No pending hardware commands queued.'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Option A vs Option B */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* OPTION A: Reset Attendance Data */}
        <div className="rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-amber-500/30 p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
                    Option A
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Reset Attendance Data
                  </h3>
                </div>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                Preserves Students
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Clears all attendance logs across the system. Ideal at the start of a new academic term or semester when student profiles need to be maintained.
            </p>

            {/* Impact List */}
            <div className="space-y-2 mb-6 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5">
                <Trash2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-rose-300">What will be permanently deleted:</span>
                  <ul className="list-disc list-inside text-slate-400 text-[11px] mt-1 space-y-0.5">
                    <li>All attendance records under <code className="text-slate-300 font-mono">attendance/*</code></li>
                    <li>Today's present and absent counts reset to 0</li>
                    <li>Weekly and monthly attendance charts reset to 0%</li>
                    <li>Live attendance activity and unknown card logs</li>
                  </ul>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-emerald-300">What will be strictly preserved:</span>
                  <ul className="list-disc list-inside text-slate-400 text-[11px] mt-1 space-y-0.5">
                    <li>All registered students and RFID UIDs in <code className="text-slate-300 font-mono">students/</code></li>
                    <li>Firebase configuration, credentials, and settings</li>
                    <li>Administrator accounts and passwords</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80">
            <button
              onClick={() => handleOpenModal('attendance')}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-white text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Initiate Attendance Wipe</span>
            </button>
          </div>
        </div>

        {/* OPTION B: Complete System Reset */}
        <div className="rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-rose-500/40 p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <AlertOctagon className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-rose-400 font-bold uppercase tracking-wider block">
                    Option B &bull; High Impact
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Complete System Reset
                  </h3>
                </div>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono font-bold">
                Total Wipe + ESP32 Reset
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Factory reset of the entire attendance portal and connected hardware. Broadcasts a remote hardware reboot signal to the ESP32.
            </p>

            {/* Impact List */}
            <div className="space-y-2 mb-6 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5">
                <Trash2 className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-rose-400">What will be permanently deleted:</span>
                  <ul className="list-disc list-inside text-slate-400 text-[11px] mt-1 space-y-0.5">
                    <li>All attendance records under <code className="text-slate-300 font-mono">attendance/*</code></li>
                    <li>All registered students under <code className="text-slate-300 font-mono">students/*</code></li>
                    <li>Dashboard statistics, historical telemetry, and charts</li>
                    <li>ESP32 hardware runtime memory and session state</li>
                  </ul>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5">
                <Cpu className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-cyan-300">ESP32 Hardware Handshake:</span>
                  <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                    Sends command to <code className="text-cyan-300 font-mono">deviceCommands/esp32</code>. The ESP32 clears RFID queues, resets its LCD to the idle screen, and sends a status acknowledgement. Wi-Fi credentials remain preserved.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80">
            <button
              onClick={() => handleOpenModal('system')}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 via-rose-700 to-red-800 hover:from-rose-500 hover:to-rose-700 text-white text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Initiate Complete System Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation & Security Verification Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div 
            className="w-full max-w-lg bg-[#0d1322] border border-rose-500/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800/90 bg-rose-950/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                  <ShieldAlert className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {activeModal === 'attendance' ? 'Confirm Attendance Wipe' : 'Confirm Complete System Reset'}
                  </h3>
                  <p className="text-xs text-rose-300 font-mono">
                    Multi-Factor Security Clearance Required
                  </p>
                </div>
              </div>
              <button
                disabled={isProcessing}
                onClick={handleCloseModal}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleExecuteReset} className="p-6 space-y-5">
              
              {/* Warning Box */}
              <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/50 text-rose-200 text-xs space-y-2">
                <div className="flex items-center gap-2 text-rose-300 font-bold uppercase tracking-wider text-[11px]">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Irreversible Action Warning</span>
                </div>
                <p className="leading-relaxed text-slate-300">
                  {activeModal === 'attendance'
                    ? 'You are about to delete all records from the Firebase attendance node. Student registrations and admin accounts will be preserved.'
                    : 'You are about to delete ALL attendance records, ALL student profiles, and trigger a remote hardware reboot on the ESP32. This cannot be undone.'}
                </p>
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500 text-rose-200 text-xs flex items-start gap-2.5">
                  <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed flex-1">
                    <div>{errorMessage}</div>
                    {errorMessage.toLowerCase().includes('permission') && (
                      <div className="mt-2 text-[11px] text-rose-300/90 bg-rose-900/40 p-2 rounded-lg border border-rose-500/30">
                        <strong>Security Rules Notice:</strong> Ensure Administrator UID <code className="font-mono text-cyan-300">bi3c890VUXhVE0JFxroYfnlQwea2</code> has write permission on the <code className="font-mono text-cyan-300">attendance</code> node in Firebase Console &gt; Realtime Database &gt; Rules (see Settings page for recommended rules).
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 1: Type Confirmation Phrase */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  1. Type <span className="font-mono text-rose-400 font-bold select-all">"{expectedPhrase}"</span> to confirm
                </label>
                <input
                  type="text"
                  disabled={isProcessing}
                  value={typedConfirmation}
                  onChange={(e) => setTypedConfirmation(e.target.value.toUpperCase())}
                  placeholder={`Type "${expectedPhrase}"`}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border text-white font-mono text-xs focus:outline-none transition ${
                    isPhraseMatched 
                      ? 'border-emerald-500 text-emerald-300' 
                      : 'border-slate-800 focus:border-rose-500'
                  }`}
                />
                {isPhraseMatched && (
                  <p className="text-[11px] text-emerald-400 font-mono mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Phrase matched
                  </p>
                )}
              </div>

              {/* Step 2: Re-enter Administrator Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  2. Administrator Password Re-verification
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    disabled={isProcessing}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter current administrator password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-rose-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Re-authenticating user: <span className="text-slate-300 font-mono">{user?.email}</span>
                </p>
              </div>

              {/* Progress Indicator */}
              {isProcessing && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center gap-3">
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                  <span className="text-slate-200 font-mono text-[11px]">
                    {progressStep || 'Executing reset transaction on Firebase...'}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleCloseModal}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isProcessing || !isPhraseMatched || !adminPassword.trim()}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-rose-600/30 flex items-center gap-2 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Executing...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Permanently Execute Reset</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hardware Firmware Integration Instructions Box */}
      <div className="p-6 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-xl space-y-3">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800 text-xs font-bold text-slate-200">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span>ESP32 Firmware Remote Reset Listener Logic</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          The ESP32 firmware polls or listens via Firebase Realtime Database Stream to <code className="text-cyan-300 font-mono">deviceCommands/esp32</code>. When a command with <code className="text-cyan-300 font-mono">RESET_SYSTEM</code> arrives:
        </p>
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1 overflow-x-auto">
          <p className="text-slate-500">// ESP32 C++ Snippet:</p>
          <p><span className="text-cyan-400">if</span> (cmd == <span className="text-amber-300">"RESET_SYSTEM"</span> &amp;&amp; cmdId != lastProcessedCmdId) &#123;</p>
          <p className="pl-4">lastProcessedCmdId = cmdId;</p>
          <p className="pl-4">clearLocalAttendanceBuffer();</p>
          <p className="pl-4">lcd.clear(); lcd.print(<span className="text-emerald-300">"SYSTEM RESET"</span>);</p>
          <p className="pl-4">http.PUT(<span className="text-slate-400">"&#123;\"status\":\"ACKNOWLEDGED\",\"acknowledgedAt\":"</span> + String(millis()) + <span className="text-slate-400">"&#125;"</span>);</p>
          <p>&#125;</p>
        </div>
      </div>
    </div>
  );
};
