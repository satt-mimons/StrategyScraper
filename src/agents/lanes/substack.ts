import { buildSubstackQueries } from "@/lib/exa-queries";
import { fetchExaForTopicWithEscalation } from "@/lib/lane-escalation";
import { fetchMustReadSubstackRss } from "@/lib/substack-rss";
import { isLikelySubstack } from "@/lib/exa";
import {
  laneDeadline,
  isPastDeadline,
  exaResultToCandidate,
  collectTopicsParallel,
  laneResult,
  MAX_CANDIDATES_PER_TOPIC,
} from "@/agents/lanes/exa-lane-utils";
import { dedupeByUrl } from "@/lib/utils";
import type { Candidate, Lane, LaneResult, PipelineContext } from "@/types";

/**
 * Substack lane — dual-pass Exa (substack.com + open/custom-domain)
 * plus guaranteed RSS sub-lane for profile must-read Substack URLs.
 */
export async function runSubstackLane(ctx: PipelineContext): Promise<LaneResult> {
  const deadline = laneDeadline();
  const mustReadUrls = ctx.profile.substack_urls ?? [];

  try {
    const rssItems = mustReadUrls.length
      ? await fetchMustReadSubstackRss(
          mustReadUrls,
          ctx.laneRecencyCutoffs.substack,
          ctx.profile.topics
        )
      : [];

    const rssCandidates: Omit<Candidate, "run_id">[] = rssItems.map((item) => ({
      lane: "substack" as const,
      url: item.url,
      title: item.title,
      author: "",
      published_date: item.publishedDate,
      snippet: item.snippet,
      highlights: [],
      raw_score: 1,
      is_paywalled: false,
      platform_post_id: null,
    }));

    const exaCandidates = await collectTopicsParallel(ctx, deadline, async (topic) => {
      if (isPastDeadline(deadline)) return [];

      const results = await fetchExaForTopicWithEscalation(
        ctx,
        "substack",
        "substack",
        topic,
        (t, cutoff) => buildSubstackQueries(ctx.profile, t, cutoff),
        { includeDomains: ["substack.com"] }
      );

      return dedupeByUrl(
        results.map((r) => {
          const laneTag: Lane =
            r.url.includes("substack.com") || isLikelySubstack(r.url, r.snippet)
              ? "substack"
              : "substack-open";
          return exaResultToCandidate(r, laneTag);
        })
      ).slice(0, MAX_CANDIDATES_PER_TOPIC);
    });

    const candidates = dedupeByUrl([...rssCandidates, ...exaCandidates]);

    const timedOut = isPastDeadline(deadline);
    return laneResult("substack", candidates, timedOut);
  } catch (err) {
    return {
      lane: "substack",
      candidates: [],
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
