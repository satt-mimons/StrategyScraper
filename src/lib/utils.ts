import { RECENCY_FALLBACK_DAYS, SENT_URL_DEDUP_DAYS } from "@/lib/constants";
import { getLastSuccessfulRunDate, getSentUrls } from "@/lib/supabase";

export async function getRecencyCutoff(): Promise<Date> {
  const lastRun = await getLastSuccessfulRunDate();
  if (lastRun) return lastRun;

  const fallback = new Date();
  fallback.setDate(fallback.getDate() - RECENCY_FALLBACK_DAYS);
  return fallback;
}

export function getSentUrlCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SENT_URL_DEDUP_DAYS);
  return cutoff;
}

export async function loadSentUrlSet(): Promise<Set<string>> {
  return getSentUrls(getSentUrlCutoff());
}

export function countWordsExcludingLinks(text: string): number {
  const withoutLinks = text.replace(/\[([^\]]*)\]\([^)]+\)/g, "$1");
  // markdown links removed
  const withoutUrls = withoutLinks.replace(/https?:\/\/\S+/g, "");
  return withoutUrls.split(/\s+/).filter(Boolean).length;
}

export function extractMarkdownLinks(text: string): string[] {
  const links: string[] = [];
  const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = mdLinkRegex.exec(text)) !== null) {
    links.push(match[2]);
  }
  const bareUrlRegex = /https?:\/\/[^\s)>\]]+/g;
  while ((match = bareUrlRegex.exec(text)) !== null) {
    links.push(match[0]);
  }
  return links;
}

export function validateLinkIntegrity(
  text: string,
  allowedUrls: Set<string>
): { valid: boolean; invalidUrls: string[] } {
  const usedLinks = extractMarkdownLinks(text);
  const normalizedAllowed = new Set(
    [...allowedUrls].map(normalizeUrl)
  );
  const invalidUrls = usedLinks.filter(
    (url) => !normalizedAllowed.has(normalizeUrl(url))
  );
  return { valid: invalidUrls.length === 0, invalidUrls };
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    if (u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch {
    return url;
  }
}

export function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = normalizeUrl(item.url);
    const existing = seen.get(key);
    if (!existing || (item as { raw_score?: number }).raw_score! > (existing as { raw_score?: number }).raw_score!) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}
