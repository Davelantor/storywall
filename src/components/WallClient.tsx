"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { POLL_INTERVAL_MS, WALL_MAX_ITEMS } from "@/lib/constants";
import type { Opportunity } from "@/lib/types";

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

/**
 * Vertical gap between cards, and between the last card of one copy and the
 * first of the next. Fixed rather than responsive so the loop period is exact.
 */
const CARD_GAP_PX = 20;

type Props = {
  initialItems: Opportunity[];
  kiosk: boolean;
  qrSvg: string | null;
};

export default function WallClient({ initialItems, kiosk, qrSvg }: Props) {
  const [items, setItems] = useState<Opportunity[]>(initialItems);
  const [arrived, setArrived] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [liveError, setLiveError] = useState(false);

  const seen = useRef(new Set(initialItems.map((item) => item.id)));

  // Gates the CSS that hides un-revealed cards. Set in a layout effect, so it
  // lands before the browser paints (no flash) but never at all if JS is dead.
  const [revealActive, setRevealActive] = useState(false);
  useIsomorphicLayoutEffect(() => setRevealActive(true), []);

  const reducedMotion = useReducedMotion();
  const columnCount = useColumnCount();
  const columns = useMasonryColumns(items, columnCount);
  const revealRef = useRevealObserver(!reducedMotion);

  /* ------------------------------------------------------------ loop sizing */

  const trackRef = useRef<HTMLDivElement>(null);
  // The first copy of each column, measured to derive the loop period.
  const firstCopyRefs = useRef<Array<HTMLDivElement | null>>([]);
  const periodRef = useRef(0);

  const [copies, setCopies] = useState(1);
  const [period, setPeriod] = useState(0);

  // A looping wall needs a finite, repeating set, so reduced motion gets a
  // single copy and an ordinary page instead.
  const wantsLoop = !reducedMotion && items.length > 0;

  useIsomorphicLayoutEffect(() => {
    if (!wantsLoop) {
      periodRef.current = 0;
      setCopies(1);
      setPeriod(0);
      return;
    }

    const measure = () => {
      const elements = firstCopyRefs.current.slice(0, columnCount);
      const heights = elements.map((el) =>
        el ? el.getBoundingClientRect().height : 0,
      );
      const tallest = Math.max(0, ...heights);
      if (tallest <= 0) return;

      // Every copy of every column is given this exact height, so all columns
      // share one wrap distance and none shows a seam. Rounded up to a whole
      // pixel: content heights are fractional, and padding each column out
      // with a fractional margin instead let the columns drift a pixel apart.
      const next = Math.ceil(tallest) + CARD_GAP_PX;
      periodRef.current = next;
      setPeriod(next);

      // Enough copies that a full viewport still sits below the wrap point.
      setCopies(Math.max(2, Math.ceil(window.innerHeight / next) + 1));
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

  const loop = useWallLoop({ enabled: wantsLoop, kiosk, trackRef, periodRef });

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
        // Keep the wall bounded: it shows the most recent posts, and every
        // extra card lengthens the loop the venue screen has to get through.
        setItems((previous) => [...fresh, ...previous].slice(0, WALL_MAX_ITEMS));
        setArrived((previous) => {
          const next = new Set(previous);
          fresh.forEach((item) => next.add(item.id));
          return next;
        });

        window.setTimeout(() => {
          if (cancelled) return;
          setArrived((previous) => {
            const next = new Set(previous);
            fresh.forEach((item) => next.delete(item.id));
            return next;
          });
        }, ARRIVAL_GLOW_MS);
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
          <div key={columnIndex} className="flex min-w-0 flex-1 flex-col">
            {Array.from({ length: copies }, (_, copyIndex) => (
              <div
                key={copyIndex}
                // Fixed to the shared period. The slack below each column's
                // cards is empty space, so the wrap lands on identical pixels.
                style={period > 0 ? { height: period, flexShrink: 0 } : undefined}
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
                  style={{ gap: `${CARD_GAP_PX}px` }}
                >
                  {column.map((item) => (
                    <div
                      key={`${item.id}-${copyIndex}`}
                      ref={revealRef}
                      className="nd-reveal"
                    >
                      <OpportunityCard
                        opportunity={item}
                        variant="wall"
                        onOpen={copyIndex === 0 ? setSelected : undefined}
                        arrived={arrived.has(item.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

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
