"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { btnOxblood, EditorialTag } from "@/components/desk";

export interface BriefRowData {
  id: string;
  title: string;
  topics: string[];
  failed: boolean;
  lanesSucceeded: number | null;
  filedDate: string | null;
  wordCount: number | null;
  lanesCount: number | null;
  cost: number | null;
  lastRunId: string | null;
  lastIssue: { date: string; quote: string } | null;
}

const LANE_TOTAL = 6;

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function formatFiled(iso: string | null): string | null {
  if (!iso) return null;
  return `filed ${MONTH_DAY.format(new Date(iso))}`;
}

const TOPIC_VISIBLE = 3;

export function BriefRow({ data }: { data: BriefRowData }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const generateNow = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsletterId: data.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Generation failed to start");
      router.push(`/newsletters/${data.id}/runs/${body.runId}`);
    } catch (err) {
      console.error("Failed to start generation:", err);
      setGenerating(false);
      setError(err instanceof Error ? err.message : "Generation failed");
    }
  };

  const deleteBrief = async () => {
    setDeleting(true);
    setError(null);
    try {
      // RLS restricts this to the owner's own row; the runs → candidates/newsletters foreign
      // keys cascade, so removing the config cleans up its whole history.
      const { error: deleteError } = await supabase
        .from("newsletter_configs")
        .delete()
        .eq("id", data.id);
      if (deleteError) throw deleteError;
      router.refresh();
    } catch (err) {
      console.error("Failed to delete brief:", err);
      setDeleting(false);
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : "Failed to delete brief");
    }
  };

  const visibleTopics = data.topics.slice(0, TOPIC_VISIBLE);
  const overflow = data.topics.length - visibleTopics.length;
  const filed = formatFiled(data.filedDate);

  return (
    <div>
      <div
        className={`bg-white border border-hairline rounded-card px-[22px] py-5 ${
          generating ? "border-l-2 border-l-oxblood" : ""
        }`}
      >
        <div className="flex justify-between items-start gap-5">
          <div className="flex-1">
            <h3 className="font-serif text-[19px] font-semibold leading-[1.25] text-ink">
              {data.title}
            </h3>

            {visibleTopics.length > 0 && (
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                {visibleTopics.map((t) => (
                  <EditorialTag key={t}>{t}</EditorialTag>
                ))}
                {overflow > 0 && <EditorialTag muted>+{overflow}</EditorialTag>}
              </div>
            )}

            {data.failed ? (
              <div className="mt-3.5 font-mono text-[12px] font-medium text-oxblood">
                Run failed{" "}
                {data.lanesSucceeded != null
                  ? `— ${data.lanesSucceeded} of ${LANE_TOTAL} lanes succeeded. `
                  : "— "}
                Try again.
              </div>
            ) : (
              <div className="flex items-center gap-3 mt-3.5 font-mono text-[12px] font-medium text-ink-4 flex-wrap">
                <span className="text-moss">● {filed ?? "not filed yet"}</span>
                <span>{data.wordCount != null ? `${data.wordCount.toLocaleString()} words` : "—"}</span>
                <span>{data.lanesCount != null ? `${data.lanesCount} lanes` : "—"}</span>
                <span>{data.cost != null ? `$${data.cost.toFixed(2)}` : "—"}</span>
              </div>
            )}
          </div>

          {generating ? (
            <div className="font-mono text-[12px] text-ink-4 max-w-[180px] text-right leading-relaxed">
              Reading 6 lanes… filtering… writing…&nbsp; ~3 min
            </div>
          ) : (
            <div className="flex flex-col items-end gap-2.5 shrink-0">
              <button type="button" onClick={generateNow} className={btnOxblood}>
                Generate now
              </button>
              {data.lastRunId && (
                <Link
                  href={`/newsletters/${data.id}/runs/${data.lastRunId}/preview`}
                  className="font-sans text-[12.5px] font-semibold text-oxblood hover:opacity-70"
                >
                  Preview last issue →
                </Link>
              )}
              <div className="flex items-center gap-3">
                <Link
                  href={`/newsletters/${data.id}`}
                  className="font-sans text-[12.5px] text-ink-4 hover:text-ink-2"
                >
                  Edit
                </Link>
                {confirmingDelete ? (
                  <span className="flex items-center gap-2 font-sans text-[12.5px]">
                    <button
                      type="button"
                      onClick={deleteBrief}
                      disabled={deleting}
                      className="font-semibold text-oxblood hover:opacity-70 disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deleting}
                      className="text-ink-4 hover:text-ink-2 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="font-sans text-[12.5px] text-ink-4 hover:text-oxblood"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {error && (
          <p className="mt-3 font-mono text-[12px] text-oxblood">{error}</p>
        )}
      </div>

      {data.lastIssue && (
        <div className="mt-3.5 bg-white border border-hairline rounded-card px-[18px] py-4 flex gap-4 items-center">
          <LastIssueThumb title={data.title} />
          <div className="flex-1">
            <div className="font-mono text-[11px] font-medium tracking-[0.1em] uppercase text-ink-4">
              Last issue · {data.lastIssue.date}
            </div>
            <p className="font-serif text-[16px] font-medium italic leading-snug mt-1.5 text-ink">
              &ldquo;{data.lastIssue.quote}&rdquo;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tiny paper-document mock standing in for a rendered email thumbnail. */
function LastIssueThumb({ title }: { title: string }) {
  return (
    <div className="w-[78px] h-[96px] border border-hairline rounded-[3px] bg-surface p-2 shrink-0">
      <div className="font-serif text-[8px] font-semibold leading-tight line-clamp-2 text-ink">
        {title}
      </div>
      <div className="h-px bg-hairline my-1" />
      <div className="h-[3px] bg-[#ECE6D8] rounded-sm mb-[3px]" />
      <div className="h-[3px] bg-[#ECE6D8] rounded-sm w-4/5 mb-[3px]" />
      <div className="h-[3px] bg-[#ECE6D8] rounded-sm mb-[3px]" />
      <div className="h-[3px] bg-[#ECE6D8] rounded-sm w-3/5" />
    </div>
  );
}
