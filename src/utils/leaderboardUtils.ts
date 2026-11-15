import {
  AchievementBadge,
  AchievementId,
  AttendanceRecord,
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardSnapshot,
  Student,
  WorkingDayConfig,
} from '../types';
import {
  addDaysIST,
  getISTWeekdayName,
  isValidDateStr,
  normalizeToISODate,
} from './dateUtils';

export const ACHIEVEMENT_DEFINITIONS: Record<AchievementId, AchievementBadge> = {
  attendance_champion: {
    id: 'attendance_champion',
    title: 'Attendance Champion',
    description: 'Ranked #1 in regularity for the selected period',
    icon: 'gem',
    criteriaLabel: 'Rank #1',
  },
  perfect_attendance: {
    id: 'perfect_attendance',
    title: 'Perfect Attendance',
    description: 'Maintained 100% attendance across all working days in period',
    icon: 'trophy',
    criteriaLabel: '100% Attendance',
  },
  regular_student: {
    id: 'regular_student',
    title: 'Regular Student',
    description: 'Achieved 95% or higher attendance across the period',
    icon: 'star',
    criteriaLabel: '95%+ Attendance',
  },
  streak_30: {
    id: 'streak_30',
    title: '30-Day Streak',
    description: 'Attended 30 or more consecutive working days',
    icon: 'flame',
    criteriaLabel: '30+ Working Days',
  },
  streak_7: {
    id: 'streak_7',
    title: '7-Day Streak',
    description: 'Attended 7 or more consecutive working days',
    icon: 'flame',
    criteriaLabel: '7+ Working Days',
  },
};

export const LEADERBOARD_PERIOD_META: Record<
  LeaderboardPeriod,
  { label: string; shortLabel: string; description: string }
> = {
  overall: {
    label: 'Overall Attendance',
    shortLabel: 'Overall',
    description: 'Cumulative academic regularity across all recorded working days',
  },
  weekly: {
    label: 'Weekly Leaderboard',
    shortLabel: 'Weekly (7d)',
    description: 'Attendance regularity across the past 7 IST days',
  },
  monthly: {
    label: 'Monthly Leaderboard',
    shortLabel: 'Monthly (30d)',
    description: 'Attendance regularity across the past 30 IST days',
  },
  semester: {
    label: 'Semester Leaderboard',
    shortLabel: 'Semester (180d)',
    description: 'Attendance regularity across the current 180-day semester window',
  },
};

export function isStudentEligibleForLeaderboard(student?: Student | null): boolean {
  if (!student) return false;
  return (
    student.status === 'active' &&
    !student.isSuspended &&
    !(student.activeSuspension && student.activeSuspension.status === 'active')
  );
}

export function getPeriodDateBounds(
  period: LeaderboardPeriod,
  todayStr: string,
  allWorkingDates: string[]
): { startDate: string; endDate: string } {
  const safeToday = isValidDateStr(todayStr) ? todayStr : allWorkingDates[allWorkingDates.length - 1] || todayStr;
  if (period === 'weekly') {
    return { startDate: addDaysIST(safeToday, -6), endDate: safeToday };
  }
  if (period === 'monthly') {
    return { startDate: addDaysIST(safeToday, -29), endDate: safeToday };
  }
  if (period === 'semester') {
    return { startDate: addDaysIST(safeToday, -179), endDate: safeToday };
  }
  const earliest = allWorkingDates.length > 0 ? allWorkingDates[0] : safeToday;
  return { startDate: earliest, endDate: safeToday };
}

/**
 * Returns chronologically sorted YYYY-MM-DD working dates for the specified period.
 * Strictly excludes:
 * - Invalid dates
 * - Future dates (> todayStr)
 * - Sundays (IST)
 * - Holidays & officially declared college closures in workingDays
 */
export function getEligibleWorkingDatesForPeriod(
  allAttendance: Record<string, Record<string, AttendanceRecord>>,
  workingDays: Record<string, WorkingDayConfig>,
  todayStr: string,
  period: LeaderboardPeriod
): string[] {
  const dateSet = new Set<string>();

  Object.keys(allAttendance || {}).forEach((d) => {
    if (!d || !isValidDateStr(d) || d > todayStr) return;
    const dayMap = allAttendance[d];
    if (dayMap && Object.values(dayMap).some((r) => r && !r.isDeleted)) {
      dateSet.add(d);
    }
  });

  Object.keys(workingDays || {}).forEach((d) => {
    if (!d || !isValidDateStr(d) || d > todayStr) return;
    const cfg = workingDays[d];
    if (cfg && !cfg.isHoliday) {
      dateSet.add(d);
    }
  });

  const sortedAll = Array.from(dateSet)
    .filter((d) => {
      if (workingDays?.[d]?.isHoliday) return false;
      const weekday = getISTWeekdayName(d, 'short');
      if (weekday === 'Sun') return false;
      return true;
    })
    .sort();

  if (period === 'overall') {
    return sortedAll;
  }

  const { startDate, endDate } = getPeriodDateBounds(period, todayStr, sortedAll);
  return sortedAll.filter((d) => d >= startDate && d <= endDate);
}

/**
 * Computes unlocked automatic achievement badges for a student entry.
 */
export function computeStudentAchievements(params: {
  rank: number;
  presentDays: number;
  totalWorkingDays: number;
  attendancePercentage: number;
  currentStreak: number;
  longestStreak: number;
}): AchievementBadge[] {
  const {
    rank,
    presentDays,
    totalWorkingDays,
    attendancePercentage,
    currentStreak,
    longestStreak,
  } = params;

  const badges: AchievementBadge[] = [];

  if (rank === 1 && presentDays > 0) {
    badges.push(ACHIEVEMENT_DEFINITIONS.attendance_champion);
  }
  if (totalWorkingDays > 0 && presentDays === totalWorkingDays && attendancePercentage >= 100) {
    badges.push(ACHIEVEMENT_DEFINITIONS.perfect_attendance);
  }
  if (totalWorkingDays > 0 && attendancePercentage >= 95) {
    badges.push(ACHIEVEMENT_DEFINITIONS.regular_student);
  }
  if (longestStreak >= 30 || currentStreak >= 30) {
    badges.push(ACHIEVEMENT_DEFINITIONS.streak_30);
  }
  if (longestStreak >= 7 || currentStreak >= 7) {
    badges.push(ACHIEVEMENT_DEFINITIONS.streak_7);
  }

  return badges;
}

function getEffectiveStudentStartDate(
  student: Student,
  periodWorkingDates: string[],
  normalizedRecordsByDate: Record<string, AttendanceRecord>
): string | null {
  const regDate = normalizeToISODate(student.registeredAt);
  const validRecordDates: string[] = [];

  Object.entries(normalizedRecordsByDate).forEach(([dateKey, rec]) => {
    if (!rec || rec.isDeleted) return;
    if (!isValidDateStr(dateKey)) return;
    validRecordDates.push(dateKey);
  });

  validRecordDates.sort();
  const earliestRecordDate: string | null = validRecordDates.length > 0 ? validRecordDates[0] : null;

  if (regDate && earliestRecordDate) {
    return earliestRecordDate < regDate ? earliestRecordDate : regDate;
  }
  if (regDate) return regDate;
  if (earliestRecordDate) return earliestRecordDate;
  return periodWorkingDates[0] || null;
}

/**
 * Computes sanitized (non-PII) leaderboard metrics and streaks for a single student.
 */
export function computeSingleStudentLeaderboardEntry(params: {
  student: Student;
  studentDbId: string;
  periodWorkingDates: string[];
  todayStr: string;
  isAfterDeadline: boolean;
}): LeaderboardEntry {
  const { student, studentDbId, periodWorkingDates, todayStr, isAfterDeadline } = params;
  const rawAttendance = student.attendance || {};
  const recordsByDate: Record<string, AttendanceRecord> = {};

  Object.entries(rawAttendance).forEach(([dateKey, rec]) => {
    if (!rec || rec.isDeleted) return;
    const cleanDate = isValidDateStr(rec.date || '') ? rec.date : dateKey;
    if (!isValidDateStr(cleanDate)) return;
    // Duplicate RFID scans on the same date resolve to 1 normalized attendance day
    if (!recordsByDate[cleanDate] || rec.status === 'Present') {
      recordsByDate[cleanDate] = rec;
    }
  });

  const effectiveStartDate = getEffectiveStudentStartDate(student, periodWorkingDates, recordsByDate);

  // Filter working dates eligible for this specific student and account for today's pending window
  const evaluatedDates = periodWorkingDates.filter((d) => {
    if (effectiveStartDate && d < effectiveStartDate) return false;
    if (d < todayStr) return true;
    if (d === todayStr) {
      const todayRec = recordsByDate[todayStr];
      if (todayRec && (todayRec.status === 'Present' || todayRec.status === 'Absent' || todayRec.status === 'Late')) {
        return true;
      }
      return isAfterDeadline;
    }
    return false;
  });

  let presentDays = 0;
  let runningStreak = 0;
  let longestStreak = 0;

  evaluatedDates.forEach((d) => {
    const rec = recordsByDate[d];
    const isPresent = Boolean(rec && rec.status === 'Present');
    if (isPresent) {
      presentDays += 1;
      runningStreak += 1;
      if (runningStreak > longestStreak) {
        longestStreak = runningStreak;
      }
    } else {
      runningStreak = 0;
    }
  });

  const currentStreak = runningStreak;
  const totalWorkingDays = evaluatedDates.length;
  const absentDays = Math.max(0, totalWorkingDays - presentDays);

  const attendancePercentage =
    totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 1000) / 10 : 0;

  const streakFactor =
    totalWorkingDays > 0
      ? ((0.55 * longestStreak + 0.45 * currentStreak) / totalWorkingDays) * 100
      : 0;

  const consistencyScore =
    totalWorkingDays > 0 && presentDays > 0
      ? Math.round(Math.min(100, Math.max(0, 0.7 * streakFactor + 0.3 * attendancePercentage)) * 10) / 10
      : 0;

  const regularityScore =
    totalWorkingDays > 0
      ? Math.round((0.7 * attendancePercentage + 0.3 * consistencyScore) * 10) / 10
      : 0;

  const todayRec = recordsByDate[todayStr];
  const isTodayPresent = Boolean(todayRec && todayRec.status === 'Present');

  const achievements = computeStudentAchievements({
    rank: 0,
    presentDays,
    totalWorkingDays,
    attendancePercentage,
    currentStreak,
    longestStreak,
  });

  return {
    studentDbId,
    rank: 0,
    name: student.name || 'Student',
    studentId: student.studentId || 'STU-000',
    ...(student.avatar ? { avatar: student.avatar } : {}),
    department: student.department || 'General',
    year: student.year || 'N/A',
    semester: student.semester || 'N/A',
    presentDays,
    totalWorkingDays,
    absentDays,
    attendancePercentage,
    currentStreak,
    longestStreak,
    consistencyScore,
    regularityScore,
    achievements,
    isTodayPresent,
  };
}

/**
 * Deterministic multi-level tie-breaker comparator:
 * 1. Regularity Score (desc)
 * 2. Higher Attendance Percentage (desc)
 * 3. Longer Current Attendance Streak (desc)
 * 4. Higher Total Present Days (desc)
 * 5. Longer Longest Streak (desc)
 * 6. Alphabetical Name (asc)
 * 7. Roll Number / Student ID (asc)
 */
export function compareLeaderboardEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.regularityScore !== a.regularityScore) {
    return b.regularityScore - a.regularityScore;
  }
  if (b.attendancePercentage !== a.attendancePercentage) {
    return b.attendancePercentage - a.attendancePercentage;
  }
  if (b.currentStreak !== a.currentStreak) {
    return b.currentStreak - a.currentStreak;
  }
  if (b.presentDays !== a.presentDays) {
    return b.presentDays - a.presentDays;
  }
  if (b.longestStreak !== a.longestStreak) {
    return b.longestStreak - a.longestStreak;
  }
  const nameCmp = (a.name || '').localeCompare(b.name || '');
  if (nameCmp !== 0) return nameCmp;
  return (a.studentId || '').localeCompare(b.studentId || '');
}

/**
 * Builds the complete, strictly sanitized LeaderboardSnapshot for a given period.
 */
export function computeLeaderboardSnapshot(params: {
  studentsMap: Record<string, Student>;
  allAttendance: Record<string, Record<string, AttendanceRecord>>;
  workingDays: Record<string, WorkingDayConfig>;
  todayStr: string;
  isAfterDeadline: boolean;
  period: LeaderboardPeriod;
}): LeaderboardSnapshot {
  const { studentsMap, allAttendance, workingDays, todayStr, isAfterDeadline, period } = params;

  const periodWorkingDates = getEligibleWorkingDatesForPeriod(
    allAttendance,
    workingDays,
    todayStr,
    period
  );

  const bounds = getPeriodDateBounds(period, todayStr, periodWorkingDates);
  const rawEntries: LeaderboardEntry[] = [];

  Object.entries(studentsMap || {}).forEach(([dbKey, student]) => {
    if (!isStudentEligibleForLeaderboard(student)) return;
    const cleanDbId = (student.studentDbId || dbKey).trim();
    if (!cleanDbId) return;

    rawEntries.push(
      computeSingleStudentLeaderboardEntry({
        student,
        studentDbId: cleanDbId,
        periodWorkingDates,
        todayStr,
        isAfterDeadline,
      })
    );
  });

  rawEntries.sort(compareLeaderboardEntries);

  const rankedEntries: LeaderboardEntry[] = rawEntries.map((entry, idx) => {
    const rank = idx + 1;
    return {
      ...entry,
      rank,
      achievements: computeStudentAchievements({
        rank,
        presentDays: entry.presentDays,
        totalWorkingDays: entry.totalWorkingDays,
        attendancePercentage: entry.attendancePercentage,
        currentStreak: entry.currentStreak,
        longestStreak: entry.longestStreak,
      }),
    };
  });

  return {
    period,
    periodLabel: LEADERBOARD_PERIOD_META[period].label,
    startDate: periodWorkingDates[0] || bounds.startDate,
    endDate: bounds.endDate,
    updatedAt: Date.now(),
    totalEligibleStudents: rankedEntries.length,
    totalWorkingDays: periodWorkingDates.length,
    entries: rankedEntries,
  };
}

/**
 * Merges a logged-in student's live client-side record into a shared RTDB LeaderboardSnapshot
 * so live RFID check-ins reflect immediately in the student's rank & streaks even without an Admin session online.
 */
export function mergeStudentLiveEntryIntoSnapshot(params: {
  snapshot: LeaderboardSnapshot;
  student: Student | null;
  studentDbId: string;
  allAttendance: Record<string, Record<string, AttendanceRecord>>;
  workingDays: Record<string, WorkingDayConfig>;
  todayStr: string;
  isAfterDeadline: boolean;
}): LeaderboardSnapshot {
  const { snapshot, student, studentDbId, allAttendance, workingDays, todayStr, isAfterDeadline } = params;
  if (!student || !studentDbId || !isStudentEligibleForLeaderboard(student)) {
    return snapshot;
  }

  const periodWorkingDates = getEligibleWorkingDatesForPeriod(
    allAttendance,
    workingDays,
    todayStr,
    snapshot.period
  );

  const liveEntry = computeSingleStudentLeaderboardEntry({
    student,
    studentDbId,
    periodWorkingDates,
    todayStr,
    isAfterDeadline,
  });

  const existingEntries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
  const filtered = existingEntries.filter((e) => e.studentDbId !== studentDbId);
  const merged = [...filtered, liveEntry].sort(compareLeaderboardEntries);

  const reRanked: LeaderboardEntry[] = merged.map((entry, idx) => {
    const rank = idx + 1;
    return {
      ...entry,
      rank,
      achievements: computeStudentAchievements({
        rank,
        presentDays: entry.presentDays,
        totalWorkingDays: entry.totalWorkingDays,
        attendancePercentage: entry.attendancePercentage,
        currentStreak: entry.currentStreak,
        longestStreak: entry.longestStreak,
      }),
    };
  });

  return {
    ...snapshot,
    totalEligibleStudents: reRanked.length,
    totalWorkingDays: Math.max(snapshot.totalWorkingDays, periodWorkingDates.length),
    entries: reRanked,
  };
}

/**
 * Deterministic signature used to avoid redundant Firebase RTDB writes
 * when computed rankings have not changed.
 */
export function computeLeaderboardSignature(snapshots: Record<LeaderboardPeriod, LeaderboardSnapshot>): string {
  const periods: LeaderboardPeriod[] = ['overall', 'weekly', 'monthly', 'semester'];
  return periods
    .map((p) => {
      const snap = snapshots[p];
      if (!snap) return `${p}:empty`;
      const rows = (snap.entries || [])
        .map(
          (e) =>
            `${e.studentDbId}:${e.rank}:${e.presentDays}:${e.totalWorkingDays}:${e.currentStreak}:${e.longestStreak}:${e.regularityScore}:${e.attendancePercentage}:${e.isTodayPresent ? 1 : 0}`
        )
        .join(',');
      return `${p}|${snap.totalWorkingDays}|${snap.totalEligibleStudents}|${rows}`;
    })
    .join('||');
}

export interface StudentMotivationalInsight {
  headline: string;
  subtext: string;
  tone: 'gold' | 'emerald' | 'blue' | 'amber';
}

/**
 * Generates contextual motivational feedback for a student based on live leaderboard position.
 */
export function getStudentMotivationalMessage(
  entry: LeaderboardEntry | null,
  totalStudents: number
): StudentMotivationalInsight {
  if (!entry || totalStudents === 0) {
    return {
      headline: 'Start Building Your Streak Today',
      subtext: 'Scan your RFID card on working days to climb the attendance regularity rankings.',
      tone: 'blue',
    };
  }

  if (entry.rank === 1 && entry.presentDays > 0) {
    return {
      headline: "Congratulations! You are today's most regular student!",
      subtext: `Rank #1 out of ${totalStudents} students with a ${entry.regularityScore.toFixed(1)} regularity score and ${entry.currentStreak}-day streak.`,
      tone: 'gold',
    };
  }

  if (entry.rank <= 3 && entry.presentDays > 0) {
    return {
      headline: 'You are in the Top 3!',
      subtext: `Currently ranked #${entry.rank} of ${totalStudents} with ${entry.attendancePercentage.toFixed(1)}% attendance. Keep your ${entry.currentStreak}-day streak alive!`,
      tone: 'gold',
    };
  }

  if (entry.rank <= 10) {
    const gapToTop3 = entry.rank - 3;
    return {
      headline: `You are in the Top 10 (#${entry.rank})!`,
      subtext: `Just ${gapToTop3} position${gapToTop3 === 1 ? '' : 's'} away from the Top 3 podium. Maintain your daily streak to move up!`,
      tone: 'emerald',
    };
  }

  const gapToTop10 = entry.rank - 10;
  if (gapToTop10 <= 5) {
    return {
      headline: `Just ${gapToTop10} position${gapToTop10 === 1 ? '' : 's'} away from the Top 10!`,
      subtext: 'Consistent daily check-ins boost both your attendance rate and streak consistency bonus.',
      tone: 'blue',
    };
  }

  return {
    headline: 'Maintain your streak to improve your ranking!',
    subtext: `Currently #${entry.rank} of ${totalStudents}. Every consecutive working day increases your 30% consistency score.`,
    tone: 'amber',
  };
}

function escapeCsvField(val: string | number): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an Excel-compatible UTF-8 BOM CSV file string for the leaderboard.
 */
export function buildLeaderboardCsvContent(
  entries: LeaderboardEntry[],
  periodLabel: string
): string {
  const headers = [
    'Rank',
    'Student Name',
    'Roll Number',
    'Department',
    'Academic Year',
    'Semester',
    'Present Days',
    'Total Working Days',
    'Absent Days',
    'Attendance %',
    'Current Streak (Days)',
    'Longest Streak (Days)',
    'Consistency Score',
    'Regularity Score',
    'Achievements',
    'Period',
  ];

  const rows = entries.map((e) => [
    e.rank,
    e.name,
    e.studentId,
    e.department,
    e.year,
    e.semester,
    e.presentDays,
    e.totalWorkingDays,
    e.absentDays,
    `${e.attendancePercentage.toFixed(1)}%`,
    e.currentStreak,
    e.longestStreak,
    e.consistencyScore.toFixed(1),
    e.regularityScore.toFixed(1),
    e.achievements.map((a) => a.title).join('; ') || 'None',
    periodLabel,
  ]);

  const lines = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((r) => r.map(escapeCsvField).join(',')),
  ];

  return '\uFEFF' + lines.join('\r\n');
}

export function exportLeaderboardToCsv(
  entries: LeaderboardEntry[],
  period: LeaderboardPeriod,
  periodLabel: string
): void {
  const csvContent = buildLeaderboardCsvContent(entries, periodLabel);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const timestamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `attendance-leaderboard-${period}-${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
