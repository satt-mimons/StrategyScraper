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
import { displayName } from "@/lib/newsletter-display";
import { summarizeRunCoverage } from "@/lib/lane-stats";
import type { NewsletterConfig, ProfileFrequency, Run } from "@/types";

const RUN_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

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
      setNewsletter(data as NewsletterConfig);
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
          updated_at: new Date().toISOString(),
        })
        .eq("id", newsletter.id);
      if (error) throw error;
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

  const generateNow = async () => {
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
        body: JSON.stringify({ newsletterId: newsletter!.id }),
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
      <div className="flex justify-between items-center mt-4 bg-white border border-hairline rounded-card px-[18px] py-3.5">
        <button
          type="button"
          onClick={discardChanges}
          disabled={saving || generating}
          className={btnGhost}
        >
          Discard changes
        </button>
        <div className="flex gap-2.5">
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
            onClick={generateNow}
            disabled={generating || saving}
            className={btnOxblood}
          >
            {generating ? "Filing…" : "Generate now"}
          </button>
        </div>
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
