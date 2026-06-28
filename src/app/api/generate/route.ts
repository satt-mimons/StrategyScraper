import { NextResponse, after } from "next/server";
import { runPipeline } from "@/agents/chief";
import { createRun, getProfile, getRun } from "@/lib/supabase";
import { getDeliveryRecipients } from "@/lib/resend";

export const maxDuration = 300;

export async function POST() {
  try {
    const profile = await getProfile();
    if (!profile) {
      return NextResponse.json(
        { error: "No profile configured. Save your settings first." },
        { status: 400 }
      );
    }

    if (profile.topics.length === 0) {
      return NextResponse.json(
        { error: "Add at least one topic before generating." },
        { status: 400 }
      );
    }

    if (getDeliveryRecipients(profile.recipients).length === 0) {
      return NextResponse.json(
        { error: "Add at least one recipient email (or set RESEND_TO_EMAIL in .env.local)." },
        { status: 400 }
      );
    }

    const run = await createRun();

    // Continue pipeline after response on Vercel (extended-duration function)
    after(async () => {
      try {
        await runPipeline(run.id, profile);
      } catch (err) {
        console.error(`Pipeline failed for run ${run.id}:`, err);
      }
    });

    return NextResponse.json({ runId: run.id, status: "running" });
  } catch (err) {
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
    const run = await getRun(runId);
    if (!run) {
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
