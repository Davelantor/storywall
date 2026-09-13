"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type ColumnsPreference,
  COLUMNS_CHANGE_EVENT,
  readColumnsPreference,
} from "@/lib/columns";
import type { Opportunity } from "@/lib/types";

/**
 * useLayoutEffect on the client, useEffect on the server. Lets us widen the
 * masonry from its one-column server render before the browser paints, so
 * there is no visible single-column flash on load.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ==========================================================================
   prefers-reduced-motion
   ========================================================================== */

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return reduced;
}

/* ==========================================================================
   Responsive column count
   --------------------------------------------------------------------------
   Driven purely by viewport width against each column's own hard cap
   (max-width: 520px, WALL_COLUMN_MAX_WIDTH in WallColumn.tsx) rather than a
   handful of fixed breakpoints. Fixed breakpoints leave a wide gap between
   whichever step they land on and the next: a venue display at 2560px, say,
   sat on the same column count as 1900px and rendered columns nowhere near
   their 520px cap, leaving the row visibly short of the screen edges instead
   of filling it. Computing the *minimum* number of columns whose combined
   max-width can span the viewport scales continuously instead - 1080p, 1440p,
   4K, and everything in between all get exactly enough columns to fill the
   row edge to edge (each stretching up to, but never past, its own cap via
   `flex: 1 1 0` on `.nd-wall-column`), with no jump discontinuities.

   Deliberately independent of how many posts exist: the wall is meant to
   read as a full row of columns from the very first frame, before a single
   post has arrived, not just once enough content exists to justify them. An
   earlier version also capped the count by content (so a handful of posts
   wouldn't loop through only one or two cards each) - that capping is what
   caused the count to visibly collapse to a single column at zero posts and
   then jump around as the first few arrived. Columns start empty and simply
   fill in as posts land.
   ========================================================================== */

/** Must match WALL_COLUMN_MAX_WIDTH in WallColumn.tsx / .nd-wall-column. */
const COLUMN_MAX_WIDTH_PX = 520;

const MIN_COLUMNS = 1;
/** Hard ceiling regardless of width - keeps DOM cost (N copies per column)
 * bounded on absurdly wide displays rather than chasing every extra pixel. */
const MAX_COLUMNS = 8;

function columnsForWidth(width: number): number {
  const needed = Math.ceil(width / COLUMN_MAX_WIDTH_PX);
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, needed));
}

export function useColumnCount(
  /**
   * True whenever nothing is arriving right now - the queue is empty and no
   * flight is in the air. `useMasonryColumns` reassigns every card from
   * scratch whenever the column count changes, so recomputing it mid-arrival
   * (a resize landing mid-animation, or a manual override from
   * ColumnsSelect) would reshuffle cards across every column while one of
   * them is still mid-animation: exactly the flicker a continuously-running
   * display must not have. Recomputing only at a quiet moment defers that
   * change until the wall is idle again, same as an item-count change would.
   */
  idle: boolean,
): number {
  // Start at 1 so the server and the first client render agree; the effect
  // widens it immediately after mount.
  const [columns, setColumns] = useState(1);

  // "auto" (the default, unset preference) until read from localStorage -
  // unknown during SSR, so this can't be the initial state above without
  // mismatching the server render. ColumnsSelect can't just write this prop
  // directly (it isn't a descendant of whichever WallColumn mounted this
  // hook - see writeColumnsPreference), so this also listens for its event.
  const [preference, setPreference] = useState<ColumnsPreference>("auto");

  useEffect(() => {
    setPreference(readColumnsPreference());
    const onChange = (event: Event) => {
      setPreference((event as CustomEvent<ColumnsPreference>).detail);
    };
    window.addEventListener(COLUMNS_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(COLUMNS_CHANGE_EVENT, onChange);
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!idle) return;

    const measure = () =>
      setColumns(preference === "auto" ? columnsForWidth(window.innerWidth) : preference);

    measure();
    if (preference !== "auto") return;

    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, [idle, preference]);

  return columns;
}

/* ==========================================================================
   Masonry distribution
   --------------------------------------------------------------------------
   Cards are packed into the column that leaves the wall best balanced, rather
   than laid out round-robin - which is what produces the uneven,
   storyboard-like waterfall. Height is estimated from content length: cheap,
   deterministic, and good enough because columns are never forced to equal
   heights - each column's own loop period (see WallColumn) is simply
   whatever its own content adds up to. Packing quality only affects how even
   the columns *look* next to each other, not the loop itself; a column left
   noticeably taller or shorter than its neighbours just runs a longer or
   shorter cycle.
   ========================================================================== */

export function estimateHeight(item: Opportunity): number {
  const CHARS_PER_LINE = 34;
  const LINE_HEIGHT = 23;

  // Mirrors what a Wall card actually renders: title, detail, an optional
  // location line and the contact row. No badge, organisation or tags - those
  // are Board-only, so counting them here would skew the column packing.
  let height = 76; // contact row + card padding
  height += Math.ceil(item.title.length / 24) * 25; // title lines
  height += Math.ceil(item.detail.length / CHARS_PER_LINE) * LINE_HEIGHT;
  if (item.location || item.work_mode) height += 20;
  return height;
}

/**
 * Vertical gap between cards, and between the last card of one copy and the
 * first of the next. Fixed rather than responsive so each column's own loop
 * period is exact - see `.nd-column-stack` in WallColumn.
 */
export const CARD_GAP_PX = 20;

/**
 * Assigns each item to a column, keeping earlier assignments stable so that
 * appending a page (or a live arrival) never reshuffles the whole wall.
 * Recomputes from scratch only when the column count changes - which is also
 * the moment a wide screen like a venue display, with many more columns and
 * so far fewer cards in each, needs the best packing it can get: with only a
 * handful of cards per column, one bad assignment is a much larger fraction
 * of that column's content, and shows up as a visibly longer or shorter loop
 * cycle next to its neighbours.
 *
 * Each item goes into whichever column currently holds the least total
 * content. A fancier one-step look-ahead - simulating the per-card gap each
 * candidate would leave the *whole wall* needing - was tried and made things
 * worse: comparing a candidate against a column that's already run ahead
 * makes every other choice look artificially catastrophic by comparison
 * (it's being measured against a period that column's own past growth set),
 * so the metric kept recommending the already-largest column and the
 * imbalance fed on itself. Comparing current totals doesn't have that
 * feedback loop, because every comparison is against the same today, not
 * against whichever column happens to be biggest today.
 */
export function useMasonryColumns(
  items: Opportunity[],
  columnCount: number,
  /**
   * Column overrides by id. An arriving post is dropped next to a card the
   * viewer can actually see, so its column is chosen by the arrival rather
   * than by the packer below.
   */
  pinned?: Map<string, number>,
): Opportunity[][] {
  const assignment = useRef(new Map<string, number>());
  const heights = useRef<number[]>([]);
  const lastColumnCount = useRef(columnCount);

  return useMemo(() => {
    if (lastColumnCount.current !== columnCount) {
      assignment.current.clear();
      lastColumnCount.current = columnCount;
    }
    if (heights.current.length !== columnCount) {
      heights.current = new Array<number>(columnCount).fill(0);
      assignment.current.clear();
    }

    for (const item of items) {
      if (assignment.current.has(item.id)) continue;

      const forced = pinned?.get(item.id);
      let target: number;
      if (forced !== undefined) {
        target = Math.max(0, Math.min(forced, columnCount - 1));
      } else {
        target = 0;
        for (let c = 1; c < columnCount; c += 1) {
          if (heights.current[c]! < heights.current[target]!) target = c;
        }
      }

      assignment.current.set(item.id, target);
      heights.current[target] += estimateHeight(item);
    }

    const columns: Opportunity[][] = Array.from(
      { length: columnCount },
      () => [],
    );
    for (const item of items) {
      const column = assignment.current.get(item.id) ?? 0;
      columns[Math.min(column, columnCount - 1)]!.push(item);
    }
    return columns;
  }, [items, columnCount, pinned]);
}

/* ==========================================================================
   Scroll reveal
   --------------------------------------------------------------------------
   Cards fade and rise as they enter the viewport. Entries that intersect in the
   same callback are staggered by 70ms so a row arrives as a wave, not a block.
   ========================================================================== */

export function useRevealObserver(enabled: boolean) {
  const observer = useRef<IntersectionObserver | null>(null);
  const pending = useRef(new Set<HTMLElement>());

  const reveal = useCallback((node: HTMLElement, delayMs: number) => {
    node.style.setProperty("--nd-delay", `${delayMs}ms`);
    node.dataset.revealed = "true";
    pending.current.delete(node);
    observer.current?.unobserve(node);
  }, []);

  // Built on first use rather than in an effect. Ref callbacks fire before
  // effects, so an effect-created observer would miss every card of the first
  // render - they would sit at opacity 0 forever.
  const getObserver = useCallback(() => {
    if (typeof window === "undefined") return null;
    observer.current ??= new IntersectionObserver(
      (entries) => {
        let staggerIndex = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target as HTMLElement, staggerIndex * 70);
          staggerIndex += 1;
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    return observer.current;
  }, [reveal]);

  // Safety net. IntersectionObserver callbacks are throttled - and in some
  // browsers suppressed entirely - while a tab is backgrounded or occluded, so
  // a wall loaded out of view could otherwise stay blank. This sweeps any card
  // that is actually within the viewport and reveals it directly. Cards further
  // down are still left to the observer, which keeps the scroll-reveal intact.
  useEffect(() => {
    if (!enabled) return;

    const sweep = () => {
      let staggerIndex = 0;
      for (const node of [...pending.current]) {
        const box = node.getBoundingClientRect();
        const onScreen = box.top < window.innerHeight && box.bottom > 0;
        if (!onScreen) continue;
        reveal(node, staggerIndex * 70);
        staggerIndex += 1;
      }
    };

    const timer = window.setTimeout(sweep, 700);
    const onVisibility = () => {
      if (document.visibilityState === "visible") sweep();
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, reveal]);

  useEffect(
    () => () => {
      observer.current?.disconnect();
      observer.current = null;
      pending.current.clear();
    },
    [],
  );

  /** Ref callback to attach to each card wrapper. */
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      if (!enabled) {
        node.dataset.revealed = "true";
        return;
      }
      if (node.dataset.revealed === "true") return;
      pending.current.add(node);
      getObserver()?.observe(node);
    },
    [enabled, getObserver],
  );
}

/* ==========================================================================
   Per-column seamless loop
   --------------------------------------------------------------------------
   Every column is its own independent scroll container - own scrollTop, own
   period, own hover-pause - rather than the whole wall sharing one window
   scroll and one period. There is no state shared between columns at all, so
   a card landing in one can never move the cards in another: there is
   nothing left for it to move.

   How the seam is avoided: WallColumn stacks N identical copies of its own
   card list, each forced to the same integer height - its own period P.
   Once the column has scrolled one full period, the pixels on screen are
   identical to those one period earlier, so subtracting P from its own
   scrollTop is invisible. The wrap runs on manual scrolling too, which is
   what makes it endless in both directions rather than merely automatic.

   Exactly one rule governs whether a column is moving: it scrolls whenever
   the pointer is not resting on one of its own cards, and stops the instant
   it is - no delay either way, and nothing else (a click, a keypress, a
   wheel nudge) holds it still or wakes it. Hovering a card in one column has
   no effect on any other. Disabled outright when the viewer prefers reduced
   motion - in which case WallColumn renders a single copy and behaves like
   ordinary static content.
   ========================================================================== */

const PIXELS_PER_SECOND = 26;

export function useColumnLoop({
  enabled,
  containerRef,
  periodRef,
}: {
  /** False when reduced motion is requested or the period is not measured yet. */
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  periodRef: React.RefObject<number>;
}): boolean {
  const [scrolling, setScrolling] = useState(false);

  // Read straight from the pointer handlers below with no delay, so there is
  // nothing an idle tick needs to reconcile it against.
  const hovering = useRef(false);

  /** Subtracts one whole period once scrolled far enough for it to be invisible. */
  const wrap = useCallback(() => {
    const el = containerRef.current;
    const period = periodRef.current;
    if (!el || period <= 0) return;
    if (el.scrollTop >= period) el.scrollTop -= period;
  }, [containerRef, periodRef]);

  // Wrap on manual scrolling too (wheel/touch inside this column), so it is
  // endless in both directions, not just under the auto-scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        wrap();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [enabled, wrap, containerRef]);

  // The one rule, scoped to this column's own container only.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) {
      setScrolling(false);
      return;
    }

    const cardUnder = (node: EventTarget | null) =>
      node instanceof Element ? node.closest("article") : null;

    const onOver = (event: PointerEvent) => {
      if (!cardUnder(event.target)) return;
      hovering.current = true;
      setScrolling(false);
    };

    const onOut = (event: PointerEvent) => {
      if (!cardUnder(event.target)) return;
      // Ignore crossings between elements inside the same card.
      if (cardUnder(event.relatedTarget)) return;
      hovering.current = false;
      setScrolling(true);
    };

    hovering.current = false;
    setScrolling(true);

    el.addEventListener("pointerover", onOver);
    el.addEventListener("pointerout", onOut);
    return () => {
      el.removeEventListener("pointerover", onOver);
      el.removeEventListener("pointerout", onOut);
    };
  }, [enabled, containerRef]);

  // The scroll loop.
  useEffect(() => {
    if (!enabled || !scrolling) return;
    const el = containerRef.current;
    if (!el) return;

    let frame = 0;
    let previous = performance.now();
    let carry = 0;

    const step = (timestamp: number) => {
      const deltaMs = Math.min(64, timestamp - previous);
      previous = timestamp;

      carry += (PIXELS_PER_SECOND * deltaMs) / 1000;
      const whole = Math.floor(carry);
      if (whole > 0) {
        carry -= whole;
        el.scrollTop += whole;
        wrap();
      }

      frame = window.requestAnimationFrame(step);
    };

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [enabled, scrolling, wrap, containerRef]);

  return scrolling;
}

/**
 * Kiosk-only cursor hiding: any activity anywhere on the page wakes the
 * pointer, and it hides again after CURSOR_IDLE_MS of quiet. Page-level and
 * independent of any one column, unlike scrolling above.
 */
const CURSOR_IDLE_MS = 3000;

export function useCursorIdle(kiosk: boolean): void {
  const [cursorHidden, setCursorHidden] = useState(false);
  const lastInteraction = useRef(Date.now());

  useEffect(() => {
    if (!kiosk) {
      setCursorHidden(false);
      return;
    }

    const wake = () => {
      lastInteraction.current = Date.now();
      setCursorHidden(false);
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "wheel",
      "touchstart",
      "touchmove",
      "keydown",
    ];
    for (const name of events) window.addEventListener(name, wake, { passive: true });

    const tick = () => {
      setCursorHidden(Date.now() - lastInteraction.current > CURSOR_IDLE_MS);
    };
    tick();
    const id = window.setInterval(tick, 150);

    return () => {
      for (const name of events) window.removeEventListener(name, wake);
      window.clearInterval(id);
    };
  }, [kiosk]);

  useEffect(() => {
    const root = document.documentElement;
    if (kiosk && cursorHidden) root.classList.add("nd-cursor-hidden");
    else root.classList.remove("nd-cursor-hidden");
    return () => root.classList.remove("nd-cursor-hidden");
  }, [kiosk, cursorHidden]);
}
