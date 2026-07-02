"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { SpotlightCursor } from "@/components/ui/spotlight-cursor";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surface a failed OAuth exchange (redirected here as /login?error=...)
  // instead of silently dropping back to a blank page.
  useEffect(() => {
    const fromCallback = new URLSearchParams(window.location.search).get("error");
    if (fromCallback) setError(fromCallback);
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setLoading(false);
      setError(error.message);
    }
    // On success, Supabase redirects to Google — no further local state change needed.
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      {/* Ambient warm-halo cursor — palette-matched (oxblood accent), low brightness, and
          disabled under prefers-reduced-motion. Entry screen only; kept off dense reading views. */}
      <SpotlightCursor />
      <div className="w-full max-w-sm bg-white border border-hairline rounded-card shadow-card p-8 text-center">
        <h1 className="font-serif text-[32px] font-semibold tracking-[-0.01em] text-ink">
          The Desk<span className="text-oxblood">.</span>
        </h1>
        <p className="font-sans text-[14px] text-ink-4 mt-2">
          The 9 a.m. you can quote. Sign in to continue.
        </p>

        {error && (
          <div className="mt-6 px-4 py-3 rounded-input font-mono text-[12px] bg-note-bg text-oxblood border border-[#EAD9A0] text-left">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-hairline-2 rounded-btn font-sans text-[14px] font-semibold text-ink hover:bg-surface disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v2.97h3.86c2.26-2.09 3.56-5.17 3.56-8.79z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.92l-3.86-2.97c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.06C3.26 21.3 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.3a7.13 7.13 0 0 1 0-4.6V6.64H1.27a11.98 11.98 0 0 0 0 10.72l4-3.06z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.27 6.64l4 3.06C6.22 6.86 8.87 4.75 12 4.75z"
            />
          </svg>
          {loading ? "Redirecting…" : "Sign in with Google"}
        </button>
      </div>
    </main>
  );
}
