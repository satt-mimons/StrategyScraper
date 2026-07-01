import {
  DEFAULT_EMAIL_ACCENT_COLOR,
  DEFAULT_EMAIL_PRIMARY_COLOR,
} from "@/lib/constants";
import { extractMarkdownLinks } from "@/lib/utils";
import type { BrandOverrides, Profile } from "@/types";

/**
 * Neutral fallback palette — company-agnostic. Used when the user supplied no brand colors.
 * Defaults to The Desk's single accent (oxblood) so an un-branded email still matches the site.
 */
const DEFAULT_PRIMARY_COLOR = DEFAULT_EMAIL_PRIMARY_COLOR;
const DEFAULT_ACCENT_COLOR = DEFAULT_EMAIL_ACCENT_COLOR;

/*
 * "The Desk" fixed palette + type stack — the layout is now deterministic, so these are
 * baked in (not brand-driven). Mirrors the design tokens in src/app/globals.css. Only the
 * primary/accent colors below come from the user's brand overrides; everything else is the
 * editorial chrome (warm paper, ink text, hairline rules). Email-safe font fallbacks only —
 * Newsreader/IBM Plex Mono are not available in mail clients, so we fall back to Georgia /
 * Courier the way globals.css falls back to Georgia.
 */
const PAPER = "#f3efe5"; // app background — warm cream
const SURFACE = "#fbf9f3"; // card fill — slightly lighter cream
const INK = "#1b1814"; // primary text — warm near-black
const INK_2 = "#3a332a"; // body text
const INK_4 = "#8a8275"; // muted / metadata text
const HAIRLINE = "#e2dcce"; // borders and dividers
const RULE = "#d8d1c2"; // newspaper rule

const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'IBM Plex Mono', 'Courier New', Courier, monospace";

export interface BrandIdentity {
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
  companyName: string;
  /** True when the user supplied explicit brand colors (vs. the neutral default). */
  hasCustomColors: boolean;
}

/**
 * Synchronous brand identity. No hardcoded company palettes: uses the user's brand
 * overrides when present, otherwise The Desk's neutral default. Only the primary/accent
 * colors and the optional logo vary per newsletter — the layout itself is fixed.
 */
export function inferBrand(profile: Profile): BrandIdentity {
  const overrides = (profile.brand_overrides ?? {}) as BrandOverrides;
  const hasCustomColors = Boolean(
    overrides.primary_color && overrides.accent_color
  );
  return {
    primaryColor: overrides.primary_color || DEFAULT_PRIMARY_COLOR,
    accentColor: overrides.accent_color || DEFAULT_ACCENT_COLOR,
    logoUrl: overrides.logo_url,
    companyName: profile.company || "Newsletter",
    hasCustomColors,
  };
}

/* ------------------------------------------------------------------ *
 * Deterministic markdown → email HTML renderer
 * ------------------------------------------------------------------ */

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "p"; text: string };

/**
 * Parse the write-stage markdown subset into a flat block list. The polished markdown is a
 * small, well-known grammar (see reporter.ts / editor.ts / further-reading.ts): h2/h3
 * headings, `- ` bullet lists, bold, links, and blank-line-separated paragraphs. A focused
 * parser keeps full control over the inline styles emitted (required for email safety) and
 * avoids a heavyweight markdown dependency.
 */
function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let items: string[] | null = null;

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ type: "p", text: para.join(" ") });
      para = [];
    }
  };
  const flushList = () => {
    if (items && items.length > 0) {
      blocks.push({ type: "ul", items });
    }
    items = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushPara();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      blocks.push({
        type: level === 1 ? "h1" : level === 2 ? "h2" : "h3",
        text: heading[2],
      });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      if (!items) items = [];
      items.push(bullet[1]);
      continue;
    }

    flushList();
    para.push(line);
  }

  flushPara();
  flushList();
  return blocks;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render inline markdown (links + bold) to HTML with inline styles. Order matters: escape
 * first (brackets/parens/asterisks survive escaping), then links, then bold — so bold inside
 * a link's label is still emitted. `&` in URLs becomes `&amp;` in the href, which is correct
 * HTML; the fidelity guardrail decodes that back before comparing.
 */
function renderInline(text: string, brand: BrandIdentity): string {
  let html = escapeHtml(text);
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${url}" style="color:${brand.accentColor};text-decoration:underline;">${label}</a>`
  );
  html = html.replace(
    /\*\*(.+?)\*\*/g,
    `<strong style="font-weight:700;color:${INK};">$1</strong>`
  );
  return html;
}

/** A short oxblood segment + full-width hairline — The Desk's "newspaper rule". */
function newspaperRule(brand: BrandIdentity, marginTop: number): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${marginTop}px 0 0;border-collapse:collapse;">
<tr>
<td width="46" height="2" style="width:46px;height:2px;background:${brand.primaryColor};font-size:0;line-height:0;">&nbsp;</td>
<td height="2" style="height:2px;background:${RULE};font-size:0;line-height:0;">&nbsp;</td>
</tr>
</table>`;
}

/** Em-dash bullets in the brand color — newspaper-style, reliably styled in every mail client. */
function renderList(items: string[], brand: BrandIdentity): string {
  const rows = items
    .map(
      (item) => `<tr>
<td valign="top" style="padding:6px 12px 0 0;font-family:${SERIF};font-size:16px;line-height:1.6;color:${brand.primaryColor};">&mdash;</td>
<td valign="top" style="padding:5px 0;font-family:${SERIF};font-size:16px;line-height:1.6;color:${INK_2};">${renderInline(item, brand)}</td>
</tr>`
    )
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;border-collapse:collapse;">
${rows}
</table>`;
}

function renderBlock(block: Block, brand: BrandIdentity): string {
  switch (block.type) {
    case "h1":
      return `<h1 style="margin:0 0 14px;font-family:${SERIF};font-size:28px;line-height:1.2;font-weight:600;color:${INK};">${renderInline(block.text, brand)}</h1>`;
    case "h2":
      // Section header (TLDR, each topic, Further Reading) with a rule above it.
      return `${newspaperRule(brand, 30)}
<h2 style="margin:13px 0 2px;font-family:${SERIF};font-size:21px;line-height:1.25;font-weight:600;color:${INK};">${renderInline(block.text, brand)}</h2>`;
    case "h3":
      return `<h3 style="margin:22px 0 2px;font-family:${SERIF};font-size:17px;line-height:1.3;font-weight:600;color:${INK};">${renderInline(block.text, brand)}</h3>`;
    case "ul":
      return renderList(block.items, brand);
    case "p":
      return `<p style="margin:12px 0;font-family:${SERIF};font-size:16px;line-height:1.65;color:${INK_2};">${renderInline(block.text, brand)}</p>`;
  }
}

function formatDateline(date: Date): string {
  return date
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .replace(/,/g, " ·")
    .toUpperCase();
}

function formatFiledDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function renderHeader(brand: BrandIdentity, date: Date): string {
  const masthead = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.companyName)}" style="max-height:40px;max-width:180px;display:block;border:0;" />`
    : `<div style="font-family:${SERIF};font-size:26px;font-weight:600;letter-spacing:-0.01em;color:${INK};">${escapeHtml(brand.companyName)}</div>`;

  return `<tr>
<td style="padding:34px 32px 0;">
${masthead}
<div style="margin-top:7px;font-family:${MONO};font-size:11px;letter-spacing:0.12em;color:${INK_4};">${formatDateline(date)}</div>
${newspaperRule(brand, 16)}
</td>
</tr>`;
}

function renderFooter(brand: BrandIdentity, date: Date): string {
  return `<tr>
<td style="padding:28px 32px 34px;">
<div style="border-top:1px solid ${HAIRLINE};padding-top:16px;font-family:${MONO};font-size:11px;letter-spacing:0.04em;line-height:1.6;color:${INK_4};">
Filed ${formatFiledDate(date)} &middot; Generated by ${escapeHtml(brand.companyName)}
</div>
</td>
</tr>`;
}

function wrapDocument(body: string, brand: BrandIdentity): string {
  const date = new Date();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(brand.companyName)} — Brief</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};border-collapse:collapse;">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${SURFACE};border:1px solid ${HAIRLINE};border-radius:6px;border-collapse:separate;">
${renderHeader(brand, date)}
<tr>
<td style="padding:4px 32px 8px;">
${body}
</td>
</tr>
${renderFooter(brand, date)}
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

/**
 * Convert the polished write-stage markdown into a complete, email-safe HTML document styled
 * to match "The Desk". Deterministic — NO LLM call. Table-based layout with inline styles
 * only (renders in Gmail/Outlook); brand primary/accent colors and the optional logo are the
 * only per-newsletter variation. Throws if any source link or the Further Reading list is
 * dropped (see assertRenderFidelity).
 */
export function renderNewsletterHtml(
  markdown: string,
  brand: BrandIdentity
): string {
  const blocks = parseBlocks(markdown);
  const body = blocks.map((block) => renderBlock(block, brand)).join("\n");
  const html = wrapDocument(body, brand);
  assertRenderFidelity(markdown, html);
  return html;
}

/** A heading is "present" in the HTML if its text survives the markdown→HTML conversion. */
function htmlContainsHeading(html: string, headingText: string): boolean {
  return html.toLowerCase().includes(headingText.toLowerCase());
}

/**
 * Verify the rendered HTML preserved the markdown's links and its trailing Further Reading
 * section. Throws on any loss — both are hard formatting guardrails for the newsletter. The
 * renderer is deterministic, so this should never fire in practice; it fails loudly if a
 * parser bug ever silently drops content rather than shipping a broken email.
 */
function assertRenderFidelity(markdown: string, html: string): void {
  // URLs with query strings get their "&" HTML-encoded as "&amp;" inside href attributes;
  // decode that so encoding alone isn't mistaken for a dropped link.
  const decodedHtml = html.replace(/&amp;/g, "&");
  const markdownLinks = new Set(extractMarkdownLinks(markdown));
  const missing = [...markdownLinks].filter((url) => !decodedHtml.includes(url));
  if (missing.length > 0) {
    throw new Error(
      `Newsletter render dropped ${missing.length}/${markdownLinks.size} source links during conversion`
    );
  }

  if (
    markdown.includes("## Further Reading") &&
    !htmlContainsHeading(html, "Further Reading")
  ) {
    throw new Error("Newsletter render dropped the Further Reading section during conversion");
  }
}
