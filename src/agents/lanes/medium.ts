import { generateExaQueries } from "@/agents/query-generator";
import { enrichCandidate } from "@/agents/lanes/news";
import { EXA_NUM_RESULTS } from "@/lib/constants";
import { runExaSearch, type ExaSearchResult } from "@/lib/exa";
import { dedupeByUrl } from "@/lib/utils";
import type { Candidate, LaneResult, PipelineContext } from "@/types";

/**
 * Medium lane (strongest discovery lane) — Exa-powered, dual-pass.
 * Same pattern as Substack with medium.com domain filter + open query.
 */
export async function runMediumLane(
  ctx: PipelineContext
): Promise<LaneResult> {
  const lane = "medium" as const;
  const allCandidates: Omit<Candidate, "run_id">[] = [];

  try {
    for (const topic of ctx.profile.topics) {
      const domainQueries = await generateExaQueries(
        {
          profile: ctx.profile,
          topic,
          lane: "medium",
          includeDomains: ["medium.com"],
          recencyCutoff: ctx.recencyCutoff,
        },
        ctx.costTracker
      );

      const openQueries = await generateExaQueries(
        {
          profile: ctx.profile,
          topic,
          lane: "medium",
          recencyCutoff: ctx.recencyCutoff,
        },
        ctx.costTracker
      );

      const domainResults = await Promise.all(
        domainQueries.map((q) =>
          runExaSearch(
            { ...q, includeDomains: ["medium.com"] },
            ctx.costTracker,
            ctx.profile.role
          )
        )
      );

      const openResults = await Promise.all(
        openQueries.map((q) => runExaSearch(q, ctx.costTracker, ctx.profile.role))
      );

      const merged = dedupeByUrl([
        ...domainResults.flat().map((r) => toMediumCandidate(r)),
        ...openResults.flat().map((r) => toMediumCandidate(r)),
      ]);

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

function toMediumCandidate(r: ExaSearchResult): Omit<Candidate, "run_id"> {
  return {
    lane: "medium",
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
