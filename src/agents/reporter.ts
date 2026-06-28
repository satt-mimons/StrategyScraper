import { callLLM } from "@/lib/anthropic";
import {
  MAX_WORD_COUNT,
  TLDR_BULLET_MIN,
  TLDR_BULLET_MAX,
  DEEP_DIVE_MIN,
  DEEP_DIVE_MAX,
} from "@/lib/constants";
import { validateLinkIntegrity, countWordsExcludingLinks } from "@/lib/utils";
import type { CostTracker, Profile, SelectedStory } from "@/types";

export async function runReporterAgent(
  stories: SelectedStory[],
  profile: Profile,
  tracker: CostTracker
): Promise<string> {
  const allowedUrls = new Set(stories.map((s) => s.url));

  const system = `You are a junior reporter agent synthesizing selected stories into a newsletter draft.

Format (strict):
- TLDR section at top with ${TLDR_BULLET_MIN}-${TLDR_BULLET_MAX} bullet points
- Then ${DEEP_DIVE_MIN}-${DEEP_DIVE_MAX} deep-dive subsections as paragraph prose (NO bullets in subsections)
- Maximum ~${MAX_WORD_COUNT} words excluding hyperlink URLs
- Hyperlink sources inline using markdown [text](url) format throughout

Hard rules:
- ONLY cite URLs from the allowed URL set provided — never invent or guess URLs
- Paywalled items: include headline + snippet + link, labeled as (paywalled); summarize ONLY from snippet/highlights
- Write for a ${profile.role || "professional"} at ${profile.company || "their company"}
- Topics: ${profile.topics.join(", ")}

Return markdown only. No preamble.`;

  const user = JSON.stringify({
    stories: stories.map((s) => ({
      url: s.url,
      title: s.title,
      lane: s.lane,
      author: s.author,
      snippet: s.snippet,
      highlights: s.highlights,
      is_paywalled: s.is_paywalled,
    })),
    allowed_urls: [...allowedUrls],
  });

  let draft = await callLLM("sonnet", system, user, tracker, 8192);

  const integrity = validateLinkIntegrity(draft, allowedUrls);
  if (!integrity.valid) {
    draft = await callLLM(
      "sonnet",
      `Fix link integrity. Remove or replace these invalid URLs: ${integrity.invalidUrls.join(", ")}. Only use allowed URLs.`,
      draft,
      tracker,
      8192
    );
  }

  return draft;
}

export function enforceWordCount(markdown: string): string {
  const count = countWordsExcludingLinks(markdown);
  if (count <= MAX_WORD_COUNT) return markdown;
  return markdown;
}
