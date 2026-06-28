import { callLLM } from "@/lib/anthropic";
import {
  DEFAULT_TONE_SPEC,
  MAX_WORD_COUNT,
  TLDR_BULLET_MIN,
  TLDR_BULLET_MAX,
  CLUSTER_DISTINCT_STORY_MIN,
  CLUSTER_DISTINCT_STORY_MAX,
} from "@/lib/constants";
import {
  allClusterUrls,
  flattenClusterSources,
} from "@/agents/cluster";
import { appendFurtherReading } from "@/lib/further-reading";
import { validateLinkIntegrity, countWordsExcludingLinks } from "@/lib/utils";
import type { ClusteredStory, CostTracker, Profile } from "@/types";

export async function runReporterAgent(
  clusters: ClusteredStory[],
  profile: Profile,
  tracker: CostTracker
): Promise<string> {
  const flatSources = flattenClusterSources(clusters);
  const allowedUrls = new Set(allClusterUrls(clusters));
  const topicOrder = profile.topics;
  const toneSpec = profile.tone_spec || DEFAULT_TONE_SPEC;

  const topicSections = topicOrder
    .map((topic) => {
      const topicClusters = clusters.filter((c) => c.primary_topic === topic);
      const hasMainstream = topicClusters.some((c) =>
        c.source_types.includes("mainstream")
      );
      const hasNiche = topicClusters.some((c) =>
        c.source_types.includes("niche_blog") || c.source_types.includes("analyst")
      );
      return {
        topic,
        has_mainstream: hasMainstream,
        has_niche_or_analyst: hasNiche,
        clusters: topicClusters.map((c) => ({
          headline: c.headline,
          source_count: c.source_count,
          source_types: c.source_types,
          lead_url: c.lead_url,
          cluster_note: c.cluster_note,
          sources: c.sources.map((s) => ({
            url: s.url,
            title: s.title,
            source_type: s.source_type,
            lane: s.lane,
            author: s.author,
            snippet: s.snippet,
            highlights: s.highlights,
            is_paywalled: s.is_paywalled,
            link_tier: s.link_tier,
          })),
        })),
      };
    })
    .filter((section) => section.clusters.length > 0);

  const system = `You are a reporter agent drafting a strategy newsletter (§9).

Tone spec (§14) — apply to every sharp take:
${toneSpec}

You receive DISTINCT STORIES (clusters). Each cluster = one bullet in its topic section.
Each cluster may include multiple source URLs covering the same underlying event.

STRUCTURE (strict — follow exactly):

1. ## TLDR
   ${TLDR_BULLET_MIN}–${TLDR_BULLET_MAX} bullets. Cross-topic highlights — one bullet per major cluster where possible. Scan-friendly.

2. TOPIC SECTIONS — one ## section per profile topic that has qualifying clusters this week.
   Section title = the exact topic name. Write sections in this order: ${topicOrder.join(" → ")}
   Skip topics with zero clusters.

3. WITHIN EACH TOPIC SECTION — one markdown bullet (- ) per distinct story (cluster). NO paragraph prose blocks.
   For each bullet:
   a) Open with a **bold topic sentence** stating the story's core point (reader can scan bold lines only).
   b) Follow with a 2–4 sentence sharp take in the configured voice (tone spec).
   c) Cite MULTIPLE SOURCES inline from that cluster's sources[] — use markdown [text](url). When source_count > 1, show breadth (e.g. "reported across N outlets this week" using the cluster's source_count, or name mainstream + niche channels).
   d) Prefer citing at least two URLs per cluster when available; use lead_url plus additional sources.

SECTION COMPOSITION:
- Across each topic section, ensure at least one bullet draws on a mainstream source AND at least one bullet draws on a niche_blog or analyst source, where those types exist in that section's clusters.
- Target ${CLUSTER_DISTINCT_STORY_MIN}–${CLUSTER_DISTINCT_STORY_MAX} distinct story bullets total across all sections, drawing on 20–30 source URLs.

LENGTH:
- Maximum ~${MAX_WORD_COUNT} words excluding hyperlink URLs. Further Reading is appended separately — do not write it.

LINK & PAYWALL RULES:
- ONLY cite URLs from allowed_urls — never invent URLs
- Paywalled sources: headline + snippet + link labeled (paywalled); summarize ONLY from snippet/highlights provided

Write for a ${profile.role || "professional"} at ${profile.company || "their company"}.
Do NOT add a flat SOURCES list — Further Reading is appended automatically.

Return markdown only. No preamble.`;

  const user = JSON.stringify({
    topic_sections: topicSections,
    distinct_story_count: clusters.length,
    total_source_count: flatSources.length,
    allowed_urls: [...allowedUrls],
  });

  let draft = await callLLM("sonnet", system, user, tracker, 8192);

  const integrity = validateLinkIntegrity(draft, allowedUrls);
  if (!integrity.valid) {
    draft = await callLLM(
      "sonnet",
      `Fix link integrity. Remove or replace these invalid URLs: ${integrity.invalidUrls.join(", ")}. Only use allowed URLs.`,
      draft,
      tracker,
      8192
    );
  }

  draft = appendFurtherReading(draft, flatSources, topicOrder);

  return draft;
}

export function enforceWordCount(markdown: string): string {
  const count = countWordsExcludingLinks(markdown);
  if (count <= MAX_WORD_COUNT) return markdown;
  return markdown;
}
