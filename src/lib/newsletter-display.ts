import type { NewsletterConfig, ProfileFrequency, Run } from "@/types";

const FREQUENCY_DAYS: Record<ProfileFrequency, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export function displayName(newsletter: NewsletterConfig): string {
  if (newsletter.name.trim()) return newsletter.name;
  if (newsletter.topics[0]) return newsletter.topics[0];
  return "Untitled newsletter";
}

/** Estimated next send, derived from cadence since the last completed run (or creation). */
export function estimatedNextRun(
  newsletter: NewsletterConfig,
  lastRun: Run | undefined
): Date {
  const anchor = lastRun?.finished_at ?? newsletter.created_at;
  const days = FREQUENCY_DAYS[newsletter.frequency];
  return new Date(new Date(anchor).getTime() + days * 24 * 60 * 60 * 1000);
}
