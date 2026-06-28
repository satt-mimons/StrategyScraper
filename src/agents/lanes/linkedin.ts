import { scrapeLinkedIn } from "@/lib/apify";
import { dedupeByUrl } from "@/lib/utils";
import type { Candidate, LaneResult, PipelineContext } from "@/types";

/**
 * LinkedIn lane (weakest, best-effort) — Apify-powered.
 * Cookie-based actors carry ban risk; prefer cookieless, low volume.
 * Empty results are normal — never block the run on this lane.
 *
 * Note: Scrapes public data via Apify in tension with platform ToS;
 * product owner accepts this risk for internal MVP.
 */
export async function runLinkedInLane(
  ctx: PipelineContext
): Promise<LaneResult> {
  const lane = "linkedin" as const;
  const allCandidates: Omit<Candidate, "run_id">[] = [];

  try {
    for (const topic of ctx.profile.topics) {
      const posts = await scrapeLinkedIn(topic, ctx.costTracker);

      for (const post of posts) {
        if (!post.url) continue;
        allCandidates.push({
          lane,
          url: post.url,
          title: post.title || post.snippet.slice(0, 80),
          author: post.author,
          published_date: post.publishedDate,
          snippet: post.snippet,
          highlights: [],
          raw_score: 0,
          is_paywalled: false,
          platform_post_id: post.platformPostId,
        });
      }
    }

    return {
      lane,
      candidates: dedupeByUrl(allCandidates),
      success: true,
    };
  } catch {
    // Best-effort: empty results are expected
    return { lane, candidates: [], success: true };
  }
}
