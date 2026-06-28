import { withTimeout } from "@/lib/utils";

const RSS_FETCH_TIMEOUT_MS = 12_000;

export interface SubstackRssItem {
  url: string;
  title: string;
  publishedDate: string | null;
  snippet: string;
}

/** Normalize a Substack publication URL to its RSS feed endpoint. */
export function substackFeedUrl(publicationUrl: string): string {
  try {
    const href = publicationUrl.startsWith("http")
      ? publicationUrl
      : `https://${publicationUrl}`;
    const origin = new URL(href).origin;
    return `${origin}/feed`;
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssItems(xml: string): SubstackRssItem[] {
  const items: SubstackRssItem[] = [];

  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractAtomLink(block);
    const pubDate =
      extractTag(block, "pubDate") ||
      extractTag(block, "published") ||
      extractTag(block, "updated");
    const description =
      extractTag(block, "description") ||
      extractTag(block, "content:encoded") ||
      extractTag(block, "summary");

    if (link && title) {
      items.push({
        url: link,
        title: stripHtml(title),
        publishedDate: pubDate ? safeIsoDate(pubDate) : null,
        snippet: stripHtml(description).slice(0, 500),
      });
    }
  }

  if (items.length === 0) {
    const entryBlocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
    for (const block of entryBlocks) {
      const title = extractTag(block, "title");
      const link = extractAtomLink(block);
      const pubDate =
        extractTag(block, "published") || extractTag(block, "updated");
      const summary =
        extractTag(block, "summary") || extractTag(block, "content");

      if (link && title) {
        items.push({
          url: link,
          title: stripHtml(title),
          publishedDate: pubDate ? safeIsoDate(pubDate) : null,
          snippet: stripHtml(summary).slice(0, 500),
        });
      }
    }
  }

  return items;
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );
  const match = block.match(re);
  return match?.[1]?.trim() ?? "";
}

function extractAtomLink(block: string): string {
  const relAlternate = block.match(
    /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i
  );
  if (relAlternate) return relAlternate[1];
  const hrefOnly = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  return hrefOnly?.[1] ?? "";
}

function safeIsoDate(raw: string): string | null {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchFeed(feedUrl: string): Promise<SubstackRssItem[]> {
  if (!feedUrl) return [];

  const res = await fetch(feedUrl, {
    headers: { Accept: "application/rss+xml, application/atom+xml, text/xml" },
    signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) return [];
  const xml = await res.text();
  return parseRssItems(xml);
}

function matchesTopicHint(
  item: SubstackRssItem,
  topics: string[]
): boolean {
  if (topics.length === 0) return true;
  const text = `${item.title} ${item.snippet}`.toLowerCase();
  return topics.some((topic) => {
    const tokens = topic.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    return tokens.some((token) => text.includes(token));
  });
}

/**
 * Guaranteed must-read Substack sub-lane via RSS.
 * When substack_urls is set, always returns recent posts from those feeds
 * (topic filter is soft — non-matching posts still included to avoid empty lane).
 */
export async function fetchMustReadSubstackRss(
  substackUrls: string[],
  recencyCutoff: Date,
  topics: string[] = []
): Promise<SubstackRssItem[]> {
  if (substackUrls.length === 0) return [];

  const feeds = [...new Set(substackUrls.map(substackFeedUrl).filter(Boolean))];
  const cutoffMs = recencyCutoff.getTime();

  const batches = await Promise.allSettled(
    feeds.map((feed) =>
      withTimeout(fetchFeed(feed), RSS_FETCH_TIMEOUT_MS, `Substack RSS ${feed}`)
    )
  );

  const recent: SubstackRssItem[] = [];
  const topicMatched: SubstackRssItem[] = [];
  const seen = new Set<string>();

  for (const batch of batches) {
    if (batch.status !== "fulfilled") continue;
    for (const item of batch.value) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);

      const pubMs = item.publishedDate
        ? new Date(item.publishedDate).getTime()
        : Date.now();
      if (pubMs < cutoffMs) continue;

      recent.push(item);
      if (matchesTopicHint(item, topics)) {
        topicMatched.push(item);
      }
    }
  }

  // Prefer topic-relevant when available; otherwise all recent from must-read feeds
  const pool = topicMatched.length > 0 ? topicMatched : recent;
  return pool.sort(
    (a, b) =>
      new Date(b.publishedDate ?? 0).getTime() -
      new Date(a.publishedDate ?? 0).getTime()
  );
}
