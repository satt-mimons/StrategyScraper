import { callLLM, parseJsonFromLLM } from "@/lib/anthropic";
import {
  PER_TOPIC_STORY_CAP,
  PER_TOPIC_STORY_MIN,
  PER_TOPIC_STORY_TARGET,
} from "@/lib/constants";
import type { ClusteredStory, CostTracker, Profile } from "@/types";

export interface TopicSelectionStat {
  topic: string;
  available: number;
  selected: number;
  /** True when fewer than PER_TOPIC_STORY_MIN distinct stories exist for this topic. */
  thin: boolean;
}

export interface SelectionResult {
  selected: ClusteredStory[];
  byTopic: TopicSelectionStat[];
}

/**
 * Select a balanced set of distinct stories from the clustered pool (§8).
 *
 * Operates on clustered stories (produced by the cluster step), NOT raw candidates.
 * Rules:
 *  - Per-topic cap: at most PER_TOPIC_STORY_CAP stories per topic.
 *  - Per-topic floor/target: aim for PER_TOPIC_STORY_TARGET per topic, at least
 *    PER_TOPIC_STORY_MIN where the pool allows.
 *  - Thin topics (fewer than PER_TOPIC_STORY_MIN distinct stories) take what exists and
 *    are flagged thin — never padded with near-duplicates (clustering already removed those).
 *  - Overall size scales with the number of topics the user selected
 *    (≈ topics.length * PER_TOPIC_STORY_TARGET). It is NOT a fixed number.
 *
 * Relevance is preserved: stories are ordered by an LLM strategic-relevance ranking
 * (falling back to source_count) before the per-topic caps are applied, so the most
 * relevant stories win the limited slots. This does not loosen the relevance bar.
 */
export async function runFilterAgent(
  clusters: ClusteredStory[],
  profile: Profile,
  tracker: CostTracker
): Promise<ClusteredStory[]> {
  const { selected, byTopic } = await selectStories(clusters, profile, tracker);

  const thin = byTopic.filter((t) => t.thin).map((t) => t.topic);
  if (thin.length > 0) {
    console.warn(
      `[filter] thin topics (< ${PER_TOPIC_STORY_MIN} distinct stories, not padded): ${thin.join(", ")}`
    );
  }

  return selected;
}

/** Core selection — exported for offline verification of the topic distribution. */
export async function selectStories(
  clusters: ClusteredStory[],
  profile: Profile,
  tracker: CostTracker
): Promise<SelectionResult> {
  const topics = profile.topics ?? [];
  if (clusters.length === 0 || topics.length === 0) {
    return {
      selected: [],
      byTopic: topics.map((topic) => ({
        topic,
        available: 0,
        selected: 0,
        thin: true,
      })),
    };
  }

  const rank = await rankByRelevance(clusters, profile, tracker);

  // Global ordering: by LLM relevance rank, then by corroboration (source_count).
  const ordered = [...clusters].sort((a, b) => {
    const ra = rank.get(a.cluster_id) ?? Number.POSITIVE_INFINITY;
    const rb = rank.get(b.cluster_id) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return b.source_count - a.source_count;
  });
  // Stamp global relevance priority (0 = most relevant) for downstream length budgeting.
  ordered.forEach((c, i) => {
    c.priority = i;
  });

  // Bucket by topic, preserving the global relevance order within each topic.
  const byTopicClusters = new Map<string, ClusteredStory[]>();
  for (const topic of topics) byTopicClusters.set(topic, []);
  for (const c of ordered) {
    if (byTopicClusters.has(c.primary_topic)) {
      byTopicClusters.get(c.primary_topic)!.push(c);
    }
  }

  const picked = new Map<string, ClusteredStory[]>();
  for (const topic of topics) picked.set(topic, []);

  // Phase 1 — give each topic up to its target (the floor is satisfied here when the
  // pool allows; thin topics simply have fewer than the floor available).
  for (const topic of topics) {
    const avail = byTopicClusters.get(topic)!;
    picked.set(topic, avail.slice(0, PER_TOPIC_STORY_TARGET));
  }

  // Phase 2 — if we are below the overall floor, top topics up toward the per-topic cap
  // in global relevance order until we reach the floor (never exceeding the overall max).
  // Overall target scales with the user's topic count (≈ target per topic). Phase 1 already
  // caps each topic at its target, so the total never exceeds this — no trimming needed.
  const overallTarget = topics.length * PER_TOPIC_STORY_TARGET;
  const total = () => topics.reduce((n, t) => n + picked.get(t)!.length, 0);

  // Phase 2 — if thin topics left us short of the overall target, top up the remaining
  // topics toward their per-topic cap, in global relevance order, to compensate.
  if (total() < overallTarget) {
    for (const c of ordered) {
      if (total() >= overallTarget) break;
      const sel = picked.get(c.primary_topic);
      if (!sel) continue;
      if (sel.length >= PER_TOPIC_STORY_CAP) continue;
      if (sel.includes(c)) continue;
      sel.push(c);
    }
  }

  const selected: ClusteredStory[] = [];
  const byTopic: TopicSelectionStat[] = [];
  for (const topic of topics) {
    const sel = picked.get(topic)!;
    selected.push(...sel);
    byTopic.push({
      topic,
      available: byTopicClusters.get(topic)!.length,
      selected: sel.length,
      thin: byTopicClusters.get(topic)!.length < PER_TOPIC_STORY_MIN,
    });
  }

  return { selected, byTopic };
}

/** Returns a map cluster_id -> rank index (0 = most relevant). Empty map on failure. */
async function rankByRelevance(
  clusters: ClusteredStory[],
  profile: Profile,
  tracker: CostTracker
): Promise<Map<string, number>> {
  const company = profile.company?.trim() || "the user's company";
  const system = `You are a relevance ranker for a personalized newsletter pipeline.
You receive DISTINCT STORIES (already deduplicated/clustered). Rank ALL of them from most to least relevant.

Rank by, in order:
1. Relevance to the user's TOPICS/THEMES — this is the dominant signal and outweighs everything below.
2. Broad relevance to the user's category/space: market-structure shifts, pricing-model changes, competitor moves, and category dynamics that matter to ANY strategy leader operating in ${company}'s space. Use ${company} only as context for the category — NOT as a target.

HARD RULE — push to the BOTTOM any story that is primarily ABOUT ${company} itself or its specific products/announcements (vendor PR, product launches, ${company} earnings or stock moves, partnership press releases), UNLESS ${company} appears only as one illustrative example of a broader theme.

LITMUS TEST for every story: "Would a strategy leader at a direct COMPETITOR of ${company} find this useful for understanding the theme?" If yes, it is theme-relevant — rank it up. If it is only useful because it is about ${company}, rank it near the bottom.

Do NOT rank by lane or source type. Do NOT drop any story — every cluster_id must appear exactly once.

Return ONLY JSON: { "ranking": ["<cluster_id>", ...] } ordered most-relevant first.`;

  const user = JSON.stringify({
    profile: { company: profile.company, role: profile.role, topics: profile.topics },
    stories: clusters.map((c) => ({
      cluster_id: c.cluster_id,
      headline: c.headline,
      primary_topic: c.primary_topic,
      source_count: c.source_count,
      source_types: c.source_types,
      samples: c.sources.slice(0, 3).map((s) => ({
        title: s.title,
        snippet: (s.snippet ?? "").slice(0, 160),
      })),
    })),
  });

  try {
    const response = await callLLM("sonnet", system, user, tracker, 2048);
    const parsed = parseJsonFromLLM<{ ranking?: string[] }>(response);
    const ranking = Array.isArray(parsed?.ranking) ? parsed.ranking : [];
    const map = new Map<string, number>();
    ranking.forEach((id, i) => {
      if (!map.has(id)) map.set(id, i);
    });
    return map;
  } catch {
    return new Map();
  }
}
