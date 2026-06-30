"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

/**
 * The account affordance in the masthead: email · Account. "Account" opens a quiet
 * dropdown holding Sign out — no floating avatar orb, per the design system.
 */
export function AccountMenu({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div ref={ref} className="relative font-mono text-[12px] text-ink-4">
      <span>{email}</span>
      <span className="mx-1.5">·</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-oxblood hover:opacity-70"
      >
        Account
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-40 bg-white border border-hairline rounded-card shadow-card z-10 py-1">
          <button
            type="button"
            onClick={signOut}
            className="w-full text-left px-3 py-2 font-sans text-[13px] text-ink-2 hover:bg-surface"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
