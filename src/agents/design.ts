import { callLLM } from "@/lib/anthropic";
import {
  DEFAULT_EMAIL_ACCENT_COLOR,
  DEFAULT_EMAIL_PRIMARY_COLOR,
  DESIGN_MAX_OUTPUT_TOKENS,
} from "@/lib/constants";
import { extractMarkdownLinks } from "@/lib/utils";
import type { BrandOverrides, CostTracker, Profile } from "@/types";

/**
 * Neutral fallback palette — company-agnostic. Used only when the user supplied no brand
 * colors AND the design LLM is unavailable (the LLM-failure fallback path).
 */
const DEFAULT_PRIMARY_COLOR = DEFAULT_EMAIL_PRIMARY_COLOR;
const DEFAULT_ACCENT_COLOR = DEFAULT_EMAIL_ACCENT_COLOR;

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
 * overrides when present, otherwise a neutral default. Brand-evocative colors for an
 * arbitrary company are inferred dynamically by the design LLM (see runDesignAgent),
 * so this works for any company without a lookup table.
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

export async function runDesignAgent(
  markdown: string,
  profile: Profile,
  tracker: CostTracker
): Promise<string> {
  const brand = inferBrand(profile);

  const paletteSpec = brand.hasCustomColors
    ? `- Primary color: ${brand.primaryColor}\n- Accent color: ${brand.accentColor}`
    : `- Infer a tasteful brand palette evocative of "${brand.companyName}" from its known visual identity, expressed as a primary and an accent hex color (e.g. a media company's signature blue, a retailer's signature orange). If the company is unrecognizable, choose a clean, professional palette. Do NOT default to generic colors when the company has a recognizable brand.`;

  const system = `You are a design agent generating email-client-safe responsive HTML for a newsletter.

Brand identity:
- Company: ${brand.companyName}
${paletteSpec}
${brand.logoUrl ? `- Logo URL: ${brand.logoUrl}` : "- Generate a simple text wordmark for the company name"}

Requirements:
- Apply the brand palette (provided or inferred above) consistently throughout
- Inline styles only (no external CSS)
- Table-based layout for email client compatibility
- Neutral background, readable on mobile
- Responsive: max-width 600px container
- Style headings with brand primary color
- Style links with accent color
- Include a header with company wordmark/logo
- Include a footer with generation date
- Convert the markdown content faithfully to HTML
- Preserve all hyperlinks from the markdown

Return HTML only. No markdown fences. No preamble.`;

  const html = stripCodeFences(
    await callLLM("sonnet", system, markdown, tracker, DESIGN_MAX_OUTPUT_TOKENS, {
      throwOnTruncation: true,
    })
  );

  // Guardrail: the markdown→HTML step is the last place links + the bottom-of-letter
  // Further Reading list can be silently dropped. If the LLM lost either, throw so the
  // caller falls back to the deterministic converter (markdownToPlainHtml), which preserves
  // every link and the full document structure.
  assertConversionFidelity(markdown, html);

  return html;
}

/** A heading is "present" in the HTML if its text survives the markdown→HTML conversion. */
function htmlContainsHeading(html: string, headingText: string): boolean {
  return html.toLowerCase().includes(headingText.toLowerCase());
}

/**
 * Verify the rendered HTML preserved the markdown's links and its trailing Further Reading
 * section. Throws on any loss — both are hard formatting guardrails for the newsletter.
 */
function assertConversionFidelity(markdown: string, html: string): void {
  // URLs with query strings get their "&" HTML-encoded as "&amp;" inside href attributes;
  // decode that so encoding alone isn't mistaken for a dropped link.
  const decodedHtml = html.replace(/&amp;/g, "&");
  const markdownLinks = new Set(extractMarkdownLinks(markdown));
  const missing = [...markdownLinks].filter((url) => !decodedHtml.includes(url));
  if (missing.length > 0) {
    throw new Error(
      `Design HTML dropped ${missing.length}/${markdownLinks.size} source links during conversion`
    );
  }

  if (
    markdown.includes("## Further Reading") &&
    !htmlContainsHeading(html, "Further Reading")
  ) {
    throw new Error("Design HTML dropped the Further Reading section during conversion");
  }
}

export function markdownToPlainHtml(markdown: string, brand: BrandIdentity): string {
  let html = markdown
    .replace(/^### (.+)$/gm, `<h3 style="color:${brand.primaryColor};margin:24px 0 8px;font-size:18px;">$1</h3>`)
    .replace(/^## (.+)$/gm, `<h2 style="color:${brand.primaryColor};margin:32px 0 12px;font-size:22px;">$1</h2>`)
    .replace(/^# (.+)$/gm, `<h1 style="color:${brand.primaryColor};margin:0 0 16px;font-size:28px;">$1</h1>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\((.+?)\)/g, `<a href="$2" style="color:${brand.accentColor};">$1</a>`)
    .replace(/^- (.+)$/gm, `<li style="margin:4px 0;">$1</li>`)
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul style="padding-left:20px;margin:12px 0;">${match}</ul>`)
    .replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.6;color:#333;">')
    .replace(/\n/g, "<br>");

  return wrapInEmailTemplate(html, brand);
}

function wrapInEmailTemplate(content: string, brand: BrandIdentity): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const logoBlock = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${brand.companyName}" style="max-height:40px;margin-bottom:8px;" />`
    : `<div style="font-size:24px;font-weight:700;color:${brand.primaryColor};">${brand.companyName}</div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;max-width:600px;width:100%;">
<tr><td style="padding:32px 32px 16px;border-bottom:3px solid ${brand.primaryColor};">
${logoBlock}
<div style="font-size:13px;color:#666;margin-top:4px;">${date}</div>
</td></tr>
<tr><td style="padding:24px 32px;">
<p style="margin:12px 0;line-height:1.6;color:#333;">${content}</p>
</td></tr>
<tr><td style="padding:16px 32px 32px;border-top:1px solid #eee;font-size:12px;color:#999;">
Generated by ${brand.companyName} Newsletter · ${date}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function stripCodeFences(html: string): string {
  return html
    .replace(/^```html?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
}

export { wrapInEmailTemplate };
