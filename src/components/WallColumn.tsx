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

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!wantsLoop || !container) {
      periodRef.current = 0;
      container?.style.removeProperty("--nd-period");
      setCopies(1);
      return;
    }

    // Deliberately not frozen while this column's own arrival slot is open.
    // The slot's grid-rows transition grows the column's real content height
    // every frame; if the period didn't track that, the copy's declared
    // height (which every card below it is positioned relative to) would
    // fall behind the content actually growing inside it, and the next
    // copy down would render on top of the overflow instead of being pushed
    // out of the way - cards visibly overlapping mid-arrival. Tracking it
    // every frame instead means the whole deck below the opening gap moves
    // down in step with it, which is the point of the animation. This was
    // frozen in an earlier design where every column shared one period, to
    // stop this column's growth from also dragging its neighbours' cards
    // apart every frame - that risk doesn't exist any more now that each
    // column measures only itself.
    const measure = () => {
      const el = firstCopyRef.current;
      if (!el || el.children.length === 0) return;

      // Both reads happen before the write below. Reading container.clientHeight
      // *after* writing --nd-period would force a second layout pass - the
      // write invalidates layout, so the next read has to redo it - and this
      // runs on every frame during an arrival now, doubling that cost for the
      // whole animation.
      //
      // The stack's own rendered height, not a sum of children plus an
      // assumed fixed gap. The two used to be interchangeable when every
      // gap was always exactly CARD_GAP_PX, but the arriving card's own
      // trailing margin now spends 550ms animating between zero and that -
      // measuring the real box directly means the period tracks whatever
      // the true current footprint is at every point in that transition,
      // rather than assuming the end state and jumping ahead of it.
      const natural = el.getBoundingClientRect().height;
      const clientHeight = container.clientHeight;

      // Rounded up to a whole pixel: content heights are fractional, and a
      // fractional period would let the copies drift a pixel apart.
      const next = Math.ceil(natural) + CARD_GAP_PX;
      periodRef.current = next;

      // Written straight to the DOM rather than held in state, since the
      // ResizeObserver below can fire every frame during layout changes.
      container.style.setProperty("--nd-period", `${next}px`);

      // Enough copies that a full container height still sits below the
      // wrap point.
      const needed = Math.max(2, Math.ceil(clientHeight / next) + 1);
      setCopies((previous) => (previous === needed ? previous : needed));
    };

    measure();

    const observer = new ResizeObserver(measure);
    if (firstCopyRef.current) observer.observe(firstCopyRef.current);
    observer.observe(container);

    return () => observer.disconnect();
  }, [wantsLoop, items]);

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
                  // Read by .nd-column-stack > [data-slot] in globals.css:
                  // this wrapper's own margin-bottom (the gap below it)
                  // animates from 0 alongside the slot's grid-rows, instead
                  // of the container's spacing applying in full the instant
                  // this element exists.
                  data-slot={inSlot ? "true" : undefined}
                  data-open={inSlot ? slotOpen : undefined}
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
