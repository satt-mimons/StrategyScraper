import { generateExaQueries, extractCandidateInsights } from "@/agents/query-generator";
import { EXA_NUM_RESULTS } from "@/lib/constants";
import {
  runExaSearch,
  isLikelyPaywalled,
  type ExaSearchResult,
} from "@/lib/exa";
import { dedupeByUrl } from "@/lib/utils";
import type { Candidate, LaneResult, PipelineContext } from "@/types";

/**
 * News lane (solid) — Exa-powered.
 * Runs domain-scoped query AND open query per topic, merging results
 * so trusted outlets are favored but open discovery still happens.
 */
export async function runNewsLane(
  ctx: PipelineContext
): Promise<LaneResult> {
  const lane = "news" as const;
  const allCandidates: Omit<Candidate, "run_id">[] = [];

  try {
    for (const topic of ctx.profile.topics) {
      const queries = await generateExaQueries(
        {
          profile: ctx.profile,
          topic,
          lane: "news",
          includeDomains: ctx.profile.preferred_pubs,
          recencyCutoff: ctx.recencyCutoff,
        },
        ctx.costTracker
      );

      const openQueries = await generateExaQueries(
        {
          profile: ctx.profile,
          topic,
          lane: "news",
          recencyCutoff: ctx.recencyCutoff,
        },
        ctx.costTracker
      );

      const allQueries = [...queries, ...openQueries.slice(0, 1)];
      const searchResults = await Promise.all(
        allQueries.map((q) => runExaSearch(q, ctx.costTracker, ctx.profile.role))
      );

      const merged = dedupeByUrl(
        searchResults.flat().map((r) => exaToCandidate(r, lane))
      );

      for (const candidate of merged.slice(0, EXA_NUM_RESULTS * 2)) {
        const enriched = await enrichCandidate(candidate, ctx);
        allCandidates.push(enriched);
      }
    }

    return { lane, candidates: dedupeByUrl(allCandidates), success: true };
  } catch (err) {
    return {
      lane,
      candidates: allCandidates,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function exaToCandidate(
  r: ExaSearchResult,
  lane: "news"
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

async function enrichCandidate(
  candidate: Omit<Candidate, "run_id">,
  ctx: PipelineContext
): Promise<Omit<Candidate, "run_id">> {
  if (candidate.highlights.length === 0) return candidate;

  const { summary, isPaywalled } = await extractCandidateInsights(
    candidate.highlights,
    candidate.title,
    ctx.profile.role,
    ctx.costTracker
  );

  return {
    ...candidate,
    snippet: summary || candidate.snippet,
    is_paywalled: candidate.is_paywalled || isPaywalled,
  };
}

export { enrichCandidate, exaToCandidate };
