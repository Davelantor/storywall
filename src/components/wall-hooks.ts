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

export function useColumnCount(): number {
  // Start at 1 so the server and the first client render agree; the effect
  // widens it immediately after mount.
  const [columns, setColumns] = useState(1);

  useIsomorphicLayoutEffect(() => {
    const measure = () => {
      const width = window.innerWidth;
      const match = BREAKPOINTS.find((bp) => width >= bp.minWidth);
      setColumns(match ? match.columns : 1);
    };

    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);

  return columns;
}

/* ==========================================================================
   Masonry distribution
   --------------------------------------------------------------------------
   Cards are packed into the currently shortest column rather than laid out
   round-robin, which is what produces the uneven, storyboard-like waterfall.
   Height is estimated from content length: cheap, deterministic, and good
   enough because we never force equal heights on the wall.
   ========================================================================== */

function estimateHeight(item: Opportunity): number {
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
 * Assigns each item to a column, keeping earlier assignments stable so that
 * appending a page (or a live arrival) never reshuffles the whole wall.
 * Recomputes from scratch only when the column count changes.
 */
export function useMasonryColumns(
  items: Opportunity[],
  columnCount: number,
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
      let shortest = 0;
      for (let c = 1; c < columnCount; c += 1) {
        if (heights.current[c]! < heights.current[shortest]!) shortest = c;
      }
      assignment.current.set(item.id, shortest);
      heights.current[shortest] += estimateHeight(item);
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
  }, [items, columnCount]);
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

   Auto-scroll pauses on any interaction and resumes after 10s of quiet, and is
   disabled outright when the viewer prefers reduced motion - in which case
   WallClient renders a single copy and the page behaves normally.
   ========================================================================== */

const CURSOR_IDLE_MS = 3000;
const RESUME_IDLE_MS = 10_000;
/** How long after the pointer leaves a card before the wall starts moving again. */
const HOVER_RESUME_MS = 1000;
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

  const lastInteraction = useRef(Date.now());
  const pausedUntil = useRef(Date.now() + 1200);

  // Hovering a card holds the wall still so it can be read. Refs rather than
  // state: the idle tick below is the single place that decides whether the
  // wall moves, and re-rendering on every pointer crossing would be wasteful.
  const hovering = useRef(false);
  const hoverLeftAt = useRef(0);

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

  // Deliberately taking control - scrolling, typing, tapping - holds the wall
  // for the full 10s. Plain pointer movement is not in this list: with
  // hover-to-pause below, moving the mouse across the screen should not stop
  // the wall, only coming to rest on a card should.
  useEffect(() => {
    if (!enabled && !kiosk) return;

    const takeControl = () => {
      const now = Date.now();
      lastInteraction.current = now;
      pausedUntil.current = now + RESUME_IDLE_MS;
      setCursorHidden(false);
      setScrolling(false);
    };

    // Movement alone only wakes the pointer back up for kiosk mode.
    const wakePointer = () => {
      lastInteraction.current = Date.now();
      setCursorHidden(false);
    };

    const controlEvents: Array<keyof WindowEventMap> = [
      "mousedown",
      "wheel",
      "touchstart",
      "touchmove",
      "keydown",
    ];

    for (const name of controlEvents)
      window.addEventListener(name, takeControl, { passive: true });
    window.addEventListener("mousemove", wakePointer, { passive: true });

    return () => {
      for (const name of controlEvents)
        window.removeEventListener(name, takeControl);
      window.removeEventListener("mousemove", wakePointer);
    };
  }, [enabled, kiosk]);

  // Hover-to-pause, delegated on the track so it covers every card including
  // the duplicated copies, and keeps working as cards come and go.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !enabled) return;

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
      hoverLeftAt.current = Date.now();
    };

    track.addEventListener("pointerover", onOver);
    track.addEventListener("pointerout", onOut);
    return () => {
      track.removeEventListener("pointerover", onOver);
      track.removeEventListener("pointerout", onOut);
    };
  }, [enabled, trackRef]);

  // Idle clock: pointer at 3s, auto-scroll resumes at 10s.
  useEffect(() => {
    if (!enabled && !kiosk) {
      setScrolling(false);
      setCursorHidden(false);
      return;
    }

    const tick = () => {
      const now = Date.now();
      setCursorHidden(kiosk && now - lastInteraction.current > CURSOR_IDLE_MS);
      setScrolling(
        enabled &&
          now > pausedUntil.current &&
          !hovering.current &&
          now - hoverLeftAt.current > HOVER_RESUME_MS,
      );
    };

    tick();
    // Fast enough that the 1s hover resume lands close to on time.
    const id = window.setInterval(tick, 150);
    return () => window.clearInterval(id);
  }, [enabled, kiosk]);

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
