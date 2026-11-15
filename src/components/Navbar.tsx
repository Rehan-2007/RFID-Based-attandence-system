import React, { useState, useEffect } from 'react';
import { 
  Menu, 
  Radio, 
  Clock, 
  Calendar, 
  Wifi, 
  Database,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { useAttendance } from '../context/AttendanceContext';
import { NavPage } from './Sidebar';
import { getISTClockTime, getISTDisplayDate } from '../utils/dateUtils';

interface NavbarProps {
  currentPage: NavPage;
  onOpenMobile: () => void;
  onOpenScanner: () => void;
  onNavigate: (page: NavPage) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPage,
  onOpenMobile,
  onOpenScanner,
  onNavigate,
}) => {
  const { isDbConnected, dbErrorMessage, dbDiagnostic } = useAttendance();
  const [time, setTime] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(`${getISTClockTime(now)} IST`);
      setDateStr(getISTDisplayDate(now));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const titles: Record<NavPage, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Attendance Overview',
      subtitle: 'Real-time telemetry from ESP32 & RFID Readers',
    },
    students: {
      title: 'Student Directory',
      subtitle: 'Manage student credentials, RFID UIDs, and profiles',
    },
    attendance: {
      title: 'Live Attendance Feed',
      subtitle: 'Sub-second card detection, duplicate prevention & security logs',
    },
    leaderboard: {
      title: 'Attendance Leaderboard',
      subtitle: 'Real-time student regularity rankings, daily streaks & achievement rewards',
    },
    reports: {
      title: 'Attendance Analytics & Reports',
      subtitle: 'Daily, weekly, monthly breakdowns with Microsoft Excel CSV export',
    },
    settings: {
      title: 'Hardware & Firebase Configuration',
      subtitle: 'ESP32 firmware configuration, Firebase credentials, and RTDB rules',
    },
    reset: {
      title: 'System Reset & Recovery',
      subtitle: 'Verified administrative database purge and remote ESP32 hardware reset',
    },
  };

  return (
    <header className="sticky top-0 z-30 min-h-[4.25rem] py-2 bg-[#090d16]/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 flex items-center justify-between gap-2">
      {/* Left: Mobile trigger & Page Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobile}
          className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2 truncate">
            <span className="truncate">{titles[currentPage].title}</span>
          </h1>
          <p className="text-[11px] text-slate-400 hidden sm:block truncate">
            {titles[currentPage].subtitle}
          </p>
        </div>
      </div>

      {/* Right Actions & Telemetry */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {/* Live ESP32 Hardware Status indicator */}
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="cursor-pointer flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition"
          title={dbDiagnostic?.message || 'Firebase Realtime Database: rfid-attendance-system-5fccd'}
        >
          <div className="relative flex items-center justify-center">
            {dbErrorMessage ? (
              <span className="w-2 h-2 rounded-full bg-rose-500" />
            ) : isDbConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute" />
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </>
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </div>
          <span className="text-[11px] font-mono text-slate-300 font-medium">
            <span className="hidden md:inline">RTDB: </span>
            <span className={
              dbErrorMessage 
                ? 'text-rose-400' 
                : isDbConnected 
                  ? 'text-emerald-400' 
                  : 'text-amber-400'
            }>
              {dbErrorMessage ? dbDiagnostic.label : isDbConnected ? 'LIVE' : 'SYNC'}
            </span>
          </span>
        </button>

        {/* Live Clock & Calendar */}
        <div className="hidden xl:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/60 text-slate-300 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>{dateStr}</span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-1.5 font-mono text-cyan-300 font-semibold">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{time}</span>
          </div>
        </div>

        {/* Quick Simulator CTA */}
        <button
          onClick={onOpenScanner}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 border border-blue-400/30 transition transform active:scale-95"
        >
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          <span className="hidden sm:inline">Tap RFID Card</span>
          <span className="sm:hidden">Tap RFID</span>
        </button>
      </div>
    </header>
  );
};
