import "server-only";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./constants";
import { SEED_OPPORTUNITIES } from "./seed-data";
import { adminClient, publicClient, supabaseConfigured } from "./supabase";
import type {
  ModeratedOpportunity,
  Opportunity,
  OpportunityInput,
  OpportunityPage,
  OpportunityType,
  SortOrder,
  Status,
  WorkMode,
} from "./types";

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };

export type FeedQuery = {
  q?: string;
  types?: OpportunityType[];
  locations?: string[];
  modes?: WorkMode[];
  sort?: SortOrder;
  limit?: number;
  offset?: number;
};

export type RepoError = "unreachable" | "not_configured" | "rejected";

export type RepoResult<T> =
  | { ok: true; data: T; demo: boolean }
  | { ok: false; error: RepoError; message: string };

export type Facets = { locations: string[]; total: number };

const PUBLIC_COLUMNS =
  "id,title,organisation,type,detail,tags,location,work_mode,contact_email,contact_url,contact_note,jd_url,created_at,approved_at";

const MODERATION_COLUMNS = `${PUBLIC_COLUMNS},status`;

const UNREACHABLE_MESSAGE =
  "We could not reach the opportunity board just now.";

/** Escapes the LIKE metacharacters so a user query is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// ===========================================================================
// In-memory demo store
// ---------------------------------------------------------------------------
// Used only when Supabase credentials are absent, so that `npm run dev` and
// preview deployments still show a populated wall. Writes live for the lifetime
// of the server process and are never persisted.
// ===========================================================================

type DemoRow = ModeratedOpportunity;

type DemoStore = { rows: DemoRow[]; counter: number };

// Next bundles route handlers and pages into separate module graphs, so a plain
// module-level array would give /api/opportunities and /admin their own private
// copies - a post submitted through the API would never reach the queue.
// Hanging the store off globalThis keeps one instance per server process.
const DEMO_STORE_KEY = Symbol.for("nordeep.opportunity-wall.demo-store");

function seedDemoRows(): DemoRow[] {
  return SEED_OPPORTUNITIES.map((seed, index) => {
    const createdAt = new Date(Date.now() - seed.minutesAgo * 60_000);
    return {
      id: `demo-${String(index + 1).padStart(4, "0")}`,
      title: seed.title,
      organisation: seed.organisation,
      type: seed.type,
      detail: seed.detail,
      tags: seed.tags,
      location: seed.location,
      work_mode: seed.work_mode,
      contact_email: seed.contact_email,
      contact_url: seed.contact_url,
      contact_note: seed.contact_note,
      jd_url: seed.jd_url,
      status: "approved" as Status,
      created_at: createdAt.toISOString(),
      approved_at: createdAt.toISOString(),
    };
  });
}

function demoStore(): DemoStore {
  const globalScope = globalThis as typeof globalThis & {
    [DEMO_STORE_KEY]?: DemoStore;
  };
  globalScope[DEMO_STORE_KEY] ??= {
    rows: seedDemoRows(),
    counter: SEED_OPPORTUNITIES.length,
  };
  return globalScope[DEMO_STORE_KEY];
}

function demoHaystack(row: DemoRow): string {
  return [
    row.title,
    row.organisation,
    row.detail,
    row.tags.join(" "),
    row.location ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function stripStatus(row: ModeratedOpportunity): Opportunity {
  const { status: _status, ...rest } = row;
  void _status;
  return rest;
}

function queryDemo(query: FeedQuery): OpportunityPage {
  const limit = clampLimit(query.limit);
  const offset = Math.max(0, query.offset ?? 0);
  const needle = query.q?.trim().toLowerCase();

  let rows = demoStore().rows.filter((row) => row.status === "approved");

  if (needle) rows = rows.filter((row) => demoHaystack(row).includes(needle));
  if (query.types?.length)
    rows = rows.filter((row) => query.types!.includes(row.type));
  if (query.locations?.length)
    rows = rows.filter(
      (row) => row.location !== null && query.locations!.includes(row.location),
    );
  if (query.modes?.length)
    rows = rows.filter(
      (row) => row.work_mode !== null && query.modes!.includes(row.work_mode),
    );

  rows = [...rows].sort((a, b) =>
    query.sort === "organisation"
      ? a.organisation.localeCompare(b.organisation) ||
        b.created_at.localeCompare(a.created_at)
      : b.created_at.localeCompare(a.created_at),
  );

  const total = rows.length;
  const items = rows.slice(offset, offset + limit).map(stripStatus);
  return {
    items,
    total,
    hasMore: offset + items.length < total,
    nextOffset: offset + items.length,
  };
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

// ===========================================================================
// Public reads
// ===========================================================================

export async function listOpportunities(
  query: FeedQuery,
): Promise<RepoResult<OpportunityPage>> {
  if (!supabaseConfigured) {
    return { ok: true, data: queryDemo(query), demo: true };
  }

  const client = publicClient()!;
  const limit = clampLimit(query.limit);
  const offset = Math.max(0, query.offset ?? 0);

  try {
    let builder = client
      .from("opportunities")
      .select(PUBLIC_COLUMNS, { count: "exact" })
      // Redundant with the RLS SELECT policy, but makes the intent explicit
      // and keeps the planner on the (status, created_at) index.
      .eq("status", "approved");

    const needle = query.q?.trim();
    if (needle) builder = builder.ilike("search_blob", `%${escapeLike(needle)}%`);
    if (query.types?.length) builder = builder.in("type", query.types);
    if (query.locations?.length)
      builder = builder.in("location", query.locations);
    if (query.modes?.length) builder = builder.in("work_mode", query.modes);

    builder =
      query.sort === "organisation"
        ? builder
            .order("organisation", { ascending: true })
            .order("created_at", { ascending: false })
        : builder.order("created_at", { ascending: false });

    const { data, error, count } = await builder.range(offset, offset + limit - 1);
    if (error) throw error;

    const items = (data ?? []) as unknown as Opportunity[];
    const total = count ?? items.length;
    return {
      ok: true,
      demo: false,
      data: {
        items,
        total,
        hasMore: offset + items.length < total,
        nextOffset: offset + items.length,
      },
    };
  } catch (error) {
    console.error("[repository] listOpportunities failed:", error);
    return { ok: false, error: "unreachable", message: UNREACHABLE_MESSAGE };
  }
}

/** Distinct locations and the total approved count, for filters and the header. */
export async function listFacets(): Promise<RepoResult<Facets>> {
  if (!supabaseConfigured) {
    const approved = demoStore().rows.filter((row) => row.status === "approved");
    const locations = [
      ...new Set(approved.map((r) => r.location).filter((l): l is string => !!l)),
    ].sort((a, b) => a.localeCompare(b));
    return { ok: true, demo: true, data: { locations, total: approved.length } };
  }

  const client = publicClient()!;
  try {
    const { data, error, count } = await client
      .from("opportunities")
      .select("location", { count: "exact" })
      .eq("status", "approved");
    if (error) throw error;

    const locations = [
      ...new Set(
        (data ?? [])
          .map((row) => (row as { location: string | null }).location)
          .filter((l): l is string => Boolean(l)),
      ),
    ].sort((a, b) => a.localeCompare(b));

    return {
      ok: true,
      demo: false,
      data: { locations, total: count ?? 0 },
    };
  } catch (error) {
    console.error("[repository] listFacets failed:", error);
    return { ok: false, error: "unreachable", message: UNREACHABLE_MESSAGE };
  }
}

// ===========================================================================
// Public write
// ===========================================================================

export async function createOpportunity(
  input: OpportunityInput,
): Promise<RepoResult<{ id: string | null }>> {
  if (!supabaseConfigured) {
    const store = demoStore();
    store.counter += 1;
    const now = new Date().toISOString();
    store.rows.unshift({
      ...input,
      id: `demo-${String(store.counter).padStart(4, "0")}`,
      status: "pending",
      created_at: now,
      approved_at: null,
    });
    return { ok: true, demo: true, data: { id: null } };
  }

  const client = publicClient()!;
  try {
    // No .select() here on purpose: the RLS read policy only exposes approved
    // rows, so asking for the inserted row back would fail.
    const { error } = await client
      .from("opportunities")
      .insert({ ...input, status: "pending" });
    if (error) throw error;
    return { ok: true, demo: false, data: { id: null } };
  } catch (error) {
    console.error("[repository] createOpportunity failed:", error);
    return {
      ok: false,
      error: "unreachable",
      message: "We could not save your post just now. Please try again.",
    };
  }
}

// ===========================================================================
// Moderation (service role - callers must already be authenticated)
// ===========================================================================

export async function listForModeration(
  status: Status,
): Promise<RepoResult<ModeratedOpportunity[]>> {
  if (!supabaseConfigured) {
    const rows = demoStore()
      .rows.filter((row) => row.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { ok: true, demo: true, data: rows.map((r) => ({ ...r })) };
  }

  const client = adminClient();
  if (!client) {
    return {
      ok: false,
      error: "not_configured",
      message:
        "SUPABASE_SERVICE_ROLE_KEY is not set, so the moderation queue cannot be read.",
    };
  }

  try {
    const { data, error } = await client
      .from("opportunities")
      .select(MODERATION_COLUMNS)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return {
      ok: true,
      demo: false,
      data: (data ?? []) as unknown as ModeratedOpportunity[],
    };
  } catch (error) {
    console.error("[repository] listForModeration failed:", error);
    return { ok: false, error: "unreachable", message: UNREACHABLE_MESSAGE };
  }
}

export async function setOpportunityStatus(
  id: string,
  status: Status,
): Promise<RepoResult<null>> {
  if (!supabaseConfigured) {
    const row = demoStore().rows.find((r) => r.id === id);
    if (!row)
      return { ok: false, error: "rejected", message: "That post no longer exists." };
    row.status = status;
    row.approved_at = status === "approved" ? new Date().toISOString() : null;
    return { ok: true, demo: true, data: null };
  }

  const client = adminClient();
  if (!client) {
    return {
      ok: false,
      error: "not_configured",
      message: "SUPABASE_SERVICE_ROLE_KEY is not set, so moderation is read-only.",
    };
  }

  try {
    // approved_at is maintained by the set_approved_at trigger.
    const { error } = await client
      .from("opportunities")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
    return { ok: true, demo: false, data: null };
  } catch (error) {
    console.error("[repository] setOpportunityStatus failed:", error);
    return { ok: false, error: "unreachable", message: UNREACHABLE_MESSAGE };
  }
}

export async function updateOpportunity(
  id: string,
  patch: OpportunityInput,
): Promise<RepoResult<null>> {
  if (!supabaseConfigured) {
    const row = demoStore().rows.find((r) => r.id === id);
    if (!row)
      return { ok: false, error: "rejected", message: "That post no longer exists." };
    Object.assign(row, patch);
    return { ok: true, demo: true, data: null };
  }

  const client = adminClient();
  if (!client) {
    return {
      ok: false,
      error: "not_configured",
      message: "SUPABASE_SERVICE_ROLE_KEY is not set, so moderation is read-only.",
    };
  }

  try {
    const { error } = await client
      .from("opportunities")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    return { ok: true, demo: false, data: null };
  } catch (error) {
    console.error("[repository] updateOpportunity failed:", error);
    return { ok: false, error: "unreachable", message: UNREACHABLE_MESSAGE };
  }
}

export async function countByStatus(): Promise<
  RepoResult<Record<Status, number>>
> {
  if (!supabaseConfigured) {
    const counts: Record<Status, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const row of demoStore().rows) counts[row.status] += 1;
    return { ok: true, demo: true, data: counts };
  }

  const client = adminClient();
  if (!client) {
    return {
      ok: false,
      error: "not_configured",
      message: "SUPABASE_SERVICE_ROLE_KEY is not set.",
    };
  }

  try {
    const statuses: Status[] = ["pending", "approved", "rejected"];
    const results = await Promise.all(
      statuses.map((status) =>
        client
          .from("opportunities")
          .select("id", { count: "exact", head: true })
          .eq("status", status),
      ),
    );
    const counts: Record<Status, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    statuses.forEach((status, i) => {
      if (results[i].error) throw results[i].error;
      counts[status] = results[i].count ?? 0;
    });
    return { ok: true, demo: false, data: counts };
  } catch (error) {
    console.error("[repository] countByStatus failed:", error);
    return { ok: false, error: "unreachable", message: UNREACHABLE_MESSAGE };
  }
}
