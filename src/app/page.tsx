import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  getLatestRunsByNewsletter,
  getNewsletterMetaByRunIds,
} from "@/lib/supabase";
import { displayName, extractPullQuote } from "@/lib/newsletter-display";
import { AccountMenu } from "@/components/account-menu";
import { BriefRow, type BriefRowData } from "@/components/brief-row";
import { NewspaperRule, Dateline, btnInk } from "@/components/desk";
import type { NewsletterConfig } from "@/types";

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: newsletters } = await supabase
    .from("newsletter_configs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list = (newsletters ?? []) as NewsletterConfig[];
  const latestRuns = await getLatestRunsByNewsletter(list.map((n) => n.id));

  const doneRunIds = [...latestRuns.values()]
    .filter((r) => r.status === "done")
    .map((r) => r.id);
  const contentMeta = await getNewsletterMetaByRunIds(doneRunIds);

  const briefs: BriefRowData[] = list.map((newsletter) => {
    const lastRun = latestRuns.get(newsletter.id);
    const isDone = lastRun?.status === "done";
    const meta = lastRun ? contentMeta.get(lastRun.id) : undefined;
    const quote = meta ? extractPullQuote(meta.markdown) : null;

    return {
      id: newsletter.id,
      title: displayName(newsletter),
      topics: newsletter.topics,
      failed: lastRun?.status === "failed",
      lanesSucceeded: lastRun ? lastRun.lanes_succeeded.length : null,
      filedDate: isDone ? lastRun?.finished_at ?? null : null,
      wordCount: meta?.word_count ?? null,
      lanesCount: lastRun ? lastRun.lanes_succeeded.length : null,
      cost: lastRun ? lastRun.cost_estimate_usd : null,
      lastRunId: meta ? lastRun!.id : null,
      lastIssue:
        isDone && quote && lastRun?.finished_at
          ? { date: MONTH_DAY.format(new Date(lastRun.finished_at)), quote }
          : null,
    };
  });

  return (
    <main className="max-w-[860px] mx-auto px-6 py-12">
      {/* Masthead */}
      <div className="flex justify-between items-baseline gap-4">
        <div className="font-serif text-[28px] font-semibold tracking-[-0.01em] text-ink">
          The Desk<span className="text-oxblood">.</span>
        </div>
        <AccountMenu email={user.email ?? ""} />
      </div>

      <div className="mt-3.5">
        <NewspaperRule />
      </div>
      <div className="mt-2">
        <Dateline date={new Date()} label="STANDING BRIEFS" />
      </div>

      {/* Section row */}
      <div className="flex justify-between items-center mt-6">
        <h1 className="font-serif text-[20px] font-semibold text-ink">
          {list.length} standing {list.length === 1 ? "brief" : "briefs"}
        </h1>
        <Link href="/newsletters/new" className={btnInk}>
          Commission a brief
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="font-serif text-[22px] italic text-ink-3">Nothing filed yet.</p>
          <p className="font-sans text-[15px] text-ink-4 mt-3">
            Commission your first brief and we&apos;ll read the internet for you.
          </p>
          <div className="mt-6">
            <Link href="/newsletters/new" className={btnInk}>
              Commission a brief
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3.5">
          {briefs.map((brief) => (
            <BriefRow key={brief.id} data={brief} />
          ))}
        </div>
      )}
    </main>
  );
}
