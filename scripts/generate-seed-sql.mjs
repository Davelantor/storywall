// Generates supabase/seed.sql from src/lib/seed-data.ts so the sample content
// used by the offline demo store and the database seed can never drift apart.
//
//   node scripts/generate-seed-sql.mjs
//
// Relies on Node's built-in TypeScript type stripping (Node >= 22.18).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { SEED_OPPORTUNITIES } = await import(
  new URL("../src/lib/seed-data.ts", import.meta.url).href
);

const q = (value) => {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
};

const arr = (tags) =>
  tags.length === 0
    ? "'{}'::text[]"
    : `array[${tags.map(q).join(", ")}]::text[]`;

const rows = SEED_OPPORTUNITIES.map((o) => {
  const created = `now() - interval '${o.minutesAgo} minutes'`;
  return `  (${q(o.title)}, ${q(o.organisation)}, ${q(o.type)}::public.opportunity_type, ${q(o.detail)},
   ${arr(o.tags)}, ${q(o.location)}, ${o.work_mode ? `${q(o.work_mode)}::public.work_mode` : "null"},
   ${q(o.contact_email)}, ${q(o.contact_url)}, ${q(o.contact_note)}, ${q(o.jd_url)},
   'approved'::public.opportunity_status, ${created})`;
}).join(",\n\n");

const sql = `-- ===========================================================================
-- NORDEEP Opportunity Wall - seed data (${SEED_OPPORTUNITIES.length} approved sample opportunities)
-- ---------------------------------------------------------------------------
-- GENERATED FILE - do not edit by hand.
-- Source: src/lib/seed-data.ts   Regenerate: node scripts/generate-seed-sql.mjs
--
-- Run after supabase/schema.sql. Safe to re-run: it clears previous seed rows
-- (matched by title) before inserting, and never touches real submissions.
-- ===========================================================================

begin;

delete from public.opportunities
where title in (
${SEED_OPPORTUNITIES.map((o) => `  ${q(o.title)}`).join(",\n")}
);

insert into public.opportunities
  (title, organisation, type, detail,
   tags, location, work_mode,
   contact_email, contact_url, contact_note, jd_url,
   status, created_at)
values
${rows};

commit;

-- Sanity check:
--   select type, count(*) from public.opportunities
--   where status = 'approved' group by type order by type;
`;

const target = path.join(root, "supabase", "seed.sql");
await fs.writeFile(target, sql, "utf8");
console.log(
  `Wrote ${path.relative(root, target)} (${SEED_OPPORTUNITIES.length} rows)`,
);
