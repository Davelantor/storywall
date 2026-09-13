// Phases the reported wall/admin sync issues: does a "Pull from wall" really
// take a post out of the public feed (and stay out on a fresh fetch, i.e. a
// reload), and does releasing several posts back-to-back leave the live
// folder in the state the wall's poll would read.
//
// Requires a running dev/prod server (defaults to http://localhost:3000).
//
//   node scripts/test-wall-sync.mjs

import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DATA_DIR = process.env.DATA_DIR ?? path.join(root, "data");
const RUN_ID = Date.now().toString(36);
const TEST_IP = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
const STATUSES = ["pending", "approved", "live", "rejected"];

let passCount = 0;
let failCount = 0;
const createdIds = [];

function ok(label, condition, detail) {
  if (condition) {
    passCount += 1;
    console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
  } else {
    failCount += 1;
    console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function loadAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  try {
    const raw = await readFile(path.join(root, ".env.local"), "utf8");
    const match = raw.match(/^ADMIN_PASSWORD=(.*)$/m);
    if (match) return match[1].trim();
  } catch {
    // fall through
  }
  throw new Error("ADMIN_PASSWORD not set and not found in .env.local");
}

let sessionCookie = null;

async function api(pathname, { method = "GET", body, asAdmin = false } = {}) {
  const headers = { "x-forwarded-for": TEST_IP };
  if (body) headers["content-type"] = "application/json";
  if (asAdmin && sessionCookie) headers["cookie"] = sessionCookie;

  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) sessionCookie = setCookie.split(";")[0];

  let json = null;
  try {
    json = await response.json();
  } catch {
    // no body
  }
  return { status: response.status, json };
}

function testPost(label) {
  return {
    title: `[test-wall-sync ${RUN_ID}] ${label}`,
    organisation: "Test Harness Org",
    type: "job_opening",
    detail: `Automated wall-sync check, run ${RUN_ID}.`,
    tags: [],
    location: null,
    work_mode: null,
    contact_email: "test-harness@example.com",
    contact_url: null,
    contact_note: null,
    jd_url: null,
    website_url: "",
  };
}

async function deletePost(id) {
  for (const status of STATUSES) {
    const filePath = path.join(DATA_DIR, status, `${id}.json`);
    try {
      await unlink(filePath);
      return true;
    } catch {
      // not in this folder
    }
  }
  return false;
}

async function findByTitle(status, title) {
  const { status: httpStatus, json } = await api(
    `/api/admin/moderate?status=${status}`,
    { asAdmin: true },
  );
  if (httpStatus !== 200) return null;
  return json.items.find((item) => item.title === title) ?? null;
}

async function publicFeedHas(title) {
  const { json } = await api(`/api/opportunities?q=${encodeURIComponent(title)}&limit=100`);
  return Boolean(json?.items?.some((item) => item.title === title));
}

async function submitAndApprove(label) {
  const candidate = testPost(label);
  const submit = await api("/api/opportunities", { method: "POST", body: candidate });
  ok(`submit "${label}" returns 201`, submit.status === 201, `got ${submit.status}`);

  const pending = await findByTitle("pending", candidate.title);
  ok(`"${label}" appears in pending`, Boolean(pending));
  if (!pending) return null;
  createdIds.push(pending.id);

  const approve = await api("/api/admin/moderate", {
    method: "POST",
    asAdmin: true,
    body: { id: pending.id, status: "approved" },
  });
  ok(`approve "${label}" succeeds`, approve.status === 200, `got ${approve.status}`);
  return { id: pending.id, title: candidate.title };
}

async function main() {
  console.log(`Testing against ${BASE_URL} (run ${RUN_ID})\n`);

  const password = await loadAdminPassword();
  const login = await api("/api/admin/session", { method: "POST", body: { password } });
  ok("admin sign-in succeeds", login.status === 200, `got ${login.status}`);

  // ------------------------------------------------------------------
  console.log("\nPhase 1: single release onto an otherwise-unaffected feed");
  const p1 = await submitAndApprove("phase1 single release");
  if (p1) {
    const release = await api("/api/admin/moderate", {
      method: "POST",
      asAdmin: true,
      body: { id: p1.id, status: "live" },
    });
    ok("release succeeds", release.status === 200, `got ${release.status}`);
    ok("post appears in the live folder", Boolean(await findByTitle("live", p1.title)));
    ok("post appears in the public feed", await publicFeedHas(p1.title));
  }

  // ------------------------------------------------------------------
  console.log("\nPhase 2: pull from wall - the reported reappear-on-reload bug");
  if (p1) {
    const pull = await api("/api/admin/moderate", {
      method: "POST",
      asAdmin: true,
      body: { id: p1.id, status: "approved" },
    });
    ok("pull-from-wall request succeeds", pull.status === 200, `got ${pull.status}`);

    const stillInLive = await findByTitle("live", p1.title);
    ok("post no longer in the live folder", !stillInLive, stillInLive ? "still present" : undefined);

    const stillOnFeed = await publicFeedHas(p1.title);
    ok("post no longer on the public feed", !stillOnFeed, stillOnFeed ? "still returned" : undefined);

    // Second, independent fetch - simulates a hard reload of /wall, which
    // re-runs listOpportunities() server-side exactly like this GET does.
    const reloadCheck = await publicFeedHas(p1.title);
    ok("post stays gone on a second independent fetch (reload)", !reloadCheck);

    // Re-check the approved folder actually holds it (not lost, not duped).
    const approvedCopy = await findByTitle("approved", p1.title);
    ok("post landed in approved (not lost)", Boolean(approvedCopy));

    // Make sure it didn't get duplicated into both folders by a partial move.
    const liveDupe = await findByTitle("live", p1.title);
    ok("no duplicate left behind in live", !liveDupe);
  }

  // ------------------------------------------------------------------
  console.log("\nPhase 3: five releases back-to-back (rapid-fire from the queue)");
  const batch = [];
  for (let i = 0; i < 5; i += 1) {
    const item = await submitAndApprove(`phase3 batch ${i}`);
    if (item) batch.push(item);
  }
  ok("all 5 batch posts made it to approved", batch.length === 5, `only ${batch.length}/5`);

  const releaseResults = await Promise.all(
    batch.map((item) =>
      api("/api/admin/moderate", {
        method: "POST",
        asAdmin: true,
        body: { id: item.id, status: "live" },
      }),
    ),
  );
  ok(
    "all 5 concurrent release requests succeed",
    releaseResults.every((r) => r.status === 200),
    releaseResults.map((r) => r.status).join(","),
  );

  let allLive = true;
  for (const item of batch) {
    const found = await findByTitle("live", item.title);
    if (!found) allLive = false;
  }
  ok("all 5 posts present in the live folder after concurrent release", allLive);

  let allOnFeed = true;
  for (const item of batch) {
    if (!(await publicFeedHas(item.title))) allOnFeed = false;
  }
  ok("all 5 posts present on the public feed", allOnFeed);

  // ------------------------------------------------------------------
  console.log("\nPhase 4: pull all 5 back-to-back (concurrent pulls)");
  const pullResults = await Promise.all(
    batch.map((item) =>
      api("/api/admin/moderate", {
        method: "POST",
        asAdmin: true,
        body: { id: item.id, status: "approved" },
      }),
    ),
  );
  ok(
    "all 5 concurrent pull requests succeed",
    pullResults.every((r) => r.status === 200),
    pullResults.map((r) => r.status).join(","),
  );

  let noneLive = true;
  let noneOnFeed = true;
  for (const item of batch) {
    if (await findByTitle("live", item.title)) noneLive = false;
    if (await publicFeedHas(item.title)) noneOnFeed = false;
  }
  ok("none of the 5 remain in the live folder", noneLive);
  ok("none of the 5 remain on the public feed", noneOnFeed);

  // ------------------------------------------------------------------
  console.log("\nPhase 5: reject straight from live (skip the approved stop)");
  const p5 = await submitAndApprove("phase5 reject from live");
  if (p5) {
    await api("/api/admin/moderate", {
      method: "POST",
      asAdmin: true,
      body: { id: p5.id, status: "live" },
    });
    ok("pre-condition: on the feed before reject", await publicFeedHas(p5.title));

    const reject = await api("/api/admin/moderate", {
      method: "POST",
      asAdmin: true,
      body: { id: p5.id, status: "rejected" },
    });
    ok("reject-from-live succeeds", reject.status === 200, `got ${reject.status}`);
    ok("gone from the feed after reject", !(await publicFeedHas(p5.title)));
    ok("landed in rejected", Boolean(await findByTitle("rejected", p5.title)));
  }

  return finish();
}

async function finish() {
  console.log("\nCleaning up test posts...");
  let cleaned = 0;
  for (const id of createdIds) {
    if (await deletePost(id)) cleaned += 1;
  }
  console.log(`  removed ${cleaned}/${createdIds.length} test post file(s)`);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error("\nTest run crashed:", error);
  await finish();
  process.exitCode = 1;
});
