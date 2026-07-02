// Pure schedule math for scheduled sending. Given a newsletter's cadence (`frequency`), anchor
// day/hour, and IANA timezone, computeNextSendAt() returns the next UTC instant the pipeline
// should fire — strictly after `from`.
//
// DST-correctness is the whole point of this module: a scheduled "Sunday 9am America/New_York"
// send must land at 9am *local* whether the country is on EST (-05:00) or EDT (-04:00), so we
// never do naive `from + 7*24h` arithmetic. Instead we build the target wall-clock time in the
// zone and resolve it back to a UTC instant using the zone's offset *at that instant*.

import type { ProfileFrequency } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Offset of `tz` at the given instant, in ms, defined as (localWallClock - utc). West-of-UTC
 * zones are negative (e.g. America/New_York EST = -5h). Derived by formatting the instant in the
 * zone and re-reading the fields as if they were UTC.
 */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return asUTC - date.getTime();
}

/** The tz-local calendar date (year/month/day, month 1-12) of `date`. */
function localYMD(date: Date, tz: string): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}

/**
 * Resolve a wall-clock time (y/m/d h:00 in `tz`) to the UTC instant it names. Two-pass so DST
 * transitions resolve correctly: we guess the offset at the naive-UTC instant, then re-check the
 * offset at the resulting instant and correct if the guess straddled a transition.
 */
function wallTimeToUtc(
  y: number,
  m: number,
  d: number,
  hour: number,
  tz: string
): Date {
  const asUTC = Date.UTC(y, m - 1, d, hour, 0, 0);
  const off1 = tzOffsetMs(new Date(asUTC), tz);
  let utc = asUTC - off1;
  const off2 = tzOffsetMs(new Date(utc), tz);
  if (off2 !== off1) utc = asUTC - off2;
  return new Date(utc);
}

/** Add `n` whole calendar days to a y/m/d (month 1-12), via UTC arithmetic (no tz involved). */
function addDays(
  y: number,
  m: number,
  d: number,
  n: number
): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Day of week (0=Sunday..6=Saturday) for a y/m/d (month 1-12). */
function dayOfWeek(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Number of days in month `m` (1-12) of year `y`. */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Next instant of `hour:00` local time in `tz`, strictly after `from`. */
function nextDailyAt(hour: number, tz: string, from: Date): Date {
  const { y, m, d } = localYMD(from, tz);
  // Today or tomorrow always contains the next daily slot; a couple extra days of slack covers
  // DST edges where a local hour is skipped/repeated.
  for (let i = 0; i <= 3; i++) {
    const c = addDays(y, m, d, i);
    const inst = wallTimeToUtc(c.y, c.m, c.d, hour, tz);
    if (inst.getTime() > from.getTime()) return inst;
  }
  throw new Error("nextDailyAt: no slot found (unreachable)");
}

/** Next instant of weekday `send_day` at `hour:00` local in `tz`, strictly after `from`. */
function nextWeekdayAt(
  send_day: number,
  hour: number,
  tz: string,
  from: Date
): Date {
  const { y, m, d } = localYMD(from, tz);
  for (let i = 0; i <= 14; i++) {
    const c = addDays(y, m, d, i);
    if (dayOfWeek(c.y, c.m, c.d) !== send_day) continue;
    const inst = wallTimeToUtc(c.y, c.m, c.d, hour, tz);
    if (inst.getTime() > from.getTime()) return inst;
  }
  throw new Error("nextWeekdayAt: no slot found (unreachable)");
}

/**
 * First occurrence of weekday `send_day` at `hour:00` local in `tz` within a calendar month,
 * strictly after `from`. "Monthly on the first Monday", etc. Scans forward month-by-month until
 * a first-of-month weekday lands after `from`.
 */
function nextMonthlyFirstWeekday(
  send_day: number,
  hour: number,
  tz: string,
  from: Date
): Date {
  let { y, m } = localYMD(from, tz);
  for (let iter = 0; iter < 3; iter++) {
    for (let d = 1; d <= 7; d++) {
      if (dayOfWeek(y, m, d) !== send_day) continue;
      const inst = wallTimeToUtc(y, m, d, hour, tz);
      if (inst.getTime() > from.getTime()) return inst;
      break; // only the first matching weekday of this month counts
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  throw new Error("nextMonthlyFirstWeekday: no slot found (unreachable)");
}

/**
 * Occurrence of day-of-month `dayOfMonth` at `hour:00` local in `tz`, strictly after `from`.
 * "Monthly on the 15th", etc. A `dayOfMonth` past the current month's length clamps to that
 * month's last day (so 31 lands on Feb 28/29, Apr 30, …) rather than skipping the month.
 */
function nextMonthlyByDate(
  dayOfMonth: number,
  hour: number,
  tz: string,
  from: Date
): Date {
  let { y, m } = localYMD(from, tz);
  for (let iter = 0; iter < 3; iter++) {
    const d = Math.min(dayOfMonth, daysInMonth(y, m));
    const inst = wallTimeToUtc(y, m, d, hour, tz);
    if (inst.getTime() > from.getTime()) return inst;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  throw new Error("nextMonthlyByDate: no slot found (unreachable)");
}

/**
 * Next UTC instant a newsletter with this cadence should send, strictly after `from`.
 *
 * - `daily`:    every day at send_hour (send_day ignored).
 * - `weekly`:   send_day each week.
 * - `biweekly`: send_day every 14 days. When `from` is itself a send instant (the recurring
 *               case) the immediate next weekday is only +7 days, so we skip a week to keep the
 *               ~14-day cadence.
 * - `monthly`:  when `send_month_day` is set, that day of the month (e.g. "the 15th"); otherwise
 *               the first send_day of each month (e.g. "first Monday").
 *
 * @param send_day 0=Sunday..6=Saturday; required for weekly/biweekly and for monthly when
 *   send_month_day is not set. Ignored for daily.
 * @param send_hour local hour 0-23 in `tz`.
 * @param tz IANA timezone name (e.g. "America/New_York").
 * @param from lower bound; the result is always strictly greater. Defaults to now.
 * @param send_month_day monthly-only day-of-month override (1-31); null/undefined = first weekday.
 */
export function computeNextSendAt(
  frequency: ProfileFrequency,
  send_day: number | null,
  send_hour: number,
  tz: string,
  from: Date = new Date(),
  send_month_day: number | null = null
): Date {
  if (frequency === "daily") {
    return nextDailyAt(send_hour, tz, from);
  }

  // Monthly-by-date needs no weekday anchor, so resolve it before the send_day requirement.
  if (frequency === "monthly" && send_month_day != null) {
    return nextMonthlyByDate(send_month_day, send_hour, tz, from);
  }

  if (send_day === null) {
    throw new Error(`send_day is required for ${frequency} schedules`);
  }

  if (frequency === "weekly") {
    return nextWeekdayAt(send_day, send_hour, tz, from);
  }

  if (frequency === "biweekly") {
    let next = nextWeekdayAt(send_day, send_hour, tz, from);
    if (next.getTime() - from.getTime() < 14 * DAY_MS) {
      next = nextWeekdayAt(send_day, send_hour, tz, next);
    }
    return next;
  }

  if (frequency === "monthly") {
    return nextMonthlyFirstWeekday(send_day, send_hour, tz, from);
  }

  throw new Error(`Unknown frequency: ${frequency as string}`);
}
