"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { PipelineStage, Run } from "@/types";
import { friendlyGenerationError, STOPPED_BY_USER } from "@/lib/generation-errors";
import { btnGhost, btnInk, NewspaperRule } from "@/components/desk";

// The reader only sees the steps that involve real editorial work. The pipeline also runs a
// "design" stage, but that's a deterministic template render with no choices to make — it's
// folded into "Deliver" below rather than shown as its own line.
const STEPS: { label: string }[] = [
  { label: "Research" },
  { label: "Filter" },
  { label: "Write" },
  { label: "Deliver" },
];

// Maps the pipeline's internal stage to the visible step index above. "design" collapses into
// the "Deliver" step (index 3) so it never surfaces on its own.
const STAGE_TO_STEP: Record<PipelineStage, number> = {
  research: 0,
  filter: 1,
  write: 2,
  design: 3,
  deliver: 3,
};

// A run can't outlive the serverless function that drives it (generate route maxDuration is
// 300s). If a run is still queued/running well past that cap, the function was killed (e.g.
// a Vercel timeout) before its catch block could mark the run failed — so surface it as
// failed rather than spinning on "Write" forever. Buffer past 300s avoids false positives
// from a slow cold start. See PIPELINE_TIMEOUT_MS in lib/constants.
const STALE_AFTER_MS = 360_000;

function isRunStale(run: Run): boolean {
  if (run.status === "done" || run.status === "failed") return false;
  const startedMs = new Date(run.started_at ?? run.created_at).getTime();
  return Date.now() - startedMs > STALE_AFTER_MS;
}

function stepState(
  stepIndex: number,
  currentStageIndex: number,
  status: Run["status"]
): "done" | "active" | "pending" {
  if (status === "done") return "done";
  if (stepIndex < currentStageIndex) return "done";
  if (stepIndex === currentStageIndex) return status === "failed" ? "done" : "active";
  return "pending";
}

export default function GenerationProgressPage() {
  const params = useParams<{ id: string; runId: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [stopping, setStopping] = useState(false);
  const runRef = useRef<Run | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/generate?runId=${params.runId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Failed to load run status");
          return;
        }
        const next = data.run as Run;
        runRef.current = next;
        setRun(next);
      } catch {
        if (!cancelled) setError("Failed to load run status");
      }
    };

    poll();
    const interval = setInterval(() => {
      // Stop polling once the run is terminal OR has gone stale (the driving function was
      // killed and will never update the row again). Read from the ref so the check sees the
      // latest fetched run, not the value captured when the effect ran.
      const latest = runRef.current;
      if (
        latest &&
        (latest.status === "done" || latest.status === "failed" || isRunStale(latest))
      ) {
        clearInterval(interval);
        return;
      }
      poll();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.runId]);

  // On completion, take the user straight to the preview (replace so Back skips this page).
  useEffect(() => {
    if (run?.status === "done") {
      router.replace(`/newsletters/${params.id}/runs/${params.runId}/preview`);
    }
  }, [run?.status, router, params.id, params.runId]);

  const stopGenerating = async () => {
    setStopping(true);
    try {
      await fetch(`/api/generate?runId=${params.runId}`, { method: "DELETE" });
      // Head back to the desk — the pipeline aborts itself at its next stage boundary.
      router.push("/");
    } catch {
      setStopping(false);
    }
  };

  const tryAgain = async () => {
    setRetrying(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsletterId: params.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start generation");
      router.push(`/newsletters/${params.id}/runs/${data.runId}`);
      router.refresh();
    } catch {
      setRetrying(false);
    }
  };

  if (error) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="font-sans text-[15px] text-oxblood mb-6">{error}</p>
        <Link href="/" className="font-sans text-[13px] text-ink-4 hover:text-ink-2">
          ← Back to the desk
        </Link>
      </main>
    );
  }

  if (!run) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16 text-center font-mono text-[12px] text-ink-4">
        Loading…
      </main>
    );
  }

  // Treat a stale run as failed so a killed function doesn't leave the user on an infinite
  // spinner. run.error is null in that case, so supply a meaningful message below.
  const stale = isRunStale(run);
  const effectiveStatus: Run["status"] = stale ? "failed" : run.status;
  const stopped = run.error === STOPPED_BY_USER;
  const failureMessage =
    stale && !run.error
      ? "This run timed out and was stopped before it finished. Generation took longer than the server allows — please try again."
      : friendlyGenerationError(run.error);

  const currentStageIndex = STAGE_TO_STEP[run.stage] ?? 0;
  const inProgress = effectiveStatus === "queued" || effectiveStatus === "running";

  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <div className="relative mx-auto max-w-md">
        {/* Stacked-paper layers behind the card for a bit of editorial depth. */}
        <div
          aria-hidden
          className="absolute inset-0 translate-y-3 rotate-[-1.2deg] rounded-card border border-hairline bg-surface"
        />
        <div
          aria-hidden
          className="absolute inset-0 translate-y-1.5 rotate-[0.6deg] rounded-card border border-hairline bg-white"
        />

        <div className="relative rounded-card border border-hairline bg-white shadow-card px-8 py-9">
          <NewspaperRule />

          <h1 className="font-serif text-[24px] font-semibold tracking-[-0.01em] text-ink text-center mt-4">
            Generating your brief
          </h1>
          <p className="font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-ink-4 text-center mt-2">
            Reading the internet for you
          </p>

          <ol className="space-y-3.5 mt-8">
            {STEPS.map((step, i) => {
              const state = stepState(i, currentStageIndex, effectiveStatus);
              const failed = effectiveStatus === "failed" && i === currentStageIndex;
              return (
                <li key={step.label} className="flex items-center gap-3">
                  <span className="w-6 h-6 flex items-center justify-center shrink-0">
                    {failed ? (
                      <span className="w-5 h-5 rounded-full bg-note-bg text-oxblood border border-oxblood/30 flex items-center justify-center text-xs font-bold">
                        !
                      </span>
                    ) : state === "done" ? (
                      <span className="w-5 h-5 rounded-full bg-moss-bg text-moss flex items-center justify-center text-xs font-bold">
                        ✓
                      </span>
                    ) : state === "active" ? (
                      <span className="w-4 h-4 rounded-full border-2 border-hairline-2 border-t-oxblood animate-spin" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-hairline" />
                    )}
                  </span>
                  <span
                    className={`font-sans text-[14px] ${
                      state === "pending" ? "text-ink-4" : "text-ink font-medium"
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {run.status === "done" && (
            <p className="font-mono text-[12px] text-ink-4 text-center mt-8">
              Opening preview…
            </p>
          )}

          {inProgress && (
            <div className="mt-8 pt-5 border-t border-hairline-3 flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={stopGenerating}
                disabled={stopping}
                className={btnGhost}
              >
                {stopping ? "Stopping…" : "Stop generating"}
              </button>
              <p className="font-mono text-[11px] text-ink-4">Usually ready in ~3 min.</p>
            </div>
          )}

          {effectiveStatus === "failed" && (
            <div className="mt-8 pt-5 border-t border-hairline-3 flex flex-col items-center gap-3">
              <p
                className={`font-sans text-[13px] text-center max-w-xs ${
                  stopped ? "text-ink-3" : "text-oxblood"
                }`}
              >
                {stopped ? "You stopped this generation." : failureMessage}
              </p>
              <button
                onClick={tryAgain}
                disabled={retrying}
                className={btnInk}
              >
                {retrying ? "Starting…" : stopped ? "Start over" : "Try again"}
              </button>
              <Link
                href="/"
                className="font-sans text-[13px] text-ink-4 hover:text-ink-2"
              >
                Back to the desk
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
