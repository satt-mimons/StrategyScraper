import Anthropic from "@anthropic-ai/sdk";
import type { CostTracker } from "@/types";
import { PRICING, RUN_COST_CAP_USD } from "@/lib/constants";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export const MODELS = {
  opus: "claude-opus-4-20250514",
  sonnet: "claude-sonnet-4-20250514",
} as const;

export function createCostTracker(): CostTracker {
  return {
    exaSearches: 0,
    apifyRuns: 0,
    opusInputTokens: 0,
    opusOutputTokens: 0,
    sonnetInputTokens: 0,
    sonnetOutputTokens: 0,
  };
}

export function estimateCost(tracker: CostTracker): number {
  const exa =
    tracker.exaSearches * PRICING.exaPerSearch +
    tracker.apifyRuns * (PRICING.apifyXPer1k / 1000) * 100;
  const opus =
    (tracker.opusInputTokens / 1_000_000) * PRICING.opusInputPer1M +
    (tracker.opusOutputTokens / 1_000_000) * PRICING.opusOutputPer1M;
  const sonnet =
    (tracker.sonnetInputTokens / 1_000_000) * PRICING.sonnetInputPer1M +
    (tracker.sonnetOutputTokens / 1_000_000) * PRICING.sonnetOutputPer1M;
  return exa + opus + sonnet;
}

export function checkCostCap(tracker: CostTracker): {
  ok: boolean;
  estimate: number;
  message?: string;
} {
  const estimate = estimateCost(tracker);
  if (estimate > RUN_COST_CAP_USD) {
    return {
      ok: false,
      estimate,
      message: `Run projected cost $${estimate.toFixed(2)} exceeds cap of $${RUN_COST_CAP_USD}`,
    };
  }
  return { ok: true, estimate };
}

export async function callLLM(
  model: keyof typeof MODELS,
  system: string,
  user: string,
  tracker: CostTracker,
  maxTokens = 4096
): Promise<string> {
  const capCheck = checkCostCap(tracker);
  if (!capCheck.ok) {
    throw new Error(capCheck.message);
  }

  const response = await getClient().messages.create({
    model: MODELS[model],
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

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
  return textBlock.text;
}

export function parseJsonFromLLM<T>(text: string): T {
  const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("LLM response did not contain valid JSON");
  }
  return JSON.parse(jsonMatch[0]) as T;
}
