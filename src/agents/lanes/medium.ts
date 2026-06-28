import { buildMediumQueries } from "@/lib/exa-queries";
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

/** Medium lane — Exa with escalation. */
export async function runMediumLane(ctx: PipelineContext): Promise<LaneResult> {
  const lane = "medium" as const;
  const deadline = laneDeadline();

  try {
    const candidates = await collectTopicsParallel(ctx, deadline, async (topic) => {
      if (isPastDeadline(deadline)) return [];

      const results = await fetchExaForTopicWithEscalation(
        ctx,
        "medium",
        "medium",
        topic,
        (t, cutoff) => buildMediumQueries(ctx.profile, t, cutoff),
        { includeDomains: ["medium.com"] }
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
