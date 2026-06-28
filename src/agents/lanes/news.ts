import { buildNewsQueries } from "@/lib/exa-queries";
import { fetchExaForTopicWithEscalation } from "@/lib/lane-escalation";
import {
  laneDeadline,
  isPastDeadline,
  exaResultToCandidate,
  collectTopicsParallel,
  laneResult,
  MAX_CANDIDATES_PER_TOPIC,
} from "@/agents/lanes/exa-lane-utils";
import { dedupeByUrl } from "@/lib/utils";
import type { LaneResult, PipelineContext } from "@/types";

/**
 * News lane (solid) — Exa-powered with recency escalation.
 */
export async function runNewsLane(ctx: PipelineContext): Promise<LaneResult> {
  const lane = "news" as const;
  const deadline = laneDeadline();

  try {
    const candidates = await collectTopicsParallel(ctx, deadline, async (topic) => {
      if (isPastDeadline(deadline)) return [];

      const results = await fetchExaForTopicWithEscalation(
        ctx,
        "news",
        "news",
        topic,
        (t, cutoff) => buildNewsQueries(ctx.profile, t, cutoff),
        { includeDomains: ctx.profile.preferred_pubs }
      );

      return dedupeByUrl(
        results.map((r) => exaResultToCandidate(r, lane))
      ).slice(0, MAX_CANDIDATES_PER_TOPIC);
    });

    const timedOut = isPastDeadline(deadline);
    return laneResult(lane, candidates, timedOut);
  } catch (err) {
    return {
      lane,
      candidates: [],
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export { exaResultToCandidate as exaToCandidate };
