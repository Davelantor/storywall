"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { clearConfetti } from "@/lib/confetti";
import { isDebugId, makeDebugPost } from "@/lib/debug-samples";
import { POLL_INTERVAL_MS, WALL_MAX_ITEMS } from "@/lib/constants";
import type { Opportunity } from "@/lib/types";

import ArrivalFlight from "./ArrivalFlight";
import DetailSheet from "./DetailSheet";
import WallColumn from "./WallColumn";
import {
  estimateHeight,
  useColumnCount,
  useCursorIdle,
  useIsomorphicLayoutEffect,
  useMasonryColumns,
  useReducedMotion,
} from "./wall-hooks";

const ARRIVAL_GLOW_MS = 2800;
/** Quiet gap between one arrival landing and the next taking off - releasing
 * several posts in a row should trickle onto the wall, not rush it. */
const ARRIVAL_SPACING_MS = 5000;
/** How long the landed card keeps its slot wrapper before rendering plainly. */
const SLOT_TEARDOWN_MS = 700;
/** How often to check whether a pending removal has scrolled out of view. */
const REMOVAL_CHECK_MS = 400;
// Safety valve for columns sparse enough that one loop period never fully
// fits below the viewport - the straddle guard in the removal check below
// would otherwise wait forever. Any pending id stuck straddling past this
// many ms is dropped regardless, accepting the rare visible shift.
const REMOVAL_STRADDLE_TIMEOUT_MS = 6000;

type Arrival = { item: Opportunity; direction: "left" | "right" };

type Props = {
  initialItems: Opportunity[];
  kiosk: boolean;
  qrSvg: string | null;
  /** QR code for the full board, used by the "See the full board" panel. */
  boardQrSvg: string | null;
  /** Enables the numpad shortcuts for rehearsing arrivals. */
  debug?: boolean;
};

export default function WallClient({
  initialItems,
  kiosk,
  qrSvg,
  boardQrSvg,
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

  // A card marked for removal keeps rendering exactly as before - full size,
  // full opacity, still clickable - nothing about it changes right away.
  // Instead a periodic check (see the effect below) watches for the moment
  // every rendered copy of it has scrolled fully out of view, and only then
  // actually drops it from `items`. By that point nothing on screen was
  // showing it, so the drop - and the reflow it causes - happens somewhere
  // nobody is currently looking, rather than as a visible cut or animation.
  const [pendingRemoval, setPendingRemoval] = useState<Set<string>>(
    () => new Set(),
  );

  const seen = useRef(new Set(initialItems.map((item) => item.id)));

  // Gates the CSS that hides un-revealed cards. Set in a layout effect, so it
  // lands before the browser paints (no flash) but never at all if JS is dead.
  const [revealActive, setRevealActive] = useState(false);
  useIsomorphicLayoutEffect(() => setRevealActive(true), []);

  const reducedMotion = useReducedMotion();
  // Recomputing the column count reshuffles every column's card assignment
  // (see useMasonryColumns), so it's only allowed to happen when nothing is
  // actively arriving - otherwise a queue draining several posts in a row
  // would reshuffle the whole wall mid-animation.
  const columnCount = useColumnCount(!arrival && queue.length === 0);
  const columns = useMasonryColumns(items, columnCount, pinned);
  useCursorIdle(kiosk);
  useEffect(() => clearConfetti, []);

  // Wraps every column, purely so pickLandingSpot can search across all of
  // them without needing a ref into each individual WallColumn.
  const rowRef = useRef<HTMLDivElement>(null);

  /* --------------------------------------------------------------- arrivals */

  /**
   * Picks a card the viewer can actually see and drops the newcomer in above
   * it, so the gap opens on screen rather than somewhere off the top.
   *
   * Restricted to the lower part of the viewport on purpose: every column
   * keeps auto-scrolling upward throughout the whole arrival, so a gap that
   * opened near the top would ride most of the way off-screen before the
   * flight even finishes settling into it. Biasing the pick toward the lower
   * band means the newcomer lands somewhere the viewer still has time to
   * actually see, rather than right at the edge it's about to scroll past.
   */
  const pickLandingSpot = useCallback((): {
    column: number;
    beforeId: string | null;
  } => {
    const row = rowRef.current;
    if (!row) return { column: 0, beforeId: null };

    // Any card that overlaps the lower band qualifies - it doesn't need to
    // fit inside it whole. Requiring full containment excluded every card
    // taller than the band from ever being a candidate, which meant whichever
    // column happened to hold the tallest cards could never be picked as a
    // landing spot even when it was the shortest overall.
    const lowerBandTop = window.innerHeight * 0.55;
    const candidates = [...row.querySelectorAll<HTMLElement>("[data-card-id]")]
      .map((el) => ({
        id: el.dataset.cardId ?? "",
        column: Number(el.dataset.column ?? 0),
        rect: el.getBoundingClientRect(),
      }))
      .filter(
        (c) =>
          c.id && c.rect.bottom > lowerBandTop && c.rect.top < window.innerHeight - 60,
      );

    if (candidates.length === 0) return { column: 0, beforeId: null };

    // Among the columns the viewer can see, favour the one with the least
    // total content - the same rule the initial packer uses, so an arrival
    // balances the wall the same way loading it in the first place does.
    // Estimated rather than measured from the DOM: each column now manages
    // its own layout privately, so this is the same heuristic the packer
    // itself trusts for the same decision.
    const contentByColumn = columns.map((column) =>
      column.reduce((total, item) => total + estimateHeight(item), 0),
    );
    const shortest = candidates.reduce((best, candidate) => {
      const height = contentByColumn[candidate.column] ?? Infinity;
      const bestHeight = contentByColumn[best] ?? Infinity;
      return height < bestHeight ? candidate.column : best;
    }, candidates[0]!.column);

    const inColumn = candidates.filter((c) => c.column === shortest);
    const pick = inColumn[Math.floor(Math.random() * inColumn.length)]!;
    return { column: pick.column, beforeId: pick.id };
  }, [columns]);

  const insertItem = useCallback(
    (item: Opportunity, beforeId: string | null) => {
      setItems((previous) => {
        const index = beforeId
          ? previous.findIndex((existing) => existing.id === beforeId)
          : 0;
        const next = [...previous];
        next.splice(index < 0 ? 0 : index, 0, item);
        // Keep the wall bounded: every extra card lengthens its column's loop.
        return next.slice(0, WALL_MAX_ITEMS);
      });
    },
    [],
  );

  /**
   * Marks a card for removal without touching `items` yet. The card keeps
   * rendering exactly as it was - the periodic check below is what actually
   * drops it, once every rendered copy of it is off screen.
   */
  const removeCard = useCallback(
    (id: string) => {
      if (!items.some((item) => item.id === id)) return; // nothing to remove
      // A card actively flying in isn't a candidate: it hasn't settled into
      // the wall yet, and pickRemovalTarget already excludes it, but a
      // direct call here (moderation, say) should be just as safe.
      if (id === slotId) return;

      if (reducedMotion) {
        // No auto-scroll to eventually carry it off screen, so there's
        // nothing to wait for - drop it immediately instead of marking it
        // pending forever.
        setItems((previous) => previous.filter((item) => item.id !== id));
        return;
      }

      setPendingRemoval((previous) =>
        previous.has(id) ? previous : new Set(previous).add(id),
      );
    },
    [items, reducedMotion, slotId],
  );

  /**
   * Drops a card the moment the poll finds it no longer `live` server-side
   * (pulled or rejected from admin) - unlike `removeCard`, this does not wait
   * for it to scroll out of view first. A moderator pulling a post wants it
   * gone from the wall right away, not whenever the loop happens to carry it
   * off screen. Every branch uses a functional update (or is a no-op if the
   * id isn't present), so this has no dependencies and stays referentially
   * stable across renders - safe to call from the poll's interval closure.
   */
  const removeCardImmediately = useCallback((id: string) => {
    setQueue((previous) => previous.filter((item) => item.id !== id));
    setItems((previous) => previous.filter((item) => item.id !== id));
    setPendingRemoval((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setPinned((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
    setArrived((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setSettled((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setSlotId((current) => (current === id ? null : current));
    // If this id is the one currently mid-flight, cancel the flight outright
    // rather than let it land somewhere the moderator already pulled it from.
    setArrival((current) => {
      if (!current || current.item.id !== id) return current;
      setSlotOpen(false);
      setLanded(false);
      return null;
    });
  }, []);

  /** A currently-visible card not already pending removal, for the debug shortcut. */
  const pickRemovalTarget = useCallback((): string | null => {
    const row = rowRef.current;
    if (!row) return null;

    const candidates = [...row.querySelectorAll<HTMLElement>("[data-card-id]")]
      .map((el) => ({ id: el.dataset.cardId ?? "", rect: el.getBoundingClientRect() }))
      .filter(
        (c) =>
          c.id &&
          c.id !== slotId &&
          !pendingRemoval.has(c.id) &&
          c.rect.bottom > 150 &&
          c.rect.top < window.innerHeight - 60,
      );

    if (candidates.length === 0) return null;
    const uniqueIds = [...new Set(candidates.map((c) => c.id))];
    return uniqueIds[Math.floor(Math.random() * uniqueIds.length)]!;
  }, [slotId, pendingRemoval]);

  // The actual drop. Runs on an interval rather than off scroll events -
  // every column scrolls independently, so there's no one scroll signal to
  // hook into - checking periodically whether every rendered copy of a
  // pending id has left its own column's visible bounds is simpler and cheap
  // at the scale a handful of pending removals ever reaches.
  const pendingSinceRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (pendingRemoval.size === 0) {
      pendingSinceRef.current.clear();
      return;
    }

    const check = () => {
      const row = rowRef.current;
      if (!row) return;

      const now = performance.now();
      const toDrop: string[] = [];
      pendingRemoval.forEach((id) => {
        const elements = [
          ...row.querySelectorAll<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`),
        ];
        if (elements.length === 0) return;

        const stillVisible = elements.some((el) => {
          const column = el.closest<HTMLElement>(".nd-wall-column");
          const bounds = column?.getBoundingClientRect();
          const rect = el.getBoundingClientRect();
          const top = bounds?.top ?? 0;
          const bottom = bounds?.bottom ?? window.innerHeight;
          return rect.bottom > top && rect.top < bottom;
        });
        if (stillVisible) {
          pendingSinceRef.current.delete(id);
          return;
        }

        // Dropping the item changes its column's loop period, which shifts
        // every later copy - WallColumn compensates with a single scroll
        // offset that can only anchor one copy at a time. If the viewport
        // currently straddles two copies of this column, the un-anchored
        // sliver would visibly jump even though the removed card itself is
        // off screen. Waiting for a moment when the viewport sits entirely
        // inside one copy makes the compensation exact by construction.
        // Columns sparse enough that a whole period fits inside the
        // viewport would straddle forever, so a card stuck waiting past
        // REMOVAL_STRADDLE_TIMEOUT_MS is dropped anyway rather than never.
        const column = elements[0]!.closest<HTMLElement>(".nd-wall-column");
        if (column) {
          const period = parseFloat(
            getComputedStyle(column).getPropertyValue("--nd-period"),
          );
          if (period > 0) {
            const viewTop = column.scrollTop;
            const viewBottom = viewTop + column.clientHeight;
            const straddling =
              Math.floor(viewTop / period) !==
              Math.floor((viewBottom - 1) / period);
            if (straddling) {
              const since = pendingSinceRef.current.get(id) ?? now;
              pendingSinceRef.current.set(id, since);
              if (now - since < REMOVAL_STRADDLE_TIMEOUT_MS) return;
            }
          }
        }

        pendingSinceRef.current.delete(id);
        toDrop.push(id);
      });

      if (toDrop.length === 0) return;

      setItems((previous) => previous.filter((item) => !toDrop.includes(item.id)));
      setPendingRemoval((previous) => {
        const next = new Set(previous);
        toDrop.forEach((id) => next.delete(id));
        return next;
      });
    };

    check();
    const interval = window.setInterval(check, REMOVAL_CHECK_MS);
    return () => window.clearInterval(interval);
  }, [pendingRemoval]);

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
    setPendingRemoval(keep);
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
      const clear = event.code === "NumpadSubtract" || event.key === "-";
      // Delete rather than a numpad key: "mark for removal" isn't part of
      // the same +/- pair (clear wipes every sample instantly; this quietly
      // schedules exactly one card, debug or real) and reads better on its
      // own key. Nothing visibly happens until it scrolls out of view.
      const markForRemoval = event.key === "Delete" || event.key === "Backspace";

      if (add) {
        event.preventDefault();
        const post = makeDebugPost(debugSequence.current);
        debugSequence.current += 1;
        seen.current.add(post.id);
        // Straight into the queue, so it takes the same route as a real post.
        setQueue((previous) => [...previous, post]);
      } else if (clear) {
        event.preventDefault();
        clearDebugPosts();
      } else if (markForRemoval) {
        event.preventDefault();
        const target = pickRemovalTarget();
        if (target) removeCard(target);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [debug, clearDebugPosts, pickRemovalTarget, removeCard]);

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

        const presentIds = new Set(page.items.map((item) => item.id));

        const fresh = page.items.filter((item) => !seen.current.has(item.id));
        fresh.forEach((item) => seen.current.add(item.id));
        // Queued rather than shown: each one gets its own entrance.
        if (fresh.length > 0) setQueue((previous) => [...previous, ...fresh]);

        // Anything we previously believed was live but the server no longer
        // returns has been pulled or rejected - take it off the wall right
        // away. Debug samples are excluded: they were never really in `live/`
        // to begin with, so they'd otherwise look "gone" on every poll.
        seen.current.forEach((id) => {
          if (isDebugId(id) || presentIds.has(id)) return;
          seen.current.delete(id);
          // Forgetting the id (rather than leaving it seen forever) also
          // means a post that gets pulled and later re-released is treated
          // as fresh again instead of silently never reappearing.
          removeCardImmediately(id);
        });
      } catch {
        if (!cancelled) setLiveError(true);
      }
    };

    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [removeCardImmediately]);

  return (
    <>
      {liveError && (
        <p
          role="status"
          className="mb-2 shrink-0 text-[13px] text-nd-muted"
        >
          Live updates are paused — we will reconnect automatically.
        </p>
      )}

      <div
        ref={rowRef}
        className="flex min-h-0 flex-1 items-stretch justify-center gap-4 overflow-hidden xl:gap-5"
      >
        {(() => {
          // Clamped exactly as useMasonryColumns clamps a pinned column, so
          // this always agrees with whichever column the slotted item
          // actually rendered into - even in the unlikely event the column
          // count itself changed since the pin was made (a resize is the
          // only way that can happen, and only while idle - see
          // useColumnCount - but agreeing by construction rather than by
          // that invariant holding is one less thing to keep in sync).
          const pinnedColumn =
            slotId !== null ? pinned.get(slotId) : undefined;
          const clampedPinnedColumn =
            pinnedColumn !== undefined
              ? Math.max(0, Math.min(pinnedColumn, columns.length - 1))
              : undefined;

          return columns.map((columnItems, columnIndex) => {
            const inThisColumn = clampedPinnedColumn === columnIndex;
            return (
              <WallColumn
                key={columnIndex}
                columnIndex={columnIndex}
                items={columnItems}
                reducedMotion={reducedMotion}
                revealActive={revealActive}
                onOpen={setSelected}
                arrived={arrived}
                slotId={inThisColumn ? slotId : null}
                slotOpen={slotOpen}
                landed={landed}
                settled={settled}
              />
            );
          });
        })()}
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

      {/* Debug indicator and the "see the full board" panel share the
          bottom-left corner, stacked rather than overlapping. */}
      <div className="fixed bottom-4 left-4 z-40 flex flex-col items-start gap-2 sm:bottom-6 sm:left-6">
        {debug && (
          <p className="rounded-[4px] border border-nd-line bg-nd-surface px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-nd-muted">
            Debug · <span className="text-nd-white">+</span> add sample ·{" "}
            <span className="text-nd-white">−</span> clear samples ·{" "}
            <span className="text-nd-white">Del</span> mark one for removal
            {queue.length > 0 && (
              <span className="text-nd-accent-hi"> · {queue.length} queued</span>
            )}
          </p>
        )}

        {/* Mirrors the "Post an Opportunity" panel opposite it: just the QR
            of the board under its title, sized to stay scannable from a
            few metres off the venue screen. No button - the whole panel is
            the link, the QR is the visual draw. */}
        <Link
          href="/board"
          className="flex flex-col items-center gap-2 rounded-[8px] px-3 py-2.5 shadow-lg shadow-black/50 transition-opacity duration-200 hover:opacity-80 sm:w-[168px] sm:border sm:border-nd-line sm:bg-nd-surface xl:w-[192px]"
        >
          <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.14em] text-nd-white">
            See the Full Board
          </span>
          {boardQrSvg && (
            <div
              className="hidden aspect-square w-full shrink-0 rounded-[4px] bg-white p-1.5 sm:block [&>svg]:h-full [&>svg]:w-full"
              // Generated server-side by the qrcode package from our own URL.
              dangerouslySetInnerHTML={{ __html: boardQrSvg }}
              // Decorative: the enclosing link is the accessible equivalent
              // and goes to exactly the same place, so announcing both is noise.
              aria-hidden="true"
            />
          )}
        </Link>
      </div>

      {/* Fixed call to action: just the QR of the submission form under its
          title, sized so the code stays scannable from a few metres off the
          venue screen. No button - the whole panel is the link, the QR is
          the visual draw. */}
      <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
        <Link
          href="/board/new"
          className="flex flex-col items-center gap-2 rounded-[8px] px-3 py-2.5 shadow-lg shadow-black/50 transition-opacity duration-200 hover:opacity-80 sm:w-[168px] sm:border sm:border-nd-line sm:bg-nd-surface xl:w-[192px]"
        >
          <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.14em] text-nd-white">
            Post an Opportunity
          </span>
          {qrSvg && (
            <div
              className="hidden aspect-square w-full shrink-0 rounded-[4px] bg-white p-1.5 sm:block [&>svg]:h-full [&>svg]:w-full"
              // Generated server-side by the qrcode package from our own URL.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              // Decorative: the enclosing link is the accessible equivalent
              // and goes to exactly the same place, so announcing both is noise.
              aria-hidden="true"
            />
          )}
        </Link>
      </div>

      <DetailSheet opportunity={selected} onClose={() => setSelected(null)} />
    </>
  );
}
