import { generateExaQueries } from "@/agents/query-generator";
import {
  LANE_ESCALATION_MAX_RETRIES,
  LANE_FETCH_TARGET_MIN,
} from "@/lib/constants";
import { runExaQueriesParallel } from "@/agents/lanes/exa-lane-utils";
import {
  checkCostProjection,
  type CostCheckResult,
} from "@/lib/anthropic";
import { widenCutoff } from "@/lib/recency";
import type { ExaSearchResult } from "@/lib/exa";
import type { ExaQueryPayload, PipelineContext } from "@/types";
import type { RecencyLane } from "@/lib/recency";

type ExaQueryLane = "news" | "analyst" | "substack" | "medium";

export function perTopicTarget(lane: RecencyLane, topicCount: number): number {
  const laneTarget = LANE_FETCH_TARGET_MIN[lane] ?? 5;
  if (topicCount <= 0) return laneTarget;
  return Math.max(2, Math.ceil(laneTarget / topicCount));
}

async function fetchExaAtCutoff(
  ctx: PipelineContext,
  queries: ExaQueryPayload[]
): Promise<ExaSearchResult[]> {
  const projected = checkCostProjection(ctx.costTracker, {
    exa: queries.length,
  });
  if (!projected.ok) {
    ctx.costTracker.costCapHit = true;
    return [];
  }
  if (projected.level === "warn") {
    ctx.costTracker.costWarnFlagged = true;
  }
  return runExaQueriesParallel(queries, ctx);
}

/**
 * Escalation ladder: base window → 2× → 4× (max 2 retries), then query-generator once.
 */
export async function fetchExaForTopicWithEscalation(
  ctx: PipelineContext,
  recencyLane: RecencyLane,
  exaLane: ExaQueryLane,
  topic: string,
  buildQueries: (topic: string, cutoff: Date) => ExaQueryPayload[],
  queryGenOptions?: {
    includeDomains?: string[];
    includeText?: string[];
  }
): Promise<ExaSearchResult[]> {
  const baseCutoff = ctx.laneRecencyCutoffs[recencyLane];
  const target = perTopicTarget(recencyLane, ctx.profile.topics.length);
  const seen = new Map<string, ExaSearchResult>();
  let queryGenUsed = false;

  const merge = (batch: ExaSearchResult[]) => {
    for (const r of batch) {
      if (!seen.has(r.url)) seen.set(r.url, r);
    }
  };

  const cutoffs: Date[] = [baseCutoff];
  for (let i = 1; i <= LANE_ESCALATION_MAX_RETRIES; i++) {
    const mult = i === 1 ? 2 : 4;
    cutoffs.push(widenCutoff(baseCutoff, mult as 2 | 4));
  }

  for (let i = 0; i < cutoffs.length; i++) {
    if (seen.size >= target) break;
    if (ctx.costTracker.costCapHit) break;

    const batch = await fetchExaAtCutoff(
      ctx,
      buildQueries(topic, cutoffs[i])
    );
    merge(batch);
  }

  if (
    seen.size < target &&
    !queryGenUsed &&
    !ctx.costTracker.costCapHit
  ) {
    queryGenUsed = true;
    const projected = checkCostProjection(ctx.costTracker, {
      exa: 3,
    });
    if (projected.ok) {
      if (projected.level === "warn") {
        ctx.costTracker.costWarnFlagged = true;
      }
      try {
        const generated = await generateExaQueries(
          {
            profile: ctx.profile,
            topic,
            lane: exaLane,
            recencyCutoff: cutoffs[cutoffs.length - 1],
            includeDomains: queryGenOptions?.includeDomains,
            includeText: queryGenOptions?.includeText,
          },
          ctx.costTracker
        );
        merge(await fetchExaAtCutoff(ctx, generated));
      } catch {
        // query-gen is best-effort
      }
    } else {
      ctx.costTracker.costCapHit = true;
    }
  }

  return [...seen.values()];
}

export function formatCostFlag(check: CostCheckResult): string | undefined {
  if (check.level === "warn") {
    return `Run projected cost $${check.estimate.toFixed(2)} exceeds warn threshold`;
  }
  if (check.level === "cap") {
    return check.message;
  }
  return undefined;
}
