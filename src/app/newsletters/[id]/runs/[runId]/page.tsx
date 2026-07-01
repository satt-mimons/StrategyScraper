"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { PipelineStage, Run } from "@/types";
import { friendlyGenerationError } from "@/lib/generation-errors";

const STEPS: { stage: PipelineStage; label: string }[] = [
  { stage: "research", label: "Research" },
  { stage: "filter", label: "Filter" },
  { stage: "write", label: "Write" },
  { stage: "design", label: "Design" },
  { stage: "deliver", label: "Deliver" },
];

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
        <p className="text-red-700 mb-6">{error}</p>
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  if (!run) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16 text-center text-gray-500">
        Loading…
      </main>
    );
  }

  // Treat a stale run as failed so a killed function doesn't leave the user on an infinite
  // spinner. run.error is null in that case, so supply a meaningful message below.
  const stale = isRunStale(run);
  const effectiveStatus: Run["status"] = stale ? "failed" : run.status;
  const failureMessage =
    stale && !run.error
      ? "This run timed out and was stopped before it finished. Generation took longer than the server allows — please try again."
      : friendlyGenerationError(run.error);

  const currentStageIndex = STEPS.findIndex((s) => s.stage === run.stage);

  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-center mb-10">
        Generating Your Newsletter
      </h1>

      <ol className="space-y-4 mb-10">
        {STEPS.map((step, i) => {
          const state = stepState(i, currentStageIndex, effectiveStatus);
          const failed = effectiveStatus === "failed" && i === currentStageIndex;
          return (
            <li key={step.stage} className="flex items-center gap-3">
              <span className="w-6 h-6 flex items-center justify-center shrink-0">
                {failed ? (
                  <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">
                    !
                  </span>
                ) : state === "done" ? (
                  <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                ) : state === "active" ? (
                  <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                )}
              </span>
              <span
                className={`text-sm ${
                  state === "pending" ? "text-gray-400" : "text-gray-900 font-medium"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {run.status === "done" && (
        <p className="text-sm text-gray-500 text-center">Opening preview…</p>
      )}

      {effectiveStatus === "failed" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-red-700 text-center max-w-md">
            {failureMessage}
          </p>
          <button
            onClick={tryAgain}
            disabled={retrying}
            className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {retrying ? "Starting…" : "Try Again"}
          </button>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
            Back to Dashboard
          </Link>
        </div>
      )}
    </main>
  );
}
