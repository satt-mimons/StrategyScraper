import { callLLM, parseJsonFromLLM } from "@/lib/anthropic";
import {
  assignPrimaryTopic,
  assignLinkTier,
  resolveCiteUrl,
  isDenylisted,
} from "@/lib/source-quality";
import { classifySourceType, uniqueSourceTypes } from "@/lib/story-sources";
import type {
  Candidate,
  ClusteredStory,
  CostTracker,
  LinkTier,
  Profile,
  StorySource,
  StorySourceType,
} from "@/types";

/**
 * LLM returns ONLY merge-groups (2+ members) as local indices into a single topic's
 * article list. Anything it doesn't list stays its own story — keeps output tiny and
 * truncation-proof even for large topics.
 */
interface MergeGroup {
  headline?: string;
  member_ids: number[];
  cluster_note?: string;
}

const TIER_ORDER: Record<LinkTier, number> = { must_read: 0, context: 1 };
const TYPE_ORDER: Record<StorySourceType, number> = {
  analyst: 0,
  niche_blog: 1,
  mainstream: 2,
};

function candidateToStorySource(
  c: Candidate,
  profile: Profile,
  pool: Candidate[]
): StorySource {
  const cite = resolveCiteUrl({ url: c.url, title: c.title }, pool);
  return {
    url: cite,
    title: c.title,
    lane: c.lane,
    source_type: classifySourceType(c.lane),
    author: c.author,
    snippet: c.snippet,
    highlights: c.highlights,
    is_paywalled: c.is_paywalled,
    link_tier: assignLinkTier({ url: cite, lane: c.lane }, profile),
  };
}

function pickLeadSource(sources: StorySource[]): StorySource {
  return [...sources].sort((a, b) => {
    const tierDiff =
      TIER_ORDER[a.link_tier ?? "context"] - TIER_ORDER[b.link_tier ?? "context"];
    if (tierDiff !== 0) return tierDiff;
    return TYPE_ORDER[a.source_type] - TYPE_ORDER[b.source_type];
  })[0];
}

function buildCluster(
  members: Candidate[],
  headline: string,
  primaryTopicHint: string | undefined,
  note: string | undefined,
  profile: Profile,
  pool: Candidate[],
  index: number
): ClusteredStory | null {
  const sources = members.map((c) => candidateToStorySource(c, profile, pool));
  if (sources.length === 0) return null;

  const lead = pickLeadSource(sources);
  const topics = profile.topics ?? [];
  const primary_topic =
    primaryTopicHint && topics.includes(primaryTopicHint)
      ? primaryTopicHint
      : assignPrimaryTopic(
          { title: headline || lead.title, snippet: lead.snippet, highlights: lead.highlights },
          topics
        );

  return {
    cluster_id: `c${index + 1}`,
    headline: headline || lead.title,
    primary_topic,
    sources,
    source_count: sources.length,
    source_types: uniqueSourceTypes(sources.map((s) => s.source_type)),
    lead_url: lead.url,
    cluster_note: note,
  };
}

/** Each candidate becomes its own single-source story (used when LLM clustering is unavailable). */
function singletonClusters(
  pool: Candidate[],
  profile: Profile
): ClusteredStory[] {
  const clusters: ClusteredStory[] = [];
  for (const c of pool) {
    const cluster = buildCluster(
      [c],
      c.title,
      undefined,
      undefined,
      profile,
      pool,
      clusters.length
    );
    if (cluster) clusters.push(cluster);
  }
  return clusters;
}

/** Ask the LLM for merge-groups within ONE topic's article list. Empty on failure. */
async function findMergeGroups(
  topic: string,
  cands: Candidate[],
  tracker: CostTracker
): Promise<MergeGroup[]> {
  const system = `You are a deduplication agent for a newsletter pipeline (§8.5).

You receive a list of articles that all belong to ONE topic. Find groups of articles that should be MERGED into a SINGLE story because they either:
(a) cover the SAME underlying event, announcement, or development, OR
(b) make SUBSTANTIALLY THE SAME CORE ARGUMENT or thesis — even if they cite different events, are from different outlets, or use different headlines (e.g. several pieces all arguing "the context layer is becoming the most important part of the AI stack" = ONE story).

Rules:
- Return ONLY merge groups that contain 2 OR MORE members. Any article you do not list will automatically remain its own separate story — do NOT list singletons.
- Each article id may appear in at most ONE group.
- Do NOT merge two genuinely different arguments or developments just to reduce the count. When in doubt, leave them separate.
- headline: a concise, outlet-neutral label for the merged story.
- cluster_note: one short line on the shared event or argument that justifies the merge.

Return ONLY a JSON array (possibly empty): [{ "headline", "member_ids": [<int>, <int>, ...], "cluster_note" }]`;

  const user = JSON.stringify({
    topic,
    articles: cands.map((c, i) => ({
      id: i,
      title: c.title,
      snippet: (c.snippet ?? "").slice(0, 250),
      lane: c.lane,
    })),
  });

  // LLM/transport errors (e.g. exhausted Anthropic credits, rate limits) propagate so the
  // run fails loudly. Only an unparseable response is treated as "no merges in this topic".
  const response = await callLLM("sonnet", system, user, tracker, 4096);
  try {
    const parsed = parseJsonFromLLM<MergeGroup[]>(response);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Build the distinct stories for one topic from its merge-groups + leftover singletons. */
function clusterOneTopic(
  topic: string,
  cands: Candidate[],
  groups: MergeGroup[],
  profile: Profile,
  pool: Candidate[],
  startIndex: number
): ClusteredStory[] {
  const clusters: ClusteredStory[] = [];
  const assigned = new Set<number>();

  for (const group of groups) {
    const ids = (group.member_ids ?? []).filter(
      (i) =>
        Number.isInteger(i) && i >= 0 && i < cands.length && !assigned.has(i)
    );
    if (ids.length < 2) continue; // ignore degenerate / singleton "groups"
    for (const i of ids) assigned.add(i);
    const cluster = buildCluster(
      ids.map((i) => cands[i]),
      group.headline ?? "",
      topic,
      group.cluster_note,
      profile,
      pool,
      startIndex + clusters.length
    );
    if (cluster) clusters.push(cluster);
  }

  // Everything not merged stays its own distinct story (never dropped).
  for (let i = 0; i < cands.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = buildCluster(
      [cands[i]],
      cands[i].title,
      topic,
      undefined,
      profile,
      pool,
      startIndex + clusters.length
    );
    if (cluster) clusters.push(cluster);
  }

  return clusters;
}

/**
 * Group the FULL candidate pool into distinct stories (§8.5) — runs BEFORE selection,
 * so downstream selection counts distinct stories rather than raw articles.
 *
 * Collapses into one story both (a) same-event/same-URL coverage AND (b) articles making
 * substantially the same core argument/thesis. Each resulting story carries all member
 * source URLs and a source_count. Clustering is done per topic (smaller, higher-precision
 * LLM calls; merge-only output avoids truncation on large topics). No output ceiling —
 * balancing across topics is the filter step's job.
 */
export async function runClusterAgent(
  candidates: Candidate[],
  profile: Profile,
  tracker: CostTracker
): Promise<ClusteredStory[]> {
  const pool = candidates.filter((c) => c.url && !isDenylisted(c.url));
  if (pool.length === 0) return [];
  if (pool.length === 1) return singletonClusters(pool, profile);

  const topics = profile.topics ?? [];

  // Bucket the pool by best-fit topic, then dedup within each topic.
  const byTopic = new Map<string, Candidate[]>();
  for (const c of pool) {
    const topic = assignPrimaryTopic(
      { title: c.title, snippet: c.snippet, highlights: c.highlights },
      topics
    );
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic)!.push(c);
  }

  let perTopic: { topic: string; cands: Candidate[]; groups: MergeGroup[] }[];
  try {
    perTopic = await Promise.all(
      [...byTopic.entries()].map(async ([topic, cands]) => {
        if (cands.length === 1) return { topic, cands, groups: [] as MergeGroup[] };
        const groups = await findMergeGroups(topic, cands, tracker);
        return { topic, cands, groups };
      })
    );
  } catch (err) {
    // Fail loudly rather than silently degrading to un-deduplicated singletons.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Clustering failed — newsletter not generated. The clustering LLM call did not complete (commonly an exhausted Anthropic credit balance or a rate limit). Original error: ${msg}`
    );
  }

  const clusters: ClusteredStory[] = [];
  for (const { topic, cands, groups } of perTopic) {
    clusters.push(
      ...clusterOneTopic(topic, cands, groups, profile, pool, clusters.length)
    );
  }

  return clusters;
}

/** Flatten clustered stories to individual sources (Further Reading, sent_urls). */
export function flattenClusterSources(
  clusters: ClusteredStory[]
): import("@/types").SelectedStory[] {
  const seen = new Set<string>();
  const flat: import("@/types").SelectedStory[] = [];

  for (const cluster of clusters) {
    for (const src of cluster.sources) {
      if (seen.has(src.url)) continue;
      seen.add(src.url);
      flat.push({
        url: src.url,
        title: src.title,
        lane: src.lane,
        why_selected: src.why_selected ?? cluster.cluster_note ?? "",
        is_paywalled: src.is_paywalled,
        primary_topic: cluster.primary_topic,
        link_tier: src.link_tier,
        author: src.author,
        snippet: src.snippet,
        highlights: src.highlights,
      });
    }
  }

  return flat;
}

export function allClusterUrls(clusters: ClusteredStory[]): string[] {
  return flattenClusterSources(clusters).map((s) => s.url);
}
