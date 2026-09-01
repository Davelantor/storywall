/**
 * Browser-side submission throttle: at most 3 posts per browser session per
 * hour, as required by the brief. Backed by sessionStorage so it resets when
 * the tab closes, which is the right granularity for a shared event laptop.
 *
 * The server applies an independent IP-based backstop in src/lib/rate-limit.ts.
 */

const KEY = "nordeep:submissions";
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 3;

function readTimestamps(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((t): t is number => typeof t === "number")
      .filter((t) => now - t < WINDOW_MS);
  } catch {
    // Private mode, disabled storage, corrupt value: fail open. The server
    // still throttles, and blocking a genuine poster is the worse outcome.
    return [];
  }
}

function write(times: number[]): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(times));
  } catch {
    /* ignore */
  }
}

export function submissionsRemaining(): number {
  return Math.max(0, MAX_PER_WINDOW - readTimestamps().length);
}

export function canSubmit(): boolean {
  return submissionsRemaining() > 0;
}

/** Minutes until the oldest submission ages out of the window. */
export function minutesUntilReset(): number {
  const times = readTimestamps();
  if (times.length === 0) return 0;
  const oldest = Math.min(...times);
  return Math.max(1, Math.ceil((oldest + WINDOW_MS - Date.now()) / 60_000));
}

export function recordSubmission(): void {
  write([...readTimestamps(), Date.now()]);
}

export const SUBMISSION_LIMIT = MAX_PER_WINDOW;
