import React, { useMemo, useState } from 'react';
import {
  Trophy,
  Flame,
  Star,
  Gem,
  CalendarCheck,
  TrendingUp,
  Lock,
  Award,
  Sparkles,
  CheckCircle2,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAttendance } from '../context/AttendanceContext';
import {
  AchievementBadge,
  AchievementId,
  LeaderboardEntry,
  LeaderboardPeriod,
} from '../types';
import {
  ACHIEVEMENT_DEFINITIONS,
  getStudentMotivationalMessage,
  LEADERBOARD_PERIOD_META,
} from '../utils/leaderboardUtils';

function renderBadgeIcon(icon: AchievementBadge['icon'], className = 'w-4 h-4') {
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

function getRankVisual(rank: number) {
  if (rank === 1) {
    return {
      medal: '🥇',
      label: 'Rank 1 · Gold',
      accentText: 'text-amber-300',
      border: 'border-amber-400/40',
      surface: 'bg-gradient-to-b from-amber-500/15 via-yellow-500/5 to-[#0c1220]',
    };
  }
  if (rank === 2) {
    return {
      medal: '🥈',
      label: 'Rank 2 · Silver',
      accentText: 'text-slate-200',
      border: 'border-slate-400/40',
      surface: 'bg-gradient-to-b from-slate-400/15 via-slate-500/5 to-[#0c1220]',
    };
  }
  if (rank === 3) {
    return {
      medal: '🥉',
      label: 'Rank 3 · Bronze',
      accentText: 'text-orange-300',
      border: 'border-orange-500/40',
      surface: 'bg-gradient-to-b from-orange-500/15 via-amber-700/5 to-[#0c1220]',
    };
  }
  return {
    medal: `#${rank}`,
    label: `Rank #${rank}`,
    accentText: 'text-slate-300',
    border: 'border-slate-800',
    surface: 'bg-[#0c1220]',
  };
}

export const StudentLeaderboardPage: React.FC = () => {
  const { user } = useAuth();
  const {
    studentsList,
    leaderboardEnabled,
    getLeaderboardForPeriod,
    getStudentLeaderboardStats,
  } = useAttendance();

  const [period, setPeriod] = useState<LeaderboardPeriod>('overall');

  const currentStudent = useMemo(() => {
    return (
      studentsList.find(
        (s) =>
          (user?.studentDbId && s.studentDbId === user.studentDbId) ||
          (user?.rfidUID && (s.rfidUID || s.uid || '').toUpperCase() === user.rfidUID.toUpperCase()) ||
          (user?.uid && s.authUid === user.uid)
      ) ||
      studentsList[0] ||
      null
    );
  }, [studentsList, user]);

  const currentStudentDbId = (currentStudent?.studentDbId || user?.studentDbId || '').trim();
  const currentRoll = (currentStudent?.studentId || user?.studentId || user?.rollNumber || '').trim().toUpperCase();

  const snapshot = useMemo(
    () => getLeaderboardForPeriod(period),
    [getLeaderboardForPeriod, period]
  );

  const isMe = (entry: LeaderboardEntry): boolean => {
    if (currentStudentDbId && entry.studentDbId === currentStudentDbId) return true;
    if (currentRoll && (entry.studentId || '').toUpperCase() === currentRoll) return true;
    return false;
  };

  const myEntry = useMemo<LeaderboardEntry | null>(() => {
    const found = (snapshot.entries || []).find(isMe);
    if (found) return found;
    if (currentStudentDbId) {
      return getStudentLeaderboardStats(currentStudentDbId, period);
    }
    return null;
  }, [snapshot.entries, currentStudentDbId, getStudentLeaderboardStats, period]);

  const topThree = useMemo(() => (snapshot.entries || []).slice(0, 3), [snapshot.entries]);
  const topTen = useMemo(() => (snapshot.entries || []).slice(0, 10), [snapshot.entries]);
  const isUserInTopTen = Boolean(myEntry && myEntry.rank <= 10);

  const motivational = useMemo(
    () => getStudentMotivationalMessage(myEntry, snapshot.totalEligibleStudents),
    [myEntry, snapshot.totalEligibleStudents]
  );

  const unlockedAchievementIds = useMemo(
    () => new Set((myEntry?.achievements || []).map((a) => a.id)),
    [myEntry]
  );

  const allAchievementOrder: AchievementId[] = [
    'attendance_champion',
    'perfect_attendance',
    'regular_student',
    'streak_30',
    'streak_7',
  ];

  // When Admin disables public student leaderboard visibility, keep personal streaks & badges visible without exposing peer rankings
  if (!leaderboardEnabled) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="p-6 rounded-2xl bg-[#0c1220] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 shrink-0">
              <EyeOff className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Public Attendance Leaderboard Paused
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Your institution administrator has temporarily hidden peer leaderboard rankings. Your personal attendance streaks and achievements continue updating automatically.
              </p>
            </div>
          </div>
        </div>

        {myEntry && (
          <div className="p-6 rounded-2xl bg-[#0c1220] border border-slate-800 space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span>Your Personal Regularity &amp; Streaks</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Current Streak</span>
                <span className="text-2xl font-bold text-orange-400 font-mono tabular-nums mt-1 block">
                  {myEntry.currentStreak} days
                </span>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Longest Streak</span>
                <span className="text-2xl font-bold text-cyan-300 font-mono tabular-nums mt-1 block">
                  {myEntry.longestStreak} days
                </span>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Attendance Rate</span>
                <span className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1 block">
                  {myEntry.attendancePercentage.toFixed(1)}%
                </span>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Present / Working</span>
                <span className="text-2xl font-bold text-white font-mono tabular-nums mt-1 block">
                  {myEntry.presentDays}/{myEntry.totalWorkingDays}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Title & Period Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>Attendance Leaderboard</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {LEADERBOARD_PERIOD_META[period].description} · Sundays &amp; holidays excluded
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 self-start">
          {(['overall', 'weekly', 'monthly', 'semester'] as LeaderboardPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                period === p
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {LEADERBOARD_PERIOD_META[p].shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Personal Standing & Motivational Hero Card */}
      <div
        className={`p-6 rounded-2xl border ${
          motivational.tone === 'gold'
            ? 'bg-gradient-to-br from-amber-500/12 via-[#0c1220] to-[#080d18] border-amber-400/35'
            : motivational.tone === 'emerald'
              ? 'bg-gradient-to-br from-emerald-500/12 via-[#0c1220] to-[#080d18] border-emerald-500/35'
              : motivational.tone === 'amber'
                ? 'bg-gradient-to-br from-orange-500/10 via-[#0c1220] to-[#080d18] border-orange-500/30'
                : 'bg-gradient-to-br from-blue-500/12 via-[#0c1220] to-[#080d18] border-blue-500/30'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <Sparkles className="w-4 h-4" />
              <span>Your Regularity Standing</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {motivational.headline}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {motivational.subtext}
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 text-center min-w-[110px]">
              <span className="text-[11px] text-slate-400 block">Your Rank</span>
              <span className="text-3xl font-extrabold text-amber-300 font-mono tabular-nums mt-0.5 block">
                {myEntry ? `#${myEntry.rank}` : '—'}
              </span>
              <span className="text-[11px] text-slate-500">
                of {snapshot.totalEligibleStudents} students
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 text-center min-w-[125px]">
              <span className="text-[11px] text-slate-400 block">Regularity Score</span>
              <span className="text-3xl font-extrabold text-white font-mono tabular-nums mt-0.5 block">
                {myEntry ? myEntry.regularityScore.toFixed(1) : '0.0'}
              </span>
              <span className="text-[11px] text-emerald-400 font-mono">
                {myEntry ? `${myEntry.attendancePercentage.toFixed(1)}% rate` : 'No data'}
              </span>
            </div>
          </div>
        </div>

        {/* 4 Personal Streak & Working-Day Counters */}
        <div className="mt-5 pt-5 border-t border-slate-800/80 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Current Streak</span>
              <Flame className="w-4 h-4 text-orange-400" />
            </div>
            <p className="text-xl font-bold text-orange-400 font-mono tabular-nums mt-1">
              {myEntry ? myEntry.currentStreak : 0} Days
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Longest Streak</span>
              <Trophy className="w-4 h-4 text-amber-300" />
            </div>
            <p className="text-xl font-bold text-amber-300 font-mono tabular-nums mt-1">
              {myEntry ? myEntry.longestStreak : 0} Days
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Total Working Days</span>
              <CalendarCheck className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-xl font-bold text-white font-mono tabular-nums mt-1">
              {myEntry ? myEntry.totalWorkingDays : snapshot.totalWorkingDays}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Days Present</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
              {myEntry ? myEntry.presentDays : 0}
            </p>
          </div>
        </div>
      </div>

      {/* Automatic Achievements & Rewards */}
      <div className="p-6 rounded-2xl bg-[#0c1220] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span>Automatic Achievements &amp; Badges</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Earned automatically from your live verified RFID attendance &amp; regularity milestones
            </p>
          </div>
          <span className="text-xs font-mono text-emerald-400 tabular-nums">
            {unlockedAchievementIds.size} / {allAchievementOrder.length} Unlocked ({LEADERBOARD_PERIOD_META[period].shortLabel})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {allAchievementOrder.map((id) => {
            const def = ACHIEVEMENT_DEFINITIONS[id];
            const unlocked = unlockedAchievementIds.has(id);
            return (
              <div
                key={id}
                className={`p-3.5 rounded-xl border transition ${
                  unlocked
                    ? 'bg-slate-900/90 border-amber-400/35'
                    : 'bg-slate-950/60 border-slate-800/70 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
                    {unlocked ? renderBadgeIcon(def.icon, 'w-4 h-4') : <Lock className="w-3.5 h-3.5 text-slate-500" />}
                  </div>
                  <span
                    className={`text-[10px] font-mono ${
                      unlocked ? 'text-emerald-400 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {unlocked ? 'Unlocked' : def.criteriaLabel}
                  </span>
                </div>
                <p className="text-xs font-bold text-white">{def.title}</p>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">{def.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top 3 Champions Podium */}
      {topThree.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Top 3 Champions</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {[topThree[1], topThree[0], topThree[2]]
              .filter((item): item is LeaderboardEntry => Boolean(item))
              .map((entry) => {
                const visual = getRankVisual(entry.rank);
                const self = isMe(entry);
                const isFirst = entry.rank === 1;
                return (
                  <div
                    key={entry.studentDbId}
                    className={`p-5 rounded-2xl border ${visual.surface} ${
                      self ? 'ring-2 ring-emerald-400/60 border-emerald-400/50' : visual.border
                    } ${
                      isFirst ? 'md:order-2 md:py-6' : entry.rank === 2 ? 'md:order-1' : 'md:order-3'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center font-bold text-sm text-white shrink-0">
                          {entry.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold ${visual.accentText}`}>
                            {visual.medal} {visual.label} {self ? '· You' : ''}
                          </p>
                          <p className="text-sm font-bold text-white truncate mt-0.5">
                            {entry.name}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono truncate">
                            {entry.studentId} · {entry.department.split(' ')[0]}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 block">Score</span>
                        <span className={`text-xl font-extrabold font-mono tabular-nums ${visual.accentText}`}>
                          {entry.regularityScore.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Rate</span>
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
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Top 10 Regular Students Table */}
      <div className="rounded-2xl bg-[#0c1220] border border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Top 10 Regular Students</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Ranked by 70% attendance rate and 30% consecutive working-day consistency
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            {snapshot.totalEligibleStudents} Active
          </span>
        </div>

        {topTen.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <Trophy className="w-9 h-9 text-slate-600 mx-auto mb-2.5" />
            <p className="text-sm font-semibold text-white">No attendance rankings yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Rankings populate automatically as soon as RFID check-ins are recorded on working days.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Rank</th>
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4 text-right">Present Days</th>
                  <th className="py-3.5 px-4 text-right">Attendance %</th>
                  <th className="py-3.5 px-4 text-right">Streak</th>
                  <th className="py-3.5 px-4 text-right">Regularity Score</th>
                  <th className="py-3.5 px-4">Badges</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {topTen.map((entry) => {
                  const visual = getRankVisual(entry.rank);
                  const self = isMe(entry);
                  return (
                    <tr
                      key={entry.studentDbId}
                      className={self ? 'bg-emerald-950/25' : 'hover:bg-slate-900/50'}
                    >
                      <td className="py-3.5 px-4 font-mono tabular-nums whitespace-nowrap">
                        <span className={`font-bold ${visual.accentText}`}>
                          {entry.rank <= 3 ? `${visual.medal} ${visual.label}` : `#${entry.rank}`}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <div
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-xs shrink-0 ${
                              self
                                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                                : 'bg-slate-900 border-slate-700 text-slate-200'
                            }`}
                          >
                            {entry.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">
                              {entry.name}{' '}
                              {self && (
                                <span className="text-emerald-400 font-mono text-[11px] ml-1">
                                  (You)
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono truncate">
                              {entry.studentId} · {entry.department.split(' ')[0]}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {entry.presentDays} / {entry.totalWorkingDays}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-400 font-bold whitespace-nowrap">
                        {entry.attendancePercentage.toFixed(1)}%
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-orange-400 whitespace-nowrap">
                        {entry.currentStreak}d
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-white whitespace-nowrap">
                        {entry.regularityScore.toFixed(1)}
                      </td>

                      <td className="py-3.5 px-4">
                        {entry.achievements.length === 0 ? (
                          <span className="text-slate-500 text-[11px]">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                            {entry.achievements.slice(0, 3).map((ach) => (
                              <span
                                key={ach.id}
                                title={ach.description}
                                className="inline-flex items-center gap-1"
                              >
                                {renderBadgeIcon(ach.icon, 'w-3 h-3')}
                                <span>{ach.title}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Own Position Comparison Card when Student is ranked #11+ */}
        {myEntry && !isUserInTopTen && (
          <div className="p-4 border-t border-emerald-500/30 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold font-mono text-emerald-300 tabular-nums">
                #{myEntry.rank}
              </span>
              <div>
                <p className="text-xs font-bold text-white">
                  {myEntry.name} <span className="text-emerald-400 font-mono">(You)</span>
                </p>
                <p className="text-[11px] text-slate-400 font-mono">
                  {myEntry.studentId} · {myEntry.presentDays}/{myEntry.totalWorkingDays} days present ·{' '}
                  {myEntry.attendancePercentage.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 font-mono tabular-nums text-xs">
              <span className="text-orange-400">{myEntry.currentStreak}d streak</span>
              <span className="text-white font-bold">Score: {myEntry.regularityScore.toFixed(1)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
