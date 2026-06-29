"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { TagInput } from "@/components/tag-input";
import {
  DEFAULT_PROFILE_FREQUENCY,
  FREQUENCY_HELPER_TEXT,
  TONE_PRESETS,
  suggestTopicsForRole,
} from "@/lib/constants";
import type { ProfileFrequency } from "@/types";

const STEPS = [
  { title: "Context" },
  { title: "Topics" },
  { title: "Tone & Delivery" },
];

interface WizardState {
  company: string;
  role: string;
  frequency: ProfileFrequency;
  topics: string[];
  tonePreset: string;
  toneCustom: string;
  recipients: string[];
  replyTo: string;
  preferredPublications: string[];
  substackUrls: string[];
  linkedinUrls: string[];
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
}

export default function NewNewsletterWizard() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedTone, setShowAdvancedTone] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const [state, setState] = useState<WizardState>({
    company: "",
    role: "",
    frequency: DEFAULT_PROFILE_FREQUENCY,
    topics: [],
    tonePreset: TONE_PRESETS[0].key,
    toneCustom: "",
    recipients: [],
    replyTo: "",
    preferredPublications: [],
    substackUrls: [],
    linkedinUrls: [],
    primaryColor: "",
    accentColor: "",
    logoUrl: "",
  });

  const patch = (updates: Partial<WizardState>) =>
    setState((s) => ({ ...s, ...updates }));

  const stepValid = useMemo(() => {
    if (step === 0) return state.company.trim() !== "" && state.role.trim() !== "";
    if (step === 1) return state.topics.length > 0;
    if (step === 2) return state.tonePreset !== "" && state.recipients.length > 0;
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
          tone_preset: state.tonePreset,
          tone_custom: state.toneCustom,
          recipients: state.recipients,
          reply_to: state.replyTo,
          preferred_publications: state.preferredPublications,
          substack_urls: state.substackUrls,
          linkedin_urls: state.linkedinUrls,
          primary_color: state.primaryColor,
          accent_color: state.accentColor,
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

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Create a New Newsletter</h1>

      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex items-center gap-2 flex-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                i === step
                  ? "bg-gray-900 text-white"
                  : i < step
                    ? "bg-gray-300 text-gray-700"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-sm ${i === step ? "text-gray-900 font-medium" : "text-gray-400"}`}
            >
              {s.title}
            </span>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mb-6">
        Step {step + 1} of {STEPS.length}: {STEPS[step].title}
      </p>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
        {step === 0 && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Company</label>
              <input
                type="text"
                value={state.company}
                onChange={(e) => patch({ company: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <input
                type="text"
                value={state.role}
                onChange={(e) => patch({ role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="VP Corporate Strategy"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Send Frequency</label>
              <select
                value={state.frequency}
                onChange={(e) => patch({ frequency: e.target.value as ProfileFrequency })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {FREQUENCY_HELPER_TEXT[state.frequency]}
              </p>
            </div>
          </>
        )}

        {step === 1 && (
          <TagInput
            label="Topics"
            values={state.topics}
            onChange={(topics) => patch({ topics })}
            placeholder="e.g. enterprise AI pricing"
            suggestions={suggestTopicsForRole(state.role)}
          />
        )}

        {step === 2 && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">Tone</label>
              <div className="flex flex-wrap gap-2">
                {TONE_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => patch({ tonePreset: preset.key })}
                    className={`px-3 py-1.5 rounded-full text-sm border ${
                      state.tonePreset === preset.key
                        ? "bg-gray-900 text-white border-gray-900"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <details
                className="text-sm mt-3"
                open={showAdvancedTone}
                onToggle={(e) => setShowAdvancedTone(e.currentTarget.open)}
              >
                <summary className="cursor-pointer font-medium text-gray-700">
                  Advanced: customize tone
                </summary>
                <textarea
                  value={state.toneCustom}
                  onChange={(e) => patch({ toneCustom: e.target.value })}
                  rows={4}
                  placeholder="Override the selected tone preset with your own description…"
                  className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </details>
            </div>

            <TagInput
              label="Recipients"
              values={state.recipients}
              onChange={(recipients) => patch({ recipients })}
              placeholder="you@company.com"
            />

            <div>
              <label className="block text-sm font-medium mb-1">Reply-To Email</label>
              <input
                type="email"
                value={state.replyTo}
                onChange={(e) => patch({ replyTo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@company.com"
              />
            </div>

            <details
              className="text-sm"
              open={showAdvancedSettings}
              onToggle={(e) => setShowAdvancedSettings(e.currentTarget.open)}
            >
              <summary className="cursor-pointer font-medium text-gray-700">
                Advanced Settings
              </summary>
              <div className="mt-4 space-y-4">
                <TagInput
                  label="Preferred Publications"
                  values={state.preferredPublications}
                  onChange={(preferredPublications) => patch({ preferredPublications })}
                />
                <TagInput
                  label="Must-Read Substack URLs"
                  values={state.substackUrls}
                  onChange={(substackUrls) => patch({ substackUrls })}
                  placeholder="https://newsletter.substack.com"
                />
                <TagInput
                  label="LinkedIn Profile / Company URLs"
                  values={state.linkedinUrls}
                  onChange={(linkedinUrls) => patch({ linkedinUrls })}
                  placeholder="https://linkedin.com/in/… or /company/…"
                />
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Primary Color</label>
                    <input
                      type="text"
                      value={state.primaryColor}
                      onChange={(e) => patch({ primaryColor: e.target.value })}
                      placeholder="#2563eb"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Accent Color</label>
                    <input
                      type="text"
                      value={state.accentColor}
                      onChange={(e) => patch({ accentColor: e.target.value })}
                      placeholder="#e94560"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Logo URL</label>
                    <input
                      type="text"
                      value={state.logoUrl}
                      onChange={(e) => patch({ logoUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>
            </details>
          </>
        )}
      </div>

      <div className="flex justify-between mt-6">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            disabled={!stepValid}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!stepValid || submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Starting…" : "Generate Newsletter"}
          </button>
        )}
      </div>
    </main>
  );
}
