"use client";

import { useRef, useState } from "react";

import type { Opportunity } from "@/lib/types";

import OpportunityCard from "./OpportunityCard";
import {
  CARD_GAP_PX,
  useColumnLoop,
  useIsomorphicLayoutEffect,
  useRevealObserver,
} from "./wall-hooks";

/** No column is ever wider than this - the wall reads as a set of
 * independent tickers standing side by side, not one wide masonry block. */
export const WALL_COLUMN_MAX_WIDTH = 520;

type Props = {
  items: Opportunity[];
  /** Only used to tag cards for WallClient's arrival-landing search. */
  columnIndex: number;
  reducedMotion: boolean;
  revealActive: boolean;
  onOpen: (item: Opportunity) => void;
  arrived: Set<string>;
  /** The id of the item currently occupying this column's arrival slot, if any. */
  slotId: string | null;
  slotOpen: boolean;
  landed: boolean;
  settled: Set<string>;
};

/**
 * One independently-scrolling column of the wall: its own scroll container,
 * its own loop period, its own hover-pause. It reads and writes nothing
 * belonging to any other column, so a card landing here can never move a
 * single card in a sibling column - there is nothing shared left for it to
 * move. See CLAUDE.md's "The wall" section for the whole design.
 */
export default function WallColumn({
  items,
  columnIndex,
  reducedMotion,
  revealActive,
  onOpen,
  arrived,
  slotId,
  slotOpen,
  landed,
  settled,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const firstCopyRef = useRef<HTMLDivElement>(null);
  const periodRef = useRef(0);
  const [copies, setCopies] = useState(1);

  const revealRef = useRevealObserver(!reducedMotion);

  // A looping column needs a finite, repeating set, so reduced motion gets a
  // single copy and ordinary static content instead.
  const wantsLoop = !reducedMotion && items.length > 0;

  // While this column's own arrival slot is open, its grid-rows animation
  // changes this column's rendered height every frame; recomputing the period
  // from that would just be chasing the slot's own transition. Frozen until
  // the slot is torn down, then measured once more.
  const arrivalInFlight = slotId !== null;

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!wantsLoop || !container) {
      periodRef.current = 0;
      container?.style.removeProperty("--nd-period");
      setCopies(1);
      return;
    }

    const measure = () => {
      if (arrivalInFlight) return;

      const el = firstCopyRef.current;
      if (!el || el.children.length === 0) return;

      const content = Array.from(el.children).reduce(
        (total, child) => total + child.getBoundingClientRect().height,
        0,
      );
      const natural = content + (el.children.length - 1) * CARD_GAP_PX;

      // Rounded up to a whole pixel: content heights are fractional, and a
      // fractional period would let the copies drift a pixel apart.
      const next = Math.ceil(natural) + CARD_GAP_PX;
      periodRef.current = next;

      // Written straight to the DOM rather than held in state, since the
      // ResizeObserver below can fire every frame during layout changes.
      container.style.setProperty("--nd-period", `${next}px`);

      // Enough copies that a full container height still sits below the
      // wrap point.
      const needed = Math.max(
        2,
        Math.ceil(container.clientHeight / next) + 1,
      );
      setCopies((previous) => (previous === needed ? previous : needed));
    };

    measure();

    const observer = new ResizeObserver(measure);
    if (firstCopyRef.current) observer.observe(firstCopyRef.current);
    observer.observe(container);

    return () => observer.disconnect();
  }, [wantsLoop, items, arrivalInFlight]);

  useColumnLoop({ enabled: wantsLoop, containerRef, periodRef });

  return (
    <div
      ref={containerRef}
      className="nd-wall-column"
      data-reveal={revealActive ? "on" : undefined}
      // Scroll anchoring tries to keep a reference element steady when
      // content shifts, and nudges the position a few pixels right after the
      // loop's programmatic jump. That reads as jitter at the seam.
      style={{
        overflowAnchor: "none",
        // The looping copies rely on being clipped to exactly one column's
        // worth of height. Without a loop (reduced motion, or nothing to
        // repeat) there is only the one real copy, so the column instead
        // scrolls normally - an ordinary reachable list rather than content
        // hidden behind a fixed-height clip with no loop to bring it into view.
        overflowY: wantsLoop ? "hidden" : "auto",
      }}
    >
      {Array.from({ length: copies }, (_, copyIndex) => (
        <div
          key={copyIndex}
          // Fixed to this column's own period, unrelated to any other
          // column's.
          style={{ height: "var(--nd-period, auto)", flexShrink: 0 }}
          // Copies past the first are visual filler for the loop. inert keeps
          // them out of the tab order and the accessibility tree, so nothing
          // is announced or focused twice.
          inert={copyIndex > 0}
        >
          <div
            ref={copyIndex === 0 ? firstCopyRef : undefined}
            className="nd-column-stack"
          >
            {items.map((item) => {
              const inSlot = slotId === item.id;
              const skipReveal = inSlot || settled.has(item.id);

              const card = (
                <OpportunityCard
                  opportunity={item}
                  variant="wall"
                  onOpen={copyIndex === 0 ? onOpen : undefined}
                  arrived={arrived.has(item.id)}
                  className={inSlot ? "nd-slot-card" : undefined}
                />
              );

              return (
                <div
                  key={`${item.id}-${copyIndex}`}
                  ref={skipReveal ? undefined : revealRef}
                  className={skipReveal ? undefined : "nd-reveal"}
                  data-card-id={item.id}
                  data-column={columnIndex}
                >
                  {inSlot ? (
                    <div
                      className="nd-slot"
                      data-arrival-slot={item.id}
                      data-open={slotOpen}
                      data-landed={landed}
                    >
                      <div>{card}</div>
                    </div>
                  ) : (
                    card
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
