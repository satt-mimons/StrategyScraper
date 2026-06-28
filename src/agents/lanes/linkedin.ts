import { scrapeLinkedIn } from "@/lib/apify";
import { buildLinkedInCuratedQueries } from "@/lib/exa-queries";
import { fetchExaForTopicWithEscalation } from "@/lib/lane-escalation";
import { exaResultToCandidate } from "@/agents/lanes/exa-lane-utils";
import { dedupeByUrl } from "@/lib/utils";
import type { Candidate, LaneResult, PipelineContext } from "@/types";

/**
 * LinkedIn lane — contextual multi-keyword Apify search (topic + company + role)
 * plus optional Exa pass when curated URLs exist. Best-effort; no fixed account lists.
 */
export async function runLinkedInLane(
  ctx: PipelineContext
): Promise<LaneResult> {
  const lane = "linkedin" as const;
  const allCandidates: Omit<Candidate, "run_id">[] = [];

  try {
    const curatedUrls = ctx.profile.linkedin_urls ?? [];
    if (curatedUrls.length > 0 && !ctx.costTracker.costCapHit) {
      for (const topic of ctx.profile.topics.slice(0, 3)) {
        const results = await fetchExaForTopicWithEscalation(
          ctx,
          "linkedin",
          "news",
          topic,
          (t, cutoff) => buildLinkedInCuratedQueries(ctx.profile, t, cutoff),
          { includeDomains: ["linkedin.com"] }
        );
        for (const r of results) {
          allCandidates.push(exaResultToCandidate(r, lane));
        }
      }
    }

    if (!ctx.costTracker.costCapHit) {
      const topicResults = await Promise.all(
        ctx.profile.topics.map((topic) =>
          scrapeLinkedIn(ctx.profile, topic, ctx.costTracker)
        )
      );

      for (const posts of topicResults) {
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
            raw_score: post.engagement,
            is_paywalled: false,
            platform_post_id: post.platformPostId,
          });
        }
      }
    }

    const candidates = dedupeByUrl(allCandidates);

    return {
      lane,
      candidates,
      success: candidates.length > 0,
      error: candidates.length === 0 ? "No LinkedIn results from Apify/Exa" : undefined,
    };
  } catch (err) {
    return {
      lane,
      candidates: dedupeByUrl(allCandidates),
      success: allCandidates.length > 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
