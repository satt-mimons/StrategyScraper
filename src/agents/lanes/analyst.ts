import { generateExaQueries } from "@/agents/query-generator";
import { enrichCandidate } from "@/agents/lanes/news";
import { EXA_NUM_RESULTS } from "@/lib/constants";
import { runExaSearch, type ExaSearchResult } from "@/lib/exa";
import { dedupeByUrl } from "@/lib/utils";
import type { Candidate, LaneResult, PipelineContext } from "@/types";

/**
 * Analyst-coverage lane (solid) — Exa-powered.
 * Targets coverage of and commentary on analyst output, not gated reports.
 */
export async function runAnalystLane(
  ctx: PipelineContext
): Promise<LaneResult> {
  const lane = "analyst" as const;
  const allCandidates: Omit<Candidate, "run_id">[] = [];

  try {
    for (const topic of ctx.profile.topics) {
      const commentaryQueries = await generateExaQueries(
        {
          profile: ctx.profile,
          topic,
          lane: "analyst",
          recencyCutoff: ctx.recencyCutoff,
        },
        ctx.costTracker
      );

      const firmQueries = ctx.profile.analyst_firms.slice(0, 5).map((firm) => ({
        query: `Commentary and analysis on ${firm} research or outlook related to ${topic}, relevant to corporate strategy`,
        category: "news" as const,
        numResults: 5,
        includeText: [firm],
        startPublishedDate: ctx.recencyCutoff.toISOString(),
      }));

      const allSearches = [
        ...commentaryQueries.map((q) =>
          runExaSearch(q, ctx.costTracker, ctx.profile.role)
        ),
        ...firmQueries.map((q) =>
          runExaSearch(q, ctx.costTracker, ctx.profile.role)
        ),
      ];

      const results = await Promise.all(allSearches);
      const merged = dedupeByUrl(
        results.flat().map((r) => toAnalystCandidate(r))
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

function toAnalystCandidate(r: ExaSearchResult): Omit<Candidate, "run_id"> {
  return {
    lane: "analyst",
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
