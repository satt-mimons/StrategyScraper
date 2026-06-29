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
      <div className="flex items-center justify-between mb-6">
        <Link
          href={`/newsletters/${params.id}/runs/${params.runId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to progress
        </Link>
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          Back to dashboard
        </Link>
      </div>

      {error && <p className="text-red-700 text-sm">{error}</p>}

      {!error && !html && <p className="text-gray-500 text-sm">Loading preview…</p>}

      {html && (
        <iframe
          srcDoc={html}
          sandbox=""
          className="w-full border border-gray-200 rounded-xl"
          style={{ height: "80vh" }}
          title="Newsletter preview"
        />
      )}
    </main>
  );
}
