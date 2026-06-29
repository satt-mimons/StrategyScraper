import { NextResponse, after } from "next/server";
import { runPipeline } from "@/agents/chief";
import { createRun, getRun } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";
import { getDeliveryRecipients } from "@/lib/resend";
import type { NewsletterConfig, Profile } from "@/types";
import {
  DEFAULT_ANALYST_FIRM_DOMAINS,
  DEFAULT_ANALYST_FIRMS,
  DEFAULT_TONE_SPEC,
} from "@/lib/constants";

export const maxDuration = 300;

function newsletterToProfile(newsletter: NewsletterConfig): Profile {
  return {
    id: newsletter.id,
    company: newsletter.company,
    role: newsletter.role,
    topics: newsletter.topics,
    // Tone is a single fixed house style (see DEFAULT_TONE_SPEC) — not user-configurable.
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

export async function POST(request: Request) {
  try {
    const { newsletterId } = await request.json().catch(() => ({}));
    if (!newsletterId) {
      return NextResponse.json({ error: "newsletterId required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const { data: newsletterRow } = await supabase
      .from("newsletter_configs")
      .select("*")
      .eq("id", newsletterId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!newsletterRow) {
      return NextResponse.json({ error: "Newsletter not found." }, { status: 404 });
    }

    const profile = newsletterToProfile(newsletterRow as NewsletterConfig);

    if ((profile.topics ?? []).length === 0) {
      return NextResponse.json(
        { error: "Add at least one topic before generating." },
        { status: 400 }
      );
    }

    if (getDeliveryRecipients(profile.recipients ?? []).length === 0) {
      return NextResponse.json(
        { error: "Add at least one recipient email (or set RESEND_TO_EMAIL in .env.local)." },
        { status: 400 }
      );
    }

    const run = await createRun(newsletterId, user.id);

    // Continue pipeline after response on Vercel (extended-duration function)
    after(async () => {
      try {
        await runPipeline(run.id, profile);
      } catch (err) {
        console.error(`Pipeline failed for run ${run.id}:`, err);
      }
    });

    return NextResponse.json({ runId: run.id, status: "running" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start generation" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const run = await getRun(runId);
    if (!run || run.user_id !== user.id) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({ run });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get run status" },
      { status: 500 }
    );
  }
}
