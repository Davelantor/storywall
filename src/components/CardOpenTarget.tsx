"use client";

import { cn } from "@/lib/format";

/**
 * The card's primary tap target.
 *
 * Renders as a normal button around the card title, but its ::after overlay is
 * stretched across the whole card, so a tap anywhere on the card opens the
 * detail sheet. The accessible name stays on the title text rather than on an
 * unlabelled full-card hit area.
 *
 * Two contracts this relies on:
 *
 *   1. The card element must be positioned (`.nd-card` sets `position: relative`).
 *      The overlay is `inset: 0` against the nearest positioned ancestor, so an
 *      unpositioned card would let it stretch to the whole page.
 *   2. Anything inside the card that must stay clickable - contact links, the
 *      "More" toggle - needs `relative z-10` to sit above the overlay.
 *
 * The styling lives in the `.nd-card-target` class in globals.css, mostly so
 * the focus ring can be drawn on the overlay itself. Outlining the title text
 * alone would leave the actual click area unindicated.
 */
export default function CardOpenTarget({
  onOpen,
  children,
  hint = "View details",
  className,
}: {
  onOpen: () => void;
  children: React.ReactNode;
  /**
   * Visually hidden suffix, so the button does not announce as a bare title
   * with no indication of what activating it does. Pass null to omit.
   */
  hint?: string | null;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("nd-card-target", className)}
    >
      {children}
      {hint && <span className="nd-sr-only"> — {hint}</span>}
    </button>
  );
}
