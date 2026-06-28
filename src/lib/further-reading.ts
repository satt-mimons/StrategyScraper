import { getDomain, isAggregator } from "@/lib/source-quality";
import { getAnalystFirmDomains } from "@/lib/analyst-firms";
import { FURTHER_READING_PER_TOPIC } from "@/lib/constants";
import type { Profile, SelectedStory } from "@/types";

function linkLabel(story: SelectedStory): string {
  const label = story.title || story.url;
  return story.is_paywalled ? `${label} (paywalled)` : label;
}

function domainMatches(domain: string, list: string[]): boolean {
  return list.some((raw) => {
    const d = raw.replace(/^www\./, "").toLowerCase();
    return d !== "" && (domain === d || domain.endsWith(`.${d}`));
  });
}

/**
 * Credibility heuristic for ranking Further Reading. Higher = surface first.
 *
 * Substack follower counts are NOT available from Exa, so credibility is proxied by:
 * source type, named analyst-firm (MBB / Gartner / Forrester / …) domains, user-curated
 * must-read Substacks, and preferred publications. Aggregators are penalized.
 */
function credibilityScore(
  story: SelectedStory,
  profile: Profile,
  analystDomains: string[]
): number {
  const domain = getDomain(story.cite_url ?? story.url);
  let score = 0;

  // Source type: analyst > niche blog (Substack/Medium) > mainstream news.
  if (story.lane === "analyst") score += 5;
  else if (
    story.lane === "substack" ||
    story.lane === "substack-open" ||
    story.lane === "medium"
  ) {
    score += 3;
  } else {
    score += 1;
  }

  // Named analyst firms (Bain, McKinsey, BCG, Gartner, IDC, Forrester, …).
  if (domainMatches(domain, analystDomains)) score += 6;
  // User-curated must-read Substacks.
  if (domainMatches(domain, (profile.substack_urls ?? []).map(getDomain))) score += 4;
  // Preferred / credible publications.
  if (domainMatches(domain, profile.preferred_pubs ?? [])) score += 2;
  // Syndication / aggregator reprints.
  if (isAggregator(story.url)) score -= 4;

  return score;
}

/**
 * Deterministic "Further Reading" — per topic, the top few sources by credibility,
 * shown as a single "Must read" list. No "Context" list (low-signal sources are dropped).
 */
export function buildFurtherReadingSection(
  stories: SelectedStory[],
  topics: string[],
  profile: Profile
): string {
  const analystDomains = getAnalystFirmDomains(profile);
  const lines: string[] = ["## Further Reading", ""];

  const byTopic = new Map<string, SelectedStory[]>();
  for (const topic of topics) byTopic.set(topic, []);
  for (const story of stories) {
    const topic = story.primary_topic ?? topics[0] ?? "General";
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic)!.push(story);
  }

  let hasAny = false;

  for (const topic of topics) {
    const seen = new Set<string>();
    const deduped = (byTopic.get(topic) ?? []).filter((s) => {
      const key = s.cite_url ?? s.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (deduped.length === 0) continue;

    const ranked = deduped
      .sort(
        (a, b) =>
          credibilityScore(b, profile, analystDomains) -
          credibilityScore(a, profile, analystDomains)
      )
      .slice(0, FURTHER_READING_PER_TOPIC);

    hasAny = true;
    lines.push(`### ${topic}`, "", "**Must read**", "");
    for (const s of ranked) {
      lines.push(`- [${linkLabel(s)}](${s.cite_url ?? s.url})`);
    }
    lines.push("");
  }

  if (!hasAny) return "";
  return lines.join("\n").trim();
}

/** Remove legacy flat SOURCES / Sources sections before appending Further Reading. */
export function stripFlatSourcesSection(markdown: string): string {
  return markdown
    .replace(/\n##\s+(SOURCES|Sources|Source List|References)\s*\n[\s\S]*$/i, "")
    .trim();
}

export function appendFurtherReading(
  markdown: string,
  stories: SelectedStory[],
  topics: string[],
  profile: Profile
): string {
  const body = stripFlatSourcesSection(markdown);
  const section = buildFurtherReadingSection(stories, topics, profile);
  if (!section) return body;
  return `${body}\n\n${section}`;
}
