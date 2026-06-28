import { LANE_TIMEOUT_MS } from "@/lib/constants";
import { safeExaSearch, isLikelyPaywalled, type ExaSearchResult } from "@/lib/exa";
import { dedupeByUrl } from "@/lib/utils";
import type { Candidate, ExaQueryPayload, Lane, PipelineContext } from "@/types";

export const MAX_CANDIDATES_PER_TOPIC = 15;

export function laneDeadline(): number {
  return Date.now() + LANE_TIMEOUT_MS;
}

export function isPastDeadline(deadline: number): boolean {
  return Date.now() > deadline;
}

export async function runExaQueriesParallel(
  queries: ExaQueryPayload[],
  ctx: PipelineContext
): Promise<ExaSearchResult[]> {
  const results = await Promise.all(
    queries.map((q) => safeExaSearch(q, ctx.costTracker, ctx.profile.role))
  );
  return results.flat();
}

export function exaResultToCandidate(
  r: ExaSearchResult,
  lane: Lane
): Omit<Candidate, "run_id"> {
  return {
    lane,
    url: r.url,
    title: r.title,
    author: r.author,
    published_date: r.publishedDate,
    snippet: r.snippet,
    highlights: r.highlights,
    raw_score: r.score,
    is_paywalled: isLikelyPaywalled(r.title, r.snippet),
    platform_post_id: null,
  };
}

export async function collectTopicsParallel(
  ctx: PipelineContext,
  deadline: number,
  collectForTopic: (
    topic: string,
    ctx: PipelineContext
  ) => Promise<Omit<Candidate, "run_id">[]>
): Promise<Omit<Candidate, "run_id">[]> {
  const topics = ctx.profile.topics.filter(() => !isPastDeadline(deadline));
  if (topics.length === 0) return [];

  const batches = await Promise.all(
    topics.map((topic) => collectForTopic(topic, ctx))
  );

  return dedupeByUrl(batches.flat()).slice(0, MAX_CANDIDATES_PER_TOPIC * topics.length);
}

export function laneResult(
  lane: Lane,
  candidates: Omit<Candidate, "run_id">[],
  timedOut: boolean
): {
  lane: Lane;
  candidates: Omit<Candidate, "run_id">[];
  success: boolean;
  error?: string;
} {
  return {
    lane,
    candidates,
    success: candidates.length > 0,
    error:
      candidates.length === 0
        ? "No results found"
        : timedOut
          ? "Completed with partial results (time limit reached)"
          : undefined,
  };
}
