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
import { renderNewsletterHtml, inferBrand } from "@/agents/design";
import { createCostTracker, estimateCost, checkCostCap } from "@/lib/anthropic";
import { sendNewsletterEmail, sendFailureAlert, getDeliveryRecipients } from "@/lib/resend";
import {
  insertCandidates,
  updateRun,
  saveNewsletter,
  recordSentUrls,
  isRunAlreadySent,
  getCandidatesForRun,
  getRun,
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
import {
  LANE_TIMEOUT_MS,
  PIPELINE_TIMEOUT_MS,
  EDITOR_STAGE_TIMEOUT_MS,
} from "@/lib/constants";
import type {
  Candidate,
  LaneResult,
  PipelineContext,
  PipelineStage,
  Profile,
  StageTiming,
} from "@/types";

/**
 * Log a one-line total + per-step breakdown to the function logs, then best-effort persist to
 * runs.stage_timings. Kept separate from the main status update (and swallowing its own errors)
 * so a missing column — e.g. migration 009 not yet applied — can never fail an otherwise-good
 * run. The log line is always emitted regardless.
 */
async function persistStageTimings(
  runId: string,
  timings: StageTiming[]
): Promise<void> {
  if (timings.length === 0) return;
  const totalMs = timings.reduce((sum, t) => sum + t.ms, 0);
  const breakdown = timings
    .map((t) => `${t.step} ${(t.ms / 1000).toFixed(1)}s`)
    .join(" · ");
  console.log(
    `[run ${runId.slice(0, 8)}] ⏱ total ${(totalMs / 1000).toFixed(1)}s — ${breakdown}`
  );
  try {
    await updateRun(runId, { stage_timings: timings });
  } catch (err) {
    console.warn(
      `[run ${runId.slice(0, 8)}] Could not persist stage_timings — run supabase/migrations/009_runs_stage_timings.sql:`,
      err instanceof Error ? err.message : err
    );
  }
}

export async function runPipeline(
  runId: string,
  profile: Profile
): Promise<void> {
  try {
    await withTimeout(
      runPipelineInner(runId, profile),
      PIPELINE_TIMEOUT_MS,
      "Pipeline"
    );
  } catch (err) {
    // The wall-clock timeout fires via an EXTERNAL Promise.race, so its rejection never reaches
    // runPipelineInner's own try/catch — without this, a timed-out run is left frozen as
    // status=running until Vercel hard-kills the function. Mark it failed here. Errors thrown
    // *inside* the pipeline are already handled (and written with richer detail) by the inner
    // catch, so only write if the run isn't already terminal — don't clobber that.
    const message = err instanceof Error ? err.message : String(err);
    try {
      const current = await getRun(runId);
      if (current && current.status !== "done" && current.status !== "failed") {
        await updateRun(runId, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error: message,
        });
      }
    } catch {
      // Best-effort cleanup — never mask the original failure.
    }
    throw err;
  }
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

  async function setStage(stage: PipelineStage): Promise<void> {
    await updateRun(runId, { stage });
  }

  // Per-step wall-clock timing for troubleshooting where a run spends its 300s budget.
  // Persisted to runs.stage_timings (diagnostics only — not shown in the UI) and logged.
  // Persisted INCREMENTALLY after every step: a run that blows the budget gets hard-killed by
  // Vercel at 300s, which bypasses both the success and catch paths — so end-of-run persistence
  // alone captures nothing for exactly the timeout case we're debugging. Writing after each
  // step means a killed run still shows every step that completed before the wall.
  const stageTimings: StageTiming[] = [];
  async function timed<T>(step: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      const ms = Date.now() - start;
      stageTimings.push({ step, ms });
      console.log(`[run ${runId.slice(0, 8)}] ⏱ ${step}: ${(ms / 1000).toFixed(1)}s`);
      // Best-effort — never let a timing write break the run.
      await updateRun(runId, { stage_timings: stageTimings }).catch(() => {});
    }
  }

  await updateRun(runId, {
    status: "running",
    stage: "research",
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
    const settledResults = await timed("research", () =>
      Promise.allSettled(
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
      )
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

    await setStage("filter");

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

    const allClusters = await timed("cluster", () =>
      runClusterAgent(pool, normalizedProfile, costTracker)
    );

    if (allClusters.length === 0) {
      throw new Error("Cluster agent produced zero distinct stories");
    }

    const clusteredStories = await timed("filter", () =>
      runFilterAgent(allClusters, normalizedProfile, costTracker)
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

    await setStage("write");

    const draft = await timed("write:reporter", () =>
      runReporterAgent(clusteredStories, normalizedProfile, costTracker)
    );
    // The editor is the last expensive stage and only polishes an already-complete, valid
    // draft — so it must never be allowed to run the pipeline into the 270s wall. Bound the
    // whole editor stage; if it exceeds its budget (or throws), ship the unpolished draft.
    const polished = await timed("write:editor", () =>
      withTimeout(
        runEditorAgent(draft, flatSources, normalizedProfile, costTracker),
        EDITOR_STAGE_TIMEOUT_MS,
        "Editor stage"
      ).catch((err) => {
        console.error(
          `[run ${runId.slice(0, 8)}] editor stage failed/timed out, shipping unedited reporter draft: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        return draft;
      })
    );

    await setStage("design");

    // Deterministic markdown→HTML render — no LLM call. This used to be the pipeline's
    // largest LLM call (Sonnet, 16K output tokens) and is what pushed runs over Vercel's
    // 300s cap. renderNewsletterHtml fails loudly if it drops any link or Further Reading.
    const brand = inferBrand(normalizedProfile);
    const html = await timed("design", async () =>
      renderNewsletterHtml(polished, brand)
    );

    await setStage("deliver");

    const wordCount = countWordsExcludingLinks(polished);
    const deliveryRecipients = getDeliveryRecipients(normalizedProfile.recipients);

    const alreadySent = await isRunAlreadySent(runId);
    await timed("deliver", async () => {
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
    });

    await persistStageTimings(runId, stageTimings);
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

    // Persist whatever steps completed before the failure — these timings show how close the
    // run got to the 300s cap and which step ran long.
    await persistStageTimings(runId, stageTimings);
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
