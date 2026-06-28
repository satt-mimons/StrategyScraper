import { NextResponse } from "next/server";
import { getRecentRuns } from "@/lib/supabase";

export async function GET() {
  try {
    const runs = await getRecentRuns(20);
    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load runs" },
      { status: 500 }
    );
  }
}
