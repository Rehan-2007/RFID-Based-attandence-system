import React, { useState } from 'react';
import { 
  Radio, 
  Lock, 
  Mail, 
  ShieldCheck, 
  ArrowRight, 
  Cpu, 
  Eye, 
  EyeOff,
  AlertCircle,
  Database,
  Key,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getActiveFirebaseConfig } from '../services/firebase';

export const LoginPage: React.FC = () => {
  const { login, authError, loading } = useAuth();
  const currentConfig = getActiveFirebaseConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState(currentConfig.apiKey || '');
  const [showApiKey, setShowApiKey] = useState(!currentConfig.apiKey || currentConfig.apiKey.length < 5);
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLocalError('Please enter both administrator email and password.');
      return;
    }

    if (!apiKey.trim() && (!currentConfig.apiKey || currentConfig.apiKey.length < 5)) {
      setLocalError('Firebase Web API Key is required for administrator sign in. Please enter it below.');
      setShowApiKey(true);
      return;
    }

    const res = await login(trimmedEmail, password, apiKey.trim());
    if (!res.success && res.error) {
      setLocalError(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Cyber grid lines */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Login Card */}
      <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-300">
        <div className="p-8 rounded-3xl bg-[#0c1220]/90 backdrop-blur-2xl border border-slate-800/90 shadow-2xl shadow-black/80">
          
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="inline-flex relative mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-xl shadow-blue-500/25 border border-blue-400/30">
                <Radio className="w-8 h-8 text-white animate-pulse" />
              </div>
              <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-slate-900 border border-slate-700">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              </div>
            </div>
            
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              RFID Attendance Portal
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Administrator Authentication
            </p>

            {/* Target Firebase badge */}
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-mono text-blue-300">
              <Database className="w-3 h-3 text-cyan-400" />
              <span>Project: rfid-attendance-system-5fccd</span>
            </div>
          </div>

          {/* Error Message */}
          {(localError || authError) && (
            <div className="mb-5 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                {localError || authError}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Admin Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter administrator email"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Admin Password
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Firebase Web API Key field (for authenticating directly against rfid-attendance-system-5fccd) */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="flex items-center justify-between w-full text-[11px] font-mono text-cyan-400 hover:text-cyan-300 py-1 transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  <span>Firebase Web API Key {!apiKey ? '(Required)' : '(Configured)'}</span>
                </span>
                {showApiKey ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showApiKey && (
                <div className="mt-1.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5 animate-in fade-in duration-150">
                  <div className="relative">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter Firebase Web API Key"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-cyan-300 font-mono text-xs placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Firebase Console &gt; Project Settings &gt; General &gt; Web API Key. Required to authorize against project <code className="text-cyan-300">rfid-attendance-system-5fccd</code>.
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-500/25 border border-blue-400/30 transition flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
                </>
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="mt-8 pt-5 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Authenticated Access Only &bull; Firebase Security Rules Enforced</span>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-500 mt-4">
          RFID Attendance Management Portal &bull; ESP32 Hardware Integration
        </p>
      </div>
    </div>
  );
};
