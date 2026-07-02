import {
  DEFAULT_ANALYST_FIRMS,
  DEFAULT_ANALYST_FIRM_DOMAINS,
  DEFAULT_PREFERRED_PUBS,
  DEFAULT_PROFILE_FREQUENCY,
  DEFAULT_TONE_SPEC,
} from "@/lib/constants";
import { getAnalystFirmDomains } from "@/lib/analyst-firms";
import type { NewsletterConfig, Profile } from "@/types";

/**
 * Map a stored newsletter_configs row to the Profile the pipeline consumes. Tone is a single
 * fixed house style (DEFAULT_TONE_SPEC) — not user-configurable. Scheduling columns are not part
 * of Profile; they drive WHEN a run starts, not WHAT it produces.
 */
export function newsletterToProfile(newsletter: NewsletterConfig): Profile {
  return {
    id: newsletter.id,
    company: newsletter.company,
    role: newsletter.role,
    topics: newsletter.topics,
    tone_spec: DEFAULT_TONE_SPEC,
    preferred_pubs: newsletter.preferred_publications,
    analyst_firms: DEFAULT_ANALYST_FIRMS,
    analyst_firm_domains: DEFAULT_ANALYST_FIRM_DOMAINS,
    frequency: newsletter.frequency,
    linkedin_urls: newsletter.linkedin_urls,
    substack_urls: newsletter.substack_urls,
    brand_overrides: {
      primary_color: newsletter.primary_color || undefined,
      accent_color: newsletter.accent_color || undefined,
      logo_url: newsletter.logo_url || undefined,
    },
    recipients: newsletter.recipients,
    reply_to: newsletter.reply_to,
    created_at: newsletter.created_at,
    updated_at: newsletter.updated_at,
  };
}

/** Ensure array/profile fields exist — DB rows may predate newer migrations. */
export function normalizeProfile(profile: Profile): Profile {
  return {
    ...profile,
    company: profile.company ?? "",
    role: profile.role ?? "",
    topics: profile.topics ?? [],
    tone_spec: profile.tone_spec ?? DEFAULT_TONE_SPEC,
    preferred_pubs: profile.preferred_pubs ?? DEFAULT_PREFERRED_PUBS,
    analyst_firms: profile.analyst_firms ?? DEFAULT_ANALYST_FIRMS,
    analyst_firm_domains:
      profile.analyst_firm_domains?.length
        ? profile.analyst_firm_domains
        : getAnalystFirmDomains(profile),
    frequency: profile.frequency ?? DEFAULT_PROFILE_FREQUENCY,
    linkedin_urls: profile.linkedin_urls ?? [],
    substack_urls: profile.substack_urls ?? [],
    brand_overrides: profile.brand_overrides ?? {},
    recipients: profile.recipients ?? [],
    reply_to: profile.reply_to ?? "",
  };
}
