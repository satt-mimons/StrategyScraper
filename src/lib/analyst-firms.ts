import {
  DEFAULT_ANALYST_FIRM_DOMAINS,
  LEGACY_ANALYST_FIRM_NAME_TO_DOMAIN,
} from "@/lib/constants";
import type { Profile } from "@/types";

/** Normalize a domain entry (strip scheme, www, path). */
export function normalizeAnalystDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const host = new URL(withScheme).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return trimmed.replace(/^www\./, "").split("/")[0] ?? trimmed;
  }
}

/** User-editable firm watchlist (§17) — drives includeDomains on the primary-content pass. */
export function getAnalystFirmDomains(profile: Profile): string[] {
  const fromWatchlist = (profile.analyst_firm_domains ?? [])
    .map(normalizeAnalystDomain)
    .filter(Boolean);
  if (fromWatchlist.length > 0) {
    return [...new Set(fromWatchlist)];
  }

  // Legacy rows: map display names or bare domains from analyst_firms
  const fromLegacy = (profile.analyst_firms ?? [])
    .map((entry) => {
      const mapped = LEGACY_ANALYST_FIRM_NAME_TO_DOMAIN[entry];
      if (mapped) return mapped;
      if (entry.includes(".")) return normalizeAnalystDomain(entry);
      return null;
    })
    .filter((d): d is string => Boolean(d));

  if (fromLegacy.length > 0) {
    return [...new Set(fromLegacy)];
  }

  return [...DEFAULT_ANALYST_FIRM_DOMAINS];
}

const DOMAIN_LABEL_OVERRIDES: Record<string, string> = {
  hfsresearch: "HFS Research",
  mckinsey: "McKinsey",
  bcg: "BCG",
  idc: "IDC",
  bain: "Bain",
  gartner: "Gartner",
  forrester: "Forrester",
};

/** Human-readable firm labels for declarative query text (pass 2). */
export function getAnalystFirmLabels(profile: Profile): string[] {
  return getAnalystFirmDomains(profile)
    .map((domain) => {
      const root = domain.split(".")[0] ?? domain;
      return DOMAIN_LABEL_OVERRIDES[root] ?? root.charAt(0).toUpperCase() + root.slice(1);
    })
    .slice(0, 6);
}
