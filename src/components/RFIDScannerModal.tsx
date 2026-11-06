import React, { useState } from 'react';
import { 
  X, 
  Radio, 
  CheckCircle2, 
  AlertTriangle, 
  Cpu, 
  ShieldAlert, 
  ArrowRight, 
  Sparkles,
  Zap,
  Clock
} from 'lucide-react';
import { useAttendance } from '../context/AttendanceContext';

interface RFIDScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RFIDScannerModal: React.FC<RFIDScannerModalProps> = ({ isOpen, onClose }) => {
  const { studentsList, scanRfidCard, todayAttendance } = useAttendance();
  const [customUid, setCustomUid] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    message: string;
    uid: string;
    timestamp: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleScan = async (uidToScan: string) => {
    if (!uidToScan.trim()) return;
    setIsScanning(true);

    try {
      const res = await scanRfidCard(uidToScan.trim());
      setLastResult({
        success: res.success,
        message: res.message,
        uid: uidToScan.trim().toUpperCase(),
        timestamp: new Date().toLocaleTimeString(),
      });
      if (uidToScan === customUid) {
        setCustomUid('');
      }
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl bg-[#0d1322] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center border border-blue-400/30 shadow-lg shadow-blue-500/20">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                ESP32 RFID Card Simulator & Reader
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Hardware Target: ESP32 + RC522 Reader (13.56MHz)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Quick Tap Registered Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Tap Registered Student Cards (ESP32 Mock)
              </label>
              <span className="text-[11px] text-slate-400">1-Click Tap</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {studentsList.slice(0, 3).map((st) => {
                const isPresent = Boolean(todayAttendance[st.uid]);
                return (
                  <button
                    key={st.uid}
                    disabled={isScanning}
                    onClick={() => handleScan(st.uid)}
                    className={`p-3 rounded-xl border text-left transition relative group overflow-hidden ${
                      isPresent
                        ? 'bg-emerald-950/20 border-emerald-500/40 hover:bg-emerald-900/30'
                        : 'bg-slate-900/80 border-slate-800 hover:border-blue-500/50 hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white truncate group-hover:text-blue-300">
                        {st.name.split(' ')[0]}
                      </span>
                      {isPresent ? (
                        <span className="text-[10px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Done
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-400">Tap</span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono font-medium text-cyan-300 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 truncate">
                      UID: {st.uid}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Test Unknown Card or Custom UID */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <label className="text-xs font-semibold text-slate-300 block mb-2">
              Custom RFID UID or Unknown Card Test
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 5AA5AB24 or 99FA1122"
                value={customUid}
                onChange={(e) => setCustomUid(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleScan(customUid)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white font-mono text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                disabled={isScanning || !customUid.trim()}
                onClick={() => handleScan(customUid)}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition flex items-center gap-1.5"
              >
                <span>Transmit</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-3 mt-2.5">
              <button
                type="button"
                onClick={() => handleScan('99FA1122')}
                className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
              >
                <ShieldAlert className="w-3 h-3" />
                Test Unknown Card (99FA1122)
              </button>
              <span className="text-slate-600">•</span>
              <p className="text-[11px] text-slate-400">
                Unknown cards are rejected automatically.
              </p>
            </div>
          </div>

          {/* Realtime Result Output */}
          {lastResult && (
            <div
              className={`p-4 rounded-xl border animate-in slide-in-from-bottom-2 duration-200 ${
                lastResult.success
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  : lastResult.message.includes('Duplicate')
                  ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                  : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-3">
                {lastResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : lastResult.message.includes('Duplicate') ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {lastResult.success
                        ? 'Card Verified & Logged'
                        : lastResult.message.includes('Duplicate')
                        ? 'Duplicate Card Scan Blocked'
                        : 'Access Denied (Unknown Card)'}
                    </span>
                    <span className="text-[10px] font-mono opacity-70">
                      {lastResult.timestamp}
                    </span>
                  </div>
                  <p className="text-xs mt-1 leading-relaxed opacity-90">
                    {lastResult.message}
                  </p>
                  <div className="mt-2 text-[10px] font-mono bg-black/40 p-2 rounded border border-white/10 text-slate-300">
                    Target Realtime DB path: <span className="text-cyan-300">attendance/{new Date().toISOString().split('T')[0]}/{lastResult.uid}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ESP32 Hardware Payload Info */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400">
            <div className="flex items-center justify-between mb-1 text-slate-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                ESP32 Hardware Target Specs
              </span>
              <span className="text-[10px] text-emerald-400">Active Listener</span>
            </div>
            <p className="text-slate-400 text-[10px]">
              ESP32 writes JSON via Firebase Realtime Database REST/Client API to:
            </p>
            <p className="text-cyan-300 text-[10px] truncate mt-0.5">
              https://rfid-attendance-system-5fccd-default-rtdb.firebaseio.com/attendance/YYYY-MM-DD/UID.json
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            Close Reader
          </button>
        </div>
      </div>
    </div>
  );
};
