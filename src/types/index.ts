export type Lane =
  | "news"
  | "analyst"
  | "substack"
  | "substack-open"
  | "medium"
  | "x"
  | "linkedin";

export type RunStatus = "queued" | "running" | "done" | "failed";

export interface BrandOverrides {
  primary_color?: string;
  accent_color?: string;
  logo_url?: string;
}

export interface Profile {
  id: string;
  company: string;
  role: string;
  topics: string[];
  tone_spec: string;
  preferred_pubs: string[];
  analyst_firms: string[];
  brand_overrides: BrandOverrides;
  recipients: string[];
  reply_to: string;
  created_at: string;
  updated_at: string;
}

export interface Run {
  id: string;
  status: RunStatus;
  started_at: string | null;
  finished_at: string | null;
  cost_estimate_usd: number;
  error: string | null;
  lanes_succeeded: string[];
  lanes_failed: string[];
  created_at: string;
}

export interface Candidate {
  id?: string;
  run_id: string;
  lane: Lane;
  url: string;
  title: string;
  author: string;
  published_date: string | null;
  snippet: string;
  highlights: string[];
  raw_score: number;
  is_paywalled: boolean;
  platform_post_id?: string | null;
}

export interface SelectedStory {
  url: string;
  title: string;
  lane: Lane;
  why_selected: string;
  is_paywalled: boolean;
  author?: string;
  snippet?: string;
  highlights?: string[];
}

export interface ExaQueryPayload {
  query: string;
  category?: "news";
  numResults: number;
  includeDomains?: string[];
  includeText?: string[];
  startPublishedDate: string;
}

export interface CostTracker {
  exaSearches: number;
  apifyRuns: number;
  opusInputTokens: number;
  opusOutputTokens: number;
  sonnetInputTokens: number;
  sonnetOutputTokens: number;
}

export interface LaneResult {
  lane: Lane;
  candidates: Omit<Candidate, "run_id">[];
  success: boolean;
  error?: string;
}

export interface PipelineContext {
  runId: string;
  profile: Profile;
  recencyCutoff: Date;
  costTracker: CostTracker;
}
