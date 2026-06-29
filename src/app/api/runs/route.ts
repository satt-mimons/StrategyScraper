import { NextResponse } from "next/server";
import { getRecentRuns, updateRun } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";

const STALE_RUN_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const newsletterId = searchParams.get("newsletterId");
  if (!newsletterId) {
    return NextResponse.json({ error: "newsletterId required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const { data: newsletter } = await supabase
      .from("newsletter_configs")
      .select("id")
      .eq("id", newsletterId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!newsletter) {
      return NextResponse.json({ error: "Newsletter not found." }, { status: 404 });
    }

    const runs = await getRecentRuns(newsletterId, 20);

    const now = Date.now();
    for (const run of runs) {
      if (run.status !== "running" || !run.started_at) continue;
      const elapsed = now - new Date(run.started_at).getTime();
      if (elapsed > STALE_RUN_MS) {
        await updateRun(run.id, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error:
            "Run timed out — likely stuck on a slow research lane or LLM synthesis. Restart dev server and try again.",
        });
        run.status = "failed";
        run.error =
          "Run timed out — likely stuck on a slow research lane or LLM synthesis. Restart dev server and try again.";
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
