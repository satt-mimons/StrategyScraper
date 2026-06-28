import { scrapeX } from "@/lib/apify";
import {
  LANE_ESCALATION_MAX_RETRIES,
  X_MAX_RESULTS_PER_TOPIC,
  X_MIN_ENGAGEMENT,
  X_HIGH_FOLLOWER_THRESHOLD,
} from "@/lib/constants";
import { perTopicTarget } from "@/lib/lane-escalation";
import { widenCutoff } from "@/lib/recency";
import { dedupeByUrl } from "@/lib/utils";
import type { Candidate, LaneResult, PipelineContext } from "@/types";
import type { NormalizedTweet } from "@/lib/apify";

/**
 * Keep if (verified OR high-follower) OR (likes + reposts ≥ SOCIAL_MIN_ENGAGEMENT).
 * Replies/retweets excluded upstream in scrapeX.
 */
export function passesXQualityFilter(tweet: NormalizedTweet): boolean {
  if (tweet.isReply || tweet.isRetweet) return false;
  if (tweet.isVerified) return true;
  if (tweet.followerCount >= X_HIGH_FOLLOWER_THRESHOLD) return true;
  if (tweet.engagement >= X_MIN_ENGAGEMENT) return true;
  return false;
}

function tweetRankScore(t: NormalizedTweet): number {
  return (
    t.engagement +
    (t.isVerified ? 100 : 0) +
    Math.log10(t.followerCount + 1) * 10
  );
}

/**
 * X lane — Apify with recency escalation (48–72h base, widen 2×/4×).
 */
export async function runXLane(ctx: PipelineContext): Promise<LaneResult> {
  const lane = "x" as const;
  const allCandidates: Omit<Candidate, "run_id">[] = [];
  const rawById = new Map<string, NormalizedTweet>();
  const passedById = new Map<string, NormalizedTweet>();
  const baseCutoff = ctx.laneRecencyCutoffs.x;
  const perTopicTargetCount = perTopicTarget("x", ctx.profile.topics.length);

  const cutoffs: Date[] = [baseCutoff];
  for (let i = 1; i <= LANE_ESCALATION_MAX_RETRIES; i++) {
    cutoffs.push(widenCutoff(baseCutoff, i === 1 ? 2 : 4));
  }

  try {
    const topicResults = await Promise.all(
      ctx.profile.topics.map(async (topic) => {
        if (ctx.costTracker.costCapHit) return [] as Omit<Candidate, "run_id">[];

        let topicTweets: NormalizedTweet[] = [];

        for (const cutoff of cutoffs) {
          if (topicTweets.length >= perTopicTargetCount) break;
          if (ctx.costTracker.costCapHit) break;

          const tweets = await scrapeX(ctx.profile, topic, cutoff, ctx.costTracker);

          for (const t of tweets) {
            rawById.set(t.platformPostId, t);
            if (passesXQualityFilter(t)) {
              passedById.set(t.platformPostId, t);
            }
          }

          const filtered = tweets
            .filter(passesXQualityFilter)
            .sort((a, b) => tweetRankScore(b) - tweetRankScore(a));

          const seen = new Set(topicTweets.map((t) => t.platformPostId));
          for (const t of filtered) {
            if (!seen.has(t.platformPostId)) {
              topicTweets.push(t);
              seen.add(t.platformPostId);
            }
          }
          topicTweets = topicTweets.slice(0, X_MAX_RESULTS_PER_TOPIC);
        }

        return topicTweets.map((tweet) => ({
          lane,
          url: tweet.url,
          title: tweet.title,
          author: tweet.author,
          published_date: tweet.publishedDate,
          snippet: tweet.snippet,
          highlights: [] as string[],
          raw_score: tweet.engagement,
          is_paywalled: false,
          platform_post_id: tweet.platformPostId,
        }));
      })
    );

    for (const batch of topicResults) {
      allCandidates.push(...batch);
    }

    const preFilterCount = rawById.size;
    const postFilterCount = passedById.size;
    const byPostId = dedupeByPlatformId(dedupeByUrl(allCandidates));

    return {
      lane,
      candidates: byPostId,
      pre_filter_count: preFilterCount,
      post_filter_count: postFilterCount,
      success: byPostId.length > 0,
      error:
        byPostId.length === 0
          ? preFilterCount > 0
            ? `No X results after filter (${preFilterCount} pre-filter, ${postFilterCount} post-filter)`
            : "No X results from Apify"
          : undefined,
    };
  } catch (err) {
    return {
      lane,
      candidates: allCandidates,
      pre_filter_count: rawById.size,
      post_filter_count: passedById.size,
      success: allCandidates.length > 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function dedupeByPlatformId(
  items: Omit<Candidate, "run_id">[]
): Omit<Candidate, "run_id">[] {
  const seen = new Map<string, Omit<Candidate, "run_id">>();
  for (const item of items) {
    const key = item.platform_post_id ?? item.url;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}
