import type { Profile } from "@/types";

const X_SEARCH_SUFFIX = "-filter:replies -filter:retweets";

/** Contextual X search strings — no fixed account lists. */
export function buildXSearchTerms(
  profile: Profile,
  topic: string,
  sinceDate: string
): string[] {
  const since = `since:${sinceDate}`;
  const company = profile.company?.trim();
  const role = profile.role?.trim();
  const terms = new Set<string>();

  const base = `${topic} ${X_SEARCH_SUFFIX} ${since}`;
  terms.add(base);

  const keywords = topic
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4)
    .join(" ");
  if (keywords && keywords !== topic) {
    terms.add(`${keywords} ${X_SEARCH_SUFFIX} ${since}`);
  }

  if (company) {
    terms.add(`${topic} ${company} ${X_SEARCH_SUFFIX} ${since}`);
  }

  if (role) {
    const roleHint = role.split(/\s+/).slice(-2).join(" ");
    terms.add(`${topic} ${roleHint} ${X_SEARCH_SUFFIX} ${since}`);
  }

  terms.add(`${topic} strategy analysis ${X_SEARCH_SUFFIX} ${since}`);

  return [...terms].slice(0, 5);
}

/** Contextual LinkedIn keyword queries — no fixed account lists. */
export function buildLinkedInSearchKeywords(
  profile: Profile,
  topic: string
): string[] {
  const company = profile.company?.trim();
  const role = profile.role?.trim();
  const keywords = new Set<string>();

  keywords.add(topic);

  const shortTopic = topic
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3)
    .join(" ");
  if (shortTopic && shortTopic !== topic) {
    keywords.add(shortTopic);
  }

  if (company) {
    keywords.add(`${topic} ${company}`);
    keywords.add(`${company} ${shortTopic || topic}`);
  }

  if (role) {
    keywords.add(`${topic} ${role}`);
  }

  keywords.add(`${topic} enterprise strategy`);

  return [...keywords].slice(0, 5);
}
