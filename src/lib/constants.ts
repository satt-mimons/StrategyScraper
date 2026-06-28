export const DEFAULT_TONE_SPEC = `Dry, deadpan, analytically sharp financial-commentary voice in the Matt Levine register.
Deadpan understatement; explain serious things plainly, then undercut lightly.
The mock-naive move: pretend we cannot see the obvious problem because that is more fun.
Willingness to earnestly steelman an absurd thing before puncturing it.
Occasional running bits and tangential footnotes. Short, punchy closers.
Humor is a delivery layer, never a distortion layer — every factual claim stays accurate and sourced.`;

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

/** Per-lane minimum quotas for filter agent */
export const LANE_MIN_QUOTAS: Record<string, number> = {
  substack: 2,
  "substack-open": 1,
  medium: 2,
  analyst: 1,
};

/** Novelty weight multipliers — niche lanes ranked higher */
export const LANE_NOVELTY_WEIGHT: Record<string, number> = {
  substack: 1.5,
  "substack-open": 1.4,
  medium: 1.4,
  analyst: 1.3,
  news: 1.0,
  x: 0.9,
  linkedin: 0.8,
};

/** Lane strength expectations (for code comments / behavior) */
export const LANE_STRENGTH = {
  substack: "strongest discovery lane",
  medium: "strongest discovery lane",
  news: "solid",
  analyst: "solid",
  x: "medium, noisy — requires aggressive filtering",
  linkedin: "weakest, best-effort — may return thin results",
} as const;

export const RECENCY_FALLBACK_DAYS = 7;
export const SENT_URL_DEDUP_DAYS = 30;
export const MAX_WORD_COUNT = 2000;
export const TLDR_BULLET_MIN = 5;
export const TLDR_BULLET_MAX = 7;
export const DEEP_DIVE_MIN = 3;
export const DEEP_DIVE_MAX = 5;

/** Cost cap per run in USD */
export const RUN_COST_CAP_USD = 5.0;
export const RUN_COST_WARN_USD = 3.0;

/** Pricing estimates (verify against current docs) */
export const PRICING = {
  exaPerSearch: 0.005,
  apifyXPer1k: 0.35,
  apifyLinkedInPer1k: 5.0,
  opusInputPer1M: 15.0,
  opusOutputPer1M: 75.0,
  sonnetInputPer1M: 3.0,
  sonnetOutputPer1M: 15.0,
};

export const LANE_TIMEOUT_MS = 120_000;
export const APIFY_POLL_INTERVAL_MS = 3_000;
export const APIFY_DEFAULT_TIMEOUT_MS = 90_000;

/** X lane hard filters */
export const X_MIN_ENGAGEMENT = 50;
export const X_MAX_RESULTS_PER_TOPIC = 15;

/** Exa numResults cap per query */
export const EXA_NUM_RESULTS = 10;

/** Apify actor IDs */
export const APIFY_X_ACTOR = "apidojo/tweet-scraper";
export const APIFY_LINKEDIN_ACTOR = "curious_coder/linkedin-post-search-scraper";

export const QUERY_GENERATOR_PROMPT = `You generate Exa search queries for a newsletter research agent.
Input: user profile (company, role), one topic, the lane
(news / analyst / substack / medium), the lane's domain list, and a recency cutoff date.

Output 2–3 query objects as a JSON array. Rules:
- Write each \`query\` as a descriptive sentence describing the ideal article to find — never a keyword string. Vary the angle across the 2–3 (the trend; a named player; the implication).
- Frame every query through the lens of the user's role and company — what matters to a {role} at {company}.
- Use category:"news" for the news and analyst lanes; omit category for substack/medium.
- Always set numResults, the provided includeDomains (when applicable), startPublishedDate = recency cutoff, and contents:{ highlights:true }.
- For analyst queries targeting a specific firm, add includeText with that single firm name (single-item array ONLY).
- Return only the JSON array. No prose.`;
