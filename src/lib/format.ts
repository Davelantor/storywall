/** Joins conditional class names. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Compact relative timestamp: "just now", "14m ago", "2h ago", "3d ago".
 * Deliberately identical on server and client for a given input so that
 * hydration does not mismatch; components re-render it on an interval instead.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** Absolute timestamp for the title attribute / screen readers. */
export function absoluteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/** Strips the scheme and any trailing slash, for displaying a link compactly. */
export function prettyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("linkedin.com")) return "LinkedIn";
    return (parsed.hostname + parsed.pathname).replace(/^www\./, "").replace(/\/$/, "");
  } catch {
    return url;
  }
}
