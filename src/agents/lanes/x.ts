import { scrapeX } from "@/lib/apify";
import { X_MAX_RESULTS_PER_TOPIC, X_MIN_ENGAGEMENT } from "@/lib/constants";
import { dedupeByUrl } from "@/lib/utils";
import type { Candidate, LaneResult, PipelineContext } from "@/types";

/**
 * X lane (medium, noisy) — Apify-powered.
 * Hard filters: no replies/retweets, min engagement, prefer verified/high-follower.
 * Without aggressive filtering this lane drowns the newsletter.
 *
 * Note: Scrapes public data via Apify in tension with platform ToS;
 * product owner accepts this risk for internal MVP.
 */
export async function runXLane(ctx: PipelineContext): Promise<LaneResult> {
  const lane = "x" as const;
  const allCandidates: Omit<Candidate, "run_id">[] = [];

  try {
    for (const topic of ctx.profile.topics) {
      const tweets = await scrapeX(topic, ctx.recencyCutoff, ctx.costTracker);

      const filtered = tweets
        .filter((t) => t.engagement >= X_MIN_ENGAGEMENT)
        .sort((a, b) => {
          const scoreA =
            a.engagement + (a.isVerified ? 100 : 0) + Math.log10(a.followerCount + 1) * 10;
          const scoreB =
            b.engagement + (b.isVerified ? 100 : 0) + Math.log10(b.followerCount + 1) * 10;
          return scoreB - scoreA;
        })
        .slice(0, X_MAX_RESULTS_PER_TOPIC);

      for (const tweet of filtered) {
        allCandidates.push({
          lane,
          url: tweet.url,
          title: tweet.title,
          author: tweet.author,
          published_date: tweet.publishedDate,
          snippet: tweet.snippet,
          highlights: [],
          raw_score: tweet.engagement,
          is_paywalled: false,
          platform_post_id: tweet.platformPostId,
        });
      }
    }

    const deduped = dedupeByUrl(allCandidates);
    const byPostId = dedupeByPlatformId(deduped);

    return { lane, candidates: byPostId, success: true };
  } catch (err) {
    return {
      lane,
      candidates: allCandidates,
      success: false,
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
