import { generateExaQueries } from "@/agents/query-generator";
import { enrichCandidate } from "@/agents/lanes/news";
import { EXA_NUM_RESULTS } from "@/lib/constants";
import { runExaSearch, isLikelySubstack, type ExaSearchResult } from "@/lib/exa";
import { dedupeByUrl } from "@/lib/utils";
import type { Candidate, Lane, LaneResult, PipelineContext } from "@/types";

/**
 * Substack lane (strongest discovery lane) — Exa-powered, dual-pass.
 * Pass 1: domain-scoped includeDomains substack.com
 * Pass 2: open neural query (catches custom-domain Substacks)
 */
export async function runSubstackLane(
  ctx: PipelineContext
): Promise<LaneResult> {
  const allCandidates: Omit<Candidate, "run_id">[] = [];

  try {
    for (const topic of ctx.profile.topics) {
      const domainQueries = await generateExaQueries(
        {
          profile: ctx.profile,
          topic,
          lane: "substack",
          includeDomains: ["substack.com"],
          recencyCutoff: ctx.recencyCutoff,
        },
        ctx.costTracker
      );

      const openQueries = await generateExaQueries(
        {
          profile: ctx.profile,
          topic,
          lane: "substack",
          recencyCutoff: ctx.recencyCutoff,
        },
        ctx.costTracker
      );

      const domainResults = await Promise.all(
        domainQueries.map((q) =>
          runExaSearch(
            { ...q, includeDomains: ["substack.com"] },
            ctx.costTracker,
            ctx.profile.role
          )
        )
      );

      const openResults = await Promise.all(
        openQueries.map((q) => runExaSearch(q, ctx.costTracker, ctx.profile.role))
      );

      const merged = dedupeByUrl([
        ...domainResults.flat().map((r) => toSubstackCandidate(r, "substack")),
        ...openResults.flat().map((r) => {
          const laneTag: Lane = isLikelySubstack(r.url, r.snippet)
            ? "substack"
            : "substack-open";
          return toSubstackCandidate(r, laneTag);
        }),
      ]);

      for (const candidate of merged.slice(0, EXA_NUM_RESULTS * 2)) {
        const enriched = await enrichCandidate(candidate, ctx);
        allCandidates.push(enriched);
      }
    }

    return {
      lane: "substack",
      candidates: dedupeByUrl(allCandidates),
      success: true,
    };
  } catch (err) {
    return {
      lane: "substack",
      candidates: allCandidates,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function toSubstackCandidate(
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
    is_paywalled: false,
    platform_post_id: null,
  };
}
