import type { CostTracker } from "@/types";
import {
  APIFY_DEFAULT_TIMEOUT_MS,
  APIFY_LINKEDIN_ACTOR,
  APIFY_POLL_INTERVAL_MS,
  APIFY_X_ACTOR,
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
  retries = 3
): Promise<Response> {
  const url = `${APIFY_BASE}${path}${path.includes("?") ? "&" : "?"}token=${getToken()}`;
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status >= 500 && attempt < retries - 1) {
      await sleep(1000 * Math.pow(2, attempt));
      continue;
    }
    return res;
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
}

export async function scrapeX(
  topic: string,
  recencyCutoff: Date,
  tracker: CostTracker
): Promise<NormalizedTweet[]> {
  const sinceStr = recencyCutoff.toISOString().split("T")[0];
  const searchTerms = [
    `${topic} -filter:replies -filter:retweets since:${sinceStr}`,
  ];

  const items = await runApifyActor(
    APIFY_X_ACTOR,
    {
      searchTerms,
      maxItems: 50,
      sort: "Top",
    },
    tracker
  );

  return items
    .map(normalizeTweet)
    .filter((t) => t.engagement >= 50)
    .slice(0, 15);
}

function normalizeTweet(item: Record<string, unknown>): NormalizedTweet {
  const likes = Number(item.likeCount ?? item.favorite_count ?? 0);
  const reposts = Number(item.retweetCount ?? item.retweet_count ?? 0);
  const replies = Number(item.replyCount ?? item.reply_count ?? 0);
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
  };
}

export interface NormalizedLinkedInPost {
  url: string;
  title: string;
  author: string;
  publishedDate: string | null;
  snippet: string;
  platformPostId: string;
}

export async function scrapeLinkedIn(
  topic: string,
  tracker: CostTracker
): Promise<NormalizedLinkedInPost[]> {
  // Cookieless, low-volume, best-effort. Empty results are normal.
  try {
    const items = await runApifyActor(
      APIFY_LINKEDIN_ACTOR,
      {
        searchKeywords: topic,
        maxPosts: 10,
      },
      tracker,
      60_000
    );

    return items.slice(0, 10).map((item) => ({
      url: String(item.postUrl ?? item.url ?? ""),
      title: String(item.headline ?? item.title ?? "").slice(0, 120),
      author: String(item.authorName ?? item.author ?? ""),
      publishedDate: item.postedAt
        ? new Date(String(item.postedAt)).toISOString()
        : null,
      snippet: String(item.text ?? item.content ?? "").slice(0, 500),
      platformPostId: String(item.postId ?? item.id ?? item.url ?? ""),
    }));
  } catch {
    return [];
  }
}

// Re-export for lane modules
export { APIFY_X_ACTOR, APIFY_LINKEDIN_ACTOR };
