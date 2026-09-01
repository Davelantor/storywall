import "server-only";

/**
 * Best-effort server-side submission throttle.
 *
 * The primary limit required by the brief ("3 per browser session per hour")
 * lives in the browser, in sessionStorage - see src/lib/submission-guard.ts.
 * This is the server-side backstop for anyone who clears that.
 *
 * It is deliberately in-memory: on Vercel each serverless instance keeps its own
 * counter, so a determined abuser could get more than three through. That is an
 * acceptable trade for an event board with human moderation on every post. Swap
 * the two functions below for Upstash/Redis if you ever need a hard guarantee.
 */

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 3;

const hits = new Map<string, number[]>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, times] of hits) {
    const kept = times.filter((t) => now - t < WINDOW_MS);
    if (kept.length === 0) hits.delete(key);
    else hits.set(key, kept);
  }
}

export type RateVerdict = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(key: string): RateVerdict {
  const now = Date.now();
  sweep(now);

  const times = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (times.length >= MAX_PER_WINDOW) {
    const oldest = Math.min(...times);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
    };
  }

  times.push(now);
  hits.set(key, times);
  return {
    allowed: true,
    remaining: MAX_PER_WINDOW - times.length,
    retryAfterSeconds: 0,
  };
}

/** Derives a throttle key from proxy headers, falling back to a shared bucket. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export const RATE_LIMIT = { WINDOW_MS, MAX_PER_WINDOW } as const;
