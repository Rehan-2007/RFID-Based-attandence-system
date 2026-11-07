import React from 'react';
import { 
  LayoutDashboard, 
  CalendarCheck, 
  Calendar as CalendarIcon, 
  UserCircle, 
  LogOut, 
  Radio, 
  CreditCard
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type StudentTab = 'dashboard' | 'attendance' | 'calendar' | 'profile';

interface StudentSidebarProps {
  currentTab: StudentTab;
  onSelectTab: (tab: StudentTab) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const StudentSidebar: React.FC<StudentSidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpen,
  onClose,
}) => {
  const { user, logout } = useAuth();

  const navItems: { id: StudentTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'My Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'attendance', label: 'Attendance Records', icon: <CalendarCheck className="w-4 h-4" /> },
    { id: 'calendar', label: 'Attendance Calendar', icon: <CalendarIcon className="w-4 h-4" /> },
    { id: 'profile', label: 'My Profile & Security', icon: <UserCircle className="w-4 h-4" /> },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-[#0a0f1d] border-r border-slate-800/80 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="h-16 px-5 border-b border-slate-800/80 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white tracking-tight">Student Portal</span>
            <span className="text-[10px] text-emerald-400 font-mono font-medium">RFID ATTENDANCE</span>
          </div>
        </div>

        {/* Student Mini Profile */}
        <div className="p-4 mx-3 my-3 rounded-2xl bg-slate-900/80 border border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
              {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {user?.displayName || 'Student'}
              </p>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                {user?.studentId || user?.email || 'ID: --'}
              </p>
            </div>
          </div>
          {user?.rfidUID && (
            <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono">
              <span className="text-slate-400 flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-emerald-400" />
                <span>RFID Card</span>
              </span>
              <span className="text-emerald-300 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                {user.rfidUID}
              </span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <p className="px-3 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Menu
          </p>
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/60'
                }`}
              >
                <span className={isActive ? 'text-emerald-400' : 'text-slate-500'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-slate-800/80">
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 border border-transparent hover:border-rose-900/40 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};
