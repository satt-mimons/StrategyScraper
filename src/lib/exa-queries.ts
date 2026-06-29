import { EXA_NUM_RESULTS_PER_QUERY } from "@/lib/constants";
import {
  getAnalystFirmDomains,
  getAnalystFirmLabels,
} from "@/lib/analyst-firms";
import type { ExaQueryPayload, Profile } from "@/types";

type ExaLane = "news" | "analyst" | "substack" | "medium";

interface TemplateQueryOptions {
  profile: Profile;
  topic: string;
  lane: ExaLane;
  recencyCutoff: Date;
  includeDomains?: string[];
  includeText?: string[];
}

/**
 * Fast deterministic Exa queries — 2–3 variations at ≤25 results each.
 * LLM query-generator used only on escalation (lane-escalation.ts).
 */
export function buildTemplateExaQueries(
  options: TemplateQueryOptions
): ExaQueryPayload[] {
  const { profile, topic, lane, recencyCutoff } = options;
  const role = profile.role || "professional";
  const cutoff = recencyCutoff.toISOString();
  const numResults = EXA_NUM_RESULTS_PER_QUERY;

  const queries: ExaQueryPayload[] = [
    {
      query: `Recent in-depth analysis of ${topic} and its strategic implications for a ${role}`,
      numResults,
      startPublishedDate: cutoff,
    },
    {
      query: `Industry commentary and emerging trends in ${topic} and what they mean for corporate strategy`,
      numResults,
      startPublishedDate: cutoff,
    },
    {
      query: `Expert perspective on ${topic}: competitive dynamics, market shifts, and implications for enterprise strategy`,
      numResults,
      startPublishedDate: cutoff,
    },
  ];

  if (lane === "news" || lane === "analyst") {
    queries.forEach((q) => {
      q.category = "news";
    });
  }

  if (options.includeDomains?.length) {
    queries[0].includeDomains = options.includeDomains;
  }

  if (options.includeText?.length === 1) {
    queries[0].includeText = options.includeText;
  }

  return queries;
}

export function buildNewsQueries(
  profile: Profile,
  topic: string,
  recencyCutoff: Date
): ExaQueryPayload[] {
  const templates = buildTemplateExaQueries({
    profile,
    topic,
    lane: "news",
    recencyCutoff,
    includeDomains: profile.preferred_pubs,
  });

  return [templates[0], templates[1]];
}

export function buildSubstackQueries(
  profile: Profile,
  topic: string,
  recencyCutoff: Date
): ExaQueryPayload[] {
  const cutoff = recencyCutoff.toISOString();
  const numResults = EXA_NUM_RESULTS_PER_QUERY;
  const role = profile.role || "professional";

  // Pass 1: substack.com hosted publications
  const domainQuery: ExaQueryPayload = {
    query: `Recent Substack newsletter analysis of ${topic} and its strategic implications for a ${role}`,
    numResults,
    startPublishedDate: cutoff,
    includeDomains: ["substack.com"],
  };

  // Pass 2: open query for custom-domain Substacks (no domain filter)
  const openQuery: ExaQueryPayload = {
    query: `Independent Substack newsletter commentary on ${topic} and enterprise strategy trends (including custom-domain Substacks)`,
    numResults,
    startPublishedDate: cutoff,
  };

  return [domainQuery, openQuery];
}

export function buildMediumQueries(
  profile: Profile,
  topic: string,
  recencyCutoff: Date
): ExaQueryPayload[] {
  const cutoff = recencyCutoff.toISOString();
  const numResults = EXA_NUM_RESULTS_PER_QUERY;
  const role = profile.role || "professional";

  // Pass 1: medium.com domain-scoped
  const domainQuery: ExaQueryPayload = {
    query: `Recent Medium article analysis of ${topic} and its strategic implications for a ${role}`,
    numResults,
    startPublishedDate: cutoff,
    includeDomains: ["medium.com"],
  };

  // Pass 2: open query (syndicated / cross-posted Medium content elsewhere)
  const openQuery: ExaQueryPayload = {
    query: `Industry commentary and emerging trends in ${topic} and what they mean for corporate strategy`,
    numResults,
    startPublishedDate: cutoff,
  };

  return [domainQuery, openQuery];
}

export function buildAnalystQueries(
  profile: Profile,
  topic: string,
  recencyCutoff: Date
): ExaQueryPayload[] {
  const cutoff = recencyCutoff.toISOString();
  const numResults = EXA_NUM_RESULTS_PER_QUERY;
  const role = profile.role || "professional";

  const queries: ExaQueryPayload[] = [
    // Pass 1: news coverage of analyst / research output
    {
      query: `Recent analyst and research commentary on ${topic} and its strategic implications for a ${role}`,
      category: "news",
      numResults,
      startPublishedDate: cutoff,
    },
    {
      query: `Industry research outlook and expert analysis of ${topic} and what it means for corporate strategy`,
      category: "news",
      numResults,
      startPublishedDate: cutoff,
    },
  ];

  const firmLabels = getAnalystFirmLabels(profile);
  if (firmLabels.length > 0) {
    // Pass 2: declarative firm names in query text (no includeText filter)
    queries.push({
      query: `Research and strategy commentary on ${topic} from firms such as ${firmLabels.join(", ")}, covering market outlook and enterprise implications`,
      category: "news",
      numResults,
      startPublishedDate: cutoff,
    });
  }

  const firmDomains = getAnalystFirmDomains(profile);
  if (firmDomains.length > 0) {
    // Pass 3: primary thought leadership on firm-owned domains (open neural, no category)
    queries.push({
      query: `Public insights, perspectives, blog posts, and thought leadership on ${topic} from leading strategy and research firms, relevant to a ${role}`,
      numResults,
      startPublishedDate: cutoff,
      includeDomains: firmDomains,
    });
  }

  return queries;
}

