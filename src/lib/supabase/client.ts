"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client — always runs with the signed-in user's own session,
 * so every query goes through Postgres RLS as that user. This is the
 * ONLY Supabase client that should ever be used directly from client
 * components, and it must never be given the service-role key.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
