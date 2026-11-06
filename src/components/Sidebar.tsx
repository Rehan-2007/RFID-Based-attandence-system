import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  ClipboardCheck, 
  FileSpreadsheet, 
  Settings, 
  LogOut, 
  Radio, 
  Cpu, 
  ShieldCheck,
  ChevronRight,
  X,
  AlertOctagon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAttendance } from '../context/AttendanceContext';

export type NavPage = 'dashboard' | 'students' | 'attendance' | 'reports' | 'settings' | 'reset';

interface SidebarProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenScanner: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  mobileOpen,
  onCloseMobile,
  onOpenScanner,
}) => {
  const { user, logout } = useAuth();
  const { isDbConnected, dbErrorMessage, totalStudentsCount, presentTodayCount } = useAttendance();

  const navItems = [
    {
      id: 'dashboard' as NavPage,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'students' as NavPage,
      label: 'Students',
      icon: Users,
      badge: `${totalStudentsCount}`,
    },
    {
      id: 'attendance' as NavPage,
      label: 'Live Attendance',
      icon: ClipboardCheck,
      badge: `${presentTodayCount} Today`,
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      id: 'reports' as NavPage,
      label: 'Reports & Export',
      icon: FileSpreadsheet,
      badge: 'CSV',
    },
    {
      id: 'settings' as NavPage,
      label: 'System & Hardware',
      icon: Settings,
      badge: null,
    },
    {
      id: 'reset' as NavPage,
      label: 'System Reset',
      icon: AlertOctagon,
      badge: 'Danger',
      badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 w-72 bg-[#0c1220]/95 backdrop-blur-xl border-r border-slate-800/80 flex flex-col transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 border border-blue-400/30">
              <Radio className="w-5 h-5 text-white" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-300">
                  RFID Portal
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-medium border border-blue-500/30">
                  ESP32
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate max-w-[150px]">
                Attendance System
              </p>
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ESP32 Hardware Status Banner */}
        <div className="px-4 pt-4 pb-2">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/90 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <Cpu className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                  Firebase RTDB
                  <span className={`w-2 h-2 rounded-full ${
                    dbErrorMessage 
                      ? 'bg-rose-500' 
                      : isDbConnected 
                        ? 'bg-emerald-400 animate-pulse' 
                        : 'bg-amber-400'
                  }`} />
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {dbErrorMessage ? 'Access Restricted' : isDbConnected ? 'Connected & Synced' : 'Connecting to Server...'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600/30 via-indigo-600/20 to-transparent text-white border-l-2 border-blue-500 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      item.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick Simulator CTA */}
        <div className="p-3 mx-3 mb-3 rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-900/60 border border-indigo-500/20">
          <div className="flex items-center gap-2 mb-1.5">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-bold text-slate-200">Hardware Test Bed</span>
          </div>
          <p className="text-[10px] text-slate-400 mb-2.5 leading-relaxed">
            Test instant ESP32 card tap simulation, duplicate rejection, and RTDB triggers.
          </p>
          <button
            onClick={onOpenScanner}
            className="w-full py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
          >
            <span>Simulate RFID Tap</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Admin Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center text-xs font-bold text-slate-200 border border-slate-600 shrink-0">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-slate-200 truncate">
                {user?.displayName || 'Admin'}
              </p>
              <p className="text-[10px] text-slate-400 font-mono truncate">
                {user?.email || 'admin@portal.com'}
              </p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            title="Log out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
};
