"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { clearConfetti } from "@/lib/confetti";
import { isDebugId, makeDebugPost } from "@/lib/debug-samples";
import { POLL_INTERVAL_MS, WALL_MAX_ITEMS } from "@/lib/constants";
import type { Opportunity } from "@/lib/types";

import ArrivalFlight from "./ArrivalFlight";
import DetailSheet from "./DetailSheet";
import OpportunityCard from "./OpportunityCard";
import {
  useColumnCount,
  useIsomorphicLayoutEffect,
  useMasonryColumns,
  useReducedMotion,
  useRevealObserver,
  useWallLoop,
} from "./wall-hooks";

const ARRIVAL_GLOW_MS = 2800;
/** Quiet gap between one arrival landing and the next taking off. */
const ARRIVAL_SPACING_MS = 2600;
/** How long the landed card keeps its slot wrapper before rendering plainly. */
const SLOT_TEARDOWN_MS = 700;

/**
 * Vertical gap between cards, and between the last card of one copy and the
 * first of the next. Fixed rather than responsive so the loop period is exact.
 */
const CARD_GAP_PX = 20;

type Arrival = { item: Opportunity; direction: "left" | "right" };

type Props = {
  initialItems: Opportunity[];
  kiosk: boolean;
  qrSvg: string | null;
  /** Enables the numpad shortcuts for rehearsing arrivals. */
  debug?: boolean;
};

export default function WallClient({
  initialItems,
  kiosk,
  qrSvg,
  debug = false,
}: Props) {
  const [items, setItems] = useState<Opportunity[]>(initialItems);
  const [arrived, setArrived] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [liveError, setLiveError] = useState(false);

  // Newly approved posts wait here rather than appearing straight away, so each
  // one gets its own entrance instead of several popping in at once.
  const [queue, setQueue] = useState<Opportunity[]>([]);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [slotOpen, setSlotOpen] = useState(false);
  const [landed, setLanded] = useState(false);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [settled, setSettled] = useState<Set<string>>(() => new Set());
  const [pinned, setPinned] = useState<Map<string, number>>(() => new Map());

  const seen = useRef(new Set(initialItems.map((item) => item.id)));

  // Gates the CSS that hides un-revealed cards. Set in a layout effect, so it
  // lands before the browser paints (no flash) but never at all if JS is dead.
  const [revealActive, setRevealActive] = useState(false);
  useIsomorphicLayoutEffect(() => setRevealActive(true), []);

  const reducedMotion = useReducedMotion();
  const columnCount = useColumnCount();
  const columns = useMasonryColumns(items, columnCount, pinned);
  const revealRef = useRevealObserver(!reducedMotion);

  /* ------------------------------------------------------------ loop sizing */

  const trackRef = useRef<HTMLDivElement>(null);
  // The first copy of each column, measured to derive the loop period.
  const firstCopyRefs = useRef<Array<HTMLDivElement | null>>([]);
  // The column wrappers, which carry each column's own gap. Set on the wrapper
  // rather than the copy so every copy of a column inherits the same value.
  const columnRefs = useRef<Array<HTMLDivElement | null>>([]);
  const periodRef = useRef(0);

  const [copies, setCopies] = useState(1);

  // A looping wall needs a finite, repeating set, so reduced motion gets a
  // single copy and an ordinary page instead.
  const wantsLoop = !reducedMotion && items.length > 0;

  useIsomorphicLayoutEffect(() => {
    const track = trackRef.current;
    if (!wantsLoop || !track) {
      periodRef.current = 0;
      track?.style.removeProperty("--nd-period");
      columnRefs.current.forEach((el) =>
        el?.style.removeProperty("--nd-col-gap"),
      );
      setCopies(1);
      return;
    }

    /**
     * A column's card heights, deliberately excluding the gap between them.
     * Measuring the container instead would be circular: we are about to
     * change that gap, which would change the height we just measured.
     */
    const measureColumn = (el: HTMLDivElement | null) => {
      if (!el) return { cards: 0, content: 0 };
      const content = Array.from(el.children).reduce(
        (total, child) => total + child.getBoundingClientRect().height,
        0,
      );
      return { cards: el.children.length, content };
    };

    const measure = () => {
      const shapes = firstCopyRefs.current
        .slice(0, columnCount)
        .map(measureColumn);
      const naturals = shapes.map((shape) =>
        shape.cards > 0 ? shape.content + (shape.cards - 1) * CARD_GAP_PX : 0,
      );
      const tallest = Math.max(0, ...naturals);
      if (tallest <= 0) return;

      // Every copy of every column is given this exact height, so all columns
      // share one wrap distance and none shows a seam. Rounded up to a whole
      // pixel: content heights are fractional, and padding each column out
      // with a fractional margin instead let the columns drift a pixel apart.
      const next = Math.ceil(tallest) + CARD_GAP_PX;
      periodRef.current = next;

      // Written straight to the DOM rather than held in state. While an
      // arrival slot is opening this fires every frame, and re-rendering a
      // hundred cards per frame just to change one number is not affordable.
      track.style.setProperty("--nd-period", `${next}px`);

      // Stretching every column to that one period leaves the shorter ones
      // ending early, which reads as a black hole in the wall - and one at
      // every copy boundary, since the slack repeats. Spreading the slack
      // across the column's own gaps hides it: those cards simply sit a few
      // pixels further apart. Floored to a whole pixel so a column can never
      // overflow its copy and collide with the one below.
      shapes.forEach((shape, index) => {
        const column = columnRefs.current[index];
        if (!column) return;
        const gapCount = shape.cards - 1;
        const gap =
          gapCount > 0
            ? Math.max(
                CARD_GAP_PX,
                Math.floor((next - CARD_GAP_PX - shape.content) / gapCount),
              )
            : CARD_GAP_PX;
        column.style.setProperty("--nd-col-gap", `${gap}px`);
      });

      // Enough copies that a full viewport still sits below the wrap point.
      const needed = Math.max(2, Math.ceil(window.innerHeight / next) + 1);
      setCopies((previous) => (previous === needed ? previous : needed));
    };

    measure();

    const observer = new ResizeObserver(measure);
    firstCopyRefs.current
      .slice(0, columnCount)
      .forEach((el) => el && observer.observe(el));
    window.addEventListener("resize", measure, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [wantsLoop, columnCount, items]);

  useWallLoop({ enabled: wantsLoop, kiosk, trackRef, periodRef });

  useEffect(() => clearConfetti, []);

  /* --------------------------------------------------------------- arrivals */

  /**
   * Picks a card the viewer can actually see and drops the newcomer in above
   * it, so the gap opens on screen rather than somewhere off the top.
   */
  const pickLandingSpot = useCallback((): {
    column: number;
    beforeId: string | null;
  } => {
    const track = trackRef.current;
    if (!track) return { column: 0, beforeId: null };

    const candidates = [...track.querySelectorAll<HTMLElement>("[data-card-id]")]
      .map((el) => ({
        id: el.dataset.cardId ?? "",
        column: Number(el.dataset.column ?? 0),
        rect: el.getBoundingClientRect(),
      }))
      .filter(
        (c) => c.id && c.rect.top > 150 && c.rect.bottom < window.innerHeight - 60,
      );

    if (candidates.length === 0) return { column: 0, beforeId: null };
    const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
    return { column: pick.column, beforeId: pick.id };
  }, []);

  const insertItem = useCallback(
    (item: Opportunity, beforeId: string | null) => {
      setItems((previous) => {
        const index = beforeId
          ? previous.findIndex((existing) => existing.id === beforeId)
          : 0;
        const next = [...previous];
        next.splice(index < 0 ? 0 : index, 0, item);
        // Keep the wall bounded: every extra card lengthens the loop.
        return next.slice(0, WALL_MAX_ITEMS);
      });
    },
    [],
  );

  // Release one queued post at a time, once the previous has landed.
  useEffect(() => {
    if (arrival || queue.length === 0) return;

    const timer = window.setTimeout(() => {
      const [next, ...rest] = queue;
      if (!next) return;
      setQueue(rest);

      if (reducedMotion) {
        // No flight, no confetti - it simply joins the wall.
        insertItem(next, null);
        return;
      }

      const spot = pickLandingSpot();
      setPinned((previous) => new Map(previous).set(next.id, spot.column));
      insertItem(next, spot.beforeId);

      setSlotId(next.id);
      setSlotOpen(false);
      setLanded(false);
      setArrival({
        item: next,
        direction: Math.random() < 0.5 ? "left" : "right",
      });

      // The gap stays shut for now. ArrivalFlight opens it as the card leaves
      // centre stage, so the space finishes appearing just as the card lands.
    }, ARRIVAL_SPACING_MS);

    return () => window.clearTimeout(timer);
  }, [arrival, queue, reducedMotion, pickLandingSpot, insertItem]);

  const handleSettleStart = useCallback(() => setSlotOpen(true), []);

  const handleLanded = useCallback(() => {
    // Belt and braces: if the flight bailed out early the gap may never have
    // been asked to open, and the card would be stuck inside a collapsed slot.
    setSlotOpen(true);
    setLanded(true);
    setArrival(null);

    const id = slotId;
    if (!id) return;

    setArrived((previous) => new Set(previous).add(id));
    window.setTimeout(() => {
      setArrived((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }, ARRIVAL_GLOW_MS);

    // Drop the slot wrapper once it has served its purpose: its overflow
    // clipping would otherwise cut off the card's hover lift and focus ring.
    window.setTimeout(() => {
      setSettled((previous) => new Set(previous).add(id));
      setSlotId((current) => (current === id ? null : current));
    }, SLOT_TEARDOWN_MS);
  }, [slotId]);

  /* ------------------------------------------------------------------ debug */

  // Only ever climbs, so a removed sample is never re-added under an id the
  // masonry still holds a stale column assignment for.
  const debugSequence = useRef(0);

  const clearDebugPosts = useCallback(() => {
    const keep = <T,>(set: Set<T>) =>
      new Set([...set].filter((v) => !isDebugId(String(v))));

    setQueue((previous) => previous.filter((item) => !isDebugId(item.id)));
    setItems((previous) => previous.filter((item) => !isDebugId(item.id)));
    setArrival((previous) =>
      previous && isDebugId(previous.item.id) ? null : previous,
    );
    setSlotId((previous) => (previous && isDebugId(previous) ? null : previous));
    setArrived(keep);
    setSettled(keep);
    setPinned((previous) => {
      const next = new Map(previous);
      for (const id of next.keys()) if (isDebugId(id)) next.delete(id);
      return next;
    });
    seen.current = new Set([...seen.current].filter((id) => !isDebugId(id)));
  }, []);

  useEffect(() => {
    if (!debug) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Numpad first; the plain keys are there for laptops without one.
      const add = event.code === "NumpadAdd" || event.key === "+";
      const remove = event.code === "NumpadSubtract" || event.key === "-";

      if (add) {
        event.preventDefault();
        const post = makeDebugPost(debugSequence.current);
        debugSequence.current += 1;
        seen.current.add(post.id);
        // Straight into the queue, so it takes the same route as a real post.
        setQueue((previous) => [...previous, post]);
      } else if (remove) {
        event.preventDefault();
        clearDebugPosts();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [debug, clearDebugPosts]);

  /* -------------------------------------------------------------- live feed */

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/opportunities?limit=${WALL_MAX_ITEMS}&offset=0`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const page = (await response.json()) as { items: Opportunity[] };
        if (cancelled) return;

        setLiveError(false);

        const fresh = page.items.filter((item) => !seen.current.has(item.id));
        if (fresh.length === 0) return;

        fresh.forEach((item) => seen.current.add(item.id));
        // Queued rather than shown: each one gets its own entrance.
        setQueue((previous) => [...previous, ...fresh]);
      } catch {
        if (!cancelled) setLiveError(true);
      }
    };

    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <>
      {liveError && (
        <p
          role="status"
          className="nd-container-wide mb-4 text-[13px] text-nd-muted"
        >
          Live updates are paused — we will reconnect automatically.
        </p>
      )}

      <div
        ref={trackRef}
        className="flex items-start gap-4 xl:gap-5"
        // Scroll anchoring tries to keep a reference element steady when
        // content shifts, and nudges the position by a few pixels right after
        // the loop's programmatic jump. That reads as jitter at the seam.
        style={{ overflowAnchor: "none" }}
        data-reveal={revealActive ? "on" : undefined}
      >
        {columns.map((column, columnIndex) => (
          <div
            key={columnIndex}
            ref={(el) => {
              columnRefs.current[columnIndex] = el;
            }}
            className="flex min-w-0 flex-1 flex-col"
          >
            {Array.from({ length: copies }, (_, copyIndex) => (
              <div
                key={copyIndex}
                // Fixed to the shared period. The slack below each column's
                // cards is empty space, so the wrap lands on identical pixels.
                style={{ height: "var(--nd-period, auto)", flexShrink: 0 }}
                // Copies past the first are visual filler for the loop. inert
                // keeps them out of the tab order and the accessibility tree,
                // so nothing is announced or focused twice.
                inert={copyIndex > 0}
              >
                <div
                  ref={
                    copyIndex === 0
                      ? (el) => {
                          firstCopyRefs.current[columnIndex] = el;
                        }
                      : undefined
                  }
                  className="flex flex-col"
                  // Inherited from the column wrapper: a column packed short
                  // gets a slightly larger gap so it fills the period exactly.
                  style={{ gap: `var(--nd-col-gap, ${CARD_GAP_PX}px)` }}
                >
                  {column.map((item) => {
                    const inSlot = slotId === item.id;
                    const skipReveal = inSlot || settled.has(item.id);

                    const card = (
                      <OpportunityCard
                        opportunity={item}
                        variant="wall"
                        onOpen={copyIndex === 0 ? setSelected : undefined}
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
        ))}
      </div>

      {arrival && (
        <ArrivalFlight
          key={arrival.item.id}
          item={arrival.item}
          direction={arrival.direction}
          onSettleStart={handleSettleStart}
          onLanded={handleLanded}
        />
      )}

      {debug && (
        <p className="fixed bottom-4 left-4 z-40 rounded-[4px] border border-nd-line bg-nd-surface px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-nd-muted">
          Debug · <span className="text-nd-white">+</span> add sample ·{" "}
          <span className="text-nd-white">−</span> clear samples
          {queue.length > 0 && (
            <span className="text-nd-accent-hi"> · {queue.length} queued</span>
          )}
        </p>
      )}

      {/* Fixed call to action: one panel holding the QR of the submission form
          and the button, sized so the code stays scannable from a few metres
          off the venue screen. Below sm the QR drops away and the pill stands
          on its own, since a phone is already holding the page. */}
      <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
        <div className="flex items-center gap-3 rounded-[8px] shadow-lg shadow-black/50 sm:border sm:border-nd-line sm:bg-nd-surface sm:p-3">
          {qrSvg && (
            <div
              className="hidden h-[72px] w-[72px] shrink-0 rounded-[4px] bg-white p-1.5 sm:block xl:h-20 xl:w-20 [&>svg]:h-full [&>svg]:w-full"
              // Generated server-side by the qrcode package from our own URL.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              // Decorative: the adjacent link is the accessible equivalent and
              // goes to exactly the same place, so announcing both is noise.
              aria-hidden="true"
            />
          )}

          <div className="flex flex-col items-start gap-1.5">
            <Link
              href="/board/new"
              className="nd-btn nd-btn-primary rounded-full px-5 py-2.5 text-[13px]"
            >
              + Post an Opportunity
            </Link>
            {qrSvg && (
              <span className="hidden pl-1 text-[9px] font-bold uppercase tracking-[0.12em] text-nd-muted sm:block">
                Or scan with your phone
              </span>
            )}
          </div>
        </div>
      </div>

      <DetailSheet opportunity={selected} onClose={() => setSelected(null)} />
    </>
  );
}
