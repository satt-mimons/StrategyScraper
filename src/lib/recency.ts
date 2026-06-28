import { ESCALATION_MAX_LOOKBACK_DAYS } from "@/lib/constants";
import { getLastSuccessfulRunDate } from "@/lib/supabase";
import type { Profile, ProfileFrequency } from "@/types";

export type RecencyLane =
  | "news"
  | "analyst"
  | "substack"
  | "medium"
  | "x"
  | "linkedin";

export type LaneRecencyWindows = Record<RecencyLane, number>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Per-lane base lookback (days) derived from send frequency. */
export function getBaseLookbackDays(
  frequency: ProfileFrequency = "weekly"
): LaneRecencyWindows {
  switch (frequency) {
    case "daily":
      return {
        news: 1,
        analyst: 7,
        substack: 7,
        medium: 7,
        x: 3,
        linkedin: 7,
      };
    case "weekly":
      return {
        news: 3,
        analyst: 7,
        substack: 7,
        medium: 7,
        x: 7,
        linkedin: 7,
      };
    case "biweekly":
      return {
        news: 5,
        analyst: 10,
        substack: 10,
        medium: 10,
        x: 10,
        linkedin: 10,
      };
    case "monthly":
      return {
        news: 7,
        analyst: 14,
        substack: 14,
        medium: 14,
        x: 14,
        linkedin: 14,
      };
  }
}

/**
 * lookback_days = max(daysSinceLastSend, base_window)
 * Uses day counts — NOT max(lastSend, now - base) on timestamps (that picks the recent
 * timestamp and recreates the ~42-minute-window bug).
 */
export function computeLookbackDays(
  daysSinceLastSend: number | null,
  baseWindowDays: number
): number {
  const sinceSend =
    daysSinceLastSend != null ? daysSinceLastSend : baseWindowDays;
  return Math.min(
    Math.max(sinceSend, baseWindowDays),
    ESCALATION_MAX_LOOKBACK_DAYS
  );
}

export function cutoffFromLookbackDays(lookbackDays: number): Date {
  return new Date(Date.now() - lookbackDays * MS_PER_DAY);
}

export function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / MS_PER_DAY;
}

/** Widen an existing cutoff by multiplier (2× or 4× lookback), capped at ~30d. */
export function widenCutoff(baseCutoff: Date, multiplier: 2 | 4): Date {
  const baseDays = daysSince(baseCutoff);
  return cutoffFromLookbackDays(
    Math.min(baseDays * multiplier, ESCALATION_MAX_LOOKBACK_DAYS)
  );
}

export async function buildLaneRecencyCutoffs(
  profile: Profile
): Promise<Record<RecencyLane, Date>> {
  const lastRun = await getLastSuccessfulRunDate();
  const daysSinceLastSend = lastRun ? daysSince(lastRun) : null;
  const base = getBaseLookbackDays(profile.frequency);

  return {
    news: cutoffFromLookbackDays(
      computeLookbackDays(daysSinceLastSend, base.news)
    ),
    analyst: cutoffFromLookbackDays(
      computeLookbackDays(daysSinceLastSend, base.analyst)
    ),
    substack: cutoffFromLookbackDays(
      computeLookbackDays(daysSinceLastSend, base.substack)
    ),
    medium: cutoffFromLookbackDays(
      computeLookbackDays(daysSinceLastSend, base.medium)
    ),
    x: cutoffFromLookbackDays(
      computeLookbackDays(daysSinceLastSend, base.x)
    ),
    linkedin: cutoffFromLookbackDays(
      computeLookbackDays(daysSinceLastSend, base.linkedin)
    ),
  };
}
