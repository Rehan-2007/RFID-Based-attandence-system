import React, { useState } from 'react';
import { 
  User, 
  GraduationCap, 
  Mail, 
  Phone, 
  CreditCard, 
  Lock, 
  KeyRound, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  LogOut,
  CalendarDays,
  Building2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const StudentProfilePage: React.FC = () => {
  const { user, changePassword, sendResetEmail, logout } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset email state
  const [resetEmailLoading, setResetEmailLoading] = useState(false);
  const [resetEmailSuccess, setResetEmailSuccess] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    const res = await changePassword(newPassword);
    setLoading(false);

    if (res.success) {
      setSuccessMsg('Your account password has been updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setErrorMsg(res.error || 'Failed to update password. Please check security requirements or re-login.');
    }
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) return;
    setResetEmailLoading(true);
    setResetEmailSuccess(null);
    setErrorMsg(null);

    const res = await sendResetEmail(user.email);
    setResetEmailLoading(false);

    if (res.success) {
      setResetEmailSuccess(`Password reset instructions sent to ${user.email}.`);
    } else {
      setErrorMsg(res.error || 'Failed to send password reset email.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c1220] via-[#090e1a] to-[#060a12] border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-500 flex items-center justify-center text-white text-2xl font-extrabold shadow-xl shadow-emerald-500/25 border border-emerald-400/30">
              {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'S'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {user?.displayName || 'Student Profile'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-mono font-semibold text-emerald-400">
                  STUDENT
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {user?.email || 'student@institution.edu'}
              </p>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-950/30 hover:bg-rose-950/50 border border-rose-500/30 text-rose-300 text-xs font-semibold transition cursor-pointer self-start sm:self-auto"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal & Academic Details */}
        <div className="p-6 rounded-3xl bg-[#0c1220] border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center gap-2.5 mb-2">
            <GraduationCap className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">Academic Credentials</h3>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">Full Name</span>
              <span className="text-xs font-semibold text-white">{user?.displayName || 'N/A'}</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">Student ID / Roll Number</span>
              <span className="text-xs font-mono font-bold text-cyan-300">{user?.studentId || 'N/A'}</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">Department</span>
              <span className="text-xs font-semibold text-slate-200">{user?.department || 'Information Technology'}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80">
                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">Academic Year</span>
                <span className="text-xs font-semibold text-slate-200">{user?.year || '1st Year'}</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80">
                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">Semester</span>
                <span className="text-xs font-semibold text-slate-200">{user?.semester || 'Semester 1'}</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">Assigned RFID Card UID</span>
              <div className="flex items-center gap-2 mt-0.5">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono font-extrabold text-emerald-400">
                  {user?.rfidUID || 'Not Assigned'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Account Security & Password */}
        <div className="p-6 rounded-3xl bg-[#0c1220] border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <Lock className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">Security &amp; Password</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Update your Firebase Authentication password or request a reset link
            </p>

            {/* Success message */}
            {successMsg && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Reset email success */}
            {resetEmailSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-blue-950/40 border border-blue-500/40 text-blue-300 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>{resetEmailSuccess}</span>
              </div>
            )}

            {/* Error message */}
            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Update Password</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={handleSendResetEmail}
              disabled={resetEmailLoading}
              className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-medium text-slate-300 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5 text-cyan-400" />
              <span>{resetEmailLoading ? 'Sending email...' : 'Send Password Reset Email'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
