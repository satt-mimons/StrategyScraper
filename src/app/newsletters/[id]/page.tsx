"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { TagInput } from "@/components/tag-input";
import { FREQUENCY_HELPER_TEXT, TONE_PRESETS } from "@/lib/constants";
import type { NewsletterConfig, ProfileFrequency } from "@/types";

export default function EditNewsletterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [newsletter, setNewsletter] = useState<NewsletterConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showAdvancedTone, setShowAdvancedTone] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
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

  useEffect(() => {
    load();
  }, [load]);

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
          tone_preset: newsletter.tone_preset,
          tone_custom: newsletter.tone_custom,
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
    return <main className="max-w-3xl mx-auto px-6 py-12 text-gray-500">Loading…</main>;
  }

  if (notFound || !newsletter) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-gray-500 mb-4">Newsletter not found.</p>
        <Link href="/" className="text-blue-600 hover:underline text-sm">
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
        ← Back to dashboard
      </Link>
      <h1 className="text-3xl font-bold tracking-tight mt-4 mb-8">Edit Newsletter</h1>

      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">Newsletter Name</label>
          <input
            type="text"
            value={newsletter.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Leave blank to auto-name from your first topic"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Company</label>
            <input
              type="text"
              value={newsletter.company}
              onChange={(e) => patch({ company: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Acme Corp"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <input
              type="text"
              value={newsletter.role}
              onChange={(e) => patch({ role: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="VP Corporate Strategy"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Send Frequency</label>
          <select
            value={newsletter.frequency}
            onChange={(e) => patch({ frequency: e.target.value as ProfileFrequency })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {FREQUENCY_HELPER_TEXT[newsletter.frequency]}
          </p>
        </div>

        <TagInput
          label="Topics"
          values={newsletter.topics}
          onChange={(topics) => patch({ topics })}
          placeholder="e.g. enterprise AI pricing"
        />

        <div>
          <label className="block text-sm font-medium mb-2">Tone</label>
          <div className="flex flex-wrap gap-2">
            {TONE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => patch({ tone_preset: preset.key })}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  newsletter.tone_preset === preset.key
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
              value={newsletter.tone_custom}
              onChange={(e) => patch({ tone_custom: e.target.value })}
              rows={4}
              placeholder="Override the selected tone preset with your own description…"
              className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </details>
        </div>

        <TagInput
          label="Recipients"
          values={newsletter.recipients}
          onChange={(recipients) => patch({ recipients })}
          placeholder="you@company.com"
        />

        <div>
          <label className="block text-sm font-medium mb-1">Reply-To Email</label>
          <input
            type="email"
            value={newsletter.reply_to}
            onChange={(e) => patch({ reply_to: e.target.value })}
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
              values={newsletter.preferred_publications}
              onChange={(preferred_publications) => patch({ preferred_publications })}
            />
            <TagInput
              label="Must-Read Substack URLs"
              values={newsletter.substack_urls}
              onChange={(substack_urls) => patch({ substack_urls })}
              placeholder="https://newsletter.substack.com"
            />
            <TagInput
              label="LinkedIn Profile / Company URLs"
              values={newsletter.linkedin_urls}
              onChange={(linkedin_urls) => patch({ linkedin_urls })}
              placeholder="https://linkedin.com/in/… or /company/…"
            />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Primary Color</label>
                <input
                  type="text"
                  value={newsletter.primary_color}
                  onChange={(e) => patch({ primary_color: e.target.value })}
                  placeholder="#2563eb"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Accent Color</label>
                <input
                  type="text"
                  value={newsletter.accent_color}
                  onChange={(e) => patch({ accent_color: e.target.value })}
                  placeholder="#e94560"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Logo URL</label>
                <input
                  type="text"
                  value={newsletter.logo_url}
                  onChange={(e) => patch({ logo_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        </details>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSaveChanges}
            disabled={saving || generating}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button
            onClick={generateNow}
            disabled={generating || saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate Now"}
          </button>
        </div>
      </section>
    </main>
  );
}
