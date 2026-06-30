"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { TagInput } from "@/components/tag-input";
import {
  btnGhost,
  btnInk,
  btnOxblood,
  Field,
  helperText,
  inputClass,
  SourcesCallout,
} from "@/components/desk";
import {
  CADENCE_HELPER,
  CADENCE_OPTIONS,
  DEFAULT_PROFILE_FREQUENCY,
  SOURCES_CALLOUT_COPY,
  suggestTopicsForRole,
  TOPIC_EXAMPLE_SUGGESTIONS,
} from "@/lib/constants";
import type { ProfileFrequency } from "@/types";

const STEPS = ["Context", "Topics", "Delivery"];

interface WizardState {
  company: string;
  role: string;
  frequency: ProfileFrequency;
  topics: string[];
  recipients: string[];
  replyTo: string;
  primaryColor: string;
  logoUrl: string;
}

export default function NewNewsletterWizard() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<WizardState>({
    company: "",
    role: "",
    frequency: DEFAULT_PROFILE_FREQUENCY,
    topics: [],
    recipients: [],
    replyTo: "",
    primaryColor: "",
    logoUrl: "",
  });

  // Default Reply-To to the logged-in user's email (the account they signed in with).
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setState((s) => (s.replyTo ? s : { ...s, replyTo: user.email! }));
      }
    });
  }, [supabase]);

  const patch = (updates: Partial<WizardState>) =>
    setState((s) => ({ ...s, ...updates }));

  const stepValid = useMemo(() => {
    if (step === 0) return state.company.trim() !== "" && state.role.trim() !== "";
    if (step === 1) return state.topics.length > 0;
    if (step === 2) return state.recipients.length > 0;
    return false;
  }, [step, state]);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const { data: newsletter, error: insertError } = await supabase
        .from("newsletter_configs")
        .insert({
          user_id: user.id,
          company: state.company,
          role: state.role,
          frequency: state.frequency,
          topics: state.topics,
          recipients: state.recipients,
          reply_to: state.replyTo,
          primary_color: state.primaryColor,
          logo_url: state.logoUrl,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsletterId: newsletter.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed to start");

      router.push(`/newsletters/${newsletter.id}/runs/${data.runId}`);
    } catch (err) {
      console.error("Failed to create newsletter:", err);
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const roleText = state.role.trim() || "a VP, Corporate Strategy";
  const companyText = state.company.trim() || "ServiceNow";

  return (
    <main className="max-w-[760px] mx-auto px-6 py-12">
      <h1 className="font-serif text-[26px] font-semibold tracking-[-0.01em] text-ink">
        Commission a brief
      </h1>

      {/* Stepper */}
      <div className="flex items-center gap-2.5 mt-5">
        {STEPS.map((label, i) => {
          const filled = i <= step;
          return (
            <div key={label} className="flex items-center gap-2.5 flex-1 last:flex-none">
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[12px] font-medium ${
                    filled
                      ? "bg-ink text-paper"
                      : "border border-[#CFC8B8] text-ink-4"
                  }`}
                >
                  {i + 1}
                </span>
                <span
                  className={`font-serif text-[16px] ${
                    i === step
                      ? "text-ink font-semibold"
                      : filled
                        ? "text-ink"
                        : "text-ink-4"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && <span className="flex-1 h-px bg-rule" />}
            </div>
          );
        })}
      </div>
      <p className="font-mono text-[12px] text-ink-4 mt-3">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>

      {error && (
        <div className="mt-5 px-4 py-3 rounded-input font-mono text-[12px] bg-note-bg text-oxblood border border-[#EAD9A0]">
          {error}
        </div>
      )}

      {step === 0 && (
        <div className="flex gap-6 mt-6">
          <div className="flex-[1.55]">
            <div className="bg-white border border-hairline rounded-card px-[26px] py-6">
              <Field label="Company">
                <input
                  type="text"
                  value={state.company}
                  onChange={(e) => patch({ company: e.target.value })}
                  className={inputClass}
                  placeholder="ServiceNow"
                />
              </Field>
              <Field label="Role" className="mt-[18px]">
                <input
                  type="text"
                  value={state.role}
                  onChange={(e) => patch({ role: e.target.value })}
                  className={inputClass}
                  placeholder="VP, Corporate Strategy"
                />
              </Field>
              <Field
                label={
                  <>
                    Cadence{" "}
                    <span className="font-normal text-ink-4">— how far back we read</span>
                  </>
                }
                className="mt-[18px]"
              >
                <select
                  value={state.frequency}
                  onChange={(e) => patch({ frequency: e.target.value as ProfileFrequency })}
                  className={inputClass}
                >
                  {CADENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className={`${helperText} mt-2.5`}>{CADENCE_HELPER}</p>
              </Field>
            </div>
          </div>

          {/* Editorial margin note */}
          <div className="flex-1 pt-1">
            <div className="border-l-2 border-oxblood pl-3.5">
              <div className="font-mono text-[11px] font-medium tracking-[0.1em] uppercase text-oxblood mb-2">
                In the margin
              </div>
              <p className="font-serif text-[17px] italic leading-[1.45] text-ink-2">
                Company and role aren&apos;t form-filler. We read every story as if we were{" "}
                {roleText} at {companyText} — and quietly ignore what they wouldn&apos;t care
                about.
              </p>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="bg-white border border-hairline rounded-card px-[26px] py-6 mt-6 space-y-4">
          <TagInput
            label="Topics"
            values={state.topics}
            onChange={(topics) => patch({ topics })}
            placeholder="Add a topic — e.g. enterprise AI pricing"
            suggestions={[
              ...suggestTopicsForRole(state.role),
              ...TOPIC_EXAMPLE_SUGGESTIONS,
            ].filter((v, i, a) => a.indexOf(v) === i)}
          />
          <SourcesCallout copy={SOURCES_CALLOUT_COPY} />
        </div>
      )}

      {step === 2 && (
        <div className="bg-white border border-hairline rounded-card px-[26px] py-6 mt-6 space-y-5">
          <TagInput
            label="Recipients"
            values={state.recipients}
            onChange={(recipients) => patch({ recipients })}
            placeholder="you@company.com"
          />

          <Field label="Reply-To email">
            <input
              type="email"
              value={state.replyTo}
              onChange={(e) => patch({ replyTo: e.target.value })}
              className={inputClass}
              placeholder="you@company.com"
            />
            <p className={`${helperText} mt-2`}>Defaults to your sign-in email.</p>
          </Field>

          <div className="border-t border-hairline-3 pt-5">
            <div className="font-mono text-[11px] font-medium tracking-[0.1em] uppercase text-ink-4 mb-3">
              Brand overrides · optional
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Primary color (hex)">
                <input
                  type="text"
                  value={state.primaryColor}
                  onChange={(e) => patch({ primaryColor: e.target.value })}
                  className={inputClass}
                  placeholder="#8C2F23"
                />
              </Field>
              <Field label="Logo URL">
                <input
                  type="text"
                  value={state.logoUrl}
                  onChange={(e) => patch({ logoUrl: e.target.value })}
                  className={inputClass}
                  placeholder="https://…"
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mt-6">
        <button
          type="button"
          onClick={step === 0 ? () => router.push("/") : back}
          className={btnGhost}
        >
          {step === 0 ? "Cancel" : "← Back"}
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} disabled={!stepValid} className={btnInk}>
            Next →
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!stepValid || submitting}
            className={btnOxblood}
          >
            {submitting ? "Filing…" : "Generate now"}
          </button>
        )}
      </div>
    </main>
  );
}
