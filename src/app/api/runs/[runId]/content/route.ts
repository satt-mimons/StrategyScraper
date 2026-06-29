import { NextResponse } from "next/server";
import { getNewsletterContentByRunId, getRun } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

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

    const content = await getNewsletterContentByRunId(runId);
    if (!content) {
      return NextResponse.json({ error: "Newsletter content not available yet" }, { status: 404 });
    }

    return NextResponse.json({ html: content.html });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load preview" },
      { status: 500 }
    );
  }
}
