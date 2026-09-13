import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./constants";
import { SEED_OPPORTUNITIES } from "./seed-data";
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
import { STATUSES } from "./types";

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

export type RepoError = "unreachable" | "rejected";

export type RepoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RepoError; message: string };

export type Facets = { locations: string[]; total: number };

const UNREACHABLE_MESSAGE = "We could not reach the opportunity board just now.";

// ===========================================================================
// File-per-post store
// ---------------------------------------------------------------------------
// One JSON file per post, in one of three lifecycle folders under DATA_DIR
// (defaults to ./data): pending/, live/, rejected/. A post's
// folder location *is* its status - the `status` field inside the JSON is
// kept redundantly, purely so a misplaced file is obvious on inspection
// rather than silently wrong.
//
// Writes are atomic: content goes to a temp file in the destination folder
// first, then an fs.rename into place - rename is atomic as long as source
// and destination are on the same volume, which they always are here
// (subfolders of one root). Moving a post between folders is therefore a
// read + rewrite-into-the-new-folder + delete-the-old-file, not a bare
// rename, because the JSON content's own status field has to change too;
// the new file is written and fsynced into place before the old one is
// removed, so a crash mid-move leaves the post duplicated (self-evident and
// recoverable) rather than lost.
// ===========================================================================

type FileRecord = Opportunity & { status: Status };

// DATA_DIR is a runtime env var, so Next can't statically scope any path
// built from it - every path.join below is ignored rather than letting the
// build tracer pull in (and bundle) the whole project as a false dependency.
function dataRoot(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

function dirFor(status: Status): string {
  return path.join(/* turbopackIgnore: true */ dataRoot(), status);
}

function filePathFor(status: Status, id: string): string {
  return path.join(/* turbopackIgnore: true */ dirFor(status), `${id}.json`);
}

function seedRows(): FileRecord[] {
  return SEED_OPPORTUNITIES.map((seed) => {
    const createdAt = new Date(Date.now() - seed.minutesAgo * 60_000).toISOString();
    return {
      ...seed,
      id: randomUUID(),
      status: "live",
      created_at: createdAt,
      approved_at: createdAt,
    };
  });
}

let dirsReady: Promise<void> | null = null;

/**
 * Creates the three lifecycle folders on first use. If the data root did not
 * exist yet - a fresh checkout or a brand new deployment - seeds `live/`
 * with the sample opportunities so the wall is never empty on day one, the
 * same property the old in-memory demo store gave for free.
 */
function ensureDirs(): Promise<void> {
  dirsReady ??= (async () => {
    const root = dataRoot();
    const isFresh = await stat(/* turbopackIgnore: true */ root).then(
      () => false,
      () => true,
    );

    await Promise.all(STATUSES.map((status) => mkdir(dirFor(status), { recursive: true })));

    if (isFresh) {
      await Promise.all(seedRows().map((row) => atomicWrite("live", row)));
    }

    // One-time migration for existing installs: the "approved" staging
    // status was removed (approving a post now releases it straight to
    // "live"), so anything a moderator had already approved but not yet
    // released would otherwise be stranded in a folder nothing reads from
    // any more. Fold it into "live" rather than losing it.
    await migrateApprovedFolder(root);
  })();
  return dirsReady;
}

async function migrateApprovedFolder(root: string): Promise<void> {
  const approvedDir = path.join(/* turbopackIgnore: true */ root, "approved");
  let names: string[];
  try {
    names = await readdir(approvedDir);
  } catch {
    return; // no leftover "approved" folder - nothing to migrate
  }

  await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          const raw = await readFile(path.join(approvedDir, name), "utf8");
          const record = JSON.parse(raw) as FileRecord;
          await atomicWrite("live", {
            ...record,
            status: "live",
            approved_at: record.approved_at ?? new Date().toISOString(),
          });
          await unlink(path.join(approvedDir, name));
        } catch (error) {
          console.error(`[repository] could not migrate ${approvedDir}/${name}:`, error);
        }
      }),
  );
}

/** Writes `record` into `status`'s folder atomically (temp file + rename). */
async function atomicWrite(status: Status, record: FileRecord): Promise<void> {
  const dir = dirFor(status);
  const finalPath = path.join(dir, `${record.id}.json`);
  const tmpPath = path.join(dir, `.${record.id}.${randomUUID()}.tmp`);
  await writeFile(tmpPath, JSON.stringify(record, null, 2), "utf8");
  await rename(tmpPath, finalPath);
}

/** Reads every record in one folder. Corrupt/unreadable files are skipped and logged. */
async function readFolder(status: Status): Promise<FileRecord[]> {
  await ensureDirs();
  const dir = dirFor(status);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    console.error(`[repository] could not list ${dir}:`, error);
    return [];
  }

  const records = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          const raw = await readFile(path.join(/* turbopackIgnore: true */ dir, name), "utf8");
          return JSON.parse(raw) as FileRecord;
        } catch (error) {
          console.error(`[repository] skipping unreadable file ${dir}/${name}:`, error);
          return null;
        }
      }),
  );
  return records.filter((r): r is FileRecord => r !== null);
}

/** Locates a record by id across all folders. Returns its current status too. */
async function findRecord(id: string): Promise<{ status: Status; record: FileRecord } | null> {
  await ensureDirs();
  for (const status of STATUSES) {
    try {
      const raw = await readFile(filePathFor(status, id), "utf8");
      return { status, record: JSON.parse(raw) as FileRecord };
    } catch {
      // not in this folder - keep looking
    }
  }
  return null;
}

function stripStatus(record: FileRecord): Opportunity {
  const { status: _status, ...rest } = record;
  void _status;
  return rest;
}

function haystack(record: FileRecord): string {
  return [record.title, record.organisation, record.detail, record.tags.join(" "), record.location ?? ""]
    .join(" ")
    .toLowerCase();
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

// ===========================================================================
// Public reads
// ===========================================================================

export async function listOpportunities(query: FeedQuery): Promise<RepoResult<OpportunityPage>> {
  try {
    const limit = clampLimit(query.limit);
    const offset = Math.max(0, query.offset ?? 0);
    const needle = query.q?.trim().toLowerCase();

    let rows = await readFolder("live");

    if (needle) rows = rows.filter((r) => haystack(r).includes(needle));
    if (query.types?.length) rows = rows.filter((r) => query.types!.includes(r.type));
    if (query.locations?.length)
      rows = rows.filter((r) => r.location !== null && query.locations!.includes(r.location));
    if (query.modes?.length)
      rows = rows.filter((r) => r.work_mode !== null && query.modes!.includes(r.work_mode));

    rows = [...rows].sort((a, b) =>
      query.sort === "organisation"
        ? a.organisation.localeCompare(b.organisation) || b.created_at.localeCompare(a.created_at)
        : b.created_at.localeCompare(a.created_at),
    );

    const total = rows.length;
    const items = rows.slice(offset, offset + limit).map(stripStatus);
    return {
      ok: true,
      data: { items, total, hasMore: offset + items.length < total, nextOffset: offset + items.length },
    };
  } catch (error) {
    console.error("[repository] listOpportunities failed:", error);
    return { ok: false, error: "unreachable", message: UNREACHABLE_MESSAGE };
  }
}

/** Distinct locations and the total live count, for filters and the header. */
export async function listFacets(): Promise<RepoResult<Facets>> {
  try {
    const rows = await readFolder("live");
    const locations = [...new Set(rows.map((r) => r.location).filter((l): l is string => !!l))].sort(
      (a, b) => a.localeCompare(b),
    );
    return { ok: true, data: { locations, total: rows.length } };
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
): Promise<RepoResult<{ id: string }>> {
  try {
    await ensureDirs();
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: FileRecord = { ...input, id, status: "pending", created_at: now, approved_at: null };
    await atomicWrite("pending", record);
    return { ok: true, data: { id } };
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
// Moderation (callers must already be authenticated)
// ===========================================================================

export async function listForModeration(status: Status): Promise<RepoResult<ModeratedOpportunity[]>> {
  try {
    const rows = await readFolder(status);
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { ok: true, data: rows };
  } catch (error) {
    console.error("[repository] listForModeration failed:", error);
    return { ok: false, error: "unreachable", message: UNREACHABLE_MESSAGE };
  }
}

/** Moves a post to a new lifecycle folder, rewriting its status/timestamps. */
export async function setOpportunityStatus(id: string, status: Status): Promise<RepoResult<null>> {
  try {
    const found = await findRecord(id);
    if (!found) {
      return { ok: false, error: "rejected", message: "That post no longer exists." };
    }
    if (found.status === status) {
      return { ok: true, data: null };
    }

    const updated: FileRecord = {
      ...found.record,
      status,
      approved_at:
        status === "live" ? found.record.approved_at ?? new Date().toISOString() : null,
    };

    await atomicWrite(status, updated);
    await unlink(filePathFor(found.status, id));
    return { ok: true, data: null };
  } catch (error) {
    console.error("[repository] setOpportunityStatus failed:", error);
    return { ok: false, error: "unreachable", message: UNREACHABLE_MESSAGE };
  }
}

/** Edits a post's fields in place, wherever it currently lives. */
export async function updateOpportunity(id: string, patch: OpportunityInput): Promise<RepoResult<null>> {
  try {
    const found = await findRecord(id);
    if (!found) {
      return { ok: false, error: "rejected", message: "That post no longer exists." };
    }
    const updated: FileRecord = { ...found.record, ...patch };
    await atomicWrite(found.status, updated);
    return { ok: true, data: null };
  } catch (error) {
    console.error("[repository] updateOpportunity failed:", error);
    return { ok: false, error: "unreachable", message: UNREACHABLE_MESSAGE };
  }
}

export async function countByStatus(): Promise<RepoResult<Record<Status, number>>> {
  try {
    await ensureDirs();
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
    await Promise.all(
      STATUSES.map(async (status) => {
        const names = await readdir(dirFor(status));
        counts[status] = names.filter((name) => name.endsWith(".json")).length;
      }),
    );
    return { ok: true, data: counts };
  } catch (error) {
    console.error("[repository] countByStatus failed:", error);
    return { ok: false, error: "unreachable", message: UNREACHABLE_MESSAGE };
  }
}
