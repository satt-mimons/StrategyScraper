import { NextResponse } from "next/server";
import { startRun, StartRunError } from "@/lib/run";
import { getRun } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";
import type { RunMode } from "@/types";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const newsletterId: unknown = body.newsletterId;
    if (!newsletterId || typeof newsletterId !== "string") {
      return NextResponse.json({ error: "newsletterId required" }, { status: 400 });
    }

    // "Generate now" defaults to a preview (goes only to the requester, never records sent URLs);
    // the UI opts in to "live" explicitly to send the real edition. An unrecognized mode is
    // rejected rather than silently coerced.
    if (body.mode !== undefined && body.mode !== "live" && body.mode !== "preview") {
      return NextResponse.json({ error: "mode must be 'live' or 'preview'." }, { status: 400 });
    }
    const mode: RunMode = body.mode === "live" ? "live" : "preview";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const { runId } = await startRun(newsletterId, user.id, mode, {
      previewRecipient: user.email ?? undefined,
    });

    return NextResponse.json({ runId, status: "running", mode });
  } catch (err) {
    if (err instanceof StartRunError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start generation" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const run = await getRun(runId);
    if (!run || run.user_id !== user.id) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({ run });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get run status" },
      { status: 500 }
    );
  }
}
