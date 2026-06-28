import type { Profile, ProfileFrequency } from "@/types";

export type RecencyLane = "news" | "analyst" | "substack" | "medium";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Strict maximum source age (days) for the selected send frequency. Sources dated older
 * than this are never fetched or used — there is NO window widening / escalation.
 * weekly = 7d, biweekly = 14d, monthly = 30d, daily = 1d.
 */
export function getStrictWindowDays(
  frequency: ProfileFrequency = "weekly"
): number {
  switch (frequency) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "monthly":
      return 30;
  }
}

export function cutoffFromLookbackDays(lookbackDays: number): Date {
  return new Date(Date.now() - lookbackDays * MS_PER_DAY);
}

/** Strict recency cutoff (identical for every lane) derived from send frequency. */
export function buildLaneRecencyCutoffs(
  profile: Profile
): Record<RecencyLane, Date> {
  const cutoff = cutoffFromLookbackDays(getStrictWindowDays(profile.frequency));
  return {
    news: cutoff,
    analyst: cutoff,
    substack: cutoff,
    medium: cutoff,
  };
}

/** True when a published date is present AND older than the strict cutoff. */
export function isOlderThanCutoff(
  publishedDate: string | null | undefined,
  cutoff: Date
): boolean {
  if (!publishedDate) return false; // unknown date — cannot prove it's stale; keep it
  const t = new Date(publishedDate).getTime();
  if (Number.isNaN(t)) return false;
  return t < cutoff.getTime();
}
