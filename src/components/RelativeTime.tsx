"use client";

import { useEffect, useState } from "react";

import { absoluteTime, relativeTime } from "@/lib/format";

/**
 * Relative timestamp that refreshes itself once a minute.
 *
 * Server and client both render against their own clock, which can differ by a
 * few seconds and occasionally straddles a minute boundary. That is exactly
 * what suppressHydrationWarning is for - the value self-corrects on the first
 * tick, and it beats showing nothing until the client takes over.
 */
export default function RelativeTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <time
      dateTime={iso}
      title={absoluteTime(iso)}
      className={className}
      suppressHydrationWarning
    >
      {relativeTime(iso, now)}
    </time>
  );
}
