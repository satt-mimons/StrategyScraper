/**
 * Offline verification of the cluster -> balanced-select pipeline.
 *
 * Reuses an existing run's candidate pool from Supabase and runs ONLY:
 *   runClusterAgent (dedup by event + argument)  ->  selectStories (topic balancing)
 *
 * It never invokes research lanes, the reporter/editor, or Resend — so it sends no email
 * and incurs no Exa/Apify cost (only two small Sonnet calls: cluster + relevance rank).
 *
 * Usage: npx tsx scripts/verify-selection.ts [runId]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local into process.env (no dependency on dotenv / --env-file).
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // fall through — env may already be set
}

import {
  getProfile,
  getCandidatesForRun,
  getSupabase,
} from "@/lib/supabase";
import { normalizeProfile } from "@/lib/profile-utils";
import { isDenylisted } from "@/lib/source-quality";
import { dedupeByUrl } from "@/lib/utils";
import { createCostTracker, estimateCost } from "@/lib/anthropic";
import { runClusterAgent } from "@/agents/cluster";
import { selectStories } from "@/agents/filter";
import type { Candidate } from "@/types";

async function main() {
  const argRun = process.argv[2];
  const profileRaw = await getProfile();
  if (!profileRaw) throw new Error("No profile found in Supabase.");
  const profile = normalizeProfile(profileRaw);

  // Find a run that actually has candidates (newest first).
  let runId = argRun ?? "";
  let candidates: Candidate[] = [];
  if (runId) {
    candidates = await getCandidatesForRun(runId);
  } else {
    // Runs are scoped per-newsletter; pull the 10 most recent across all
    // newsletters so this offline check works without a newsletter id.
    const { data: runs, error } = await getSupabase()
      .from("runs")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    for (const r of runs ?? []) {
      const c = await getCandidatesForRun(r.id);
      if (c.length > 0) {
        runId = r.id;
        candidates = c;
        break;
      }
    }
  }
  if (candidates.length === 0) {
    throw new Error(`No candidates found${runId ? ` for run ${runId}` : ""}.`);
  }

  const pool = dedupeByUrl(
    candidates.filter((c) => c.url && !isDenylisted(c.url))
  );

  const tracker = createCostTracker();
  const allClusters = await runClusterAgent(pool, profile, tracker);
  const { selected, byTopic } = await selectStories(allClusters, profile, tracker);

  console.log("\n=================================================");
  console.log(`Run: ${runId}`);
  console.log(
    `Candidates: ${candidates.length} raw -> ${pool.length} after dedup/denylist`
  );
  console.log(
    `Clustered into ${allClusters.length} distinct stories -> selected ${selected.length}`
  );
  console.log(`LLM cost (cluster + rank): ~$${estimateCost(tracker).toFixed(4)}`);
  console.log("=================================================\n");

  console.log("DISTRIBUTION BY TOPIC (selected / available):");
  for (const t of byTopic) {
    console.log(
      `  ${t.thin ? "⚠ THIN " : "       "}${t.topic}: ${t.selected} selected / ${t.available} available`
    );
  }

  console.log("\nSELECTED STORIES (grouped by topic, with source_count):");
  for (const t of byTopic) {
    const stories = selected.filter((s) => s.primary_topic === t.topic);
    console.log(`\n## ${t.topic} (${stories.length} stories${t.thin ? " — THIN" : ""})`);
    if (stories.length === 0) {
      console.log("   (none)");
      continue;
    }
    for (const s of stories) {
      console.log(
        `   • [${s.source_count} src] ${s.headline}  {${s.source_types.join(", ")}}`
      );
    }
  }

  const totalSources = selected.reduce((n, s) => n + s.source_count, 0);
  console.log(
    `\nTOTAL: ${selected.length} distinct stories, ${totalSources} member sources.\n`
  );
}

main().catch((err) => {
  console.error("verify-selection failed:", err);
  process.exit(1);
});
