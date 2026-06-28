import { callLLM } from "@/lib/anthropic";
import {
  DEFAULT_TONE_SPEC,
  MAX_WORD_COUNT,
  TLDR_BULLET_MIN,
  TLDR_BULLET_MAX,
} from "@/lib/constants";
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

  const system = `You are an editor agent polishing a newsletter draft (§10).

FORMAT (enforce strictly) — topic sections use bullets: exactly one bullet per distinct story. Do NOT convert topic-section bullets into paragraphs, and do NOT remove bullets from topic sections — bullets there are REQUIRED.

Required structure:
- ## TLDR at top: ${TLDR_BULLET_MIN}–${TLDR_BULLET_MAX} bullets (plain bullets; bold topic-sentence pattern not required here)
- Then ## sections titled with each user topic that has content
- WITHIN each topic section: bullets ONLY — one bullet per distinct story. NO paragraph prose blocks
- Each story bullet MUST open with a **bold topic sentence** stating the core point, then the sharp take with inline source links distributed THROUGHOUT (specific claims/figures linked to specific sources), not a single trailing citation
- If the draft uses paragraph prose inside a topic section, REWRITE it as the required bullet structure — do not leave prose blocks
- Preserve and, where a bullet is thin on links, ADD inline source links throughout it (aim for 3+ distinct sources when available); never collapse to one link
- Mainstream NEWS sources are first-class: ensure they are represented in the bullets, not dropped in favor of niche/analyst commentary
- Further Reading is a short per-topic "Must read" list ONLY (no "Context" list) — preserve that structure and do not add a Context section
- Maximum ~${MAX_WORD_COUNT} words excluding link URLs

VOICE (§14) — apply at the bullet level, not only in TLDR:
${toneSpec}

Voice is independent of form: the Matt Levine register applies inside each story bullet's sharp take, not just in TLDR. Polish wording for dry, deadpan, analytically sharp delivery while keeping the bullet + bold-lede structure intact.

Guardrails:
- Humor is a delivery layer, never a distortion layer — every factual claim stays accurate and sourced
- Never fabricate quotes or attribute invented lines to real, named people
- Emulating a style is fine; reproducing any real columnist's actual text is not
- Re-verify link integrity — only use allowed URLs
- Paywalled items: headline + snippet + (paywalled) label; summarize from snippet only

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
      `Fix these invalid URLs: ${integrity.invalidUrls.join(", ")}. Only use allowed URLs. Preserve topic-section bullet structure with bold topic sentences.`,
      polished,
      tracker,
      8192
    );
  }

  const wordCount = countWordsExcludingLinks(polished);
  if (wordCount > MAX_WORD_COUNT) {
    polished = await callLLM(
      "sonnet",
      `Trim this draft to under ${MAX_WORD_COUNT} words (excluding link URLs). Preserve TLDR, topic sections as bullets (bold topic sentence + sharp take each), and Further Reading. Do not convert bullets to paragraphs.`,
      polished,
      tracker,
      8192
    );
  }

  return polished;
}
