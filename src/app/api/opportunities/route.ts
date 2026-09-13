import { NextResponse } from "next/server";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  createOpportunity,
  listOpportunities,
} from "@/lib/repository";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { parseBoardState } from "@/lib/query";
import { validateSubmission } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/opportunities - paged, filtered feed of approved posts. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = parseBoardState(url.searchParams);

  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_PAGE_SIZE),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const result = await listOpportunities({
    q: state.q,
    types: state.types,
    locations: state.locations,
    modes: state.modes,
    sort: state.sort,
    limit,
    offset,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(result.data, { headers: { "cache-control": "no-store" } });
}

/** POST /api/opportunities - public submission. Always lands as `pending`. */
export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { message: "We could not read that submission." },
      { status: 400 },
    );
  }

  // Honeypot. Real people never see this field, so anything in it is a bot.
  // Answer with the same success shape so scrapers learn nothing.
  if (typeof payload.website_url === "string" && payload.website_url.trim()) {
    return NextResponse.json({ queued: true }, { status: 202 });
  }

  const verdict = checkRateLimit(clientKey(request.headers));
  if (!verdict.allowed) {
    return NextResponse.json(
      {
        message:
          "That is three posts in an hour from this connection. Give it a little while before posting again.",
      },
      {
        status: 429,
        headers: { "retry-after": String(verdict.retryAfterSeconds) },
      },
    );
  }

  const validation = validateSubmission(payload);
  if (!validation.ok) {
    return NextResponse.json(
      { message: "Please check the highlighted fields.", errors: validation.errors },
      { status: 422 },
    );
  }

  const result = await createOpportunity(validation.value);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 503 });
  }

  return NextResponse.json(
    { queued: true },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
