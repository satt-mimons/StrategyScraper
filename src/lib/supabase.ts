import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { normalizeProfile } from "@/lib/profile-utils";
import type {
  Candidate,
  NewsletterConfig,
  Profile,
  Run,
  RunStatus,
} from "@/types";

let supabase: SupabaseClient | null = null;

function validateSupabaseEnv(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }
  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is a publishable key. In Supabase → Project Settings → API, copy the secret / service_role key (starts with sb_secret_ or eyJ…), not the publishable key."
    );
  }
  return { url, key };
}

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    const { url, key } = validateSupabaseEnv();
    supabase = createClient(url, key);
  }
  return supabase;
}

function formatDbError(error: { message: string; code?: string; hint?: string }): string {
  if (error.code === "42P01") {
    return "Database tables not found. Run supabase/migrations/001_initial.sql in the Supabase SQL Editor.";
  }
  return error.message;
}

export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await getSupabase()
    .from("profile")
    .select("*")
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") {
    throw new Error(formatDbError(error));
  }
  if (!data) return null;
  return normalizeProfile(data as Profile);
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
    if (error) throw new Error(formatDbError(error));
    return data as Profile;
  }

  const { data, error } = await getSupabase()
    .from("profile")
    .insert({ ...profile, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(formatDbError(error));
  return data as Profile;
}

export async function createRun(
  newsletterId: string,
  userId: string
): Promise<Run> {
  const { data, error } = await getSupabase()
    .from("runs")
    .insert({ status: "queued", newsletter_id: newsletterId, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Run;
}

/**
 * Fetch a single newsletter config, scoped to its owner. Uses the service-role client, so the
 * user_id filter (not RLS) is what enforces ownership — always pass the authenticated user's id
 * (or, for scheduled runs, the row's own user_id).
 */
export async function getNewsletterConfig(
  newsletterId: string,
  userId: string
): Promise<NewsletterConfig | null> {
  const { data, error } = await getSupabase()
    .from("newsletter_configs")
    .select("*")
    .eq("id", newsletterId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(formatDbError(error));
  return (data as NewsletterConfig) ?? null;
}

/**
 * Enabled schedules whose next_send_at is due (<= now). The cron dispatcher reads these, then
 * claims each one individually (see claimDueSchedule) before starting any pipeline.
 */
export async function getDueSchedules(
  now: Date = new Date()
): Promise<NewsletterConfig[]> {
  const { data, error } = await getSupabase()
    .from("newsletter_configs")
    .select("*")
    .eq("schedule_enabled", true)
    .not("next_send_at", "is", null)
    .lte("next_send_at", now.toISOString());
  if (error) throw new Error(formatDbError(error));
  return (data as NewsletterConfig[]) ?? [];
}

/**
 * Atomically claim a due schedule for sending: advance next_send_at to the next occurrence and
 * stamp last_sent_at, but ONLY if next_send_at still equals the value we read. Two overlapping
 * cron ticks racing on the same row: the first update matches and wins, the second's WHERE no
 * longer matches and returns zero rows. Returns true iff this caller won the claim and should
 * start the pipeline.
 */
export async function claimDueSchedule(
  newsletterId: string,
  expectedNextSendAt: string,
  newNextSendAt: string,
  lastSentAt: string
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("newsletter_configs")
    .update({ next_send_at: newNextSendAt, last_sent_at: lastSentAt })
    .eq("id", newsletterId)
    .eq("schedule_enabled", true)
    .eq("next_send_at", expectedNextSendAt)
    .select("id");
  if (error) throw new Error(formatDbError(error));
  return (data?.length ?? 0) > 0;
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

export async function getNewsletterContentByRunId(
  runId: string
): Promise<{ html: string } | null> {
  const { data, error } = await getSupabase()
    .from("newsletters")
    .select("html")
    .eq("run_id", runId)
    .maybeSingle();
  if (error) throw error;
  return data as { html: string } | null;
}

/** Content metadata (word count + markdown for a pull quote) keyed by run id. */
export async function getNewsletterMetaByRunIds(
  runIds: string[]
): Promise<Map<string, { word_count: number; markdown: string }>> {
  const result = new Map<string, { word_count: number; markdown: string }>();
  if (runIds.length === 0) return result;
  const { data, error } = await getSupabase()
    .from("newsletters")
    .select("run_id, word_count, markdown")
    .in("run_id", runIds);
  if (error) throw error;
  for (const row of (data ?? []) as {
    run_id: string;
    word_count: number | null;
    markdown: string | null;
  }[]) {
    // Keep the first (newest insert) per run id.
    if (!result.has(row.run_id)) {
      result.set(row.run_id, {
        word_count: row.word_count ?? 0,
        markdown: row.markdown ?? "",
      });
    }
  }
  return result;
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

export async function getRecentRuns(
  newsletterId: string,
  limit = 10
): Promise<Run[]> {
  const { data, error } = await getSupabase()
    .from("runs")
    .select("*")
    .eq("newsletter_id", newsletterId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Run[];
}

/** Latest run per newsletter, for the dashboard cards. */
export async function getLatestRunsByNewsletter(
  newsletterIds: string[]
): Promise<Map<string, Run>> {
  if (newsletterIds.length === 0) return new Map();
  const { data, error } = await getSupabase()
    .from("runs")
    .select("*")
    .in("newsletter_id", newsletterIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const latest = new Map<string, Run>();
  for (const run of (data ?? []) as Run[]) {
    if (run.newsletter_id && !latest.has(run.newsletter_id)) {
      latest.set(run.newsletter_id, run);
    }
  }
  return latest;
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
