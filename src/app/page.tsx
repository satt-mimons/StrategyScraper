import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getLatestRunsByNewsletter } from "@/lib/supabase";
import { displayName, estimatedNextRun } from "@/lib/newsletter-display";
import { SignOutButton } from "@/components/sign-out-button";
import type { NewsletterConfig } from "@/types";

const STATUS_STYLES: Record<string, string> = {
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  running: "bg-yellow-100 text-yellow-700",
  queued: "bg-gray-100 text-gray-600",
};

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

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your Newsletters</h1>
          <p className="text-gray-500 mt-2">
            Personalized multi-agent research → filter → write → design → deliver.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-gray-600">{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <div className="mb-8">
        <Link
          href="/newsletters/new"
          className="inline-flex px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          + Create New Newsletter
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl py-20 text-center">
          <p className="text-gray-500 mb-4">You haven&apos;t created any newsletters yet.</p>
          <Link
            href="/newsletters/new"
            className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Create your first newsletter
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((newsletter) => {
            const lastRun = latestRuns.get(newsletter.id);
            const nextRun = estimatedNextRun(newsletter, lastRun);
            return (
              <Link
                key={newsletter.id}
                href={`/newsletters/${newsletter.id}`}
                className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition"
              >
                <h2 className="font-semibold text-lg mb-1 truncate">
                  {displayName(newsletter)}
                </h2>
                <p className="text-sm text-gray-500 capitalize mb-4">
                  {newsletter.frequency}
                </p>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Last run</span>
                  {lastRun ? (
                    <span
                      className={`px-2 py-0.5 rounded font-medium ${
                        STATUS_STYLES[lastRun.status] ?? STATUS_STYLES.queued
                      }`}
                    >
                      {lastRun.status}
                      {lastRun.finished_at &&
                        ` · ${new Date(lastRun.finished_at).toLocaleDateString()}`}
                    </span>
                  ) : (
                    <span className="text-gray-400">No runs yet</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs mt-2">
                  <span className="text-gray-500">Next scheduled</span>
                  <span className="text-gray-700">
                    {nextRun.toLocaleDateString()}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
