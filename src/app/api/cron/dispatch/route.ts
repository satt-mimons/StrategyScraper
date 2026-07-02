import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { getDueSchedules, claimDueSchedule } from "@/lib/supabase";
import { computeNextSendAt } from "@/lib/schedule";

// This route only claims due rows and fans out — the ~270s pipelines run in the worker
// invocations it triggers, never here. A short budget is plenty and keeps a stuck tick from
// holding the function open.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Hourly scheduler tick (Vercel Cron). For every enabled schedule that's due it:
 *   1. atomically claims the row (advancing next_send_at so overlapping ticks can't both win),
 *   2. only if the claim succeeded, triggers ONE worker invocation for that newsletter.
 *
 * Each newsletter is its own unit of work — a separate HTTP invocation with its own 300s budget —
 * so we never run multiple pipelines serially inside this tick. We await only the fast kickoff
 * ack from each worker (it returns before its own pipeline runs via after()), not the pipeline.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const secret = process.env.CRON_SECRET as string; // isAuthorizedCron already asserted presence
  const origin = new URL(request.url).origin;

  const due = await getDueSchedules(now);
  const results: Array<Record<string, unknown>> = [];

  for (const nl of due) {
    if (!nl.next_send_at) continue; // getDueSchedules filters nulls, but keep TS + logic honest

    // Claim the row first, computing the next occurrence from `now` so the new next_send_at is
    // always in the future (a late tick advances one cadence step, it doesn't backfill misses).
    let claimed = false;
    try {
      const nextSendAt = computeNextSendAt(
        nl.frequency,
        nl.send_day,
        nl.send_hour,
        nl.timezone,
        now
      );
      claimed = await claimDueSchedule(
        nl.id,
        nl.next_send_at,
        nextSendAt.toISOString(),
        now.toISOString()
      );
    } catch (err) {
      // A misconfigured schedule (e.g. weekly with no send_day) must not break the whole tick.
      console.error(`[cron] Failed to claim schedule ${nl.id}:`, err);
      results.push({ id: nl.id, claimed: false, error: errorText(err) });
      continue;
    }

    if (!claimed) {
      // Another tick already claimed it, or it was disabled in the interim.
      results.push({ id: nl.id, claimed: false });
      continue;
    }

    try {
      const res = await fetch(`${origin}/api/cron/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ newsletterId: nl.id, userId: nl.user_id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        runId?: string;
        error?: string;
      };
      results.push({
        id: nl.id,
        claimed: true,
        ok: res.ok,
        runId: data.runId,
        error: res.ok ? undefined : data.error,
      });
      if (!res.ok) {
        console.error(`[cron] Worker rejected ${nl.id}: ${data.error ?? res.status}`);
      }
    } catch (err) {
      // The row is already claimed (advanced), so it won't retry until its next cadence slot.
      console.error(`[cron] Failed to trigger worker for ${nl.id}:`, err);
      results.push({ id: nl.id, claimed: true, ok: false, error: errorText(err) });
    }
  }

  return NextResponse.json({ tick: now.toISOString(), due: due.length, results });
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
