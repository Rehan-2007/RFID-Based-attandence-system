import React from 'react';
import { Undo2, X, Clock, AlertCircle } from 'lucide-react';
import { useAttendance } from '../context/AttendanceContext';

export const UndoToast: React.FC = () => {
  const { activeUndo, undoTimeRemaining, triggerUndo, dismissUndo } = useAttendance();

  if (!activeUndo) return null;

  const percentage = Math.max(0, Math.min(100, (undoTimeRemaining / 30) * 100));

  return (
    <aside
      aria-label="Undo action"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg animate-in fade-in slide-in-from-bottom-5 duration-200"
    >
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-cyan-500/40 shadow-2xl shadow-cyan-950/50 p-4">
        {/* Animated Progress Bar */}
        <div 
          className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400 transition-all duration-1000 ease-linear"
          style={{ width: `${percentage}%` }}
        />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Undo2 className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white truncate">
                  {activeUndo.description}
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800 text-[10px] font-mono text-cyan-300 font-semibold shrink-0">
                  <Clock className="w-2.5 h-2.5" />
                  {undoTimeRemaining}s
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                Click Undo to revert this change immediately.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => triggerUndo()}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>

            <button
              onClick={dismissUndo}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
