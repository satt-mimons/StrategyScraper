import { callLLM, parseJsonFromLLM } from "@/lib/anthropic";
import { EXA_NUM_RESULTS, QUERY_GENERATOR_PROMPT } from "@/lib/constants";
import type { CostTracker, ExaQueryPayload, Profile } from "@/types";
import type { Lane } from "@/types";

interface QueryGenInput {
  profile: Profile;
  topic: string;
  lane: "news" | "analyst" | "substack" | "medium";
  includeDomains?: string[];
  includeText?: string[];
  recencyCutoff: Date;
}

export async function generateExaQueries(
  input: QueryGenInput,
  tracker: CostTracker
): Promise<ExaQueryPayload[]> {
  const cutoffIso = input.recencyCutoff.toISOString();

  const userPrompt = JSON.stringify({
    company: input.profile.company,
    role: input.profile.role,
    topic: input.topic,
    lane: input.lane,
    includeDomains: input.includeDomains ?? [],
    includeText: input.includeText ?? [],
    recencyCutoff: cutoffIso,
    numResults: EXA_NUM_RESULTS,
  });

  const systemPrompt = QUERY_GENERATOR_PROMPT.replace(
    "{role}",
    input.profile.role || "professional"
  ).replace("{company}", input.profile.company || "their company");

  const response = await callLLM("sonnet", systemPrompt, userPrompt, tracker, 2048);

  try {
    const queries = parseJsonFromLLM<ExaQueryPayload[]>(response);
    return queries.map((q) => ({
      ...q,
      numResults: q.numResults ?? EXA_NUM_RESULTS,
      startPublishedDate: q.startPublishedDate ?? cutoffIso,
    }));
  } catch {
    return [fallbackQuery(input, cutoffIso)];
  }
}

function fallbackQuery(
  input: QueryGenInput,
  cutoffIso: string
): ExaQueryPayload {
  const role = input.profile.role || "professional";
  const company = input.profile.company || "their organization";

  const base: ExaQueryPayload = {
    query: `In-depth analysis of ${input.topic} relevant to a ${role} at ${company}, covering recent developments and strategic implications`,
    numResults: EXA_NUM_RESULTS,
    startPublishedDate: cutoffIso,
  };

  if (input.lane === "news" || input.lane === "analyst") {
    base.category = "news";
  }
  if (input.includeDomains?.length) {
    base.includeDomains = input.includeDomains;
  }
  if (input.includeText?.length === 1) {
    base.includeText = input.includeText;
  }
  return base;
}

export async function extractCandidateInsights(
  highlights: string[],
  title: string,
  role: string,
  tracker: CostTracker
): Promise<{ summary: string; isPaywalled: boolean }> {
  const system = `You extract key insights from search result highlights for a newsletter research pipeline.
Return JSON: { "summary": "...", "isPaywalled": boolean }
Only summarize from provided highlights. Never invent content. Flag paywalled if highlights suggest restricted access.`;

  const user = JSON.stringify({ title, highlights, role });

  const response = await callLLM("opus", system, user, tracker, 512);
  try {
    return parseJsonFromLLM(response);
  } catch {
    return {
      summary: highlights.join(" ").slice(0, 300),
      isPaywalled: false,
    };
  }
}
