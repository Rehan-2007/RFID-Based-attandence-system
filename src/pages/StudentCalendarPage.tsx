import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Cpu, 
  CreditCard,
  Info
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAttendance } from '../context/AttendanceContext';

export const StudentCalendarPage: React.FC = () => {
  const { user } = useAuth();
  const { allAttendance, todayAttendance } = useAttendance();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);

  const studentRfid = user?.rfidUID;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Compute days in month and starting day of week
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  // All recorded dates in the entire system
  const allRecordedDates = useMemo(() => {
    const dates = new Set<string>(Object.keys(allAttendance));
    dates.add(todayStr);
    return dates;
  }, [allAttendance, todayStr]);

  // Lookup helper for any given day
  const getDayAttendance = (dayNum: number) => {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const isRecordedDate = allRecordedDates.has(dStr);
    const isToday = dStr === todayStr;
    const isFuture = dStr > todayStr;

    let isPresent = false;
    let time = '--:--:--';
    let device = 'ESP32-RFID-01';

    if (studentRfid) {
      if (allAttendance[dStr] && allAttendance[dStr][studentRfid]) {
        const rec = allAttendance[dStr][studentRfid];
        if (rec.status === 'Present') {
          isPresent = true;
          time = rec.time || '--:--:--';
          device = rec.device || device;
        }
      } else if (isToday && todayAttendance[studentRfid]) {
        const rec = todayAttendance[studentRfid];
        if (rec.status === 'Present') {
          isPresent = true;
          time = rec.time || '--:--:--';
          device = rec.device || device;
        }
      }
    }

    return {
      dateStr: dStr,
      isRecordedDate,
      isToday,
      isFuture,
      isPresent,
      time,
      device,
    };
  };

  // Monthly summary stats
  const monthlyStats = useMemo(() => {
    let present = 0;
    let absent = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const info = getDayAttendance(d);
      if (!info.isFuture && info.isRecordedDate) {
        if (info.isPresent) present++;
        else absent++;
      }
    }
    const total = present + absent;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 100;
    return { present, absent, total, percentage };
  }, [year, month, daysInMonth, allRecordedDates, studentRfid, allAttendance, todayAttendance]);

  // Selected date details
  const selectedDayInfo = useMemo(() => {
    if (!selectedDayStr) return null;
    const parts = selectedDayStr.split('-');
    const dayNum = parseInt(parts[2], 10);
    return getDayAttendance(dayNum);
  }, [selectedDayStr, year, month, allRecordedDates, studentRfid, allAttendance, todayAttendance]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="space-y-6">
      {/* Calendar Header with Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#0c1220] border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              {monthNames[month]} {year}
            </h2>
            <p className="text-xs text-slate-400">
              Interactive attendance calendar for RFID card {studentRfid || 'UID'}
            </p>
          </div>
        </div>

        {/* Month Navigation & Legend */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs mr-2 hidden md:flex">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-300">Present</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-300">Absent</span>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              Current
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-[#0c1220] border border-slate-800 text-center">
          <p className="text-[10px] uppercase font-mono text-slate-400">Month Days Recorded</p>
          <p className="text-xl font-bold text-white font-mono mt-0.5">{monthlyStats.total}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 text-center">
          <p className="text-[10px] uppercase font-mono text-emerald-400">Present</p>
          <p className="text-xl font-bold text-emerald-400 font-mono mt-0.5">{monthlyStats.present}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-rose-950/20 border border-rose-500/20 text-center">
          <p className="text-[10px] uppercase font-mono text-rose-400">Absent</p>
          <p className="text-xl font-bold text-rose-400 font-mono mt-0.5">{monthlyStats.absent}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 text-center">
          <p className="text-[10px] uppercase font-mono text-indigo-400">Month Attendance</p>
          <p className="text-xl font-bold text-white font-mono mt-0.5">{monthlyStats.percentage}%</p>
        </div>
      </div>

      {/* Calendar Grid & Side Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-[#0c1220] border border-slate-800 shadow-xl">
          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Blank cells for offset */}
            {Array.from({ length: firstDayIndex }).map((_, idx) => (
              <div key={`blank-${idx}`} className="h-16 sm:h-20 rounded-xl bg-slate-950/20 border border-transparent" />
            ))}

            {/* Days in month */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const info = getDayAttendance(dayNum);
              const isSelected = selectedDayStr === info.dateStr;

              let cellStyle = 'bg-slate-950/50 border-slate-800/60 text-slate-400';
              let badge = null;

              if (info.isToday) {
                cellStyle = 'bg-blue-950/20 border-blue-500/40 text-blue-300 ring-1 ring-blue-500/30';
              }

              if (!info.isFuture && info.isRecordedDate) {
                if (info.isPresent) {
                  cellStyle = 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200 hover:border-emerald-400';
                  badge = (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-emerald-400 font-bold">
                      <CheckCircle2 className="w-3 h-3" />
                      <span className="hidden sm:inline">PRESENT</span>
                    </span>
                  );
                } else {
                  cellStyle = 'bg-rose-950/25 border-rose-500/40 text-rose-200 hover:border-rose-400';
                  badge = (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-rose-400 font-bold">
                      <XCircle className="w-3 h-3" />
                      <span className="hidden sm:inline">ABSENT</span>
                    </span>
                  );
                }
              }

              return (
                <button
                  key={dayNum}
                  onClick={() => setSelectedDayStr(info.dateStr)}
                  className={`h-16 sm:h-20 p-1.5 sm:p-2 rounded-2xl border flex flex-col justify-between items-start transition cursor-pointer text-left ${cellStyle} ${
                    isSelected ? 'ring-2 ring-cyan-400 shadow-lg' : ''
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-xs font-bold font-mono ${info.isToday ? 'text-cyan-400' : ''}`}>
                      {dayNum}
                    </span>
                    {info.isToday && (
                      <span className="text-[9px] px-1 rounded bg-blue-500/20 text-cyan-300 font-mono">
                        TODAY
                      </span>
                    )}
                  </div>
                  <div className="w-full">
                    {badge}
                    {info.isPresent && (
                      <p className="text-[9px] font-mono text-slate-400 hidden sm:block truncate">
                        {info.time}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Day Details Drawer/Card */}
        <div className="p-6 rounded-3xl bg-[#0c1220] border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">Day Attendance Details</h3>
            </div>

            {selectedDayInfo ? (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <p className="text-[10px] uppercase font-mono text-slate-400">Selected Date</p>
                  <p className="text-lg font-bold text-white font-mono mt-0.5">
                    {selectedDayInfo.dateStr}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(selectedDayInfo.dateStr).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Status</span>
                    {selectedDayInfo.isPresent ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold text-xs border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Present</span>
                      </span>
                    ) : selectedDayInfo.isFuture ? (
                      <span className="text-xs text-slate-500 font-mono">Upcoming</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-semibold text-xs border border-rose-500/20">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Absent</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Check-in Time</span>
                    </span>
                    <span className="text-xs font-mono font-medium text-slate-200">
                      {selectedDayInfo.isPresent ? selectedDayInfo.time : 'None recorded'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-slate-500" />
                      <span>Scanner Device</span>
                    </span>
                    <span className="text-xs font-mono text-slate-300">
                      {selectedDayInfo.isPresent ? selectedDayInfo.device : 'N/A'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-400 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                      <span>Card UID</span>
                    </span>
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      {studentRfid || 'Unassigned'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 text-slate-500">
                <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">Click on any date in the calendar to view full check-in information.</p>
              </div>
            )}
          </div>

          <div className="p-3.5 mt-4 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
            Attendance marks are recorded automatically when your RFID card is tapped against the hardware scanner.
          </div>
        </div>
      </div>
    </div>
  );
};
