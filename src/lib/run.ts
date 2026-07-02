import { after } from "next/server";
import { runPipeline } from "@/agents/chief";
import { createRun, getNewsletterConfig } from "@/lib/supabase";
import { newsletterToProfile } from "@/lib/profile-utils";
import { getDeliveryRecipients } from "@/lib/resend";
import type { RunMode } from "@/types";

/** A validation/precondition failure the caller should surface as a 4xx, not a 500. */
export class StartRunError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "StartRunError";
  }
}

interface StartRunOptions {
  /** Required for mode "preview": the address the test edition is emailed to (the requester). */
  previewRecipient?: string;
}

/**
 * Shared run kickoff for BOTH "generate now" (mode "preview" or an explicit "live") and the
 * scheduled cron (always "live"). Validates preconditions, creates the run row, and fires the
 * pipeline on the same invocation via after() so the HTTP response returns immediately.
 *
 * Ownership is enforced by the userId filter in getNewsletterConfig: pass the authenticated
 * user for manual runs, or the schedule row's own user_id for cron runs.
 */
export async function startRun(
  newsletterId: string,
  userId: string,
  mode: RunMode,
  options: StartRunOptions = {}
): Promise<{ runId: string }> {
  const newsletter = await getNewsletterConfig(newsletterId, userId);
  if (!newsletter) {
    throw new StartRunError("Newsletter not found.", 404);
  }

  const profile = newsletterToProfile(newsletter);

  if ((profile.topics ?? []).length === 0) {
    throw new StartRunError("Add at least one topic before generating.", 400);
  }

  if (mode === "preview") {
    if (!options.previewRecipient) {
      throw new StartRunError("A preview requires a recipient address.", 400);
    }
  } else if (getDeliveryRecipients(profile.recipients ?? []).length === 0) {
    throw new StartRunError(
      "Add at least one recipient email (or set RESEND_TO_EMAIL in .env.local).",
      400
    );
  }

  const run = await createRun(newsletterId, userId);

  // Continue the pipeline after the response on Vercel (extended-duration function).
  after(async () => {
    try {
      await runPipeline(run.id, profile, {
        mode,
        previewRecipient: options.previewRecipient,
      });
    } catch (err) {
      console.error(`Pipeline failed for run ${run.id}:`, err);
    }
  });

  return { runId: run.id };
}
