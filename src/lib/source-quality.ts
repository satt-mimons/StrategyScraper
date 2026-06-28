import type { Candidate, LinkTier, Profile, SelectedStory } from "@/types";

/** Domains never selected or cited */
export const SOURCE_DENYLIST = ["investing.com"];

/** Syndication / reprint hosts — prefer primary source when deduping */
export const AGGREGATOR_DOMAINS = [
  "investing.com",
  "msn.com",
  "news.google.com",
  "flipboard.com",
];

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isDenylisted(url: string): boolean {
  const domain = getDomain(url);
  return SOURCE_DENYLIST.some(
    (d) => domain === d || domain.endsWith(`.${d}`)
  );
}

export function isAggregator(url: string): boolean {
  const domain = getDomain(url);
  return AGGREGATOR_DOMAINS.some(
    (d) => domain === d || domain.endsWith(`.${d}`)
  );
}

/** e.g. "Raymond James via Investing.com" → "Raymond James" */
export function extractViaPrimaryName(title: string): string | null {
  const viaMatch = title.match(/\bvia\s+([^|\-–—]+)/i);
  if (viaMatch) {
    return viaMatch[1].trim().replace(/\.$/, "");
  }
  const dashVia = title.match(/([^|\-–—]+)\s+via\s+(\w+(?:\.\w+)?)/i);
  if (dashVia && isDenylisted(`https://${dashVia[2]}`)) {
    return dashVia[1].trim();
  }
  return null;
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+via\s+\S+/gi, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Pick best URL in pool for a syndicated headline (prefer non-aggregator). */
export function resolveCiteUrl(
  story: Pick<SelectedStory, "url" | "title">,
  pool: Candidate[]
): string {
  if (!isAggregator(story.url)) {
    return story.url;
  }

  const primaryName = extractViaPrimaryName(story.title);
  const titleKey = normalizeTitleKey(story.title);

  const better = pool.find((c) => {
    if (isDenylisted(c.url) || isAggregator(c.url)) return false;
    if (normalizeTitleKey(c.title) === titleKey) return true;
    if (primaryName && c.author.toLowerCase().includes(primaryName.toLowerCase())) {
      return true;
    }
    if (primaryName && c.title.toLowerCase().includes(primaryName.toLowerCase())) {
      return true;
    }
    return false;
  });

  return better?.url ?? story.url;
}

export function assignPrimaryTopic(
  story: Pick<SelectedStory, "title" | "snippet" | "highlights">,
  topics: string[]
): string {
  if (topics.length === 0) return "General";

  const text = `${story.title} ${story.snippet ?? ""} ${(story.highlights ?? []).join(" ")}`.toLowerCase();
  let best = topics[0];
  let bestScore = 0;

  for (const topic of topics) {
    const tokens = topic.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const score = tokens.reduce(
      (sum, token) => sum + (text.includes(token) ? 1 : 0),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }

  return best;
}

export function assignLinkTier(
  story: Pick<SelectedStory, "url" | "lane">,
  profile: Profile
): LinkTier {
  const domain = getDomain(story.url);
  const isCuratedSubstack = (profile.substack_urls ?? []).some((u) => {
    const d = getDomain(u);
    return d && (domain === d || domain.endsWith(`.${d}`));
  });
  if (isCuratedSubstack) return "must_read";

  if (
    story.lane === "substack" ||
    story.lane === "substack-open" ||
    story.lane === "analyst" ||
    story.lane === "medium"
  ) {
    return "must_read";
  }

  return "context";
}

