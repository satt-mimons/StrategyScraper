import { callLLM, parseJsonFromLLM } from "@/lib/anthropic";
import {
  LANE_MIN_QUOTAS,
  LANE_NOVELTY_WEIGHT,
  DEEP_DIVE_MAX,
  TLDR_BULLET_MAX,
} from "@/lib/constants";
import { dedupeByUrl } from "@/lib/utils";
import type {
  Candidate,
  CostTracker,
  Profile,
  SelectedStory,
} from "@/types";

const TARGET_STORY_COUNT = TLDR_BULLET_MAX + DEEP_DIVE_MAX;

export async function runFilterAgent(
  candidates: Candidate[],
  profile: Profile,
  sentUrls: Set<string>,
  tracker: CostTracker
): Promise<SelectedStory[]> {
  const pool = dedupeByUrl(
    candidates.filter((c) => !sentUrls.has(c.url))
  );

  if (pool.length === 0) {
    return [];
  }

  const system = `You are a filter agent for a personalized newsletter pipeline.
Rank and select the final story set from a candidate pool.

Prioritize in order:
1. Relevance to the user's specific topics
2. Relevance to the user's role and company
3. Novelty — weight niche lanes (substack, medium, analyst) HIGHER; down-rank items that duplicate mainstream news

Rules:
- Guarantee minimum per-lane quotas: substack/substack-open ≥ ${LANE_MIN_QUOTAS.substack}, medium ≥ ${LANE_MIN_QUOTAS.medium}, analyst ≥ ${LANE_MIN_QUOTAS.analyst}
- Select ${TARGET_STORY_COUNT} stories total (for 5-7 TLDR bullets + 3-5 deep dives)
- Dedup same story across lanes — keep the best version
- Never select URLs already in the sent-url blocklist

Return JSON array: [{ "url", "title", "lane", "why_selected", "is_paywalled" }]`;

  const user = JSON.stringify({
    profile: {
      company: profile.company,
      role: profile.role,
      topics: profile.topics,
    },
    candidates: pool.map((c) => ({
      url: c.url,
      title: c.title,
      lane: c.lane,
      author: c.author,
      snippet: c.snippet.slice(0, 200),
      raw_score: c.raw_score,
      is_paywalled: c.is_paywalled,
      novelty_weight: LANE_NOVELTY_WEIGHT[c.lane] ?? 1.0,
    })),
    blocked_urls: [...sentUrls].slice(0, 50),
  });

  const response = await callLLM("sonnet", system, user, tracker, 4096);

  try {
    const selected = parseJsonFromLLM<SelectedStory[]>(response);
    return enforceQuotas(selected, pool);
  } catch {
    return fallbackFilter(pool);
  }
}

function enforceQuotas(
  selected: SelectedStory[],
  pool: Candidate[]
): SelectedStory[] {
  const result = [...selected];

  for (const [lane, minCount] of Object.entries(LANE_MIN_QUOTAS)) {
    const laneCount = result.filter(
      (s) => s.lane === lane || (lane === "substack" && s.lane === "substack-open")
    ).length;

    if (laneCount < minCount) {
      const candidates = pool.filter(
        (c) =>
          (c.lane === lane || (lane === "substack" && c.lane === "substack-open")) &&
          !result.some((s) => s.url === c.url)
      );
      const needed = minCount - laneCount;
      for (const c of candidates.slice(0, needed)) {
        result.push({
          url: c.url,
          title: c.title,
          lane: c.lane,
          why_selected: `Lane quota fill for ${c.lane}`,
          is_paywalled: c.is_paywalled,
          author: c.author,
          snippet: c.snippet,
          highlights: c.highlights,
        });
      }
    }
  }

  return result.slice(0, TARGET_STORY_COUNT);
}

function fallbackFilter(pool: Candidate[]): SelectedStory[] {
  const sorted = [...pool].sort((a, b) => {
    const weightA = (LANE_NOVELTY_WEIGHT[a.lane] ?? 1) * a.raw_score;
    const weightB = (LANE_NOVELTY_WEIGHT[b.lane] ?? 1) * b.raw_score;
    return weightB - weightA;
  });

  return sorted.slice(0, TARGET_STORY_COUNT).map((c) => ({
    url: c.url,
    title: c.title,
    lane: c.lane,
    why_selected: "Fallback rank by novelty-weighted score",
    is_paywalled: c.is_paywalled,
    author: c.author,
    snippet: c.snippet,
    highlights: c.highlights,
  }));
}
