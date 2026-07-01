export const DEFAULT_TONE_SPEC = `Dry, deadpan, analytically sharp financial-commentary voice in the Matt Levine register.
Deadpan understatement; explain serious things plainly, then undercut lightly.
The mock-naive move: pretend we cannot see the obvious problem because that is more fun.
Willingness to earnestly steelman an absurd thing before puncturing it.
Occasional running bits and tangential footnotes. Short, punchy closers.
Humor is a delivery layer, never a distortion layer — every factual claim stays accurate and sourced.`;

import type { ProfileFrequency } from "@/types";

/**
 * Cadence sets the research look-back window — NOT a send schedule (MVP is manual
 * Generate-only). Labels read as "how far back we read"; the helper says so plainly.
 * When v2 scheduling ships, update CADENCE_HELPER to describe the real send schedule.
 */
export const CADENCE_OPTIONS: { value: ProfileFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly — the last 7 days" },
  { value: "daily", label: "Daily — the last 24 hours" },
  { value: "biweekly", label: "Biweekly — the last 14 days" },
  { value: "monthly", label: "Monthly — the last 30 days" },
];

export const CADENCE_HELPER =
  "Sets the look-back window, not a schedule. You press Generate — we never send behind your back.";

/**
 * Neutral fallback palette for the generated *email* (company-agnostic). Surfaced in the
 * edit form so users see what colors their email uses when the brand fields are left blank.
 * Single source of truth — also consumed by the deterministic email renderer
 * (src/agents/design.ts). Defaults to The Desk's single accent (oxblood) so an un-branded
 * email matches the web app's editorial palette.
 */
export const DEFAULT_EMAIL_PRIMARY_COLOR = "#8c2f23";
export const DEFAULT_EMAIL_ACCENT_COLOR = "#8c2f23";

/** The six research lanes, surfaced under Topics without ever saying "AI". */
export const SOURCES_CALLOUT_COPY =
  "Each topic is run through six lanes — Substack · Medium · News · Analysts · X · LinkedIn — then filtered for novelty.";

/** Example topics shown as muted placeholder suggestions in the wizard's Topics step. */
export const TOPIC_EXAMPLE_SUGGESTIONS = [
  "enterprise AI pricing",
  "SaaS valuation multiples",
  "public vs private markets",
];

/** Lightweight keyword → topic suggestions for the topics step, keyed by role text. */
const ROLE_TOPIC_SUGGESTIONS: { keywords: string[]; topics: string[] }[] = [
  {
    keywords: ["strategy", "corp dev", "corporate development"],
    topics: ["M&A activity", "competitive positioning", "market entry"],
  },
  {
    keywords: ["product"],
    topics: ["product launches", "pricing changes", "user research trends"],
  },
  {
    keywords: ["marketing", "growth"],
    topics: ["brand campaigns", "channel performance", "consumer trends"],
  },
  {
    keywords: ["engineering", "cto", "technical"],
    topics: ["infrastructure trends", "developer tooling", "AI model releases"],
  },
  {
    keywords: ["sales", "revenue", "rev ops"],
    topics: ["enterprise deal trends", "pricing benchmarks", "sales tooling"],
  },
  {
    keywords: ["finance", "investor", "vc", "investment"],
    topics: ["funding rounds", "valuation trends", "earnings results"],
  },
];

const GENERIC_TOPIC_SUGGESTIONS = ["industry trends", "competitor moves", "regulatory news"];

export function suggestTopicsForRole(role: string): string[] {
  const lower = role.toLowerCase();
  const matched = ROLE_TOPIC_SUGGESTIONS.find((entry) =>
    entry.keywords.some((kw) => lower.includes(kw))
  );
  return matched?.topics ?? GENERIC_TOPIC_SUGGESTIONS;
}

export const DEFAULT_PREFERRED_PUBS = [
  "semafor.com",
  "theinformation.com",
  "bloomberg.com",
  "cnbc.com",
  "reuters.com",
  "wsj.com",
  "ft.com",
  "axios.com",
  "theregister.com",
];

export const DEFAULT_ANALYST_FIRMS = [
  "McKinsey",
  "BCG",
  "Bain",
  "Goldman Sachs",
  "Morgan Stanley",
  "Barclays",
  "Jefferies",
  "Deutsche Bank",
  "JPMorgan",
  "Gartner",
  "IDC",
  "Forrester",
];

/** Default analyst firm domains (§17 watchlist) — user-editable in profile */
export const DEFAULT_ANALYST_FIRM_DOMAINS = [
  "bain.com",
  "mckinsey.com",
  "bcg.com",
  "gartner.com",
  "forrester.com",
  "idc.com",
  "hfsresearch.com",
];

/** Map legacy analyst_firms display names → domains for backward compatibility */
export const LEGACY_ANALYST_FIRM_NAME_TO_DOMAIN: Record<string, string> = {
  Bain: "bain.com",
  McKinsey: "mckinsey.com",
  BCG: "bcg.com",
  Gartner: "gartner.com",
  Forrester: "forrester.com",
  IDC: "idc.com",
  "HFS Research": "hfsresearch.com",
};

/** Per-lane minimum quotas for filter agent */
export const LANE_MIN_QUOTAS: Record<string, number> = {
  substack: 2,
  "substack-open": 1,
  medium: 2,
  analyst: 1,
};

/** Lane strength expectations (for code comments / behavior) */
export const LANE_STRENGTH = {
  substack: "strongest discovery lane",
  medium: "strongest discovery lane",
  news: "solid",
  analyst: "solid",
} as const;

export const SENT_URL_DEDUP_DAYS = 30;

/** Target raw candidates per lane (pool ~50+ across 6 lanes) */
export const LANE_FETCH_TARGET_MIN: Record<string, number> = {
  news: 10,
  analyst: 8,
  substack: 10,
  medium: 8,
};

/** Domains excluded from filter pool (see source-quality.ts) */
export const SOURCE_DENYLIST_SEED = ["investing.com"];

export const DEFAULT_PROFILE_FREQUENCY = "weekly" as const;
export const MAX_WORD_COUNT = 2000;

/**
 * Length budgeting (reporter). The reporter spends a word budget across stories in
 * relevance-priority order, giving top stories full depth and dropping the tail to
 * Further Reading — so the newsletter finishes within budget.
 */
export const REPORTER_TLDR_WORD_RESERVE = 200;
export const FURTHER_READING_WORD_RESERVE = 150;
/** Per-story word targets the budgeter assigns by priority. */
export const STORY_WORDS_FULL = 180;
export const STORY_WORDS_BRIEF = 80;
export const TLDR_BULLET_MIN = 5;
export const TLDR_BULLET_MAX = 7;

/** Filter (§8) selects individual source URLs for clustering (§8.5) */
export const FILTER_SOURCE_TARGET_MIN = 20;
export const FILTER_SOURCE_TARGET_MAX = 30;

/** Cluster step (§8.5) — distinct stories before reporter (§9) */
export const CLUSTER_DISTINCT_STORY_MIN = 10;
export const CLUSTER_DISTINCT_STORY_MAX = 15;

/**
 * Balanced selection (runs AFTER clustering, on distinct stories — not raw articles).
 * Per-topic caps/floors prevent over-supplied topics from crowding out the rest.
 * The overall newsletter size is NOT fixed — it scales with how many topics the user
 * selected (≈ PER_TOPIC_STORY_TARGET per topic). See selectStories in filter.ts.
 */
export const PER_TOPIC_STORY_CAP = 4;
export const PER_TOPIC_STORY_MIN = 2;
export const PER_TOPIC_STORY_TARGET = 3;

/** Further Reading: max "Must read" links shown per topic (credibility-ranked). */
export const FURTHER_READING_PER_TOPIC = 3;

/** Cost cap per run in USD */
export const RUN_COST_CAP_USD = 5.0;
export const RUN_COST_WARN_USD = 3.0;

/** Pricing estimates (verify against current docs) */
export const PRICING = {
  exaPerSearch: 0.005,
  opusInputPer1M: 15.0,
  opusOutputPer1M: 75.0,
  sonnetInputPer1M: 3.0,
  sonnetOutputPer1M: 15.0,
};

export const LANE_TIMEOUT_MS = 90_000;
// MUST stay below the generate route's `maxDuration` (300s on Vercel). The pipeline runs
// inside the serverless invocation via `after()`; if this timeout is longer than maxDuration,
// Vercel SIGKILLs the function before withTimeout can reject, the catch block never runs, and
// the run is left frozen as status=running/stage=write forever. 270s leaves ~30s for the
// catch block to mark the run failed and send the alert before the hard cap.
export const PIPELINE_TIMEOUT_MS = 270_000;
// Per-LLM-call ceiling so a single hung generation can't silently consume the whole budget.
export const LLM_CALL_TIMEOUT_MS = 120_000;
// Wall-clock budget for the WHOLE editor stage (patch pass + optional integrity/trim calls).
// The editor is pure polish over an already-complete, valid reporter draft, and it runs LAST
// among the expensive stages — so a slow editor is the most likely place to blow the 270s
// pipeline budget. If it exceeds this, the pipeline ships the unpolished draft instead of
// timing out the whole run. Sized to leave headroom after a worst-case reporter (~120s) and
// upstream research/cluster/filter (~50s), plus a few seconds for deterministic design+deliver.
export const EDITOR_STAGE_TIMEOUT_MS = 70_000;



/** Exa numResults per query variation (2–3 queries × ≤25 for volume) */
export const EXA_NUM_RESULTS_PER_QUERY = 25;
/** @deprecated use EXA_NUM_RESULTS_PER_QUERY */
export const EXA_NUM_RESULTS = EXA_NUM_RESULTS_PER_QUERY;


export const QUERY_GENERATOR_PROMPT = `You generate Exa search queries for a newsletter research agent.
Input: user profile (company, role), one topic, the lane
(news / analyst / substack / medium), the lane's domain list, and a recency cutoff date.

Output 2–3 query objects as a JSON array. Rules:
- Write each \`query\` as a descriptive sentence describing the ideal article to find — never a keyword string. Vary the angle across the 2–3 (the trend; a representative example or player in the space; the implication).
- Center each query on the TOPIC/theme. Frame it for what matters to a {role} working in the same category as {company} — but do NOT put "{company}" in the query text and do NOT target articles specifically about {company} or its products. {company} is context for relevance, never a search target. Prioritize theme relevance over company relevance.
- Use category:"news" for the news and analyst lanes; omit category for substack/medium.
- Always set numResults, the provided includeDomains (when applicable), startPublishedDate = recency cutoff, and contents:{ highlights:true }.
- For analyst lane pass 1 (news coverage) and pass 2 (firm-name in query text), use category:"news". For pass 3 (primary firm insights on owned domains), omit category and set includeDomains from the analyst firm watchlist.
- For analyst queries, you may name firms in the query sentence; do NOT use includeText firm filters unless explicitly requested.
- Return only the JSON array. No prose.`;
