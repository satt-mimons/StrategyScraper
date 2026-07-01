/**
 * Verification of the design stage (markdown -> HTML), where inline links and the bottom
 * Further Reading list were previously being silently truncated by the design LLM.
 *
 * The design stage is now a DETERMINISTIC renderer (no LLM) — renderNewsletterHtml. This
 * script runs it against a realistic full-length newsletter and asserts:
 *   1. renderNewsletterHtml preserves every inline link + the Further Reading section
 *   2. the output is email-safe (table-based layout, inline styles, no <style>/<script>)
 *   3. the fidelity guardrail throws loudly when a link would be dropped
 *
 * No LLM calls, no email, no research lanes, no cost, no API key required.
 *
 * Usage: npx tsx scripts/verify-design-fidelity.ts
 */
import { renderNewsletterHtml, inferBrand } from "@/agents/design";
import { extractMarkdownLinks } from "@/lib/utils";
import type { Profile } from "@/types";

// A realistic, link-dense, full-length newsletter (TLDR + 3 topic sections + Further Reading).
const MARKDOWN = `## TLDR

- AI infrastructure spend keeps outrunning revenue, with [hyperscalers committing $200B+ in capex](https://www.reuters.com/tech/ai-capex-2026) while monetization lags ([analysis](https://stratechery.com/2026/ai-capex-gap)).
- The enterprise SaaS repricing wave is real: [Salesforce raised list prices 9%](https://www.bloomberg.com/news/salesforce-pricing) and peers are following ([breakdown](https://www.theinformation.com/articles/saas-repricing)).
- Regulators are circling foundation-model licensing, with [the EU's draft code](https://www.ft.com/content/eu-ai-code) drawing industry pushback ([summary](https://www.axios.com/2026/eu-ai-code)).
- Open-weight models closed the gap on frontier benchmarks again ([eval data](https://www.semianalysis.com/p/open-weights-2026)).
- Vertical AI agents are the new land grab; [three startups raised mega-rounds this week](https://techcrunch.com/2026/vertical-agents).

## AI Infrastructure

- **The capex-to-revenue gap is becoming the defining tension of the AI buildout.** Hyperscalers have now [committed over $200B in 2026 capex](https://www.reuters.com/tech/ai-capex-2026), yet [cloud AI revenue is growing far slower](https://www.cnbc.com/2026/cloud-ai-revenue), a divergence one analyst called ["the most expensive bet in corporate history"](https://stratechery.com/2026/ai-capex-gap). The market has so far rewarded the spend, but [skeptics note depreciation schedules are quietly lengthening](https://www.ft.com/content/ai-depreciation) to flatter near-term margins.
- **Power, not silicon, is now the binding constraint.** Data-center developers are [signing nuclear PPAs](https://www.wsj.com/articles/datacenter-nuclear-ppa) and [reviving mothballed plants](https://www.bloomberg.com/news/grid-ai-power), while [grid interconnect queues stretch past 2030](https://www.theregister.com/2026/grid-queue) in key markets.
- **Custom accelerators are eating into the merchant GPU thesis.** [In-house chips now handle a third of inference](https://www.semianalysis.com/p/custom-silicon-2026) at the largest labs, per teardown estimates.

## Enterprise SaaS

- **Repricing is sweeping the category as vendors bundle AI into higher tiers.** [Salesforce raised list prices 9%](https://www.bloomberg.com/news/salesforce-pricing), [ServiceNow introduced a premium AI SKU](https://www.cnbc.com/2026/servicenow-ai-sku), and [Microsoft is testing per-agent pricing](https://www.theinformation.com/articles/microsoft-agent-pricing) — a shift one CFO described as ["the end of seat-based logic"](https://www.axios.com/2026/saas-seats). Buyers are [pushing back on consumption unpredictability](https://www.theregister.com/2026/saas-consumption).
- **Net revenue retention is bifurcating sharply between AI haves and have-nots.** [Leaders report NRR above 120%](https://www.bloomberg.com/news/nrr-bifurcation) while laggards slip below 100%, per [the latest cohort analysis](https://stratechery.com/2026/nrr-cohorts).
- **Procurement is professionalizing around AI risk.** [New vendor questionnaires now demand model provenance](https://www.ft.com/content/ai-procurement) before signature.

## Regulation

- **Foundation-model licensing is the next regulatory battleground.** [The EU's draft code of practice](https://www.ft.com/content/eu-ai-code) would require disclosure of training-data sources, a provision [industry groups call unworkable](https://www.axios.com/2026/eu-ai-code), even as [a parallel US framework takes a lighter touch](https://www.reuters.com/legal/us-ai-framework). The transatlantic divergence [is already shaping where labs domicile](https://www.theinformation.com/articles/ai-domicile).
- **Copyright suits are entering the damages phase.** [A federal court certified a class of authors](https://www.wsj.com/articles/ai-copyright-class), raising the stakes from injunctions to [potentially multibillion-dollar exposure](https://www.bloomberg.com/news/ai-copyright-damages).

## Further Reading

### AI Infrastructure

**Must read**

- [The $200B capex bet, explained](https://stratechery.com/2026/ai-capex-gap)
- [Grid constraints will gate AI growth](https://www.semianalysis.com/p/power-2026)
- [Custom silicon teardown 2026](https://www.semianalysis.com/p/custom-silicon-2026)

### Enterprise SaaS

**Must read**

- [The end of seat-based pricing](https://www.theinformation.com/articles/microsoft-agent-pricing)
- [NRR bifurcation cohort analysis](https://stratechery.com/2026/nrr-cohorts)

### Regulation

**Must read**

- [Inside the EU AI code fight](https://www.ft.com/content/eu-ai-code)
- [The author class action that changes everything](https://www.wsj.com/articles/ai-copyright-class)`;

const PROFILE: Profile = {
  company: "Acme Cloud",
  role: "VP of Strategy",
  topics: ["AI Infrastructure", "Enterprise SaaS", "Regulation"],
} as unknown as Profile;

function approxWords(md: string): number {
  return md.replace(/\[([^\]]*)\]\([^)]+\)/g, "$1").split(/\s+/).filter(Boolean).length;
}

/** Same encoding-tolerant link check the design guardrail uses. */
function missingLinks(md: string, html: string): string[] {
  const decoded = html.replace(/&amp;/g, "&");
  return [...new Set(extractMarkdownLinks(md))].filter((u) => !decoded.includes(u));
}

function main(): void {
  const links = [...new Set(extractMarkdownLinks(MARKDOWN))];
  console.log(
    `Input newsletter: ~${approxWords(MARKDOWN)} words, ${links.length} distinct links\n`
  );

  let failures = 0;
  const brand = inferBrand(PROFILE);

  // --- Test 1: deterministic render preserves links + Further Reading --------------------
  console.log("[1] renderNewsletterHtml (deterministic — no LLM)…");
  const html = renderNewsletterHtml(MARKDOWN, brand);
  const missing = missingLinks(MARKDOWN, html);
  const hasFR = /further reading/i.test(html);
  const looksHtml = /<table|<td|<a\s/i.test(html);
  console.log(`    output: ${html.length} chars HTML`);
  console.log(`    links preserved: ${links.length - missing.length}/${links.length}`);
  console.log(`    Further Reading present: ${hasFR}`);
  console.log(`    looks like styled HTML: ${looksHtml}`);
  if (missing.length > 0) {
    console.log(`    ✗ MISSING LINKS:\n      ${missing.join("\n      ")}`);
    failures++;
  } else if (!hasFR || !looksHtml) {
    console.log("    ✗ structural check failed");
    failures++;
  } else {
    console.log("    ✓ PASS — all links + Further Reading survived conversion");
  }

  // --- Test 2: output is email-client safe ----------------------------------------------
  console.log("\n[2] email-safety checks (table layout, inline styles only)…");
  const noStyleBlock = !/<style[\s>]/i.test(html);
  const noScript = !/<script[\s>]/i.test(html);
  const noFlexGrid = !/display\s*:\s*(flex|grid)/i.test(html);
  const hasInlineStyles = /style="/.test(html);
  const hasMaxWidth = /max-width:\s*600px/i.test(html);
  console.log(`    no <style> block: ${noStyleBlock}`);
  console.log(`    no <script>: ${noScript}`);
  console.log(`    no flex/grid: ${noFlexGrid}`);
  console.log(`    inline styles present: ${hasInlineStyles}`);
  console.log(`    600px container: ${hasMaxWidth}`);
  if (noStyleBlock && noScript && noFlexGrid && hasInlineStyles && hasMaxWidth) {
    console.log("    ✓ PASS — email-safe output");
  } else {
    console.log("    ✗ email-safety check failed");
    failures++;
  }

  // --- Test 3: the fidelity guardrail throws loudly on dropped/mangled content -----------
  console.log("\n[3] guardrail throws when a source link can't be rendered faithfully…");
  // A URL containing a raw "<" is HTML-escaped to "&lt;" in the emitted href, so the styled
  // HTML no longer contains the literal source URL — exactly the "link silently dropped or
  // mangled" condition the guardrail exists to catch (extractMarkdownLinks still returns the
  // raw URL, so the comparison mismatches and renderNewsletterHtml must throw).
  try {
    renderNewsletterHtml(
      `${MARKDOWN}\n\n- [mangled](https://example.com/q<dropped)`,
      brand
    );
    console.log("    ✗ did NOT throw — a mangled link went undetected");
    failures++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/dropped .* source link/i.test(msg)) {
      console.log(`    ✓ PASS — guardrail fired: "${msg}"`);
    } else {
      console.log(`    ✗ threw unexpected error: ${msg}`);
      failures++;
    }
  }

  console.log(`\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
