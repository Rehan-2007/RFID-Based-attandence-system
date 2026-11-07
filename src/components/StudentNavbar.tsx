import React, { useState, useEffect } from 'react';
import { 
  Menu, 
  Clock, 
  CreditCard, 
  LogOut, 
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { StudentTab } from './StudentSidebar';

interface StudentNavbarProps {
  currentTab: StudentTab;
  onOpenSidebar: () => void;
}

export const StudentNavbar: React.FC<StudentNavbarProps> = ({
  currentTab,
  onOpenSidebar,
}) => {
  const { user, logout } = useAuth();
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit', 
          hour12: true 
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const tabTitles: Record<StudentTab, { title: string; subtitle: string }> = {
    dashboard: { 
      title: 'Student Attendance Dashboard', 
      subtitle: 'Overview of your personal attendance and statistics' 
    },
    attendance: { 
      title: 'Personal Attendance History', 
      subtitle: 'Detailed record of all RFID check-in events' 
    },
    calendar: { 
      title: 'Attendance Calendar', 
      subtitle: 'Interactive monthly visual view of presence and absence' 
    },
    profile: { 
      title: 'Student Profile & Security', 
      subtitle: 'Personal academic details and Firebase account security' 
    },
  };

  const { title, subtitle } = tabTitles[currentTab];

  return (
    <header className="h-16 px-4 sm:px-6 bg-[#0a0f1d]/90 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden cursor-pointer"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span>{title}</span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
              <ShieldCheck className="w-3 h-3" />
              <span>Student Mode</span>
            </span>
          </h1>
          <p className="text-[11px] text-slate-400 hidden md:block">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* RFID Card Badge */}
        {user?.rfidUID && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
            <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400 text-[11px]">RFID:</span>
            <span className="text-emerald-300 font-semibold">{user.rfidUID}</span>
          </div>
        )}

        {/* Live Clock */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span>{time || '--:--:--'}</span>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={() => logout()}
          title="Sign out of student account"
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
