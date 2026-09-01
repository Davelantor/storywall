import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

/**
 * True when the project has real Supabase credentials. When false the app runs
 * against an in-memory demo store so the wall still renders locally and in
 * preview builds, rather than erroring out.
 */
export const supabaseConfigured = Boolean(
  url && anonKey && !url.includes("your-project-ref"),
);

export const supabaseAdminConfigured = Boolean(
  supabaseConfigured && serviceKey && serviceKey !== "your-service-role-key",
);

let publicSingleton: SupabaseClient | null = null;
let adminSingleton: SupabaseClient | null = null;

/** Anon-key client. Everything it can do is bounded by the RLS policies. */
export function publicClient(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  publicSingleton ??= createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return publicSingleton;
}

/**
 * Service-role client. Bypasses RLS, so it must only ever be constructed in
 * server code behind the admin session check. Never import this into a
 * "use client" module.
 */
export function adminClient(): SupabaseClient | null {
  if (!supabaseAdminConfigured) return null;
  adminSingleton ??= createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminSingleton;
}

export const SUPABASE_PUBLIC_ENV = {
  url: url ?? null,
  anonKey: anonKey ?? null,
  configured: supabaseConfigured,
};
