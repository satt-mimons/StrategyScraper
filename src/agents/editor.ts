import { callLLM } from "@/lib/anthropic";
import { DEFAULT_TONE_SPEC, MAX_WORD_COUNT } from "@/lib/constants";
import { validateLinkIntegrity, countWordsExcludingLinks } from "@/lib/utils";
import type { CostTracker, Profile, SelectedStory } from "@/types";

export async function runEditorAgent(
  draft: string,
  stories: SelectedStory[],
  profile: Profile,
  tracker: CostTracker
): Promise<string> {
  const allowedUrls = new Set(stories.map((s) => s.url));
  const toneSpec = profile.tone_spec || DEFAULT_TONE_SPEC;

  const system = `You are an editor agent polishing a newsletter draft.

Enforce tone spec:
${toneSpec}

Enforce format:
- Bullets ONLY in the TLDR section
- Paragraph prose in deep-dive subsections
- Maximum ~${MAX_WORD_COUNT} words excluding links

Guardrails:
- Humor must never distort underlying facts
- Never fabricate quotes or attribute invented lines to real, named people
- Emulating a style is fine; reproducing any real columnist's actual text is not
- Re-verify link integrity — only use allowed URLs

Return polished markdown only. No preamble.`;

  const user = JSON.stringify({
    draft,
    allowed_urls: [...allowedUrls],
  });

  let polished = await callLLM("sonnet", system, user, tracker, 8192);

  const integrity = validateLinkIntegrity(polished, allowedUrls);
  if (!integrity.valid) {
    polished = await callLLM(
      "sonnet",
      `Fix these invalid URLs: ${integrity.invalidUrls.join(", ")}. Only use allowed URLs.`,
      polished,
      tracker,
      8192
    );
  }

  const wordCount = countWordsExcludingLinks(polished);
  if (wordCount > MAX_WORD_COUNT) {
    polished = await callLLM(
      "sonnet",
      `Trim this draft to under ${MAX_WORD_COUNT} words (excluding link URLs). Preserve TLDR bullets and deep-dive structure.`,
      polished,
      tracker,
      8192
    );
  }

  return polished;
}
