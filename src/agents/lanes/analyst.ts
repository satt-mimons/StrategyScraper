import { buildAnalystQueries } from "@/lib/exa-queries";
import { getAnalystFirmDomains } from "@/lib/analyst-firms";
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

/** Analyst-coverage lane — Exa with escalation + optional query-generator broadening. */
export async function runAnalystLane(ctx: PipelineContext): Promise<LaneResult> {
  const lane = "analyst" as const;
  const deadline = laneDeadline();

  try {
    const candidates = await collectTopicsParallel(ctx, deadline, async (topic) => {
      if (isPastDeadline(deadline)) return [];

      const results = await fetchExaForTopicWithEscalation(
        ctx,
        "analyst",
        "analyst",
        topic,
        (t, cutoff) => buildAnalystQueries(ctx.profile, t, cutoff),
        { includeDomains: getAnalystFirmDomains(ctx.profile) }
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
