import {
  DEFAULT_ANALYST_FIRMS,
  DEFAULT_ANALYST_FIRM_DOMAINS,
  DEFAULT_PREFERRED_PUBS,
  DEFAULT_PROFILE_FREQUENCY,
  DEFAULT_TONE_SPEC,
} from "@/lib/constants";
import { getAnalystFirmDomains } from "@/lib/analyst-firms";
import type { Profile } from "@/types";

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
