'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Browser-side client. Uses the anon key, which is safe to expose: every
 *  query it makes is still filtered by the row-level security policies. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
