import { runNewsLane } from "@/agents/lanes/news";
import { runAnalystLane } from "@/agents/lanes/analyst";
import { runSubstackLane } from "@/agents/lanes/substack";
import { runMediumLane } from "@/agents/lanes/medium";
import { runXLane } from "@/agents/lanes/x";
import { runLinkedInLane } from "@/agents/lanes/linkedin";
import { runFilterAgent } from "@/agents/filter";
import { runReporterAgent } from "@/agents/reporter";
import { runEditorAgent } from "@/agents/editor";
import { runDesignAgent, inferBrand, markdownToPlainHtml } from "@/agents/design";
import { createCostTracker, estimateCost, checkCostCap } from "@/lib/anthropic";
import { LANE_TIMEOUT_MS } from "@/lib/constants";
import { sendNewsletterEmail, sendFailureAlert } from "@/lib/resend";
import {
  insertCandidates,
  updateRun,
  saveNewsletter,
  recordSentUrls,
  isRunAlreadySent,
  getCandidatesForRun,
} from "@/lib/supabase";
import { getRecencyCutoff, loadSentUrlSet, withTimeout, countWordsExcludingLinks } from "@/lib/utils";
import type { Candidate, LaneResult, PipelineContext, Profile } from "@/types";

type LaneRunner = (ctx: PipelineContext) => Promise<LaneResult>;

const ALL_LANES: { name: string; runner: LaneRunner }[] = [
  { name: "news", runner: runNewsLane },
  { name: "analyst", runner: runAnalystLane },
  { name: "substack", runner: runSubstackLane },
  { name: "medium", runner: runMediumLane },
  { name: "x", runner: runXLane },
  { name: "linkedin", runner: runLinkedInLane },
];

export async function runPipeline(
  runId: string,
  profile: Profile
): Promise<void> {
  const costTracker = createCostTracker();
  const recencyCutoff = await getRecencyCutoff();
  const sentUrls = await loadSentUrlSet();

  const ctx: PipelineContext = {
    runId,
    profile,
    recencyCutoff,
    costTracker,
  };

  await updateRun(runId, {
    status: "running",
    started_at: new Date().toISOString(),
  });

  const lanesSucceeded: string[] = [];
  const lanesFailed: string[] = [];

  try {
    // Phase 1: Parallel research lanes with per-lane timeouts
    const laneResults = await Promise.allSettled(
      ALL_LANES.map(async ({ name, runner }) => {
        try {
          const result = await withTimeout(
            runner(ctx),
            LANE_TIMEOUT_MS,
            `Lane ${name}`
          );
          return result;
        } catch (err) {
          return {
            lane: name,
            candidates: [],
            success: false,
            error: err instanceof Error ? err.message : String(err),
          } as LaneResult;
        }
      })
    );

    const allCandidates: Candidate[] = [];

    for (const settled of laneResults) {
      if (settled.status === "fulfilled") {
        const result = settled.value;
        if (result.success) {
          lanesSucceeded.push(result.lane);
        } else {
          lanesFailed.push(result.lane);
        }
        const withRunId = result.candidates.map((c) => ({
          ...c,
          run_id: runId,
        }));
        allCandidates.push(...withRunId);
      } else {
        lanesFailed.push("unknown");
      }
    }

    if (allCandidates.length > 0) {
      await insertCandidates(allCandidates);
    }

    const capCheck = checkCostCap(costTracker);
    if (!capCheck.ok) {
      throw new Error(capCheck.message);
    }

    if (lanesSucceeded.length === 0) {
      throw new Error("All research lanes failed — no candidates collected");
    }

    // Phase 2: Sequential downstream pipeline
    const candidates =
      allCandidates.length > 0
        ? allCandidates
        : await getCandidatesForRun(runId);

    const selectedStories = await runFilterAgent(
      candidates,
      profile,
      sentUrls,
      costTracker
    );

    if (selectedStories.length === 0) {
      throw new Error("Filter agent selected zero stories");
    }

    const draft = await runReporterAgent(selectedStories, profile, costTracker);
    const polished = await runEditorAgent(
      draft,
      selectedStories,
      profile,
      costTracker
    );

    let html: string;
    try {
      html = await runDesignAgent(polished, profile, costTracker);
    } catch {
      const brand = inferBrand(profile);
      html = markdownToPlainHtml(polished, brand);
    }

    const wordCount = countWordsExcludingLinks(polished);

    // Idempotency: never double-send for the same run
    const alreadySent = await isRunAlreadySent(runId);
    if (!alreadySent && profile.recipients.length > 0) {
      const subject = `${profile.company || "Your"} Weekly Brief — ${new Date().toLocaleDateString()}`;
      await sendNewsletterEmail(
        profile.recipients,
        subject,
        html,
        profile.reply_to || undefined
      );

      await recordSentUrls(selectedStories.map((s) => s.url));
    }

    await saveNewsletter(runId, html, polished, wordCount);

    await updateRun(runId, {
      status: "done",
      finished_at: new Date().toISOString(),
      cost_estimate_usd: estimateCost(costTracker),
      lanes_succeeded: lanesSucceeded,
      lanes_failed: lanesFailed,
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
    });

    if (profile.recipients.length > 0) {
      await sendFailureAlert(profile.recipients, runId, errorMessage).catch(
        () => {}
      );
    }

    throw err;
  }
}
