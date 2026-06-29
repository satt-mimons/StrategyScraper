/**
 * End-to-end verification of the design stage (markdown -> HTML), where inline links and
 * the bottom Further Reading list were previously being silently truncated.
 *
 * Runs the REAL design LLM against a realistic full-length newsletter and asserts:
 *   1. runDesignAgent preserves every inline link + the Further Reading section
 *   2. callLLM(throwOnTruncation) actually throws when output is cut at max_tokens
 *   3. markdownToPlainHtml fallback (chief's catch path) preserves everything losslessly
 *
 * Sends no email and runs no research lanes. Cost: one ~real Sonnet HTML render + one tiny
 * (intentionally truncated) call.
 *
 * Usage: npx tsx scripts/verify-design-fidelity.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local into process.env (same loader as verify-selection.ts).
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // fall through — env may already be set
}

import { runDesignAgent, inferBrand, markdownToPlainHtml } from "@/agents/design";
import { callLLM, createCostTracker, estimateCost } from "@/lib/anthropic";
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

async function main(): Promise<void> {
  const links = [...new Set(extractMarkdownLinks(MARKDOWN))];
  console.log(
    `Input newsletter: ~${approxWords(MARKDOWN)} words, ${links.length} distinct links\n`
  );

  let failures = 0;

  // --- Test 1: real design LLM preserves links + Further Reading -------------------------
  console.log("[1] runDesignAgent (real Sonnet render at 16K ceiling)…");
  const tracker = createCostTracker();
  try {
    const html = await runDesignAgent(MARKDOWN, PROFILE, tracker);
    const missing = missingLinks(MARKDOWN, html);
    const hasFR = /further reading/i.test(html);
    const looksHtml = /<table|<td|<a\s/i.test(html);
    console.log(`    output: ${html.length} chars HTML`);
    console.log(`    links preserved: ${links.length - missing.length}/${links.length}`);
    console.log(`    Further Reading present: ${hasFR}`);
    console.log(`    looks like styled HTML: ${looksHtml}`);
    console.log(`    est. cost so far: $${estimateCost(tracker).toFixed(4)}`);
    if (missing.length > 0) {
      console.log(`    ✗ MISSING LINKS:\n      ${missing.join("\n      ")}`);
      failures++;
    } else if (!hasFR || !looksHtml) {
      console.log("    ✗ structural check failed");
      failures++;
    } else {
      console.log("    ✓ PASS — all links + Further Reading survived conversion");
    }
  } catch (err) {
    console.log(`    ✗ runDesignAgent threw: ${err instanceof Error ? err.message : err}`);
    failures++;
  }

  // --- Test 2: truncation is detected (the old silent-failure mode) ----------------------
  console.log("\n[2] callLLM throwOnTruncation at a tiny ceiling (must throw)…");
  try {
    await callLLM(
      "sonnet",
      "Convert this markdown to fully inline-styled HTML email.",
      MARKDOWN,
      createCostTracker(),
      64, // intentionally too small -> max_tokens stop
      { throwOnTruncation: true }
    );
    console.log("    ✗ did NOT throw — truncation went undetected");
    failures++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/truncat/i.test(msg)) {
      console.log(`    ✓ PASS — truncation detected: "${msg}"`);
    } else {
      console.log(`    ✗ threw unexpected error: ${msg}`);
      failures++;
    }
  }

  // --- Test 3: deterministic fallback (chief's catch path) is lossless -------------------
  console.log("\n[3] markdownToPlainHtml fallback preserves links + Further Reading…");
  const fallback = markdownToPlainHtml(MARKDOWN, inferBrand(PROFILE));
  const fbMissing = missingLinks(MARKDOWN, fallback);
  const fbHasFR = /further reading/i.test(fallback);
  if (fbMissing.length === 0 && fbHasFR) {
    console.log(`    ✓ PASS — ${links.length}/${links.length} links + Further Reading intact`);
  } else {
    console.log(`    ✗ fallback lost ${fbMissing.length} links / FR present: ${fbHasFR}`);
    failures++;
  }

  console.log(`\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
