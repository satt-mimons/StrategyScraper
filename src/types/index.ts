export type Lane =
  | "news"
  | "analyst"
  | "substack"
  | "substack-open"
  | "medium";

export type RunStatus = "queued" | "running" | "done" | "failed";

export type PipelineStage = "research" | "filter" | "write" | "design" | "deliver";

export interface BrandOverrides {
  primary_color?: string;
  accent_color?: string;
  logo_url?: string;
}

export type ProfileFrequency = "daily" | "weekly" | "biweekly" | "monthly";

export interface Profile {
  id: string;
  company: string;
  role: string;
  topics: string[];
  tone_spec: string;
  preferred_pubs: string[];
  analyst_firms: string[];
  /** User-editable firm domain watchlist (§17) — drives analyst primary-content pass */
  analyst_firm_domains: string[];
  /** Send cadence — drives per-lane recency base windows */
  frequency: ProfileFrequency;
  /** Curated LinkedIn profile/company URLs */
  linkedin_urls: string[];
  /** Must-read Substack publication URLs */
  substack_urls: string[];
  brand_overrides: BrandOverrides;
  recipients: string[];
  reply_to: string;
  created_at: string;
  updated_at: string;
}

/** A user's saved newsletter configuration (supports multiple per user) */
export interface NewsletterConfig {
  id: string;
  user_id: string;
  name: string;
  company: string;
  role: string;
  frequency: ProfileFrequency;
  topics: string[];
  tone_preset: string;
  tone_custom: string;
  recipients: string[];
  reply_to: string;
  preferred_publications: string[];
  substack_urls: string[];
  linkedin_urls: string[];
  primary_color: string;
  accent_color: string;
  logo_url: string;
  created_at: string;
  updated_at: string;
}

export interface Run {
  id: string;
  newsletter_id: string | null;
  user_id: string | null;
  status: RunStatus;
  stage: PipelineStage;
  started_at: string | null;
  finished_at: string | null;
  cost_estimate_usd: number;
  error: string | null;
  lanes_succeeded: string[];
  lanes_failed: string[];
  lane_stats: LaneStatEntry[];
  created_at: string;
}

export interface LaneStatEntry {
  lane: "news" | "analyst" | "substack" | "medium";
  raw_count: number;
  survived_count: number;
  error: string | null;
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

export type LinkTier = "must_read" | "context";

/** Source-type bucket for clustered stories (§8.5) */
export type StorySourceType = "mainstream" | "niche_blog" | "analyst";

export interface StorySource {
  url: string;
  title: string;
  lane: Lane;
  source_type: StorySourceType;
  author?: string;
  snippet?: string;
  highlights?: string[];
  is_paywalled: boolean;
  link_tier: LinkTier;
  why_selected?: string;
}

/** Distinct story after semantic clustering — may span multiple source URLs */
export interface ClusteredStory {
  cluster_id: string;
  headline: string;
  primary_topic: string;
  sources: StorySource[];
  source_count: number;
  /** Unique source-type buckets represented in this cluster */
  source_types: StorySourceType[];
  /** Primary URL for inline citation in prose */
  lead_url: string;
  cluster_note?: string;
  /** Global relevance priority (0 = most relevant); set by the filter ranker. */
  priority?: number;
}

export interface SelectedStory {
  url: string;
  title: string;
  lane: Lane;
  why_selected: string;
  is_paywalled: boolean;
  /** Single primary user topic (from profile.topics) */
  primary_topic: string;
  /** Link prominence in Further Reading */
  link_tier: LinkTier;
  /** Preferred citation URL after aggregator resolution */
  cite_url?: string;
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
  opusInputTokens: number;
  opusOutputTokens: number;
  sonnetInputTokens: number;
  sonnetOutputTokens: number;
  /** Set when projected run cost exceeds RUN_COST_WARN_USD */
  costWarnFlagged?: boolean;
  /** Set when projected run cost would exceed RUN_COST_CAP_USD */
  costCapHit?: boolean;
}

export interface LaneResult {
  lane: Lane;
  candidates: Omit<Candidate, "run_id">[];
  success: boolean;
  error?: string;
}

import type { RecencyLane } from "@/lib/recency";

export interface PipelineContext {
  runId: string;
  profile: Profile;
  /** Per-lane recency cutoffs (lookback_days = max(daysSinceLastSend, base_window)) */
  laneRecencyCutoffs: Record<RecencyLane, Date>;
  costTracker: CostTracker;
}
