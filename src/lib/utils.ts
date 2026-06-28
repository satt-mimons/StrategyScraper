import { SENT_URL_DEDUP_DAYS } from "@/lib/constants";
import { getSentUrls } from "@/lib/supabase";

export function getSentUrlCutoff(): Date {
  const d = new Date();
  d.setDate(d.getDate() - SENT_URL_DEDUP_DAYS);
  return d;
}

export async function loadSentUrlSet(): Promise<Set<string>> {
  return getSentUrls(getSentUrlCutoff());
}

export function countWordsExcludingLinks(text: string): number {
  const withoutLinks = text.replace(/\[([^\]]*)\]\([^)]+\)/g, "$1");
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

/** Extract hostnames from user-provided URLs (Substack / LinkedIn curated lists). */
export function hostnamesFromUrls(urls: string[]): string[] {
  const hosts = new Set<string>();
  for (const raw of urls) {
    try {
      const href = raw.startsWith("http") ? raw : `https://${raw}`;
      hosts.add(new URL(href).hostname.replace(/^www\./, ""));
    } catch {
      // skip invalid
    }
  }
  return [...hosts];
}

export function linkedinSlugFromUrl(url: string): string {
  try {
    const href = url.startsWith("http") ? url : `https://${url}`;
    const match = new URL(href).pathname.match(/\/(in|company)\/([^/?#]+)/i);
    return match?.[2] ?? "";
  } catch {
    return "";
  }
}
