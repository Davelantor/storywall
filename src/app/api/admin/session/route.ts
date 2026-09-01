import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_OPTIONS,
  adminAuthConfigured,
  issueSessionToken,
  passwordMatches,
} from "@/lib/admin-session";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** POST /api/admin/session - exchange the moderation password for a cookie. */
export async function POST(request: Request) {
  if (!adminAuthConfigured()) {
    return NextResponse.json(
      {
        message:
          "Moderation is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET.",
      },
      { status: 503 },
    );
  }

  // Throttle guesses. Same window as submissions, separate bucket.
  const verdict = checkRateLimit(`admin-login:${clientKey(request.headers)}`);
  if (!verdict.allowed) {
    return NextResponse.json(
      { message: "Too many attempts. Wait a few minutes and try again." },
      {
        status: 429,
        headers: { "retry-after": String(verdict.retryAfterSeconds) },
      },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    /* fall through to the generic failure below */
  }

  if (!password || !passwordMatches(password)) {
    return NextResponse.json({ message: "That password is not right." }, { status: 401 });
  }

  const token = issueSessionToken();
  if (!token) {
    return NextResponse.json(
      { message: "Moderation is not configured." },
      { status: 503 },
    );
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, token, ADMIN_COOKIE_OPTIONS);

  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/session - sign out. */
export async function DELETE() {
  const store = await cookies();
  store.set(ADMIN_COOKIE, "", { ...ADMIN_COOKIE_OPTIONS, maxAge: 0 });
  return NextResponse.json({ ok: true });
}
