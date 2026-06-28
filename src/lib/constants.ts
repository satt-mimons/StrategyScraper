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
  x: "medium, noisy — requires aggressive filtering",
  linkedin: "weakest, best-effort — may return thin results",
} as const;

export const RECENCY_FALLBACK_DAYS = 7;
/** Escalation ladder cap (~30d) */
export const ESCALATION_MAX_LOOKBACK_DAYS = 30;
export const LANE_ESCALATION_MAX_RETRIES = 2;
export const SENT_URL_DEDUP_DAYS = 30;

/** Target raw candidates per lane (pool ~50+ across 6 lanes) */
export const LANE_FETCH_TARGET_MIN: Record<string, number> = {
  news: 10,
  analyst: 8,
  substack: 10,
  medium: 8,
  x: 10,
  linkedin: 8,
};

/** Domains excluded from filter pool (see source-quality.ts) */
export const SOURCE_DENYLIST_SEED = ["investing.com"];

export const DEFAULT_PROFILE_FREQUENCY = "weekly" as const;
export const MAX_WORD_COUNT = 3000;
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

export const LANE_TIMEOUT_MS = 90_000;
export const PIPELINE_TIMEOUT_MS = 480_000;
export const APIFY_POLL_INTERVAL_MS = 3_000;
export const APIFY_DEFAULT_TIMEOUT_MS = 45_000;

/** Minimum likes+reactions (X) / reactions (LinkedIn) for social posts */
export const SOCIAL_MIN_ENGAGEMENT = 500;
export const X_MIN_ENGAGEMENT = SOCIAL_MIN_ENGAGEMENT;
export const LINKEDIN_MIN_ENGAGEMENT = SOCIAL_MIN_ENGAGEMENT;
export const X_HIGH_FOLLOWER_THRESHOLD = 5_000;
export const X_MAX_RESULTS_PER_TOPIC = 20;
export const X_APIFY_MAX_ITEMS = 100;
/** Run a Latest-sort pass when Top returns fewer than this many raw tweets */
export const X_LATEST_FALLBACK_MIN = 5;

/** LinkedIn Apify */
export const LINKEDIN_MAX_POSTS_PER_QUERY = 25;
export const LINKEDIN_LATEST_FALLBACK_MIN = 3;

/** Exa numResults per query variation (2–3 queries × ≤25 for volume) */
export const EXA_NUM_RESULTS_PER_QUERY = 25;
/** @deprecated use EXA_NUM_RESULTS_PER_QUERY */
export const EXA_NUM_RESULTS = EXA_NUM_RESULTS_PER_QUERY;

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
- For analyst lane pass 1 (news coverage) and pass 2 (firm-name in query text), use category:"news". For pass 3 (primary firm insights on owned domains), omit category and set includeDomains from the analyst firm watchlist.
- For analyst queries, you may name firms in the query sentence; do NOT use includeText firm filters unless explicitly requested.
- Return only the JSON array. No prose.`;
