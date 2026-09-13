// Exercises the real HTTP surface of the app (not the repository module
// directly) so this actually proves the pending -> live / rejected pipeline
// works end to end: public submission, admin auth, moderation actions, and
// the public feed picking up an approved post.
//
// Requires a running dev/prod server (defaults to http://localhost:3000).
// Reads ADMIN_PASSWORD from the environment, falling back to .env.local
// (Next only loads that file for its own process, not for this script).
//
//   node scripts/test-moderation-flow.mjs
//   BASE_URL=http://localhost:3000 node scripts/test-moderation-flow.mjs
//
// Cleans up every post it creates by deleting its file directly from
// DATA_DIR (there is no delete endpoint - moderation only moves posts
// between folders), so a run leaves no trace on the real wall/board.

import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DATA_DIR = process.env.DATA_DIR ?? path.join(root, "data");
const RUN_ID = Date.now().toString(36);
// A fake per-run IP so repeated runs don't share the 3-per-hour submission
// rate limit bucket with each other (or with real manual testing).
const TEST_IP = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;

const STATUSES = ["pending", "live", "rejected"];

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
  throw new Error(
    "ADMIN_PASSWORD not set and not found in .env.local - export it or add it there.",
  );
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
    title: `[test-moderation-flow ${RUN_ID}] ${label}`,
    organisation: "Test Harness Org",
    type: "job_opening",
    detail: `Automated check from scripts/test-moderation-flow.mjs, run ${RUN_ID}.`,
    tags: [],
    location: null,
    work_mode: null,
    contact_email: "test-harness@example.com",
    contact_url: null,
    contact_note: null,
    jd_url: null,
    website_url: "", // honeypot - must stay empty
  };
}

/** Finds and deletes a post's file wherever it currently lives. */
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

/** Reads the moderation queue and returns the id of the post whose title matches. */
async function findByTitle(status, title) {
  const { status: httpStatus, json } = await api(
    `/api/admin/moderate?status=${status}`,
    { asAdmin: true },
  );
  if (httpStatus !== 200) return null;
  const match = json.items.find((item) => item.title === title);
  return match ?? null;
}

async function main() {
  console.log(`Testing against ${BASE_URL} (run ${RUN_ID}, fake IP ${TEST_IP})\n`);

  console.log("1. Admin sign-in");
  const password = await loadAdminPassword();
  const login = await api("/api/admin/session", { method: "POST", body: { password } });
  ok("POST /api/admin/session succeeds", login.status === 200, `got ${login.status}`);
  ok("session cookie received", Boolean(sessionCookie));

  console.log("\n2. Public submission -> pending");
  const approvalCandidate = testPost("approval path");
  const rejectionCandidate = testPost("rejection path");

  const submitA = await api("/api/opportunities", { method: "POST", body: approvalCandidate });
  ok("submit post A returns 201", submitA.status === 201, `got ${submitA.status}`);

  const submitB = await api("/api/opportunities", { method: "POST", body: rejectionCandidate });
  ok("submit post B returns 201", submitB.status === 201, `got ${submitB.status}`);

  const pendingA = await findByTitle("pending", approvalCandidate.title);
  const pendingB = await findByTitle("pending", rejectionCandidate.title);
  ok("post A appears in pending queue", Boolean(pendingA));
  ok("post B appears in pending queue", Boolean(pendingB));
  ok("post A status is 'pending'", pendingA?.status === "pending");

  if (pendingA) createdIds.push(pendingA.id);
  if (pendingB) createdIds.push(pendingB.id);

  if (!pendingA || !pendingB) {
    console.log("\nCannot continue without both posts in the queue - stopping early.");
    return finish();
  }

  console.log("\n3. Approve post A (pending -> live, straight onto the wall)");
  const approve = await api("/api/admin/moderate", {
    method: "POST",
    asAdmin: true,
    body: { id: pendingA.id, status: "live" },
  });
  ok("approve request succeeds", approve.status === 200, `got ${approve.status}`);

  const liveA = await findByTitle("live", approvalCandidate.title);
  ok("post A now in live folder", Boolean(liveA));
  ok("post A now visible on the public feed", await publicFeedHas(approvalCandidate.title));

  console.log("\n5. Edit the live post");
  const editedTitle = `${approvalCandidate.title} (edited)`;
  const edit = await api("/api/admin/moderate", {
    method: "PATCH",
    asAdmin: true,
    body: { id: pendingA.id, ...approvalCandidate, title: editedTitle },
  });
  ok("edit request succeeds", edit.status === 200, `got ${edit.status}`);
  ok("public feed reflects the edited title", await publicFeedHas(editedTitle));

  console.log("\n6. Reject post B (pending -> rejected)");
  const reject = await api("/api/admin/moderate", {
    method: "POST",
    asAdmin: true,
    body: { id: pendingB.id, status: "rejected" },
  });
  ok("reject request succeeds", reject.status === 200, `got ${reject.status}`);

  const rejectedB = await findByTitle("rejected", rejectionCandidate.title);
  ok("post B now in rejected folder", Boolean(rejectedB));
  ok("post B never reached the public feed", (await publicFeedHas(rejectionCandidate.title)) === false);

  console.log("\n7. Restore post B to pending");
  const restore = await api("/api/admin/moderate", {
    method: "POST",
    asAdmin: true,
    body: { id: pendingB.id, status: "pending" },
  });
  ok("restore-to-pending request succeeds", restore.status === 200, `got ${restore.status}`);
  const restoredB = await findByTitle("pending", rejectionCandidate.title);
  ok("post B back in pending folder", Boolean(restoredB));

  console.log("\n8. Validation still rejects a bad submission");
  const badSubmit = await api("/api/opportunities", {
    method: "POST",
    body: { ...testPost("bad"), title: "" },
  });
  ok("empty title is rejected with 422", badSubmit.status === 422, `got ${badSubmit.status}`);

  return finish();
}

async function publicFeedHas(title) {
  const { json } = await api(`/api/opportunities?q=${encodeURIComponent(title)}`);
  return Boolean(json?.items?.some((item) => item.title === title));
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
