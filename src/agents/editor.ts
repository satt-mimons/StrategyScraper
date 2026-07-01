import { callLLM } from "@/lib/anthropic";
import {
  DEFAULT_TONE_SPEC,
  MAX_WORD_COUNT,
  TLDR_BULLET_MIN,
  TLDR_BULLET_MAX,
} from "@/lib/constants";
import {
  validateLinkIntegrity,
  countWordsExcludingLinks,
  stripDisallowedLinks,
} from "@/lib/utils";
import type { CostTracker, Profile, SelectedStory } from "@/types";

/**
 * Output ceiling for the editor's single trim pass. It re-emits the finished newsletter
 * (~1500–1800 words ≈ ~5–6K tokens once markdown links are counted), so this must comfortably
 * fit the whole document. Kept above a normal newsletter but low enough that the call stays
 * well within its wall-clock budget rather than the old verbatim-patch pass that timed out.
 */
const EDITOR_MAX_TOKENS = 6144;

/**
 * The editor is a single deterministic-ish pass: TRIM to budget, DE-DENSIFY the bullets, and
 * ENFORCE link integrity — all in one LLM call, then a deterministic link strip as a hard
 * guarantee. It replaced a verbatim find/replace "voice patch" that regularly timed out on
 * content-rich drafts; the voice now lives in the reporter (§14). Link integrity moved here
 * too, so the reporter no longer pays for a second self-correcting generation.
 */
export async function runEditorAgent(
  draft: string,
  stories: SelectedStory[],
  profile: Profile,
  tracker: CostTracker
): Promise<string> {
  const allowedUrls = new Set(stories.map((s) => s.url));
  const toneSpec = profile.tone_spec || DEFAULT_TONE_SPEC;

  const system = `You are an editor condensing a strategy newsletter to its final form (§10). You receive a draft and a list of allowed_urls. Do ALL of the following in ONE pass and return the finished markdown only:

1. TRIM to under ${MAX_WORD_COUNT} words (excluding link URLs). Cut secondary examples, throat-clearing, and redundancy; keep every headline claim.
2. DE-DENSIFY the bullets — make them punchy and scannable: shorter sentences, less link-stuffing. Keep the 2–3 strongest linked claims per bullet, not every possible citation.
3. ENFORCE LINK INTEGRITY — every markdown link URL MUST appear in allowed_urls. If a link's URL is NOT in allowed_urls, remove the hyperlink (keep the sentence text) or drop that unsupported claim. Never invent or keep any URL outside allowed_urls.

Preserve EXACTLY:
- The ## TLDR at the top (${TLDR_BULLET_MIN}–${TLDR_BULLET_MAX} bullets)
- The ## topic sections and their order
- One bullet per story; the **bold topic sentence** opening each bullet
- The ## Further Reading section
Do NOT convert topic-section bullets into paragraphs, and do NOT drop stories or sections.

Keep the voice intact while tightening (§14) — sharpen it if anything, never flatten it:
${toneSpec}

Guardrails: humor is a delivery layer, never a distortion layer — every remaining factual claim stays accurate and sourced. Never fabricate quotes or attribute invented lines to real people. Paywalled items keep their (paywalled) label.

Return markdown only. No preamble, no code fences.`;

  const user = JSON.stringify({
    draft,
    allowed_urls: [...allowedUrls],
  });

  // The editor polishes an already-complete draft — it must never fail the run. On truncation
  // or any error, fall back to the raw draft; the deterministic link strip below then guarantees
  // link integrity either way.
  let polished: string;
  try {
    polished = await callLLM(
      "sonnet",
      system,
      user,
      tracker,
      EDITOR_MAX_TOKENS,
      { throwOnTruncation: true }
    );
  } catch (err) {
    console.error(
      `[editor] trim pass failed, shipping link-cleaned reporter draft: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    polished = draft;
  }

  // Deterministic backstop. The model reliably drops out-of-set URLs, but we do not trust it to
  // be perfect — and the reporter no longer self-corrects links upstream. Strip any link whose
  // URL is not in the allowed set so integrity is guaranteed in code, not by the model.
  const integrity = validateLinkIntegrity(polished, allowedUrls);
  if (!integrity.valid) {
    console.warn(
      `[editor] stripping ${integrity.invalidUrls.length} out-of-set link(s) deterministically`
    );
    polished = stripDisallowedLinks(polished, allowedUrls);
  }

  const wordCount = countWordsExcludingLinks(polished);
  if (wordCount > MAX_WORD_COUNT) {
    console.warn(
      `[editor] ${wordCount} words after trim (> ${MAX_WORD_COUNT} cap) — shipping as-is rather than paying for another pass`
    );
  }

  return polished;
}
