import React, { useState, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AttendanceProvider } from './context/AttendanceContext';
import { Sidebar, NavPage } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { RFIDScannerModal } from './components/RFIDScannerModal';
import { LiveScanToast } from './components/LiveScanToast';
import { LoginPage } from './pages/LoginPage';
import { 
  Radio, 
  Cpu, 
  ShieldAlert, 
  RefreshCw, 
  LogOut, 
  CheckCircle2, 
  Loader2 
} from 'lucide-react';

// Student Portal Layout Components
import { StudentSidebar, StudentTab } from './components/StudentSidebar';
import { StudentNavbar } from './components/StudentNavbar';

// Lazy-loaded Admin Pages for optimal performance and smaller initial bundle size
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const StudentsPage = lazy(() => import('./pages/StudentsPage').then(m => ({ default: m.StudentsPage })));
const AttendancePage = lazy(() => import('./pages/AttendancePage').then(m => ({ default: m.AttendancePage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SystemResetPage = lazy(() => import('./pages/SystemResetPage').then(m => ({ default: m.SystemResetPage })));

// Lazy-loaded Student Pages
const StudentDashboardPage = lazy(() => import('./pages/StudentDashboardPage').then(m => ({ default: m.StudentDashboardPage })));
const StudentAttendancePage = lazy(() => import('./pages/StudentAttendancePage').then(m => ({ default: m.StudentAttendancePage })));
const StudentCalendarPage = lazy(() => import('./pages/StudentCalendarPage').then(m => ({ default: m.StudentCalendarPage })));
const StudentProfilePage = lazy(() => import('./pages/StudentProfilePage').then(m => ({ default: m.StudentProfilePage })));

/**
 * Lightweight Page Transition Loader
 */
function PageLoadingFallback() {
  return (
    <div className="min-h-[420px] flex flex-col items-center justify-center p-8 text-slate-400">
      <div className="w-9 h-9 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-3.5" />
      <span className="text-xs font-mono tracking-wider uppercase text-slate-500">
        Loading module...
      </span>
    </div>
  );
}

/**
 * Dedicated Multi-Step Auth & Profile Progress Screen
 */
function AuthProgressScreen() {
  const { authStatus, statusMessage, logout } = useAuth();
  const [showCancelButton, setShowCancelButton] = useState(false);

  // Show an emergency escape button after 4 seconds to guarantee user is never locked out
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setShowCancelButton(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const isProfileStep = authStatus === 'loading_profile';

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Cyber Grid */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-7 rounded-3xl bg-[#0c1220]/90 backdrop-blur-2xl border border-slate-800/90 shadow-2xl shadow-black/80 text-center">
          
          {/* Pulsing Radar Brand Icon */}
          <div className="inline-flex relative mb-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-xl shadow-blue-500/25 border border-blue-400/30">
              <Radio className="w-8 h-8 text-white animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-slate-900 border border-slate-700">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            </div>
          </div>

          <h2 className="text-lg font-bold text-white tracking-tight mb-1">
            RFID Attendance Portal
          </h2>
          <p className="text-xs text-slate-400 mb-6">
            Establishing secure connection
          </p>

          {/* Progress Steps */}
          <div className="space-y-3 mb-6 text-left">
            {/* Step 1: Authentication */}
            <div className={`p-3 rounded-xl border transition-all flex items-center gap-3 ${
              isProfileStep 
                ? 'bg-slate-900/60 border-emerald-500/30 text-emerald-300' 
                : 'bg-slate-900/90 border-blue-500/40 text-blue-300'
            }`}>
              <div className="shrink-0">
                {isProfileStep ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold leading-tight text-white">
                  1. Authentication
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {isProfileStep ? 'Account authenticated' : 'Verifying credentials...'}
                </p>
              </div>
            </div>

            {/* Step 2: Dashboard & Role Sync */}
            <div className={`p-3 rounded-xl border transition-all flex items-center gap-3 ${
              isProfileStep 
                ? 'bg-slate-900/90 border-cyan-500/40 text-cyan-300' 
                : 'bg-slate-950/40 border-slate-800 text-slate-500'
            }`}>
              <div className="shrink-0">
                {isProfileStep ? (
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center text-[10px] text-slate-600 font-mono">
                    2
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold leading-tight ${isProfileStep ? 'text-white' : 'text-slate-400'}`}>
                  2. Dashboard &amp; Role Sync
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {isProfileStep ? 'Loading your dashboard...' : 'Pending authentication'}
                </p>
              </div>
            </div>
          </div>

          {/* Current Dynamic Status Text */}
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 mb-4">
            <p className="text-xs text-cyan-300 font-mono flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
              <span>{statusMessage || 'Connecting to database...'}</span>
            </p>
          </div>

          {/* Safe Exit / Cancel Option */}
          {showCancelButton && (
            <div className="pt-2 animate-in fade-in duration-300">
              <button
                type="button"
                onClick={logout}
                className="w-full py-2 px-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white text-xs font-medium transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                <span>Cancel &amp; Return to Sign In</span>
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/**
 * Dedicated Error Recovery Screen
 */
function AuthErrorScreen() {
  const { authError, retryProfileLoad, logout } = useAuth();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryProfileLoad();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-7 rounded-3xl bg-[#0c1220]/90 backdrop-blur-2xl border border-rose-500/30 shadow-2xl shadow-black/80 text-center">
          
          {/* Warning Icon */}
          <div className="inline-flex relative mb-4">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center shadow-lg shadow-rose-500/10">
              <ShieldAlert className="w-8 h-8 text-rose-400" />
            </div>
          </div>

          <h2 className="text-lg font-bold text-white tracking-tight mb-1">
            Access Configuration Notice
          </h2>
          <p className="text-xs text-slate-400 mb-5">
            Your login succeeded, but your role or profile needs attention.
          </p>

          {/* Actual Error Message Box */}
          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs text-left mb-6 leading-relaxed">
            {authError || 'Your account exists, but your student profile has not been configured. Contact your administrator.'}
          </div>

          {/* Recovery Actions */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-500/25 border border-blue-400/30 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
              <span>{retrying ? 'Retrying...' : 'Retry Profile Load'}</span>
            </button>

            <button
              type="button"
              onClick={logout}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer border border-slate-800"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>Sign Out &amp; Return to Login</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Admin Portal View
 */
function AdminPortal() {
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  React.useEffect(() => {
    try {
      const targetPath = `/admin/${currentPage}`;
      if (window.location.pathname !== targetPath) {
        window.history.replaceState(null, '', targetPath);
      }
    } catch {}
  }, [currentPage]);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col lg:flex-row antialiased selection:bg-blue-500/30 selection:text-white">
      {/* Toast Notification for Incoming RFID Taps */}
      <LiveScanToast />

      {/* Hardware Simulator / RFID Reader Modal */}
      <RFIDScannerModal 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
      />

      {/* Responsive Admin Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={(page) => setCurrentPage(page)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onOpenScanner={() => setIsScannerOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <Navbar
          currentPage={currentPage}
          onOpenMobile={() => setMobileSidebarOpen(true)}
          onOpenScanner={() => setIsScannerOpen(true)}
          onNavigate={(page) => setCurrentPage(page)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-200">
          <Suspense fallback={<PageLoadingFallback />}>
            {currentPage === 'dashboard' && (
              <DashboardPage
                onNavigate={(page) => setCurrentPage(page)}
                onOpenScanner={() => setIsScannerOpen(true)}
              />
            )}

            {currentPage === 'students' && (
              <StudentsPage
                onOpenScanner={() => setIsScannerOpen(true)}
              />
            )}

            {currentPage === 'attendance' && (
              <AttendancePage
                onOpenScanner={() => setIsScannerOpen(true)}
                onNavigateToStudents={() => setCurrentPage('students')}
              />
            )}

            {currentPage === 'reports' && (
              <ReportsPage />
            )}

            {currentPage === 'settings' && (
              <SettingsPage />
            )}

            {currentPage === 'reset' && (
              <SystemResetPage />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/**
 * Student Portal View
 */
function StudentPortal() {
  const [currentTab, setCurrentTab] = useState<StudentTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sync route path to /student/dashboard
  React.useEffect(() => {
    try {
      const targetPath = `/student/${currentTab}`;
      if (window.location.pathname !== targetPath) {
        window.history.replaceState(null, '', targetPath);
      }
    } catch {}
  }, [currentTab]);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col lg:flex-row antialiased selection:bg-emerald-500/30 selection:text-white">
      {/* Live Scan Notification Toast */}
      <LiveScanToast />

      {/* Responsive Student Sidebar */}
      <StudentSidebar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen lg:pl-64">
        <StudentNavbar
          currentTab={currentTab}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-200">
          <Suspense fallback={<PageLoadingFallback />}>
            {currentTab === 'dashboard' && (
              <StudentDashboardPage onNavigateTab={(tab) => setCurrentTab(tab)} />
            )}

            {currentTab === 'attendance' && (
              <StudentAttendancePage />
            )}

            {currentTab === 'calendar' && (
              <StudentCalendarPage />
            )}

            {currentTab === 'profile' && (
              <StudentProfilePage />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/**
 * Root Controller with Authentication and Role Separation
 */
function AuthenticatedApp() {
  const { user, authStatus } = useAuth();

  // 1. Initializing, Authenticating or Loading Profile
  if (
    authStatus === 'initializing' || 
    authStatus === 'authenticating' || 
    authStatus === 'loading_profile'
  ) {
    return <AuthProgressScreen />;
  }

  // 2. Profile missing or network failure while logged in
  if (authStatus === 'error') {
    return <AuthErrorScreen />;
  }

  // 3. Unauthenticated -> Common Login Page for Admin and Student
  if (!user || authStatus === 'unauthenticated') {
    return <LoginPage />;
  }

  // 4. Role Separation: Admin
  if (user.role === 'admin') {
    return <AdminPortal />;
  }

  // 5. Role Separation: Student
  return <StudentPortal />;
}

export default function App() {
  return (
    <AuthProvider>
      <AttendanceProvider>
        <AuthenticatedApp />
      </AttendanceProvider>
    </AuthProvider>
  );
}
