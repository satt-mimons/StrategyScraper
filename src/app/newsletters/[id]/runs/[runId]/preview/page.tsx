"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function NewsletterPreviewPage() {
  const params = useParams<{ id: string; runId: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${params.runId}/content`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load preview");
        setHtml(data.html);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load preview"));
  }, [params.runId]);

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      {/*
        No "Back to progress" link: the progress page redirects to this preview once a
        run is done, so linking back there traps the user in a redirect loop. Navigation
        goes to the dashboard or the brief instead.
      */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/"
          className="font-sans text-[13px] text-ink-4 hover:text-ink-2"
        >
          ← Back to The Desk
        </Link>
        <Link
          href={`/newsletters/${params.id}`}
          className="font-sans text-[13px] font-semibold text-oxblood hover:opacity-70"
        >
          Edit brief →
        </Link>
      </div>

      {error && <p className="font-mono text-[12px] text-oxblood">{error}</p>}

      {!error && !html && (
        <p className="font-mono text-[12px] text-ink-4">Loading preview…</p>
      )}

      {html && (
        <iframe
          srcDoc={html}
          sandbox=""
          className="w-full border border-hairline rounded-card bg-white"
          style={{ height: "80vh" }}
          title="Newsletter preview"
        />
      )}
    </main>
  );
}
