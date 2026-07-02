import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { startRun, StartRunError } from "@/lib/run";

// One scheduled newsletter per invocation, with the full pipeline budget. The dispatcher fans
// out to this worker so no two pipelines ever run serially in the same function.
export const maxDuration = 300;

/**
 * Internal worker: runs a single scheduled newsletter live. Called only by /api/cron/dispatch
 * (authenticated with the same CRON_SECRET). Returns the run id as soon as the pipeline is
 * kicked off — the pipeline itself continues via after() on this invocation.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      newsletterId?: string;
      userId?: string;
    };
    if (!body.newsletterId || !body.userId) {
      return NextResponse.json(
        { error: "newsletterId and userId required" },
        { status: 400 }
      );
    }

    // Scheduled sends are always live: real recipients + recordSentUrls. Double-send is prevented
    // upstream by the atomic claim in dispatch and downstream by isRunAlreadySent in chief.ts.
    const { runId } = await startRun(body.newsletterId, body.userId, "live");
    return NextResponse.json({ runId, status: "running" });
  } catch (err) {
    if (err instanceof StartRunError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start scheduled run" },
      { status: 500 }
    );
  }
}
