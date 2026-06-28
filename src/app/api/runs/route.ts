import { NextResponse } from "next/server";
import { getRecentRuns, updateRun } from "@/lib/supabase";

const STALE_RUN_MS = 10 * 60 * 1000;

export async function GET() {
  try {
    const runs = await getRecentRuns(20);

    const now = Date.now();
    for (const run of runs) {
      if (run.status !== "running" || !run.started_at) continue;
      const elapsed = now - new Date(run.started_at).getTime();
      if (elapsed > STALE_RUN_MS) {
        await updateRun(run.id, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error:
            "Run timed out — likely stuck on Apify (X/LinkedIn) or LLM synthesis. Restart dev server and try again.",
        });
        run.status = "failed";
        run.error =
          "Run timed out — likely stuck on Apify (X/LinkedIn) or LLM synthesis. Restart dev server and try again.";
        run.finished_at = new Date().toISOString();
      }
    }

    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load runs" },
      { status: 500 }
    );
  }
}
