import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client (anon key). Sessions are persisted in cookies via
 * @supabase/ssr so the middleware and server routes can read them.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
