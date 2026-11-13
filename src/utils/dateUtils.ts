export const IST_TIMEZONE = 'Asia/Kolkata';

function toDate(input?: Date | number | string): Date {
  if (input === undefined || input === null) return new Date();
  if (input instanceof Date) return isNaN(input.getTime()) ? new Date() : input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Returns YYYY-MM-DD in Asia/Kolkata (IST) timezone.
 */
export function getISTDateStr(input?: Date | number | string): string {
  const date = toDate(input);
  // en-CA formats deterministically as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Returns HH:mm:ss (24-hour) in Asia/Kolkata (IST) timezone.
 */
export function getISTTimeStr(input?: Date | number | string): string {
  const date = toDate(input);
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
  return formatted.startsWith('24:') ? `00:${formatted.slice(3)}` : formatted;
}

/**
 * Returns HH:mm (24-hour) in Asia/Kolkata (IST) timezone.
 */
export function getISTHourMinute(input?: Date | number | string): string {
  return getISTTimeStr(input).slice(0, 5);
}

/**
 * Returns formatted 12-hour clock string in Asia/Kolkata for navbar displays.
 */
export function getISTClockTime(input?: Date | number): string {
  const date = toDate(input);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Returns formatted short date display in Asia/Kolkata (e.g., "Fri, Nov 13, 2026").
 */
export function getISTDisplayDate(input?: Date | number): string {
  const date = toDate(input);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/**
 * Returns full IST timestamp label (e.g. "2026-11-13 10:15:30 IST").
 */
export function getISTTimestampDisplay(input?: Date | number): string {
  return `${getISTDateStr(input)} ${getISTTimeStr(input)} IST`;
}

/**
 * Returns year, 1-indexed month (1-12), and day (1-31) in Asia/Kolkata.
 */
export function getISTYearMonthDay(input?: Date | number | string): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = getISTDateStr(input).split('-').map((n) => parseInt(n, 10));
  return { year: y, month: m, day: d };
}

/**
 * Returns weekday label for a YYYY-MM-DD date string safely anchored at IST noon.
 */
export function getISTWeekdayName(
  dateStr: string,
  format: 'short' | 'long' = 'short'
): string {
  if (!isValidDateStr(dateStr)) return '';
  const anchored = new Date(`${dateStr}T12:00:00+05:30`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    weekday: format,
  }).format(anchored);
}

/**
 * Formats a YYYY-MM-DD date string into a readable date in IST (e.g., "Friday, November 13, 2026").
 */
export function formatISTDateFull(dateStr: string): string {
  if (!isValidDateStr(dateStr)) return dateStr;
  const anchored = new Date(`${dateStr}T12:00:00+05:30`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(anchored);
}

/**
 * Safely shifts a YYYY-MM-DD string by N days in IST without UTC day-boundary drift.
 */
export function addDaysIST(dateStr: string, days: number): string {
  if (!isValidDateStr(dateStr)) return getISTDateStr();
  const anchored = new Date(`${dateStr}T12:00:00+05:30`);
  const shifted = new Date(anchored.getTime() + days * 86400000);
  return getISTDateStr(shifted);
}

/**
 * Safely shifts a YYYY-MM-DD string by N months in IST.
 */
export function addMonthsIST(dateStr: string, months: number): string {
  if (!isValidDateStr(dateStr)) return getISTDateStr();
  const anchored = new Date(`${dateStr}T12:00:00+05:30`);
  anchored.setMonth(anchored.getMonth() + months);
  return getISTDateStr(anchored);
}

/**
 * Generates the past `count` calendar dates ending on `endDateStr` (default: today IST).
 */
export function getPastISTDates(
  count: number,
  endDateStr?: string
): Array<{ date: string; dayName: string; shortLabel: string }> {
  const end = endDateStr && isValidDateStr(endDateStr) ? endDateStr : getISTDateStr();
  const result: Array<{ date: string; dayName: string; shortLabel: string }> = [];

  for (let i = count - 1; i >= 0; i--) {
    const date = addDaysIST(end, -i);
    const dayName = getISTWeekdayName(date, 'short');
    const parts = date.split('-');
    const shortLabel = `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}`;
    result.push({ date, dayName, shortLabel });
  }

  return result;
}

export function isValidDateStr(dateStr: string): boolean {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isValidDeadlineHHMM(hhmm: string): boolean {
  return typeof hhmm === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(hhmm.trim());
}

/**
 * Returns true if the current IST time has strictly passed or reached the configured deadline (HH:mm).
 * Unscanned students are ONLY marked absent after this deadline.
 */
export function isAfterISTDeadline(deadlineHHMM: string = '10:30', now?: Date | number): boolean {
  const cleanDeadline = isValidDeadlineHHMM(deadlineHHMM) ? deadlineHHMM.trim() : '10:30';
  const currentHHMM = getISTHourMinute(now);
  return currentHHMM >= cleanDeadline;
}
