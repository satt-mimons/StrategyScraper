"use client";

import { useCallback, useEffect, useState } from "react";
import type { Profile, Run } from "@/types";
import { formatLaneStatsSummary } from "@/lib/lane-stats";
import {
  DEFAULT_TONE_SPEC,
  DEFAULT_PREFERRED_PUBS,
  DEFAULT_ANALYST_FIRM_DOMAINS,
  DEFAULT_PROFILE_FREQUENCY,
} from "@/lib/constants";

function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
      setInput("");
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-blue-400 hover:text-blue-600"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
        >
          Add
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [profile, setProfile] = useState<Partial<Profile>>({
    company: "",
    role: "",
    topics: [],
    tone_spec: DEFAULT_TONE_SPEC,
    preferred_pubs: DEFAULT_PREFERRED_PUBS,
    analyst_firm_domains: DEFAULT_ANALYST_FIRM_DOMAINS,
    frequency: DEFAULT_PROFILE_FREQUENCY,
    linkedin_urls: [],
    substack_urls: [],
    brand_overrides: {},
    recipients: [],
    reply_to: "",
  });
  const [runs, setRuns] = useState<Run[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadProfile = useCallback(async () => {
    const res = await fetch("/api/profile");
    const data = await res.json();
    if (data.profile) {
      setProfile(data.profile);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/runs");
    const data = await res.json();
    if (data.runs) setRuns(data.runs);
  }, []);

  useEffect(() => {
    loadProfile();
    loadRuns();
  }, [loadProfile, loadRuns]);

  useEffect(() => {
    if (!activeRunId) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/generate?runId=${activeRunId}`);
      const data = await res.json();
      if (data.run?.status === "done" || data.run?.status === "failed") {
        setGenerating(false);
        setActiveRunId(null);
        loadRuns();
        setMessage({
          type: data.run.status === "done" ? "success" : "error",
          text:
            data.run.status === "done"
              ? `Newsletter generated and sent!${
                  data.run.lane_stats?.length
                    ? ` ${formatLaneStatsSummary(data.run.lane_stats)}`
                    : ""
                }`
              : `Generation failed: ${data.run.error}`,
        });
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeRunId, loadRuns]);

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : Array.isArray(data.error)
              ? data.error.map((e: { message?: string }) => e.message).join("; ")
              : "Save failed";
        throw new Error(msg);
      }
      setProfile(data.profile);
      setMessage({ type: "success", text: "Profile saved." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setActiveRunId(data.runId);
      setMessage({ type: "success", text: "Generation started — this may take a few minutes…" });
    } catch (err) {
      setGenerating(false);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Generation failed",
      });
    }
  };

  const brandOverrides = profile.brand_overrides ?? {};

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Newsletter Generator</h1>
        <p className="text-gray-500 mt-2">
          Personalized multi-agent research → filter → write → design → deliver.
        </p>
      </header>

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

      <section className="bg-white border border-gray-200 rounded-xl p-6 mb-8 space-y-6">
        <h2 className="text-lg font-semibold">Profile</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Company</label>
            <input
              type="text"
              value={profile.company ?? ""}
              onChange={(e) => setProfile({ ...profile, company: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Acme Corp"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <input
              type="text"
              value={profile.role ?? ""}
              onChange={(e) => setProfile({ ...profile, role: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="VP Corporate Strategy"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Send Frequency</label>
          <select
            value={profile.frequency ?? DEFAULT_PROFILE_FREQUENCY}
            onChange={(e) =>
              setProfile({
                ...profile,
                frequency: e.target.value as Profile["frequency"],
              })
            }
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Drives per-lane recency windows (news short; discovery 7–14d; X 48–72h).
          </p>
        </div>

        <TagInput
          label="Topics"
          values={profile.topics ?? []}
          onChange={(topics) => setProfile({ ...profile, topics })}
          placeholder="e.g. enterprise AI pricing"
        />

        <TagInput
          label="Recipients"
          values={profile.recipients ?? []}
          onChange={(recipients) => setProfile({ ...profile, recipients })}
          placeholder="you@company.com"
        />

        <div>
          <label className="block text-sm font-medium mb-1">Reply-To Email</label>
          <input
            type="email"
            value={profile.reply_to ?? ""}
            onChange={(e) => setProfile({ ...profile, reply_to: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tone Spec</label>
          <textarea
            value={profile.tone_spec ?? ""}
            onChange={(e) => setProfile({ ...profile, tone_spec: e.target.value })}
            rows={4}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-gray-700">
            Advanced: Publications, Analyst Firms, Brand
          </summary>
          <div className="mt-4 space-y-4">
            <TagInput
              label="Preferred Publications"
              values={profile.preferred_pubs ?? []}
              onChange={(preferred_pubs) => setProfile({ ...profile, preferred_pubs })}
            />
            <TagInput
              label="Analyst Firm Domains (watchlist)"
              values={profile.analyst_firm_domains ?? []}
              onChange={(analyst_firm_domains) =>
                setProfile({ ...profile, analyst_firm_domains })
              }
              placeholder="bain.com"
            />
            <TagInput
              label="Must-Read Substack URLs"
              values={profile.substack_urls ?? []}
              onChange={(substack_urls) => setProfile({ ...profile, substack_urls })}
              placeholder="https://newsletter.substack.com"
            />
            <TagInput
              label="LinkedIn Profile / Company URLs"
              values={profile.linkedin_urls ?? []}
              onChange={(linkedin_urls) => setProfile({ ...profile, linkedin_urls })}
              placeholder="https://linkedin.com/in/… or /company/…"
            />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Primary Color</label>
                <input
                  type="text"
                  value={brandOverrides.primary_color ?? ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      brand_overrides: { ...brandOverrides, primary_color: e.target.value },
                    })
                  }
                  placeholder="#2563eb"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Accent Color</label>
                <input
                  type="text"
                  value={brandOverrides.accent_color ?? ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      brand_overrides: { ...brandOverrides, accent_color: e.target.value },
                    })
                  }
                  placeholder="#e94560"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Logo URL</label>
                <input
                  type="text"
                  value={brandOverrides.logo_url ?? ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      brand_overrides: { ...brandOverrides, logo_url: e.target.value },
                    })
                  }
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        </details>

        <div className="flex gap-3 pt-2">
          <button
            onClick={saveProfile}
            disabled={saving}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Profile"}
          </button>
          <button
            onClick={generate}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate Now"}
          </button>
        </div>
      </section>

      {runs.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Runs</h2>
          <div className="space-y-2">
            {runs.map((run) => (
              <div
                key={run.id}
                className="px-3 py-3 bg-gray-50 rounded-lg text-sm space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-mono text-xs text-gray-500">
                    {run.id.slice(0, 8)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      run.status === "done"
                        ? "bg-green-100 text-green-700"
                        : run.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : run.status === "running"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {run.status}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {run.finished_at
                      ? new Date(run.finished_at).toLocaleString()
                      : run.started_at
                        ? "in progress…"
                        : "queued"}
                  </span>
                  {run.cost_estimate_usd > 0 && (
                    <span className="text-gray-400 text-xs">
                      ${Number(run.cost_estimate_usd).toFixed(2)}
                    </span>
                  )}
                </div>
                {run.lane_stats && run.lane_stats.length > 0 && (
                  <p className="text-xs text-gray-600 font-mono leading-relaxed break-words">
                    {formatLaneStatsSummary(run.lane_stats)}
                  </p>
                )}
                {run.error && (
                  <p className="text-xs text-red-600">{run.error}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
