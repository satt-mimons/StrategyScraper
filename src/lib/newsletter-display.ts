import type { NewsletterConfig } from "@/types";

export function displayName(newsletter: NewsletterConfig): string {
  if (newsletter.name.trim()) return newsletter.name;
  if (newsletter.topics[0]) return newsletter.topics[0];
  return "Untitled newsletter";
}

/** Strip light inline markdown (links, bold, italics, code) down to plain text. */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [label](url) → label
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A one-line pull quote for the dashboard's last-issue strip: the first sentence of
 * the newsletter's TLDR. Falls back to the first content line if there's no TLDR
 * heading, and returns null when there's nothing usable.
 */
export function extractPullQuote(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  const lines = markdown.split("\n");

  let firstContent: string | null = null;
  let inTldr = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      inTldr = /tl;?dr/i.test(heading[1]);
      continue;
    }

    // Bullet or numbered list item, or a plain paragraph.
    const item = line.replace(/^([-*+]|\d+\.)\s+/, "");
    const clean = stripInlineMarkdown(item);
    if (!clean) continue;

    if (inTldr) return firstSentence(clean);
    if (firstContent === null) firstContent = clean;
  }

  return firstContent ? firstSentence(firstContent) : null;
}

function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  const sentence = (match ? match[0] : text).trim();
  // Guard against a runaway "sentence" with no terminal punctuation.
  if (sentence.length > 180) return sentence.slice(0, 177).trimEnd() + "…";
  return sentence;
}
