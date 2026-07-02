"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { TagInput } from "@/components/tag-input";
import {
  btnGhost,
  btnInkOutline,
  btnOxblood,
  ColorField,
  Field,
  FormSectionHeading,
  helperText,
  inputClass,
  LogoField,
  SourcesCallout,
} from "@/components/desk";
import {
  CADENCE_HELPER,
  CADENCE_OPTIONS,
  DEFAULT_EMAIL_ACCENT_COLOR,
  DEFAULT_EMAIL_PRIMARY_COLOR,
  SOURCES_CALLOUT_COPY,
} from "@/lib/constants";
import { computeNextSendAt } from "@/lib/schedule";
import { displayName } from "@/lib/newsletter-display";
import { summarizeRunCoverage } from "@/lib/lane-stats";
import type { NewsletterConfig, ProfileFrequency, RunMode, Run } from "@/types";

const RUN_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const DAY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const HOUR_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true });
const HOUR_OPTIONS: { value: number; label: string }[] = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  // Label each hour in the user's own clock convention (e.g. "9 AM", "1 PM").
  label: HOUR_FMT.format(new Date(Date.UTC(2020, 0, 1, h))),
}));

// Full IANA zone list when the runtime supports it; a small curated fallback otherwise.
const TIME_ZONES: string[] =
  typeof (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf ===
  "function"
    ? (Intl as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone")
    : [
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
        "Europe/London",
        "UTC",
      ];

function formatNextSend(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
}

export default function EditNewsletterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [newsletter, setNewsletter] = useState<NewsletterConfig | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("newsletter_configs")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error || !data) {
      setNotFound(true);
    } else {
      const row = data as Partial<NewsletterConfig>;
      const browserTz =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
      // Coalesce the scheduling fields so the form works whether or not migration 010 is applied
      // yet, and default the timezone to the browser's for schedules the user hasn't set up.
      setNewsletter({
        ...(row as NewsletterConfig),
        schedule_enabled: row.schedule_enabled ?? false,
        send_day: row.send_day ?? null,
        send_month_day: row.send_month_day ?? null,
        send_hour: row.send_hour ?? 9,
        timezone: row.schedule_enabled ? row.timezone || browserTz : browserTz,
        next_send_at: row.next_send_at ?? null,
        last_sent_at: row.last_sent_at ?? null,
      });
    }
    setLoading(false);
  }, [supabase, params.id]);

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/runs?newsletterId=${params.id}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.runs) setRuns(data.runs as Run[]);
  }, [params.id]);

  useEffect(() => {
    load();
    loadRuns();
  }, [load, loadRuns]);

  const patch = (updates: Partial<NewsletterConfig>) =>
    setNewsletter((n) => (n ? { ...n, ...updates } : n));

  const saveChanges = async (): Promise<boolean> => {
    if (!newsletter) return false;
    setSaving(true);
    setMessage(null);
    try {
      // `daily` has no anchor weekday; every other cadence needs one (default Monday).
      const sendDay =
        newsletter.frequency === "daily" ? null : (newsletter.send_day ?? 1);
      // Day-of-month override only applies to monthly; drop it otherwise so it can't linger.
      const sendMonthDay =
        newsletter.frequency === "monthly" ? (newsletter.send_month_day ?? null) : null;
      // Recompute next_send_at on every save so the schedule always reflects the current
      // settings; null when disabled so the cron dispatcher ignores the row.
      const nextSendAt = newsletter.schedule_enabled
        ? computeNextSendAt(
            newsletter.frequency,
            sendDay,
            newsletter.send_hour,
            newsletter.timezone,
            new Date(),
            sendMonthDay
          ).toISOString()
        : null;

      const { error } = await supabase
        .from("newsletter_configs")
        .update({
          name: newsletter.name,
          company: newsletter.company,
          role: newsletter.role,
          frequency: newsletter.frequency,
          topics: newsletter.topics,
          recipients: newsletter.recipients,
          reply_to: newsletter.reply_to,
          preferred_publications: newsletter.preferred_publications,
          substack_urls: newsletter.substack_urls,
          linkedin_urls: newsletter.linkedin_urls,
          primary_color: newsletter.primary_color,
          accent_color: newsletter.accent_color,
          logo_url: newsletter.logo_url,
          schedule_enabled: newsletter.schedule_enabled,
          send_day: sendDay,
          send_month_day: sendMonthDay,
          send_hour: newsletter.send_hour,
          timezone: newsletter.timezone,
          next_send_at: nextSendAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", newsletter.id);
      if (error) throw error;
      // Reflect the persisted anchor day / next send in local state.
      patch({ send_day: sendDay, send_month_day: sendMonthDay, next_send_at: nextSendAt });
      return true;
    } catch (err) {
      console.error("Failed to save newsletter:", err);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveChanges = async () => {
    const ok = await saveChanges();
    if (ok) setMessage({ type: "success", text: "Changes saved." });
  };

  const discardChanges = async () => {
    setMessage(null);
    setLoading(true);
    await load();
  };

  const generateNow = async (mode: RunMode) => {
    setGenerating(true);
    setMessage(null);
    const saved = await saveChanges();
    if (!saved) {
      setGenerating(false);
      return;
    }
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsletterId: newsletter!.id, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      router.push(`/newsletters/${newsletter!.id}/runs/${data.runId}`);
    } catch (err) {
      console.error("Failed to start generation:", err);
      setGenerating(false);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Generation failed",
      });
    }
  };

  // A live send emails the real recipients AND consumes this period's stories (they won't repeat
  // in the scheduled edition). Confirm before doing that; previews carry no such cost.
  const sendLiveNow = () => {
    const ok = window.confirm(
      "Send the real edition now?\n\nThis emails all configured recipients and uses up this period's stories — they won't appear in the next scheduled send. Choose “Preview to me” instead to test without either."
    );
    if (ok) generateNow("live");
  };

  if (loading) {
    return (
      <main className="max-w-[760px] mx-auto px-6 py-12 font-sans text-ink-4">Loading…</main>
    );
  }

  if (notFound || !newsletter) {
    return (
      <main className="max-w-[760px] mx-auto px-6 py-12">
        <p className="font-sans text-ink-3 mb-4">Brief not found.</p>
        <Link href="/" className="text-oxblood hover:opacity-70 text-sm">
          ← Back to The Desk
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-[760px] mx-auto px-6 py-12">
      <Link
        href="/"
        className="font-sans text-[13px] text-ink-4 hover:text-ink-2"
      >
        ← Back to The Desk
      </Link>

      <div className="flex items-baseline justify-between mt-4">
        <h1 className="font-serif text-[26px] font-semibold tracking-[-0.01em] text-ink">
          Edit brief
        </h1>
        <div className="font-mono text-[12px] text-ink-4">
          {displayName(newsletter)} · {newsletter.frequency}
        </div>
      </div>

      {message && (
        <div
          className={`mt-6 px-4 py-3 rounded-input font-mono text-[12px] border ${
            message.type === "success"
              ? "bg-moss-bg text-moss border-[#CBD6B4]"
              : "bg-note-bg text-oxblood border-[#EAD9A0]"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="bg-white border border-hairline rounded-card px-[26px] py-6 mt-[18px]">
        {/* Identity */}
        <FormSectionHeading>Identity</FormSectionHeading>
        <Field label="Newsletter name">
          <input
            type="text"
            value={newsletter.name}
            onChange={(e) => patch({ name: e.target.value })}
            className={inputClass}
            placeholder="Leave blank and we'll name it after your first topic"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field label="Company">
            <input
              type="text"
              value={newsletter.company}
              onChange={(e) => patch({ company: e.target.value })}
              className={inputClass}
              placeholder="ServiceNow"
            />
          </Field>
          <Field label="Role">
            <input
              type="text"
              value={newsletter.role}
              onChange={(e) => patch({ role: e.target.value })}
              className={inputClass}
              placeholder="VP, Corporate Strategy"
            />
          </Field>
        </div>

        {/* Topics & sources */}
        <div className="mt-[26px]">
          <FormSectionHeading>Topics &amp; sources</FormSectionHeading>
          <TagInput
            values={newsletter.topics}
            onChange={(topics) => patch({ topics })}
            placeholder="Add a topic — e.g. enterprise AI pricing"
          />
          <div className="mt-3">
            <SourcesCallout copy={SOURCES_CALLOUT_COPY} />
          </div>
        </div>

        {/* Delivery */}
        <div className="mt-[26px]">
          <FormSectionHeading>Delivery</FormSectionHeading>
          <Field label="Cadence — how far back we read">
            <select
              value={newsletter.frequency}
              onChange={(e) => patch({ frequency: e.target.value as ProfileFrequency })}
              className={inputClass}
            >
              {CADENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className={`${helperText} mt-2`}>{CADENCE_HELPER}</p>
          </Field>

          <Field label="Recipients" className="mt-4">
            <TagInput
              values={newsletter.recipients}
              onChange={(recipients) => patch({ recipients })}
              placeholder="you@company.com"
            />
          </Field>

          <Field label="Reply-To email" className="mt-4">
            <input
              type="email"
              value={newsletter.reply_to}
              onChange={(e) => patch({ reply_to: e.target.value })}
              className={inputClass}
              placeholder="you@company.com"
            />
          </Field>
        </div>

        {/* Schedule */}
        <div className="mt-[26px]">
          <FormSectionHeading>Schedule</FormSectionHeading>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={newsletter.schedule_enabled}
              onChange={(e) => patch({ schedule_enabled: e.target.checked })}
              className="h-4 w-4 accent-oxblood"
            />
            <span className="font-sans text-[14px] font-medium text-ink-2">
              Send this brief automatically on a recurring schedule
            </span>
          </label>
          <p className={`${helperText} mt-2`}>
            Runs on your <strong>{newsletter.frequency}</strong> cadence and emails your
            recipients — no button press needed. Change the cadence under Delivery above.
          </p>

          {newsletter.schedule_enabled && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {newsletter.frequency !== "daily" && (
                  <Field
                    label={
                      newsletter.frequency === "monthly" ? "First day of month" : "Day of week"
                    }
                  >
                    <select
                      value={newsletter.send_day ?? 1}
                      onChange={(e) => patch({ send_day: Number(e.target.value) })}
                      className={inputClass}
                    >
                      {DAY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Time">
                  <select
                    value={newsletter.send_hour}
                    onChange={(e) => patch({ send_hour: Number(e.target.value) })}
                    className={inputClass}
                  >
                    {HOUR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Timezone">
                <select
                  value={newsletter.timezone}
                  onChange={(e) => patch({ timezone: e.target.value })}
                  className={inputClass}
                >
                  {/* Ensure the current value is selectable even if it's outside the list. */}
                  {!TIME_ZONES.includes(newsletter.timezone) && (
                    <option value={newsletter.timezone}>{newsletter.timezone}</option>
                  )}
                  {TIME_ZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </Field>

              {(() => {
                try {
                  const sendDay =
                    newsletter.frequency === "daily" ? null : (newsletter.send_day ?? 1);
                  const sendMonthDay =
                    newsletter.frequency === "monthly"
                      ? (newsletter.send_month_day ?? null)
                      : null;
                  const next = computeNextSendAt(
                    newsletter.frequency,
                    sendDay,
                    newsletter.send_hour,
                    newsletter.timezone,
                    new Date(),
                    sendMonthDay
                  );
                  return (
                    <p className={helperText}>
                      Next send after saving:{" "}
                      <strong>{formatNextSend(next, newsletter.timezone)}</strong>
                    </p>
                  );
                } catch {
                  return (
                    <p className={helperText}>Pick a valid timezone to preview the next send.</p>
                  );
                }
              })()}
            </div>
          )}
        </div>

        {/* Advanced */}
        <details
          className="mt-[26px]"
          open={showAdvanced}
          onToggle={(e) => setShowAdvanced(e.currentTarget.open)}
        >
          <summary className="cursor-pointer font-mono text-[11px] font-medium tracking-[0.1em] uppercase text-ink-4 hover:text-ink-2">
            Advanced sources &amp; branding
          </summary>
          <div className="mt-4 space-y-4">
            {newsletter.frequency === "monthly" && (
              <Field label="Monthly send day · optional">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={newsletter.send_month_day ?? ""}
                  onChange={(e) =>
                    patch({
                      send_month_day:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className={inputClass}
                  placeholder="e.g. 15"
                />
                <p className={`${helperText} mt-2`}>
                  Send on this day of the month. Leave blank to use the first{" "}
                  {DAY_OPTIONS[newsletter.send_day ?? 1].label} of each month instead. Days past a
                  month&apos;s length (e.g. 31 in February) fall back to that month&apos;s last day.
                </p>
              </Field>
            )}
            <Field label="Preferred publications">
              <TagInput
                values={newsletter.preferred_publications}
                onChange={(preferred_publications) => patch({ preferred_publications })}
                placeholder="bloomberg.com"
              />
            </Field>
            <Field label="Must-read Substack URLs">
              <TagInput
                values={newsletter.substack_urls}
                onChange={(substack_urls) => patch({ substack_urls })}
                placeholder="https://newsletter.substack.com"
              />
            </Field>
            <Field label="LinkedIn profile / company URLs">
              <TagInput
                values={newsletter.linkedin_urls}
                onChange={(linkedin_urls) => patch({ linkedin_urls })}
                placeholder="https://linkedin.com/in/… or /company/…"
              />
            </Field>

            {/* Email branding — colors and logo applied to the generated newsletter. */}
            <div className="border-t border-hairline-3 pt-4">
              <p className={`${helperText} mb-3`}>
                Email branding — applied to the newsletter we send, not this app.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <ColorField
                  label="Primary color · optional"
                  value={newsletter.primary_color}
                  onChange={(primary_color) => patch({ primary_color })}
                  fallback={DEFAULT_EMAIL_PRIMARY_COLOR}
                />
                <ColorField
                  label="Accent color · optional"
                  value={newsletter.accent_color}
                  onChange={(accent_color) => patch({ accent_color })}
                  fallback={DEFAULT_EMAIL_ACCENT_COLOR}
                />
              </div>
              <div className="mt-4">
                <LogoField
                  value={newsletter.logo_url}
                  onChange={(logo_url) => patch({ logo_url })}
                />
              </div>
            </div>
          </div>
        </details>
      </section>

      {/* Action bar */}
      <div className="mt-4 bg-white border border-hairline rounded-card px-[18px] py-3.5">
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={discardChanges}
            disabled={saving || generating}
            className={btnGhost}
          >
            Discard changes
          </button>
          <div className="flex gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={saving || generating}
              className={btnInkOutline}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={sendLiveNow}
              disabled={generating || saving}
              className={btnInkOutline}
            >
              Send live now
            </button>
            <button
              type="button"
              onClick={() => generateNow("preview")}
              disabled={generating || saving}
              className={btnOxblood}
            >
              {generating ? "Filing…" : "Preview to me"}
            </button>
          </div>
        </div>
        <p className={`${helperText} mt-3`}>
          <strong>Preview to me</strong> emails only you and doesn&apos;t touch this period&apos;s
          stories — safe for testing. <strong>Send live now</strong> emails your recipients and
          consumes those stories.
        </p>
      </div>

      {runs.length > 0 && (
        <section className="mt-8">
          <div className="font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-ink-4 mb-3">
            Recent runs
          </div>
          <div className="flex flex-col gap-2">
            {runs.map((run, i) => {
              const { reviewed, featured } = summarizeRunCoverage(run.lane_stats);
              const when = run.finished_at ?? run.started_at ?? run.created_at;
              return (
                <div
                  key={run.id}
                  className="bg-white border border-hairline rounded-card px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap font-mono text-[12px]">
                    <span className="text-ink-2 font-medium">
                      Run #{runs.length - i}
                      <span className="text-ink-4 font-normal ml-2">
                        {when ? RUN_DATE.format(new Date(when)) : ""}
                      </span>
                    </span>
                    <span
                      className={
                        run.status === "done"
                          ? "text-moss"
                          : run.status === "failed"
                            ? "text-oxblood"
                            : "text-ink-4"
                      }
                    >
                      {run.status === "done" ? "● filed" : run.status}
                    </span>
                  </div>
                  {run.status === "done" && (
                    <p className="font-mono text-[12px] text-ink-4 mt-2">
                      {reviewed} sources reviewed · {featured} featured
                    </p>
                  )}
                  {run.error && (
                    <details className="mt-2 font-mono text-[12px]">
                      <summary className="cursor-pointer text-ink-4 hover:text-ink-2">
                        Details
                      </summary>
                      <p className="mt-1 text-oxblood break-words">{run.error}</p>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
