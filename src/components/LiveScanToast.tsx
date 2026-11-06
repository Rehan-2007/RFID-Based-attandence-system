import React, { useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  X, 
  Radio 
} from 'lucide-react';
import { useAttendance } from '../context/AttendanceContext';

export const LiveScanToast: React.FC = () => {
  const { lastLiveEvent, clearLastLiveEvent } = useAttendance();

  useEffect(() => {
    if (lastLiveEvent) {
      const timer = setTimeout(() => {
        clearLastLiveEvent();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastLiveEvent, clearLastLiveEvent]);

  if (!lastLiveEvent) return null;

  const { record, success, message } = lastLiveEvent;
  const isDuplicate = message.toLowerCase().includes('duplicate');

  return (
    <div className="fixed top-20 right-4 z-50 max-w-sm w-full animate-in slide-in-from-top-3 fade-in duration-300">
      <div 
        className={`p-4 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-start gap-3 ${
          success
            ? 'bg-emerald-950/90 border-emerald-500/50 text-white shadow-emerald-500/10'
            : isDuplicate
            ? 'bg-amber-950/90 border-amber-500/50 text-white shadow-amber-500/10'
            : 'bg-rose-950/90 border-rose-500/50 text-white shadow-rose-500/10'
        }`}
      >
        <div className="shrink-0 mt-0.5">
          {success ? (
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            </div>
          ) : isDuplicate ? (
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-300" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-rose-300" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-slate-300 flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
              Live RFID Tap
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {record.time || new Date().toLocaleTimeString()}
            </span>
          </div>

          <p className="text-xs font-bold text-white mt-1 truncate">
            {record.studentName || 'Unknown Cardholder'}
          </p>

          <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">
            {message}
          </p>

          <div className="mt-2 text-[10px] font-mono text-cyan-300/90 flex items-center gap-2">
            <span>UID: {record.uid}</span>
            <span>•</span>
            <span>{record.device || 'ESP32-RFID-01'}</span>
          </div>
        </div>

        <button
          onClick={clearLastLiveEvent}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
