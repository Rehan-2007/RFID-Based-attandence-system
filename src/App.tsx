import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AttendanceProvider } from './context/AttendanceContext';
import { Sidebar, NavPage } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { RFIDScannerModal } from './components/RFIDScannerModal';
import { LiveScanToast } from './components/LiveScanToast';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { AttendancePage } from './pages/AttendancePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SystemResetPage } from './pages/SystemResetPage';

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center text-slate-300">
        <div className="w-12 h-12 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono tracking-widest uppercase text-slate-400">
          Loading RFID Attendance Portal...
        </p>
      </div>
    );
  }

  // Enforce admin login
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col lg:flex-row antialiased selection:bg-blue-500/30 selection:text-white">
      {/* Toast Notification for Incoming RFID Taps */}
      <LiveScanToast />

      {/* Hardware Simulator / RFID Reader Modal */}
      <RFIDScannerModal 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
      />

      {/* Responsive Sidebar */}
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
        </main>
      </div>
    </div>
  );
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
