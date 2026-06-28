import Exa from "exa-js";
import { checkCostProjection } from "@/lib/anthropic";
import type { CostTracker } from "@/types";
import type { ExaQueryPayload } from "@/types";

let exa: Exa | null = null;

function getExa(): Exa {
  if (!exa) {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) throw new Error("EXA_API_KEY is required");
    exa = new Exa(apiKey);
  }
  return exa;
}

export interface ExaSearchResult {
  url: string;
  title: string;
  author: string;
  publishedDate: string | null;
  highlights: string[];
  snippet: string;
  score: number;
}

export async function runExaSearch(
  payload: ExaQueryPayload,
  tracker: CostTracker,
  _role?: string
): Promise<ExaSearchResult[]> {
  const projected = checkCostProjection(tracker, { exa: 1 });
  if (!projected.ok) {
    tracker.costCapHit = true;
    throw new Error(projected.message);
  }
  if (projected.level === "warn") {
    tracker.costWarnFlagged = true;
  }

  tracker.exaSearches += 1;

  const options: Record<string, unknown> = {
    type: "auto",
    numResults: payload.numResults,
    startPublishedDate: payload.startPublishedDate,
    contents: {
      highlights: true,
    },
  };

  if (payload.category) options.category = payload.category;
  if (payload.includeDomains?.length) {
    options.includeDomains = payload.includeDomains;
  }
  if (payload.includeText?.length === 1) {
    options.includeText = payload.includeText;
  }

  const response = await getExa().searchAndContents(payload.query, options);

  return (response.results ?? []).map((r) => ({
    url: r.url,
    title: r.title ?? "",
    author: r.author ?? "",
    publishedDate: r.publishedDate ?? null,
    highlights: (r as { highlights?: string[] }).highlights ?? [],
    snippet:
      ((r as { highlights?: string[] }).highlights ?? []).join(" ") ||
      (r as { text?: string }).text?.slice(0, 500) ||
      "",
    score: r.score ?? 0,
  }));
}

export async function safeExaSearch(
  payload: ExaQueryPayload,
  tracker: CostTracker,
  role?: string
): Promise<ExaSearchResult[]> {
  try {
    return await runExaSearch(payload, tracker, role);
  } catch {
    return [];
  }
}
export function isLikelySubstack(url: string, snippet: string): boolean {
  const lower = (url + snippet).toLowerCase();
  return (
    lower.includes("substack.com") ||
    lower.includes("powered by substack") ||
    lower.includes("/feed") ||
    lower.includes("subscribe to")
  );
}

export function isLikelyPaywalled(title: string, snippet: string): boolean {
  const combined = (title + snippet).toLowerCase();
  return (
    combined.includes("subscribe to read") ||
    combined.includes("sign in to read") ||
    combined.includes("premium content") ||
    combined.includes("members only") ||
    combined.includes("paywall")
  );
}
