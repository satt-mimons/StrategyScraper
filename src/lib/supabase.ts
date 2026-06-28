import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Candidate, Profile, Run, RunStatus } from "@/types";

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await getSupabase()
    .from("profile")
    .select("*")
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data as Profile | null;
}

export async function upsertProfile(
  profile: Partial<Profile> & { id?: string }
): Promise<Profile> {
  const existing = await getProfile();

  if (existing) {
    const { data, error } = await getSupabase()
      .from("profile")
      .update({ ...profile, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as Profile;
  }

  const { data, error } = await getSupabase()
    .from("profile")
    .insert({ ...profile, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function createRun(): Promise<Run> {
  const { data, error } = await getSupabase()
    .from("runs")
    .insert({ status: "queued" })
    .select()
    .single();
  if (error) throw error;
  return data as Run;
}

export async function updateRun(
  runId: string,
  updates: Partial<Run>
): Promise<void> {
  const { error } = await getSupabase()
    .from("runs")
    .update(updates)
    .eq("id", runId);
  if (error) throw error;
}

export async function insertCandidates(
  candidates: Candidate[]
): Promise<void> {
  if (candidates.length === 0) return;
  const { error } = await getSupabase().from("candidates").insert(candidates);
  if (error) throw error;
}

export async function getCandidatesForRun(runId: string): Promise<Candidate[]> {
  const { data, error } = await getSupabase()
    .from("candidates")
    .select("*")
    .eq("run_id", runId);
  if (error) throw error;
  return (data ?? []) as Candidate[];
}

export async function getSentUrls(since: Date): Promise<Set<string>> {
  const { data, error } = await getSupabase()
    .from("sent_urls")
    .select("url")
    .gte("sent_at", since.toISOString());
  if (error) throw error;
  return new Set((data ?? []).map((r: { url: string }) => r.url));
}

export async function recordSentUrls(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const rows = urls.map((url) => ({
    url,
    sent_at: new Date().toISOString(),
  }));
  const { error } = await getSupabase()
    .from("sent_urls")
    .upsert(rows, { onConflict: "url" });
  if (error) throw error;
}

export async function saveNewsletter(
  runId: string,
  html: string,
  markdown: string,
  wordCount: number
): Promise<void> {
  const { error } = await getSupabase().from("newsletters").insert({
    run_id: runId,
    html,
    markdown,
    word_count: wordCount,
  });
  if (error) throw error;
}

export async function getLastSuccessfulRunDate(): Promise<Date | null> {
  const { data, error } = await getSupabase()
    .from("runs")
    .select("finished_at")
    .eq("status", "done")
    .order("finished_at", { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  if (!data?.finished_at) return null;
  return new Date(data.finished_at);
}

export async function getRun(runId: string): Promise<Run | null> {
  const { data, error } = await getSupabase()
    .from("runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data as Run | null;
}

export async function getRecentRuns(limit = 10): Promise<Run[]> {
  const { data, error } = await getSupabase()
    .from("runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Run[];
}

export async function isRunAlreadySent(runId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("newsletters")
    .select("id")
    .eq("run_id", runId)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function markRunStatus(
  runId: string,
  status: RunStatus,
  extra: Partial<Run> = {}
): Promise<void> {
  await updateRun(runId, { status, ...extra });
}
