"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
   1 on mobile, 2 on tablet, 3-4 on desktop, 5-6 on a venue display.
   ========================================================================== */

const BREAKPOINTS: Array<{ minWidth: number; columns: number }> = [
  { minWidth: 2400, columns: 6 },
  { minWidth: 1900, columns: 5 },
  { minWidth: 1500, columns: 4 },
  { minWidth: 1100, columns: 3 },
  { minWidth: 700, columns: 2 },
  { minWidth: 0, columns: 1 },
];

/**
 * Below this many cards, a column has too few gaps to spread real content
 * variance across, so any difference between its cards' actual heights shows
 * up as one large, visible gap rather than being smoothed into several small
 * ones. A wide venue display asked to fill 6 columns from a dozen posts would
 * hit exactly that - each column gets just one or two gaps, so the ordinary
 * few-percent variance between two posts' text length becomes an obvious
 * void. Capping columns by how much content actually exists keeps every
 * column stocked enough to average that out.
 */
const MIN_CARDS_PER_COLUMN = 4;

export function useColumnCount(itemCount: number): number {
  // Start at 1 so the server and the first client render agree; the effect
  // widens it immediately after mount.
  const [columns, setColumns] = useState(1);

  useIsomorphicLayoutEffect(() => {
    const measure = () => {
      const width = window.innerWidth;
      const match = BREAKPOINTS.find((bp) => width >= bp.minWidth);
      const byWidth = match ? match.columns : 1;
      const byContent = Math.max(
        1,
        Math.floor(itemCount / MIN_CARDS_PER_COLUMN),
      );
      setColumns(Math.max(1, Math.min(byWidth, byContent)));
    };

    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, [itemCount]);

  return columns;
}

/* ==========================================================================
   Masonry distribution
   --------------------------------------------------------------------------
   Cards are packed into the column that leaves the wall best balanced, rather
   than laid out round-robin - which is what produces the uneven,
   storyboard-like waterfall. Height is estimated from content length: cheap,
   deterministic, and good enough because we never force equal heights on the
   wall itself. The loop period does force equal heights on the copies below
   it, though (see WallClient), which is what makes packing quality matter:
   a lopsided assignment shows up there as a visible gap.
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
 * first of the next. Fixed rather than responsive so the loop period is
 * exact. A column packed short widens its own gap from here to fill the
 * period - see `--nd-col-gap` / `.nd-column-stack` in WallClient.
 */
export const CARD_GAP_PX = 20;

/**
 * Assigns each item to a column, keeping earlier assignments stable so that
 * appending a page (or a live arrival) never reshuffles the whole wall.
 * Recomputes from scratch only when the column count changes - which is also
 * the moment a wide screen like a venue display, with many more columns and
 * so far fewer cards in each, needs the best packing it can get: with only a
 * handful of cards per column, one bad assignment is a much larger fraction
 * of that column's content, and shows up as a proportionally larger gap.
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
   Seamless loop
   --------------------------------------------------------------------------
   The wall scrolls itself continuously and wraps without a visible seam.

   How the seam is avoided: WallClient stacks N identical copies of the card
   set, and pads every column so each copy occupies exactly the same vertical
   period P. Once the page has scrolled one full period past the top of the
   track, the pixels on screen are identical to those one period earlier, so
   subtracting P from scrollY is invisible. The wrap runs on manual scrolling
   too, which is what makes it endless rather than merely automatic.

   Exactly one rule governs whether the wall is moving: it scrolls whenever
   the pointer is not resting on a card, and stops the instant it is - no
   delay either way, and nothing else (a click, a keypress, a wheel nudge)
   holds it still or wakes it. Disabled outright when the viewer prefers
   reduced motion - in which case WallClient renders a single copy and the
   page behaves normally.
   ========================================================================== */

const CURSOR_IDLE_MS = 3000;
const PIXELS_PER_SECOND = 26;

export type WallLoopState = { scrolling: boolean; cursorHidden: boolean };

export function useWallLoop({
  enabled,
  kiosk,
  trackRef,
  periodRef,
}: {
  /** False when reduced motion is requested or the period is not measured yet. */
  enabled: boolean;
  /** Kiosk additionally hides the pointer once the screen is idle. */
  kiosk: boolean;
  trackRef: React.RefObject<HTMLElement | null>;
  periodRef: React.RefObject<number>;
}): WallLoopState {
  const [scrolling, setScrolling] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);

  // For cursor-hiding only (kiosk mode) - unrelated to whether the wall moves.
  const lastInteraction = useRef(Date.now());

  // Hovering a card holds the wall still so it can be read. A ref rather than
  // state: it's read straight from the pointer handlers below with no delay,
  // so there's nothing an idle tick needs to reconcile it against.
  const hovering = useRef(false);

  /** Subtracts one whole period once we are far enough in for it to be invisible. */
  const wrap = useCallback(() => {
    const period = periodRef.current;
    const track = trackRef.current;
    if (!track || period <= 0) return;

    // Walk offsetTop rather than using getBoundingClientRect: the rect is
    // fractional and scroll-relative, which made the threshold wobble by a
    // pixel between calls. offsetTop is layout-absolute and stable.
    let trackTop = 0;
    for (let node: HTMLElement | null = track; node; node = node.offsetParent as HTMLElement | null) {
      trackTop += node.offsetTop;
    }

    if (window.scrollY >= trackTop + period) {
      window.scrollTo({ top: window.scrollY - period, behavior: "auto" });
    }
  }, [periodRef, trackRef]);

  // Wrap on manual scrolling as well, so a person flicking down the wall keeps
  // going rather than hitting the bottom of the last copy.
  useEffect(() => {
    if (!enabled) return;
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        wrap();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled, wrap]);

  // Cursor visibility only (kiosk mode) - any activity wakes the pointer, and
  // it hides again after CURSOR_IDLE_MS of quiet. This has no bearing on
  // whether the wall is scrolling; that's governed entirely by hover, below.
  useEffect(() => {
    if (!kiosk) return;

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
    return () => {
      for (const name of events) window.removeEventListener(name, wake);
    };
  }, [kiosk]);

  // The one rule: scrolling stops the instant the pointer rests on a card,
  // and resumes the instant it leaves - no delay in either direction, and
  // nothing else (a click, a keypress, a wheel nudge) affects it. Delegated
  // on the track so it covers every card including the duplicated copies, and
  // keeps working as cards come and go.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !enabled) {
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

    track.addEventListener("pointerover", onOver);
    track.addEventListener("pointerout", onOut);
    return () => {
      track.removeEventListener("pointerover", onOver);
      track.removeEventListener("pointerout", onOut);
    };
  }, [enabled, trackRef]);

  // Cursor-hide idle clock (kiosk only) - independent of the scroll rule above.
  useEffect(() => {
    if (!kiosk) {
      setCursorHidden(false);
      return;
    }

    const tick = () => {
      setCursorHidden(Date.now() - lastInteraction.current > CURSOR_IDLE_MS);
    };

    tick();
    const id = window.setInterval(tick, 150);
    return () => window.clearInterval(id);
  }, [kiosk]);

  // The scroll loop.
  useEffect(() => {
    if (!enabled || !scrolling) return;

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
        window.scrollBy(0, whole);
        wrap();
      }

      frame = window.requestAnimationFrame(step);
    };

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [enabled, scrolling, wrap]);

  // Pointer hiding for the unattended screen.
  useEffect(() => {
    const root = document.documentElement;
    if (kiosk && cursorHidden) root.classList.add("nd-cursor-hidden");
    else root.classList.remove("nd-cursor-hidden");
    return () => root.classList.remove("nd-cursor-hidden");
  }, [kiosk, cursorHidden]);

  return { scrolling, cursorHidden };
}
