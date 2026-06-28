import { checkCostProjection } from "@/lib/anthropic";
import { buildXSearchTerms, buildLinkedInSearchKeywords } from "@/lib/social-search";
import type { CostTracker, Profile } from "@/types";
import {
  APIFY_DEFAULT_TIMEOUT_MS,
  APIFY_LINKEDIN_ACTOR,
  APIFY_POLL_INTERVAL_MS,
  APIFY_X_ACTOR,
  X_APIFY_MAX_ITEMS,
  X_LATEST_FALLBACK_MIN,
  LINKEDIN_MAX_POSTS_PER_QUERY,
  LINKEDIN_LATEST_FALLBACK_MIN,
  LINKEDIN_MIN_ENGAGEMENT,
} from "@/lib/constants";

const APIFY_BASE = "https://api.apify.com/v2";

function getToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is required");
  return token;
}

async function apifyFetch(
  path: string,
  options: RequestInit = {},
  retries = 3,
  timeoutMs = 20_000
): Promise<Response> {
  const url = `${APIFY_BASE}${path}${path.includes("?") ? "&" : "?"}token=${getToken()}`;
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if (res.status >= 500 && attempt < retries - 1) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries - 1) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Apify request failed after ${retries} retries: ${path}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface ApifyRunResponse {
  data: {
    id: string;
    defaultDatasetId: string;
    status: string;
  };
}

export async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  tracker: CostTracker,
  timeoutMs = APIFY_DEFAULT_TIMEOUT_MS
): Promise<Record<string, unknown>[]> {
  const projected = checkCostProjection(tracker, { apify: 1 });
  if (!projected.ok) {
    tracker.costCapHit = true;
    throw new Error(projected.message);
  }
  if (projected.level === "warn") {
    tracker.costWarnFlagged = true;
  }

  tracker.apifyRuns += 1;

  const encodedActor = actorId.replace("/", "~");
  const startRes = await apifyFetch(`/acts/${encodedActor}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`Apify actor start failed: ${err}`);
  }

  const startData = (await startRes.json()) as ApifyRunResponse;
  const runId = startData.data.id;
  const datasetId = startData.data.defaultDatasetId;

  const deadline = Date.now() + timeoutMs;
  let status = startData.data.status;

  while (status !== "SUCCEEDED" && status !== "FAILED" && status !== "ABORTED") {
    if (Date.now() > deadline) {
      throw new Error(`Apify run ${runId} timed out after ${timeoutMs}ms`);
    }
    await sleep(APIFY_POLL_INTERVAL_MS);
    const statusRes = await apifyFetch(`/actor-runs/${runId}`);
    const statusData = (await statusRes.json()) as ApifyRunResponse;
    status = statusData.data.status;
  }

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run ${runId} ended with status: ${status}`);
  }

  const itemsRes = await apifyFetch(`/datasets/${datasetId}/items`);
  if (!itemsRes.ok) {
    throw new Error(`Failed to fetch Apify dataset ${datasetId}`);
  }
  return (await itemsRes.json()) as Record<string, unknown>[];
}

export interface NormalizedTweet {
  url: string;
  title: string;
  author: string;
  publishedDate: string | null;
  snippet: string;
  platformPostId: string;
  engagement: number;
  isVerified: boolean;
  followerCount: number;
  isReply: boolean;
  isRetweet: boolean;
}

export async function scrapeX(
  profile: Profile,
  topic: string,
  recencyCutoff: Date,
  tracker: CostTracker
): Promise<NormalizedTweet[]> {
  const sinceStr = recencyCutoff.toISOString().split("T")[0];
  const searchTerms = buildXSearchTerms(profile, topic, sinceStr);
  const byId = new Map<string, NormalizedTweet>();

  const mergeItems = (items: Record<string, unknown>[]) => {
    for (const t of items
      .map(normalizeTweet)
      .filter((tweet) => !tweet.isReply && !tweet.isRetweet)) {
      byId.set(t.platformPostId, t);
    }
  };

  const topItems = await runApifyActor(
    APIFY_X_ACTOR,
    {
      searchTerms,
      maxItems: X_APIFY_MAX_ITEMS,
      sort: "Top",
    },
    tracker
  );
  mergeItems(topItems);

  if (byId.size < X_LATEST_FALLBACK_MIN && !tracker.costCapHit) {
    try {
      const latestItems = await runApifyActor(
        APIFY_X_ACTOR,
        {
          searchTerms,
          maxItems: Math.min(X_APIFY_MAX_ITEMS, 50),
          sort: "Latest",
        },
        tracker
      );
      mergeItems(latestItems);
    } catch {
      // Latest pass is best-effort
    }
  }

  return [...byId.values()];
}

function normalizeTweet(item: Record<string, unknown>): NormalizedTweet {
  const likes = Number(item.likeCount ?? item.favorite_count ?? 0);
  const reposts = Number(item.retweetCount ?? item.retweet_count ?? 0);
  const engagement = likes + reposts;

  const authorObj = item.author as Record<string, unknown> | undefined;
  const userObj = item.user as Record<string, unknown> | undefined;
  const authorName =
    String(authorObj?.userName ?? authorObj?.name ?? userObj?.screen_name ?? "");
  const isVerified = Boolean(
    authorObj?.isVerified ?? authorObj?.isBlueVerified ?? userObj?.verified
  );
  const followerCount = Number(
    authorObj?.followers ?? userObj?.followers_count ?? 0
  );

  const id = String(item.id ?? item.id_str ?? "");
  const text = String(item.text ?? item.full_text ?? "");
  const createdAt = item.createdAt ?? item.created_at;

  const isReply = Boolean(
    item.isReply ??
      item.in_reply_to_status_id ??
      item.inReplyToStatusId ??
      item.in_reply_to_user_id
  );
  const isRetweet = Boolean(
    item.isRetweet ??
      item.retweeted_status_id ??
      item.retweeted_status ??
      item.retweetedStatusId
  ) || text.startsWith("RT @");

  return {
    url: String(item.url ?? `https://x.com/i/status/${id}`),
    title: text.slice(0, 120) + (text.length > 120 ? "…" : ""),
    author: authorName,
    publishedDate: createdAt ? new Date(String(createdAt)).toISOString() : null,
    snippet: text,
    platformPostId: id,
    engagement,
    isVerified,
    followerCount,
    isReply,
    isRetweet,
  };
}

export interface NormalizedLinkedInPost {
  url: string;
  title: string;
  author: string;
  publishedDate: string | null;
  snippet: string;
  platformPostId: string;
  engagement: number;
}

export async function scrapeLinkedIn(
  profile: Profile,
  topic: string,
  tracker: CostTracker
): Promise<NormalizedLinkedInPost[]> {
  const keywords = buildLinkedInSearchKeywords(profile, topic);
  const byUrl = new Map<string, NormalizedLinkedInPost>();

  const runQuery = async (searchKeywords: string) => {
    const items = await runApifyActor(
      APIFY_LINKEDIN_ACTOR,
      {
        searchKeywords,
        maxPosts: LINKEDIN_MAX_POSTS_PER_QUERY,
      },
      tracker,
      60_000
    );
    for (const item of items) {
      const post = normalizeLinkedInPost(item);
      if (post.url && post.engagement >= LINKEDIN_MIN_ENGAGEMENT) {
        byUrl.set(post.url, post);
      }
    }
  };

  try {
    await runQuery(keywords[0]);

    if (byUrl.size < LINKEDIN_LATEST_FALLBACK_MIN && keywords.length > 1) {
      await Promise.allSettled(keywords.slice(1, 4).map((kw) => runQuery(kw)));
    }
  } catch {
    if (byUrl.size === 0 && keywords.length > 1) {
      await Promise.allSettled(keywords.slice(1, 4).map((kw) => runQuery(kw)));
    }
  }

  return [...byUrl.values()].slice(0, LINKEDIN_MAX_POSTS_PER_QUERY * 2);
}

function normalizeLinkedInPost(
  item: Record<string, unknown>
): NormalizedLinkedInPost {
  const likes = Number(
    item.numLikes ?? item.likes ?? item.likeCount ?? item.reactions ?? 0
  );
  const comments = Number(
    item.numComments ?? item.comments ?? item.commentCount ?? 0
  );
  const shares = Number(
    item.numShares ?? item.shares ?? item.repostCount ?? item.reposts ?? 0
  );
  const engagement = Number(item.engagement ?? item.totalEngagement ?? 0) || likes + comments + shares;

  return {
    url: String(item.postUrl ?? item.url ?? ""),
    title: String(item.headline ?? item.title ?? "").slice(0, 120),
    author: String(item.authorName ?? item.author ?? ""),
    publishedDate: item.postedAt
      ? new Date(String(item.postedAt)).toISOString()
      : null,
    snippet: String(item.text ?? item.content ?? "").slice(0, 500),
    platformPostId: String(item.postId ?? item.id ?? item.url ?? ""),
    engagement,
  };
}

// Re-export for lane modules
export { APIFY_X_ACTOR, APIFY_LINKEDIN_ACTOR };
