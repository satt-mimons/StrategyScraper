import { callLLM } from "@/lib/anthropic";
import {
  DEFAULT_TONE_SPEC,
  MAX_WORD_COUNT,
  TLDR_BULLET_MIN,
  TLDR_BULLET_MAX,
  REPORTER_TLDR_WORD_RESERVE,
  FURTHER_READING_WORD_RESERVE,
  STORY_WORDS_FULL,
  STORY_WORDS_BRIEF,
} from "@/lib/constants";
import {
  allClusterUrls,
  flattenClusterSources,
} from "@/agents/cluster";
import { appendFurtherReading } from "@/lib/further-reading";
import { validateLinkIntegrity } from "@/lib/utils";
import type { ClusteredStory, CostTracker, Profile } from "@/types";

export interface StoryAllowance {
  cluster: ClusteredStory;
  /** Approximate word target for this story's bullet. */
  wordTarget: number;
}

/**
 * Spend a word budget across stories in relevance-priority order: top stories get full
 * depth, the next get brief treatment, and the remainder are dropped from the body (they
 * still appear in Further Reading). Each topic's highest-priority story is guaranteed a
 * slot so multi-topic coverage is preserved.
 */
export function budgetStories(
  clusters: ClusteredStory[],
  bodyBudget: number
): { included: StoryAllowance[]; dropped: ClusteredStory[] } {
  const byPriority = [...clusters].sort(
    (a, b) =>
      (a.priority ?? Number.MAX_SAFE_INTEGER) -
        (b.priority ?? Number.MAX_SAFE_INTEGER) || b.source_count - a.source_count
  );

  // Guarantee each topic's top-priority story a body slot (coverage).
  const guaranteed = new Set<string>();
  const seenTopics = new Set<string>();
  for (const c of byPriority) {
    if (!seenTopics.has(c.primary_topic)) {
      seenTopics.add(c.primary_topic);
      guaranteed.add(c.cluster_id);
    }
  }

  // Allocate guaranteed (coverage) stories first, then the rest by priority.
  const order = [
    ...byPriority.filter((c) => guaranteed.has(c.cluster_id)),
    ...byPriority.filter((c) => !guaranteed.has(c.cluster_id)),
  ];

  let remaining = bodyBudget;
  const included: StoryAllowance[] = [];
  const includedIds = new Set<string>();

  for (const c of order) {
    let wordTarget: number;
    if (remaining >= STORY_WORDS_FULL) wordTarget = STORY_WORDS_FULL;
    else if (remaining >= STORY_WORDS_BRIEF) wordTarget = STORY_WORDS_BRIEF;
    else if (guaranteed.has(c.cluster_id)) wordTarget = STORY_WORDS_BRIEF; // coverage floor
    else continue; // dropped to Further Reading only

    remaining -= wordTarget;
    included.push({ cluster: c, wordTarget });
    includedIds.add(c.cluster_id);
  }

  const dropped = clusters.filter((c) => !includedIds.has(c.cluster_id));
  return { included, dropped };
}

export async function runReporterAgent(
  clusters: ClusteredStory[],
  profile: Profile,
  tracker: CostTracker
): Promise<string> {
  const flatSources = flattenClusterSources(clusters);
  const allowedUrls = new Set(allClusterUrls(clusters));
  const topicOrder = profile.topics;
  const toneSpec = profile.tone_spec || DEFAULT_TONE_SPEC;

  // Budget the body by relevance priority; the tail moves to Further Reading only.
  const bodyBudget =
    MAX_WORD_COUNT - REPORTER_TLDR_WORD_RESERVE - FURTHER_READING_WORD_RESERVE;
  const { included } = budgetStories(clusters, bodyBudget);
  const wordTargetById = new Map(
    included.map((a) => [a.cluster.cluster_id, a.wordTarget])
  );
  const includedClusters = included.map((a) => a.cluster);

  const topicSections = topicOrder
    .map((topic) => {
      const topicClusters = includedClusters.filter(
        (c) => c.primary_topic === topic
      );
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
          word_target: wordTargetById.get(c.cluster_id),
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
   Each story has a word_target — write APPROXIMATELY that many words and do NOT materially exceed it.
   For each bullet:
   a) Open with a **bold topic sentence** stating the story's core point (reader can scan bold lines only).
   b) Follow with a sharp take in the configured voice (tone spec), sized to word_target: full stories (~${STORY_WORDS_FULL}w) get 2–4 sentences; brief stories (~${STORY_WORDS_BRIEF}w) get 1–2 tight sentences.
   c) Embed inline source links THROUGHOUT the take — hyperlink the specific claim, datapoint, or quote to the source it came from with markdown [text](url), NOT one trailing citation. Every factual assertion must be traceable to a linked source from that cluster's sources[]. The reader should be able to click through to the original at each point, not just see your synthesis.
   d) Cite MULTIPLE distinct sources per bullet (3+ when the cluster has them), and include at least one mainstream NEWS source for factual grounding whenever one exists in the cluster. Show breadth when source_count > 1 (e.g. "reported across N outlets").

SECTION COMPOSITION:
- Across each topic section, ensure at least one bullet draws on a mainstream source AND at least one bullet draws on a niche_blog or analyst source, where those types exist in that section's clusters.
- Lean on mainstream NEWS reporting for facts, figures, and timelines — do not under-use news in favor of niche/analyst commentary. News sources are first-class: surface them across the sections with inline links, not just as background.
- Write a bullet for EVERY story provided — the set has already been selected and length-budgeted to fit. Do not add or invent stories, and respect each story's word_target.

LENGTH (critical — the newsletter MUST finish within budget):
- Total target ~${MAX_WORD_COUNT} words excluding hyperlink URLs: ~${REPORTER_TLDR_WORD_RESERVE} for the TLDR, the rest spent across the story bullets per their word_target.
- Stay within budget — being concise beats running long. Further Reading is appended separately — do not write it.

LINK & PAYWALL RULES:
- ONLY cite URLs from allowed_urls — never invent URLs
- Paywalled sources: headline + snippet + link labeled (paywalled); summarize ONLY from snippet/highlights provided

Write for a ${profile.role || "professional"} at ${profile.company || "their company"}.
Use the company only as CONTEXT for relevance — frame every story around the broader THEME, never around the company's own products or announcements. A peer at a direct competitor should find each story insightful; if a story matters only because it concerns this company, it does not belong.
Do NOT add a flat SOURCES list — Further Reading is appended automatically.

Return markdown only. No preamble.`;

  const user = JSON.stringify({
    topic_sections: topicSections,
    included_story_count: includedClusters.length,
    word_budget: MAX_WORD_COUNT,
    tldr_word_reserve: REPORTER_TLDR_WORD_RESERVE,
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

  draft = appendFurtherReading(draft, flatSources, topicOrder, profile);

  return draft;
}
