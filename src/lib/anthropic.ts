import Anthropic from "@anthropic-ai/sdk";
import type { CostTracker } from "@/types";
import {
  LLM_CALL_TIMEOUT_MS,
  PRICING,
  RUN_COST_CAP_USD,
  RUN_COST_WARN_USD,
} from "@/lib/constants";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
    // maxRetries: 0 — the SDK otherwise silently retries a timed-out call up to twice, turning
    // one call that hit LLM_CALL_TIMEOUT_MS into 2–3× the latency. In a pipeline with a hard
    // 270s budget and two sequential long generations (reporter + editor), that retry is what
    // blew the budget on every timeout we saw. Fail fast instead and let the pipeline's own
    // per-stage timeouts + fallbacks handle a slow call, rather than compounding it invisibly.
    client = new Anthropic({ apiKey, maxRetries: 0 });
  }
  return client;
}

export const MODELS = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
} as const;

export function createCostTracker(): CostTracker {
  return {
    exaSearches: 0,
    opusInputTokens: 0,
    opusOutputTokens: 0,
    sonnetInputTokens: 0,
    sonnetOutputTokens: 0,
  };
}

export function estimateCost(tracker: CostTracker): number {
  const exa = tracker.exaSearches * PRICING.exaPerSearch;
  const opus =
    (tracker.opusInputTokens / 1_000_000) * PRICING.opusInputPer1M +
    (tracker.opusOutputTokens / 1_000_000) * PRICING.opusOutputPer1M;
  const sonnet =
    (tracker.sonnetInputTokens / 1_000_000) * PRICING.sonnetInputPer1M +
    (tracker.sonnetOutputTokens / 1_000_000) * PRICING.sonnetOutputPer1M;
  return exa + opus + sonnet;
}

export type CostCheckLevel = "ok" | "warn" | "cap";

export interface CostCheckResult {
  ok: boolean;
  estimate: number;
  level: CostCheckLevel;
  message?: string;
}

/** Project cost if additional Exa calls are made. Warn at $3, block at $5. */
export function checkCostProjection(
  tracker: CostTracker,
  extra: { exa?: number } = {}
): CostCheckResult {
  const projected: CostTracker = {
    ...tracker,
    exaSearches: tracker.exaSearches + (extra.exa ?? 0),
  };
  const estimate = estimateCost(projected);

  if (estimate > RUN_COST_CAP_USD) {
    return {
      ok: false,
      estimate,
      level: "cap",
      message: `Run projected cost $${estimate.toFixed(2)} exceeds cap of $${RUN_COST_CAP_USD}`,
    };
  }
  if (estimate > RUN_COST_WARN_USD) {
    return {
      ok: true,
      estimate,
      level: "warn",
      message: `Run projected cost $${estimate.toFixed(2)} exceeds warn threshold of $${RUN_COST_WARN_USD}`,
    };
  }
  return { ok: true, estimate, level: "ok" };
}

export function checkCostCap(tracker: CostTracker): CostCheckResult {
  return checkCostProjection(tracker);
}

export async function callLLM(
  model: keyof typeof MODELS,
  system: string,
  user: string,
  tracker: CostTracker,
  maxTokens = 4096,
  options: { throwOnTruncation?: boolean } = {}
): Promise<string> {
  const capCheck = checkCostCap(tracker);
  if (!capCheck.ok) {
    tracker.costCapHit = true;
    throw new Error(capCheck.message);
  }
  if (capCheck.level === "warn") {
    tracker.costWarnFlagged = true;
  }

  const response = await getClient().messages.create(
    {
      model: MODELS[model],
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    },
    // Per-call ceiling so one hung request can't burn the whole pipeline budget. The SDK
    // aborts and throws when exceeded, which surfaces to the pipeline catch block.
    { timeout: LLM_CALL_TIMEOUT_MS }
  );

  const usage = response.usage;
  if (model === "opus") {
    tracker.opusInputTokens += usage.input_tokens;
    tracker.opusOutputTokens += usage.output_tokens;
  } else {
    tracker.sonnetInputTokens += usage.input_tokens;
    tracker.sonnetOutputTokens += usage.output_tokens;
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM");
  }
  // Fail loudly on truncation: a max_tokens stop means the output is cut off mid-document.
  // Silently returning partial text lets downstream stages (e.g. design HTML) ship a
  // newsletter with the bottom — links, Further Reading — missing.
  if (options.throwOnTruncation && response.stop_reason === "max_tokens") {
    throw new Error(
      `LLM output truncated at max_tokens (${maxTokens}); response is incomplete`
    );
  }
  return textBlock.text;
}

export function parseJsonFromLLM<T>(text: string): T {
  const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("LLM response did not contain valid JSON");
  }
  return JSON.parse(jsonMatch[0]) as T;
}
