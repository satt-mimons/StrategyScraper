import { LANE_REGISTRY } from "@/lib/lane-registry";
import {
  buildRawLaneStats,
  applySurvivedCounts,
  logLaneStats,
  formatLaneStatsSummary,
} from "@/lib/lane-stats";
import type { LaneStatEntry } from "@/types";
import { runFilterAgent } from "@/agents/filter";
import {
  runClusterAgent,
  allClusterUrls,
  flattenClusterSources,
} from "@/agents/cluster";
import { runReporterAgent } from "@/agents/reporter";
import { runEditorAgent } from "@/agents/editor";
import { runDesignAgent, inferBrand, markdownToPlainHtml } from "@/agents/design";
import { createCostTracker, estimateCost, checkCostCap } from "@/lib/anthropic";
import { sendNewsletterEmail, sendFailureAlert, getDeliveryRecipients } from "@/lib/resend";
import {
  insertCandidates,
  updateRun,
  saveNewsletter,
  recordSentUrls,
  isRunAlreadySent,
  getCandidatesForRun,
} from "@/lib/supabase";
import { normalizeProfile } from "@/lib/profile-utils";
import { isDenylisted } from "@/lib/source-quality";
import { buildLaneRecencyCutoffs, isOlderThanCutoff } from "@/lib/recency";
import {
  loadSentUrlSet,
  countWordsExcludingLinks,
  dedupeByUrl,
  withTimeout,
} from "@/lib/utils";
import { LANE_TIMEOUT_MS, PIPELINE_TIMEOUT_MS } from "@/lib/constants";
import type { Candidate, LaneResult, PipelineContext, Profile } from "@/types";

export async function runPipeline(
  runId: string,
  profile: Profile
): Promise<void> {
  return withTimeout(
    runPipelineInner(runId, profile),
    PIPELINE_TIMEOUT_MS,
    "Pipeline"
  );
}

async function runPipelineInner(
  runId: string,
  profile: Profile
): Promise<void> {
  const costTracker = createCostTracker();
  const normalizedProfile = normalizeProfile(profile);
  const laneRecencyCutoffs = await buildLaneRecencyCutoffs(normalizedProfile);
  const sentUrls = await loadSentUrlSet();

  const ctx: PipelineContext = {
    runId,
    profile: normalizedProfile,
    laneRecencyCutoffs,
    costTracker,
  };

  await updateRun(runId, {
    status: "running",
    started_at: new Date().toISOString(),
  });

  const lanesSucceeded: string[] = [];
  const lanesFailed: string[] = [];
  const laneErrors: string[] = [];
  let laneStats: LaneStatEntry[] = [];

  async function persistLaneStats(stats: LaneStatEntry[]): Promise<void> {
    laneStats = stats;
    logLaneStats(runId, stats);
    try {
      await updateRun(runId, { lane_stats: stats });
    } catch (err) {
      console.warn(
        `[run ${runId.slice(0, 8)}] Could not persist lane_stats — run supabase/migrations/002_lane_stats.sql:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  try {
    // Phase 1: all six research lanes in parallel (see LANE_REGISTRY)
    const settledResults = await Promise.allSettled(
      LANE_REGISTRY.map(async ({ id, runner }) => {
        try {
          return await withTimeout(runner(ctx), LANE_TIMEOUT_MS, `Lane ${id}`);
        } catch (err) {
          return {
            lane: id,
            candidates: [],
            success: false,
            error: err instanceof Error ? err.message : String(err),
          } as LaneResult;
        }
      })
    );

    const laneResults: LaneResult[] = settledResults.map((settled, i) => {
      const laneId = LANE_REGISTRY[i].id;
      if (settled.status === "fulfilled") {
        return settled.value;
      }
      return {
        lane: laneId,
        candidates: [],
        success: false,
        error:
          settled.reason instanceof Error
            ? settled.reason.message
            : String(settled.reason),
      };
    });

    laneStats = buildRawLaneStats(laneResults);
    await persistLaneStats(laneStats);

    const allCandidates: Candidate[] = [];

    for (const result of laneResults) {
      if (result.success) {
        lanesSucceeded.push(result.lane);
      } else {
        lanesFailed.push(result.lane);
        if (result.error) {
          laneErrors.push(`${result.lane}: ${result.error}`);
        }
      }
      const withRunId = result.candidates.map((c) => ({
        ...c,
        run_id: runId,
      }));
      allCandidates.push(...withRunId);
    }

    if (allCandidates.length > 0) {
      await insertCandidates(allCandidates);
    }

    const capCheck = checkCostCap(costTracker);
    if (!capCheck.ok) {
      throw new Error(capCheck.message);
    }
    if (costTracker.costWarnFlagged) {
      console.warn(
        `[run ${runId.slice(0, 8)}] Cost warn: projected $${capCheck.estimate.toFixed(2)} (threshold $3)`
      );
    }

    if (lanesSucceeded.length === 0) {
      throw new Error("All research lanes failed — no candidates collected");
    }

    const candidates =
      allCandidates.length > 0
        ? allCandidates
        : await getCandidatesForRun(runId);

    // Pre-filter the raw pool (drop 30-day-sent + denylisted, dedupe by URL), THEN
    // cluster the WHOLE pool into distinct stories (dedup by event AND by core argument),
    // THEN select a topic-balanced set. Clustering before selection means selection counts
    // distinct stories, not raw articles.
    // Strict recency cutoff (uniform across lanes) — drop anything dated older than the
    // selected frequency window before it can reach clustering/selection.
    const strictCutoff = laneRecencyCutoffs.news;
    const pool = dedupeByUrl(
      candidates.filter(
        (c) =>
          c.url &&
          !sentUrls.has(c.url) &&
          !isDenylisted(c.url) &&
          !isOlderThanCutoff(c.published_date, strictCutoff)
      )
    );

    const allClusters = await runClusterAgent(
      pool,
      normalizedProfile,
      costTracker
    );

    if (allClusters.length === 0) {
      throw new Error("Cluster agent produced zero distinct stories");
    }

    const clusteredStories = await runFilterAgent(
      allClusters,
      normalizedProfile,
      costTracker
    );

    const flatSources = flattenClusterSources(clusteredStories);
    laneStats = applySurvivedCounts(laneStats, flatSources);
    await persistLaneStats(laneStats);

    if (clusteredStories.length === 0) {
      const laneSummary = [
        formatLaneStatsSummary(laneStats),
        `${candidates.length} candidates collected`,
        `${allClusters.length} distinct stories after clustering`,
        lanesFailed.length > 0
          ? `failed lanes: ${lanesFailed.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join(". ");
      throw new Error(`Filter agent selected zero stories (${laneSummary})`);
    }

    console.log(
      `[run ${runId.slice(0, 8)}] Clustered ${pool.length} sources → ${allClusters.length} distinct stories → selected ${clusteredStories.length} (${allClusterUrls(clusteredStories).length} URLs)`
    );

    const draft = await runReporterAgent(
      clusteredStories,
      normalizedProfile,
      costTracker
    );
    const polished = await runEditorAgent(
      draft,
      flatSources,
      normalizedProfile,
      costTracker
    );

    let html: string;
    try {
      html = await runDesignAgent(polished, normalizedProfile, costTracker);
    } catch {
      const brand = inferBrand(normalizedProfile);
      html = markdownToPlainHtml(polished, brand);
    }

    const wordCount = countWordsExcludingLinks(polished);
    const deliveryRecipients = getDeliveryRecipients(normalizedProfile.recipients);

    const alreadySent = await isRunAlreadySent(runId);
    try {
      if (!alreadySent && deliveryRecipients.length > 0) {
        const subject = `${normalizedProfile.company || "Your"} Weekly Brief — ${new Date().toLocaleDateString()}`;
        await sendNewsletterEmail(
          deliveryRecipients,
          subject,
          html,
          normalizedProfile.reply_to || undefined
        );

        await recordSentUrls(allClusterUrls(clusteredStories));
      }

      await saveNewsletter(runId, html, polished, wordCount);
    } catch (sendErr) {
      await saveNewsletter(runId, html, polished, wordCount).catch(() => {});
      throw sendErr;
    }

    await updateRun(runId, {
      status: "done",
      finished_at: new Date().toISOString(),
      cost_estimate_usd: estimateCost(costTracker),
      lanes_succeeded: lanesSucceeded,
      lanes_failed: lanesFailed,
      lane_stats: laneStats,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await updateRun(runId, {
      status: "failed",
      finished_at: new Date().toISOString(),
      cost_estimate_usd: estimateCost(costTracker),
      error: errorMessage,
      lanes_succeeded: lanesSucceeded,
      lanes_failed: lanesFailed,
      lane_stats: laneStats,
    });

    if (getDeliveryRecipients(normalizedProfile.recipients).length > 0) {
      await sendFailureAlert(
        getDeliveryRecipients(normalizedProfile.recipients),
        runId,
        errorMessage
      ).catch(() => {});
    }

    throw err;
  }
}
