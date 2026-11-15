import React, { useMemo, useState } from 'react';
import {
  Trophy,
  Medal,
  Flame,
  Download,
  Search,
  Filter,
  Eye,
  EyeOff,
  Calendar,
  TrendingUp,
  CheckCircle2,
  X,
  Star,
  Gem,
  Award,
  History,
  SlidersHorizontal,
  UserCheck,
  Clock,
} from 'lucide-react';
import { useAttendance } from '../context/AttendanceContext';
import {
  AchievementBadge,
  LeaderboardEntry,
  LeaderboardPeriod,
} from '../types';
import {
  exportLeaderboardToCsv,
  LEADERBOARD_PERIOD_META,
} from '../utils/leaderboardUtils';

function renderAchievementIcon(icon: AchievementBadge['icon'], className = 'w-3.5 h-3.5') {
  switch (icon) {
    case 'gem':
      return <Gem className={`${className} text-cyan-300`} />;
    case 'flame':
      return <Flame className={`${className} text-orange-400`} />;
    case 'star':
      return <Star className={`${className} text-amber-300`} />;
    case 'trophy':
    default:
      return <Trophy className={`${className} text-yellow-400`} />;
  }
}

function getRankTierInfo(rank: number): {
  label: string;
  medalEmoji: string;
  ringClass: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  if (rank === 1) {
    return {
      label: 'Rank 1 · Gold',
      medalEmoji: '🥇',
      ringClass: 'ring-1 ring-amber-400/40',
      bgClass: 'bg-gradient-to-b from-amber-500/15 via-yellow-500/5 to-[#0c1220]',
      textClass: 'text-amber-300',
      borderClass: 'border-amber-400/40',
    };
  }
  if (rank === 2) {
    return {
      label: 'Rank 2 · Silver',
      medalEmoji: '🥈',
      ringClass: 'ring-1 ring-slate-300/30',
      bgClass: 'bg-gradient-to-b from-slate-400/15 via-slate-500/5 to-[#0c1220]',
      textClass: 'text-slate-200',
      borderClass: 'border-slate-400/40',
    };
  }
  if (rank === 3) {
    return {
      label: 'Rank 3 · Bronze',
      medalEmoji: '🥉',
      ringClass: 'ring-1 ring-orange-400/30',
      bgClass: 'bg-gradient-to-b from-orange-500/15 via-amber-700/5 to-[#0c1220]',
      textClass: 'text-orange-300',
      borderClass: 'border-orange-500/40',
    };
  }
  return {
    label: `Rank #${rank}`,
    medalEmoji: `#${rank}`,
    ringClass: '',
    bgClass: 'bg-[#0c1220]',
    textClass: 'text-slate-300',
    borderClass: 'border-slate-800',
  };
}

export const LeaderboardPage: React.FC = () => {
  const {
    students,
    getLeaderboardForPeriod,
    leaderboardHistory,
    leaderboardEnabled,
    toggleLeaderboardEnabled,
  } = useAttendance();

  const [viewMode, setViewMode] = useState<'live' | 'history'>('live');
  const [period, setPeriod] = useState<LeaderboardPeriod>('overall');
  const [topLimit, setTopLimit] = useState<'all' | 3 | 10 | 20>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedYear, setSelectedYear] = useState('All');
  const [selectedSemester, setSelectedSemester] = useState('All');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string>('');
  const [inspectedEntry, setInspectedEntry] = useState<LeaderboardEntry | null>(null);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  const [visibilityNotice, setVisibilityNotice] = useState<{ success: boolean; message: string } | null>(null);

  const currentSnapshot = useMemo(
    () => getLeaderboardForPeriod(period),
    [getLeaderboardForPeriod, period]
  );

  // Dynamic filter dropdown options from active snapshot
  const { departments, years, semesters } = useMemo(() => {
    const dSet = new Set<string>();
    const ySet = new Set<string>();
    const sSet = new Set<string>();
    (currentSnapshot.entries || []).forEach((e) => {
      if (e.department) dSet.add(e.department);
      if (e.year && e.year !== 'N/A') ySet.add(e.year);
      if (e.semester && e.semester !== 'N/A') sSet.add(e.semester);
    });
    return {
      departments: ['All', ...Array.from(dSet).sort()],
      years: ['All', ...Array.from(ySet).sort()],
      semesters: ['All', ...Array.from(sSet).sort()],
    };
  }, [currentSnapshot.entries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = (currentSnapshot.entries || []).filter((e) => {
      const matchesSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.studentId.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q);
      const matchesDept = selectedDept === 'All' || e.department === selectedDept;
      const matchesYear = selectedYear === 'All' || e.year === selectedYear;
      const matchesSemester = selectedSemester === 'All' || e.semester === selectedSemester;
      return matchesSearch && matchesDept && matchesYear && matchesSemester;
    });
    if (topLimit === 'all') return list;
    return list.slice(0, topLimit);
  }, [currentSnapshot.entries, searchQuery, selectedDept, selectedYear, selectedSemester, topLimit]);

  const topThreePodium = useMemo(() => {
    return (currentSnapshot.entries || []).slice(0, 3);
  }, [currentSnapshot.entries]);

  const averageAttendance = useMemo(() => {
    const entries = currentSnapshot.entries || [];
    if (entries.length === 0) return 0;
    const sum = entries.reduce((acc, e) => acc + e.attendancePercentage, 0);
    return Math.round((sum / entries.length) * 10) / 10;
  }, [currentSnapshot.entries]);

  const activeHistorySnapshot = useMemo(() => {
    if (!leaderboardHistory || leaderboardHistory.length === 0) return null;
    if (selectedHistoryDate) {
      return leaderboardHistory.find((h) => h.snapshotDate === selectedHistoryDate) || leaderboardHistory[0];
    }
    return leaderboardHistory[0];
  }, [leaderboardHistory, selectedHistoryDate]);

  const handleToggleStudentVisibility = async () => {
    setIsTogglingVisibility(true);
    setVisibilityNotice(null);
    const res = await toggleLeaderboardEnabled(!leaderboardEnabled);
    setVisibilityNotice(res);
    setIsTogglingVisibility(false);
    setTimeout(() => setVisibilityNotice(null), 4000);
  };

  const handleExportCsv = () => {
    if (viewMode === 'history' && activeHistorySnapshot) {
      exportLeaderboardToCsv(
        activeHistorySnapshot.topEntries || [],
        'overall',
        `Historical ${activeHistorySnapshot.snapshotDate}`
      );
      return;
    }
    exportLeaderboardToCsv(
      filteredEntries,
      period,
      LEADERBOARD_PERIOD_META[period].label
    );
  };

  // Detailed recent attendance dates for inspected student modal
  const inspectedRecentAttendance = useMemo(() => {
    if (!inspectedEntry) return [];
    const st = students[inspectedEntry.studentDbId];
    if (!st || !st.attendance) return [];
    return Object.entries(st.attendance)
      .filter(([, rec]) => rec && !rec.isDeleted)
      .sort(([dA], [dB]) => dB.localeCompare(dA))
      .slice(0, 12)
      .map(([d, rec]) => ({
        date: rec.date || d,
        time: rec.time || '--:--:--',
        status: rec.status,
        device: rec.device || 'ESP32-RFID-01',
      }));
  }, [inspectedEntry, students]);

  return (
    <div className="space-y-6">
      {/* Header & Primary Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>Attendance Leaderboard &amp; Regularity Rankings</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            70% attendance rate · 30% streak consistency · Excludes Sundays, holidays, and suspended accounts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Student Portal Visibility Toggle */}
          <button
            type="button"
            onClick={handleToggleStudentVisibility}
            disabled={isTogglingVisibility}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
              leaderboardEnabled
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/60'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title="Enable or disable Leaderboard visibility inside the Student Portal"
          >
            {leaderboardEnabled ? (
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{leaderboardEnabled ? 'Student View: Enabled' : 'Student View: Disabled'}</span>
          </button>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={
              viewMode === 'live'
                ? filteredEntries.length === 0
                : !activeHistorySnapshot || activeHistorySnapshot.topEntries.length === 0
            }
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-600/20 whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {visibilityNotice && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            visibilityNotice.success
              ? 'bg-emerald-950/35 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/35 border-rose-500/40 text-rose-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{visibilityNotice.message}</span>
        </div>
      )}

      {/* Mode Switch & Period Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 self-start">
          <button
            type="button"
            onClick={() => setViewMode('live')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              viewMode === 'live'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Live Rankings</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('history')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              viewMode === 'history'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historical Snapshots ({leaderboardHistory.length})</span>
          </button>
        </div>

        {viewMode === 'live' && (
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 self-start">
            {(['overall', 'weekly', 'monthly', 'semester'] as LeaderboardPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  period === p
                    ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {LEADERBOARD_PERIOD_META[p].shortLabel}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewMode === 'live' ? (
        <>
          {/* Summary KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-[#0c1220] border border-slate-800">
              <p className="text-xs text-slate-400 font-medium">Ranked Active Students</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                {currentSnapshot.totalEligibleStudents}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Excluding suspended &amp; inactive</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0c1220] border border-slate-800">
              <p className="text-xs text-slate-400 font-medium">Working Days in Window</p>
              <p className="text-2xl font-bold text-cyan-300 font-mono tabular-nums mt-1">
                {currentSnapshot.totalWorkingDays}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {currentSnapshot.startDate} to {currentSnapshot.endDate}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0c1220] border border-slate-800">
              <p className="text-xs text-slate-400 font-medium">Top Regularity Score</p>
              <p className="text-2xl font-bold text-amber-300 font-mono tabular-nums mt-1">
                {topThreePodium[0] ? topThreePodium[0].regularityScore.toFixed(1) : '0.0'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 truncate">
                {topThreePodium[0] ? `Leader: ${topThreePodium[0].name}` : 'No leader yet'}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0c1220] border border-slate-800">
              <p className="text-xs text-slate-400 font-medium">Average Attendance Rate</p>
              <p className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
                {averageAttendance.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{LEADERBOARD_PERIOD_META[period].shortLabel}</p>
            </div>
          </div>

          {/* Top 3 Champions Podium */}
          {topThreePodium.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              {/* Visual podium order on md+: Rank 2 (left), Rank 1 (center elevated), Rank 3 (right) */}
              {[topThreePodium[1], topThreePodium[0], topThreePodium[2]]
                .filter((item): item is LeaderboardEntry => Boolean(item))
                .map((entry) => {
                  const tier = getRankTierInfo(entry.rank);
                  const isFirst = entry.rank === 1;
                  return (
                    <button
                      key={entry.studentDbId}
                      type="button"
                      onClick={() => setInspectedEntry(entry)}
                      className={`text-left p-5 rounded-2xl border transition hover:translate-y-[-2px] cursor-pointer ${
                        tier.bgClass
                      } ${tier.borderClass} ${tier.ringClass} ${
                        isFirst ? 'md:order-2 md:py-6 shadow-xl shadow-amber-500/5' : entry.rank === 2 ? 'md:order-1' : 'md:order-3'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-base shrink-0 border ${tier.borderClass} bg-slate-900/90 text-white`}
                          >
                            {entry.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold ${tier.textClass}`}>
                              {tier.medalEmoji} {tier.label}
                            </p>
                            <h3 className="text-sm font-bold text-white truncate mt-0.5">
                              {entry.name}
                            </h3>
                            <p className="text-[11px] text-slate-400 font-mono truncate">
                              {entry.studentId} · {entry.department.split(' ')[0]}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-slate-400 block">Regularity</span>
                          <span className={`text-xl font-extrabold font-mono tabular-nums ${tier.textClass}`}>
                            {entry.regularityScore.toFixed(1)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Attendance</span>
                          <span className="text-xs font-bold text-emerald-400 font-mono tabular-nums">
                            {entry.attendancePercentage.toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Present</span>
                          <span className="text-xs font-bold text-white font-mono tabular-nums">
                            {entry.presentDays}/{entry.totalWorkingDays}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Streak</span>
                          <span className="text-xs font-bold text-orange-400 font-mono tabular-nums">
                            {entry.currentStreak}d
                          </span>
                        </div>
                      </div>

                      {entry.achievements.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                          {entry.achievements.slice(0, 3).map((ach) => (
                            <span
                              key={ach.id}
                              className="inline-flex items-center gap-1"
                              title={ach.description}
                            >
                              {renderAchievementIcon(ach.icon, 'w-3 h-3')}
                              <span>{ach.title}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          )}

          {/* Filter & Search Toolbar */}
          <div className="p-4 rounded-2xl bg-[#0c1220] border border-slate-800 space-y-3">
            <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by student name, roll number, or department..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Top Limit Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-1">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>View:</span>
                </span>
                {([
                  { value: 'all', label: 'All Students' },
                  { value: 3, label: 'Top 3' },
                  { value: 10, label: 'Top 10' },
                  { value: 20, label: 'Top 20' },
                ] as const).map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setTopLimit(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                      topLimit === opt.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Department, Year, Semester Filters */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Filter className="w-3.5 h-3.5" />
                <span>Filters:</span>
              </div>

              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d === 'All' ? 'All Departments' : d}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y === 'All' ? 'All Academic Years' : y}
                  </option>
                ))}
              </select>

              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {semesters.map((s) => (
                  <option key={s} value={s}>
                    {s === 'All' ? 'All Semesters' : s}
                  </option>
                ))}
              </select>

              {(searchQuery || selectedDept !== 'All' || selectedYear !== 'All' || selectedSemester !== 'All' || topLimit !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedDept('All');
                    setSelectedYear('All');
                    setSelectedSemester('All');
                    setTopLimit('all');
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>

          {/* Leaderboard Rankings Table */}
          <div className="rounded-2xl bg-[#0c1220] border border-slate-800 overflow-hidden">
            {filteredEntries.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-semibold text-white">No matching leaderboard records</p>
                <p className="text-xs text-slate-500 mt-1">
                  Adjust your filters or wait for active student RFID attendance scans to be recorded.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Rank</th>
                      <th className="py-3.5 px-4">Student</th>
                      <th className="py-3.5 px-4 text-right">Present / Days</th>
                      <th className="py-3.5 px-4 text-right">Attendance %</th>
                      <th className="py-3.5 px-4 text-right">Current Streak</th>
                      <th className="py-3.5 px-4 text-right">Regularity Score</th>
                      <th className="py-3.5 px-4">Achievements</th>
                      <th className="py-3.5 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredEntries.map((entry) => {
                      const tier = getRankTierInfo(entry.rank);
                      return (
                        <tr
                          key={entry.studentDbId}
                          onClick={() => setInspectedEntry(entry)}
                          className="hover:bg-slate-900/60 transition cursor-pointer"
                        >
                          <td className="py-3.5 px-4 font-mono tabular-nums whitespace-nowrap">
                            {entry.rank <= 3 ? (
                              <span className={`font-bold ${tier.textClass}`}>
                                {tier.medalEmoji} {tier.label}
                              </span>
                            ) : (
                              <span className="font-semibold text-slate-300">#{entry.rank}</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3 min-w-[190px]">
                              <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center font-bold text-xs text-slate-200 shrink-0">
                                {entry.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-white truncate">{entry.name}</p>
                                <p className="text-[11px] text-slate-400 font-mono truncate">
                                  {entry.studentId} · {entry.department.split(' ')[0]} · {entry.semester}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                            {entry.presentDays} / {entry.totalWorkingDays}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                            <span
                              className={`font-bold ${
                                entry.attendancePercentage >= 90
                                  ? 'text-emerald-400'
                                  : entry.attendancePercentage >= 75
                                    ? 'text-cyan-300'
                                    : 'text-amber-300'
                              }`}
                            >
                              {entry.attendancePercentage.toFixed(1)}%
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="text-orange-400 font-semibold">
                              {entry.currentStreak}d
                            </span>
                            <span className="text-slate-500 text-[11px] ml-1.5">
                              (Best {entry.longestStreak}d)
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="font-bold text-white text-sm">
                              {entry.regularityScore.toFixed(1)}
                            </span>
                            <span className="text-slate-500 text-[10px]"> / 100</span>
                          </td>

                          <td className="py-3.5 px-4">
                            {entry.achievements.length === 0 ? (
                              <span className="text-slate-500 text-[11px]">None yet</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                                {entry.achievements.map((ach) => (
                                  <span
                                    key={ach.id}
                                    title={`${ach.title}: ${ach.description}`}
                                    className="inline-flex items-center gap-1"
                                  >
                                    {renderAchievementIcon(ach.icon, 'w-3 h-3')}
                                    <span>{ach.title}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspectedEntry(entry);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition cursor-pointer"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Historical Rankings Tab */
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[#0c1220] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-blue-400" />
              <div>
                <p className="text-xs font-bold text-white">Historical Daily Leaderboard Snapshots</p>
                <p className="text-[11px] text-slate-400">
                  Saved Top 20 overall snapshots archived automatically per IST date
                </p>
              </div>
            </div>

            {leaderboardHistory.length > 0 && (
              <select
                value={activeHistorySnapshot?.snapshotDate || ''}
                onChange={(e) => setSelectedHistoryDate(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 focus:outline-none focus:border-blue-500"
              >
                {leaderboardHistory.map((h) => (
                  <option key={h.snapshotDate} value={h.snapshotDate}>
                    {h.snapshotDate} ({h.topEntries.length} ranked)
                  </option>
                ))}
              </select>
            )}
          </div>

          {!activeHistorySnapshot || activeHistorySnapshot.topEntries.length === 0 ? (
            <div className="p-12 rounded-2xl bg-[#0c1220] border border-slate-800 text-center text-slate-400">
              <History className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-white">No historical snapshots archived yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Daily leaderboard snapshots are recorded automatically as attendance syncs in Firebase.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#0c1220] border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Rank</th>
                      <th className="py-3.5 px-4">Student</th>
                      <th className="py-3.5 px-4 text-right">Present / Days</th>
                      <th className="py-3.5 px-4 text-right">Attendance %</th>
                      <th className="py-3.5 px-4 text-right">Streak</th>
                      <th className="py-3.5 px-4 text-right">Regularity Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {activeHistorySnapshot.topEntries.map((entry) => {
                      const tier = getRankTierInfo(entry.rank);
                      return (
                        <tr key={`${activeHistorySnapshot.snapshotDate}-${entry.studentDbId}`} className="hover:bg-slate-900/50">
                          <td className="py-3.5 px-4 font-mono tabular-nums whitespace-nowrap">
                            {entry.rank <= 3 ? (
                              <span className={`font-bold ${tier.textClass}`}>
                                {tier.medalEmoji} {tier.label}
                              </span>
                            ) : (
                              <span className="font-semibold text-slate-300">#{entry.rank}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-semibold text-white">{entry.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono">
                              {entry.studentId} · {entry.department}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-200">
                            {entry.presentDays} / {entry.totalWorkingDays}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-400 font-bold">
                            {entry.attendancePercentage.toFixed(1)}%
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-orange-400">
                            {entry.currentStreak}d (Best {entry.longestStreak}d)
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-white font-bold">
                            {entry.regularityScore.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inspect Individual Student Stats Modal */}
      {inspectedEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setInspectedEntry(null)}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0d1322] border border-slate-700/80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/70">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center font-bold text-sm text-blue-300 shrink-0">
                  {inspectedEntry.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white truncate">{inspectedEntry.name}</h3>
                  <p className="text-xs text-slate-400 font-mono truncate">
                    {inspectedEntry.studentId} · {inspectedEntry.department} · {inspectedEntry.semester}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedEntry(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Formula & Metrics Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Rank</span>
                  <span className="text-lg font-bold text-amber-300 font-mono tabular-nums">
                    #{inspectedEntry.rank}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Regularity Score</span>
                  <span className="text-lg font-bold text-white font-mono tabular-nums">
                    {inspectedEntry.regularityScore.toFixed(1)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Current Streak</span>
                  <span className="text-lg font-bold text-orange-400 font-mono tabular-nums">
                    {inspectedEntry.currentStreak}d
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Longest Streak</span>
                  <span className="text-lg font-bold text-cyan-300 font-mono tabular-nums">
                    {inspectedEntry.longestStreak}d
                  </span>
                </div>
              </div>

              {/* 70% / 30% Weight Explanation */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2 text-xs">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <Medal className="w-4 h-4 text-blue-400" />
                  <span>Weighted Regularity Score Breakdown ({LEADERBOARD_PERIOD_META[period].shortLabel})</span>
                </p>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Attendance Percentage (70% weight): {inspectedEntry.attendancePercentage.toFixed(1)}%</span>
                  <span className="font-mono tabular-nums text-emerald-400">
                    +{(inspectedEntry.attendancePercentage * 0.7).toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Streak Consistency Score (30% weight): {inspectedEntry.consistencyScore.toFixed(1)}%</span>
                  <span className="font-mono tabular-nums text-cyan-300">
                    +{(inspectedEntry.consistencyScore * 0.3).toFixed(1)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between font-bold text-white">
                  <span>Present / Working Days: {inspectedEntry.presentDays} / {inspectedEntry.totalWorkingDays}</span>
                  <span className="font-mono tabular-nums text-amber-300">
                    Total {inspectedEntry.regularityScore.toFixed(1)} / 100
                  </span>
                </div>
              </div>

              {/* Earned Achievements */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  <span>Automatic Achievements ({inspectedEntry.achievements.length})</span>
                </h4>
                {inspectedEntry.achievements.length === 0 ? (
                  <p className="text-xs text-slate-500">No achievement badges unlocked in this period yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {inspectedEntry.achievements.map((ach) => (
                      <div
                        key={ach.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2.5"
                      >
                        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 shrink-0">
                          {renderAchievementIcon(ach.icon, 'w-4 h-4')}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">{ach.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{ach.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Attendance Timeline */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Recent Recorded Dates</span>
                </h4>
                {inspectedRecentAttendance.length === 0 ? (
                  <p className="text-xs text-slate-500">No recorded attendance logs found.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/70 rounded-xl bg-slate-950 border border-slate-800">
                    {inspectedRecentAttendance.map((item) => (
                      <div key={item.date} className="px-3.5 py-2 flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-200">{item.date}</span>
                        <span className="text-slate-400 font-mono">{item.time}</span>
                        <span
                          className={`font-semibold flex items-center gap-1 ${
                            item.status === 'Present' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          <UserCheck className="w-3 h-3" />
                          <span>{item.status}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
