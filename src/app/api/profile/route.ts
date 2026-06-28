import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile, upsertProfile } from "@/lib/supabase";
import {
  DEFAULT_TONE_SPEC,
  DEFAULT_PREFERRED_PUBS,
  DEFAULT_ANALYST_FIRM_DOMAINS,
  DEFAULT_PROFILE_FREQUENCY,
} from "@/lib/constants";

const frequencySchema = z.enum(["daily", "weekly", "biweekly", "monthly"]);

const profileSchema = z.object({
  company: z.string().optional(),
  role: z.string().optional(),
  topics: z.array(z.string()).optional(),
  tone_spec: z.string().optional(),
  preferred_pubs: z.array(z.string()).optional(),
  analyst_firms: z.array(z.string()).optional(),
  analyst_firm_domains: z.array(z.string()).optional(),
  frequency: frequencySchema.optional(),
  linkedin_urls: z.array(z.string()).optional(),
  substack_urls: z.array(z.string()).optional(),
  brand_overrides: z
    .object({
      primary_color: z.string().optional(),
      accent_color: z.string().optional(),
      logo_url: z.string().optional(),
    })
    .optional(),
  recipients: z.array(z.string().email()).optional(),
  reply_to: z.string().email().optional().or(z.literal("")),
});

export async function GET() {
  try {
    const profile = await getProfile();
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load profile" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = profileSchema.parse(body);

    const profile = await upsertProfile({
      company: parsed.company ?? "",
      role: parsed.role ?? "",
      topics: parsed.topics ?? [],
      tone_spec: parsed.tone_spec ?? DEFAULT_TONE_SPEC,
      preferred_pubs: parsed.preferred_pubs ?? DEFAULT_PREFERRED_PUBS,
      analyst_firm_domains:
        parsed.analyst_firm_domains ?? DEFAULT_ANALYST_FIRM_DOMAINS,
      frequency: parsed.frequency ?? DEFAULT_PROFILE_FREQUENCY,
      linkedin_urls: parsed.linkedin_urls ?? [],
      substack_urls: parsed.substack_urls ?? [],
      brand_overrides: parsed.brand_overrides ?? {},
      recipients: parsed.recipients ?? [],
      reply_to: parsed.reply_to ?? "",
    });

    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save profile" },
      { status: 500 }
    );
  }
}
