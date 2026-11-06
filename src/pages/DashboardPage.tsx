import React, { useState } from 'react';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Percent, 
  Radio, 
  Clock, 
  ArrowUpRight, 
  Activity, 
  Cpu, 
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  ChevronRight,
  Database,
  Wifi,
  WifiOff,
  RefreshCw
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  AreaChart, 
  Area, 
  CartesianGrid 
} from 'recharts';
import { useAttendance } from '../context/AttendanceContext';
import { NavPage } from '../components/Sidebar';

interface DashboardPageProps {
  onNavigate: (page: NavPage) => void;
  onOpenScanner: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate, onOpenScanner }) => {
  const { 
    totalStudentsCount, 
    presentTodayCount, 
    absentTodayCount, 
    todayPercentage, 
    todayRecordsList,
    weeklyStats,
    monthlyStats,
    isDbConnected,
    dbErrorMessage,
    retryConnection
  } = useAttendance();

  const [activeChartTab, setActiveChartTab] = useState<'weekly' | 'monthly'>('weekly');
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    await retryConnection();
    setTimeout(() => setIsRetrying(false), 800);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner: Actual Firebase RTDB Connection Status */}
      <div className={`relative overflow-hidden p-5 rounded-2xl bg-gradient-to-r border shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        dbErrorMessage 
          ? 'from-rose-950/60 via-slate-900/90 to-red-950/40 border-rose-500/30' 
          : 'from-blue-950/60 via-slate-900/90 to-indigo-950/50 border-blue-500/20'
      }`}>
        <div className="flex items-center gap-4">
          <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
            dbErrorMessage
              ? 'bg-rose-600/20 border-rose-500/40'
              : 'bg-blue-600/20 border-blue-500/40'
          }`}>
            <Radio className={`w-6 h-6 ${dbErrorMessage ? 'text-rose-400' : 'text-blue-400'}`} />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              {dbErrorMessage ? (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
              ) : isDbConnected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
              )}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">
                Firebase Realtime Database: {
                  dbErrorMessage 
                    ? 'Connection Restricted' 
                    : isDbConnected 
                      ? 'Connected & Listening' 
                      : 'Connecting to Server...'
                }
              </h2>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                dbErrorMessage
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : isDbConnected 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {dbErrorMessage ? 'ACCESS RESTRICTED' : isDbConnected ? 'RTDB LIVE' : 'SYNCING'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              Host: <span className="text-cyan-400">rfid-attendance-system-5fccd-default-rtdb.firebaseio.com</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('attendance')}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Live Attendance Log</span>
          </button>
          <button
            onClick={() => onNavigate('reports')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Error message banner if Firebase reports issues */}
      {dbErrorMessage && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">Firebase Error: </span>
              <span>{dbErrorMessage}</span>
              {dbErrorMessage.toLowerCase().includes('permission') && (
                <p className="text-[11px] text-rose-400/90 mt-1">
                  Ensure you are logged in with Admin UID: <code className="font-mono bg-rose-900/40 px-1 py-0.5 rounded text-rose-200">bi3c890VUXhVE0JFxroYfnlQwea2</code>.
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow transition cursor-pointer self-start sm:self-auto shrink-0 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Retrying...' : 'Retry Database Sync'}</span>
          </button>
        </div>
      )}

      {/* 4 Key Metrics Cards (Calculated strictly from actual database records) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        
        {/* Total Students */}
        <div 
          onClick={() => onNavigate('students')}
          className="p-5 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 hover:border-blue-500/40 transition cursor-pointer group shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Students
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-105 transition">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">
              {totalStudentsCount}
            </span>
            <span className="text-xs text-blue-400 font-medium">In Database</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-800/80">
            <span>Registered in Firebase</span>
            <span className="text-blue-400 group-hover:translate-x-0.5 transition flex items-center">
              View Students <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Present Today */}
        <div 
          onClick={() => onNavigate('attendance')}
          className="p-5 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 hover:border-emerald-500/40 transition cursor-pointer group shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Present Today
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400 font-mono">
              {presentTodayCount}
            </span>
            <span className="text-xs text-emerald-400/80 font-medium">Actual Scans</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-800/80">
            <span>Verified Database Taps</span>
            <span className="text-emerald-400 group-hover:translate-x-0.5 transition flex items-center">
              View Feed <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Absent Today */}
        <div 
          onClick={() => onNavigate('attendance')}
          className="p-5 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 hover:border-rose-500/40 transition cursor-pointer group shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Absent Today
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-105 transition">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-400 font-mono">
              {absentTodayCount}
            </span>
            <span className="text-xs text-rose-400/80 font-medium">Pending Taps</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-800/80">
            <span>Not Scanned Today</span>
            <span className="text-rose-400 group-hover:translate-x-0.5 transition flex items-center">
              Check Status <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Attendance Percentage */}
        <div className="p-5 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Attendance Rate
            </span>
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-300 font-mono">
              {todayPercentage}%
            </span>
            <span className="text-xs text-slate-400">of Enrolled Students</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${Math.min(todayPercentage, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Charts & Live Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Attendance Charts */}
        <div className="lg:col-span-2 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 p-5 shadow-lg flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800/80">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span>Attendance Analytics</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Plotted from actual Realtime Database records in <code className="text-cyan-300 font-mono">attendance/*</code>
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveChartTab('weekly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeChartTab === 'weekly'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                7-Day Weekly
              </button>
              <button
                onClick={() => setActiveChartTab('monthly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeChartTab === 'monthly'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                30-Day Monthly
              </button>
            </div>
          </div>

          {/* Chart Display */}
          <div className="h-72 w-full">
            {activeChartTab === 'weekly' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="dayName" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                    }} 
                    formatter={(value: any, name: any) => [
                      value,
                      name === 'present' ? 'Present Students' : 'Absent Students'
                    ]}
                  />
                  <Bar dataKey="present" fill="#3b82f6" radius={[6, 6, 0, 0]} name="present" />
                  <Bar dataKey="absent" fill="#334155" radius={[6, 6, 0, 0]} name="absent" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="dayName" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '12px'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="percentage" 
                    stroke="#06b6d4" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorPresent)" 
                    name="Attendance %"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-auto pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Present
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-700 ml-2" /> Absent
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              Synced with Firebase node: attendance/
            </span>
          </div>
        </div>

        {/* Right 1 Col: Actual Live Attendance Activity */}
        <div className="rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 p-5 shadow-lg flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>Live Attendance Activity</span>
              </h3>
              <p className="text-[11px] text-slate-400">Actual incoming RFID scans</p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {todayRecordsList.length} today
            </span>
          </div>

          {/* Live Feed List */}
          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[320px] pr-1">
            {todayRecordsList.length === 0 ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-2">
                  <Radio className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-slate-300">
                  Waiting for RFID Scans
                </p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[220px]">
                  When an ESP32 hardware tap occurs, it writes to Firebase Realtime Database and updates here immediately.
                </p>
              </div>
            ) : (
              todayRecordsList.map((record) => (
                <div
                  key={`${record.date}-${record.uid}`}
                  className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600/30 to-cyan-500/30 border border-blue-500/40 flex items-center justify-center font-bold text-xs text-blue-300 shrink-0">
                      {record.studentName ? record.studentName.charAt(0) : '?'}
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-200 truncate">
                        {record.studentName || 'Student'}
                      </p>
                      <p className="text-[10px] font-mono text-cyan-300/80 truncate">
                        UID: {record.uid}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {record.status}
                    </span>
                    <p className="text-[10px] font-mono text-slate-400 mt-1 flex items-center gap-1 justify-end">
                      <Clock className="w-2.5 h-2.5" />
                      {record.time}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <button
              onClick={() => onNavigate('attendance')}
              className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white text-xs font-semibold border border-slate-800 transition flex items-center justify-center gap-1.5"
            >
              <span>View Full Attendance Log</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Hardware Node Status Footer */}
      <div className="p-4 rounded-2xl bg-[#0c1220]/70 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span>ESP32 Hardware Target: <strong className="text-slate-200">RC522 SPI 13.56 MHz</strong></span>
          <span className="hidden md:inline text-slate-600">•</span>
          <span className="hidden md:inline font-mono">Firebase RTDB: rfid-attendance-system-5fccd</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('settings')}
            className="text-blue-400 hover:underline flex items-center gap-1"
          >
            <span>ESP32 Firmware & RTDB Rules</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
