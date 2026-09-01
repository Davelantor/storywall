"use client";

import { useEffect, useRef } from "react";

import { burst } from "@/lib/confetti";
import type { Opportunity } from "@/lib/types";

import OpportunityCard from "./OpportunityCard";

/* The three beats of an arrival. */
const SLIDE_MS = 700; // off-screen edge -> centre stage
const HOLD_MS = 1150; // held above the wall so it can be read
const SETTLE_MS = 780; // centre stage -> its slot
export const ARRIVAL_TOTAL_MS = SLIDE_MS + HOLD_MS + SETTLE_MS;

/** How far down the viewport the card pauses, and how much it grows there. */
const HOLD_Y_FRACTION = 0.3;
const HOLD_SCALE = 1.08;
const HOLD_TILT = -1.5;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/**
 * Brings a newly approved post onto the wall in three beats: it slides in from
 * one edge, holds centre stage above everything else so it can actually be
 * read, then tucks down into the gap that opens for it.
 *
 * The wall keeps scrolling throughout, so the destination is re-read from the
 * live slot element every frame rather than captured once at launch. The slot
 * exists in every loop copy, so we aim at whichever copy is actually on screen.
 */
export default function ArrivalFlight({
  item,
  direction,
  onSettleStart,
  onLanded,
}: {
  item: Opportunity;
  /** Which edge the card is fired in from. */
  direction: "left" | "right";
  /** Fires as the card leaves centre stage, so the gap opens to meet it. */
  onSettleStart: () => void;
  onLanded: () => void;
}) {
  const flightRef = useRef<HTMLDivElement>(null);
  const landedRef = useRef(false);

  useEffect(() => {
    const node = flightRef.current;
    if (!node) return;

    /** The on-screen copy of this card's slot, if there is one. */
    const findSlot = (): DOMRect | null => {
      const slots = document.querySelectorAll<HTMLElement>(
        `[data-arrival-slot="${CSS.escape(item.id)}"]`,
      );
      let best: DOMRect | null = null;
      let bestDistance = Infinity;
      const middle = window.innerHeight / 2;

      slots.forEach((slot) => {
        const rect = slot.getBoundingClientRect();
        if (rect.width === 0) return;
        const distance = Math.abs(rect.top + rect.height / 2 - middle);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = rect;
        }
      });
      return best;
    };

    const initial = findSlot();
    if (!initial) {
      onLanded();
      return;
    }

    const width = initial.width;
    const height = node.getBoundingClientRect().height || 260;

    const startX = direction === "left" ? -width - 80 : window.innerWidth + 80;
    const startY = Math.max(
      70,
      Math.min(window.innerHeight * HOLD_Y_FRACTION, window.innerHeight - 220),
    );
    const startRotation = direction === "left" ? -16 : 16;

    // Centre stage: where it pauses before dropping into place.
    const holdX = Math.max(16, (window.innerWidth - width) / 2);
    const holdY = Math.max(
      70,
      Math.min(
        window.innerHeight * HOLD_Y_FRACTION,
        window.innerHeight - height - 40,
      ),
    );

    node.style.width = `${width}px`;
    node.style.transform = `translate3d(${startX}px, ${startY}px, 0) rotate(${startRotation}deg) scale(0.94)`;

    // Popper firing it in from the edge, aimed across the screen.
    burst(direction === "left" ? 0 : window.innerWidth, startY + 40, {
      angle: direction === "left" ? -Math.PI / 5 : Math.PI + Math.PI / 5,
      spread: Math.PI / 2.4,
      count: 45,
      power: 1000,
    });

    let raf = 0;
    let poppedAtHold = false;
    let announcedSettle = false;
    const begin = performance.now();
    let lastRect = initial;

    const step = (now: number) => {
      const elapsed = now - begin;
      let x: number;
      let y: number;
      let rotation: number;
      let scale: number;

      if (elapsed < SLIDE_MS) {
        /* --- 1. slide in ------------------------------------------------ */
        const t = easeOutCubic(elapsed / SLIDE_MS);
        x = lerp(startX, holdX, t);
        y = lerp(startY, holdY, t);
        rotation = lerp(startRotation, HOLD_TILT, t);
        scale = lerp(0.94, HOLD_SCALE, t);
      } else if (elapsed < SLIDE_MS + HOLD_MS) {
        /* --- 2. hold centre stage --------------------------------------- */
        const t = (elapsed - SLIDE_MS) / HOLD_MS;

        if (!poppedAtHold) {
          poppedAtHold = true;
          burst(holdX + width / 2, holdY + 40, {
            angle: -Math.PI / 2,
            spread: Math.PI * 1.15,
            count: 90,
            power: 1100,
          });
        }

        x = holdX;
        // A slow breath so it reads as floating rather than frozen.
        y = holdY + Math.sin(t * Math.PI * 2) * 4;
        rotation = HOLD_TILT * (1 - easeOutCubic(Math.min(1, t * 3)));
        scale = HOLD_SCALE;
      } else {
        /* --- 3. settle into the slot ------------------------------------ */
        if (!announcedSettle) {
          announcedSettle = true;
          // The gap opens now, so it finishes just as the card arrives.
          onSettleStart();
        }

        const t = Math.min(1, (elapsed - SLIDE_MS - HOLD_MS) / SETTLE_MS);
        const eased = easeInOutCubic(t);
        const target = findSlot() ?? lastRect;
        lastRect = target;

        x = lerp(holdX, target.left, eased);
        y = lerp(holdY, target.top, eased);
        rotation = 0;
        scale = lerp(HOLD_SCALE, 1, eased);

        if (t >= 1) {
          node.style.transform = `translate3d(${target.left}px, ${target.top}px, 0)`;
          if (!landedRef.current) {
            landedRef.current = true;
            onLanded();
          }
          return;
        }
      }

      node.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg) scale(${scale})`;
      raf = window.requestAnimationFrame(step);
    };

    raf = window.requestAnimationFrame(step);

    // requestAnimationFrame is suspended entirely while the tab is in the
    // background, which would strand the card off-screen and block every other
    // post behind it in the queue. Timers are only throttled, not stopped, so
    // this lands it regardless.
    const bail = window.setTimeout(() => {
      if (landedRef.current) return;
      landedRef.current = true;
      onSettleStart();
      onLanded();
    }, ARRIVAL_TOTAL_MS + 2000);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(bail);
    };
  }, [item.id, direction, onSettleStart, onLanded]);

  return (
    <div
      ref={flightRef}
      // Purely decorative duplicate: the real card is already in the DOM inside
      // the slot, so this must not be announced or focusable.
      aria-hidden="true"
      inert
      className="pointer-events-none fixed left-0 top-0 z-[45] will-change-transform"
      style={{ filter: "drop-shadow(0 22px 48px rgba(0,0,0,0.8))" }}
    >
      <OpportunityCard opportunity={item} variant="wall" />
    </div>
  );
}
