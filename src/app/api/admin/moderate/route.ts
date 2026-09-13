import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/admin-session";
import {
  listForModeration,
  setOpportunityStatus,
  updateOpportunity,
} from "@/lib/repository";
import { STATUSES, type Status } from "@/lib/types";
import { validateSubmission } from "@/lib/validation";

export const dynamic = "force-dynamic";

function unauthorised() {
  return NextResponse.json({ message: "Not signed in." }, { status: 401 });
}

function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/** GET /api/admin/moderate?status=pending - the moderation queue. */
export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorised();

  const status = new URL(request.url).searchParams.get("status") ?? "pending";
  if (!isStatus(status)) {
    return NextResponse.json({ message: "Unknown status." }, { status: 400 });
  }

  const result = await listForModeration(status);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 503 });
  }

  return NextResponse.json(
    { items: result.data },
    { headers: { "cache-control": "no-store" } },
  );
}

/** POST /api/admin/moderate - approve or reject one post. */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorised();

  let body: { id?: unknown; status?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "Bad request." }, { status: 400 });
  }

  if (typeof body.id !== "string" || !body.id || !isStatus(body.status)) {
    return NextResponse.json({ message: "Bad request." }, { status: 400 });
  }

  const result = await setOpportunityStatus(body.id, body.status);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}

/** PATCH /api/admin/moderate - edit a post before approving it. */
export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorised();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Bad request." }, { status: 400 });
  }

  const id = body.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ message: "Bad request." }, { status: 400 });
  }

  // Moderator edits go through exactly the same validation as public posts.
  const validation = validateSubmission(body);
  if (!validation.ok) {
    return NextResponse.json(
      { message: "Please check the highlighted fields.", errors: validation.errors },
      { status: 422 },
    );
  }

  const result = await updateOpportunity(id, validation.value);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
