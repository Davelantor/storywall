"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { BOARD_PAGE_SIZE } from "@/lib/constants";
import { cn } from "@/lib/format";
import {
  boardStateToQuery,
  EMPTY_BOARD_STATE,
  feedApiQuery,
  isBoardStateEmpty,
  toggle,
  type BoardState,
} from "@/lib/query";
import {
  OPPORTUNITY_TYPES,
  TYPE_META,
  WORK_MODES,
  WORK_MODE_LABEL,
  type Opportunity,
} from "@/lib/types";

import DetailSheet from "./DetailSheet";
import Modal, { ModalClose } from "./Modal";
import OpportunityCard from "./OpportunityCard";
import { ConnectionNotice, EmptyState, NoPostsYet } from "./Notice";
import SubmissionForm from "./SubmissionForm";

type Props = {
  initialItems: Opportunity[];
  initialTotal: number;
  initialHasMore: boolean;
  initialNextOffset: number;
  initialState: BoardState;
  locations: string[];
  /** Opens the submission modal on first paint - used by /board?post=1. */
  openForm?: boolean;
};

export default function BoardClient({
  initialItems,
  initialTotal,
  initialHasMore,
  initialNextOffset,
  initialState,
  locations,
  openForm = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const ids = useIds();

  const [state, setState] = useState<BoardState>(initialState);
  const [searchText, setSearchText] = useState(initialState.q);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [offset, setOffset] = useState(initialNextOffset);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [formOpen, setFormOpen] = useState(openForm);

  // Skips the fetch-on-mount, since the server already rendered page one.
  const hydrated = useRef(false);

  /* -------------------------------------------------------- search debounce */

  useEffect(() => {
    if (searchText === state.q) return;
    const id = window.setTimeout(
      () => setState((previous) => ({ ...previous, q: searchText })),
      300,
    );
    return () => window.clearTimeout(id);
  }, [searchText, state.q]);

  /* ------------------------------------------------- state -> URL and fetch */

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }

    const query = boardStateToQuery(state);
    // Filters live in the URL so a filtered view can be shared or bookmarked.
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });

    const controller = new AbortController();
    setBusy(true);

    fetch(`/api/opportunities?${feedApiQuery(state, { offset: 0, limit: BOARD_PAGE_SIZE })}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as {
          items: Opportunity[];
          total: number;
          hasMore: boolean;
          nextOffset: number;
        };
      })
      .then((page) => {
        setItems(page.items);
        setTotal(page.total);
        setHasMore(page.hasMore);
        setOffset(page.nextOffset);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError("We could not reach the opportunity board just now.");
      })
      .finally(() => setBusy(false));

    return () => controller.abort();
  }, [state, pathname, router]);

  /* ------------------------------------------------------------- load more */

  const loadMore = useCallback(async () => {
    if (busy || !hasMore) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/opportunities?${feedApiQuery(state, { offset, limit: BOARD_PAGE_SIZE })}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const page = (await response.json()) as {
        items: Opportunity[];
        hasMore: boolean;
        nextOffset: number;
      };
      setItems((previous) => {
        const known = new Set(previous.map((item) => item.id));
        return [...previous, ...page.items.filter((item) => !known.has(item.id))];
      });
      setHasMore(page.hasMore);
      setOffset(page.nextOffset);
      setError(null);
    } catch {
      setError("We could not load more opportunities just now.");
    } finally {
      setBusy(false);
    }
  }, [busy, hasMore, offset, state]);

  const clearFilters = () => {
    setSearchText("");
    setState(EMPTY_BOARD_STATE);
  };

  const filtersActive = !isBoardStateEmpty(state);
  const activeCount =
    state.types.length +
    state.locations.length +
    state.modes.length +
    (state.q.trim() ? 1 : 0);

  return (
    <>
      {/* ------------------------------------------------------- controls */}

      <section aria-label="Search and filter" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <label htmlFor={ids.search} className="nd-sr-only">
              Search opportunities
            </label>
            <SearchIcon />
            <input
              id={ids.search}
              type="search"
              className="nd-field pl-11"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search roles, organisations, tags…"
              autoComplete="off"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor={ids.sort} className="nd-sr-only">
              Sort opportunities
            </label>
            <select
              id={ids.sort}
              className="nd-field w-auto min-w-[172px] cursor-pointer"
              value={state.sort}
              onChange={(event) =>
                setState((previous) => ({
                  ...previous,
                  sort: event.target.value === "organisation" ? "organisation" : "newest",
                }))
              }
            >
              <option value="newest">Newest first</option>
              <option value="organisation">Organisation A–Z</option>
            </select>

            <button
              type="button"
              className="nd-btn nd-btn-primary shrink-0 whitespace-nowrap"
              onClick={() => setFormOpen(true)}
            >
              + Post
            </button>
          </div>
        </div>

        <fieldset>
          <legend className="nd-sr-only">Filter by opportunity type</legend>
          <ul className="flex flex-wrap gap-2">
            {OPPORTUNITY_TYPES.map((type) => {
              const on = state.types.includes(type);
              return (
                <li key={type}>
                  <button
                    type="button"
                    className="nd-chip"
                    aria-pressed={on}
                    style={
                      on
                        ? {
                            backgroundColor: TYPE_META[type].text,
                            borderColor: TYPE_META[type].text,
                            color: "#000",
                          }
                        : undefined
                    }
                    onClick={() =>
                      setState((previous) => ({
                        ...previous,
                        types: toggle(previous.types, type),
                      }))
                    }
                  >
                    {TYPE_META[type].label}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <label htmlFor={ids.location} className="nd-label mb-0">
              Location
            </label>
            <select
              id={ids.location}
              className="nd-field w-auto min-w-[168px] cursor-pointer py-2 text-[14px]"
              value={state.locations[0] ?? ""}
              onChange={(event) =>
                setState((previous) => ({
                  ...previous,
                  locations: event.target.value ? [event.target.value] : [],
                }))
              }
            >
              <option value="">Anywhere</option>
              {locations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="flex items-center gap-2">
            <legend className="nd-sr-only">Filter by work mode</legend>
            <span className="nd-label mb-0" aria-hidden="true">
              Mode
            </span>
            {WORK_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className="nd-chip"
                aria-pressed={state.modes.includes(mode)}
                onClick={() =>
                  setState((previous) => ({
                    ...previous,
                    modes: toggle(previous.modes, mode),
                  }))
                }
              >
                {WORK_MODE_LABEL[mode]}
              </button>
            ))}
          </fieldset>

          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[12px] font-bold uppercase tracking-[0.1em] text-nd-accent-hi underline-offset-4 hover:text-nd-white hover:underline"
            >
              Clear {activeCount} {activeCount === 1 ? "filter" : "filters"}
            </button>
          )}
        </div>
      </section>

      {/* ----------------------------------------------------------- feed */}

      <p
        className="mt-7 border-t border-nd-line-soft pt-5 text-[13px] text-nd-muted"
        aria-live="polite"
      >
        {busy && items.length === 0
          ? "Searching…"
          : `${total.toLocaleString("en-GB")} ${
              total === 1 ? "opportunity" : "opportunities"
            }${filtersActive ? " matching your filters" : ""}`}
      </p>

      {error ? (
        <div className="py-14">
          <ConnectionNotice message={error} />
        </div>
      ) : items.length === 0 ? (
        filtersActive ? (
          <EmptyState onClear={clearFilters} />
        ) : (
          <NoPostsYet />
        )
      ) : (
        <ul
          className={cn(
            "mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2",
            busy && "opacity-60 transition-opacity duration-200",
          )}
        >
          {items.map((item) => (
            <li key={item.id} className="flex">
              <OpportunityCard
                opportunity={item}
                variant="board"
                onOpen={setSelected}
                className="w-full"
              />
            </li>
          ))}
        </ul>
      )}

      {hasMore && !error && items.length > 0 && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            className="nd-btn nd-btn-ghost"
            onClick={loadMore}
            disabled={busy}
          >
            {busy ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* --------------------------------------------------------- modals */}

      <DetailSheet opportunity={selected} onClose={() => setSelected(null)} />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        labelledBy={ids.formTitle}
      >
        <div className="relative p-6 pt-14 sm:p-8 sm:pt-14">
          <ModalClose onClose={() => setFormOpen(false)} />
          <h2
            id={ids.formTitle}
            className="nd-display text-[26px] sm:text-[32px]"
          >
            Post an Opportunity
          </h2>
          <p className="mt-2 text-[14px] text-nd-muted">
            Jobs, co-founders, pilots, talent, research. One card, 280 characters.
          </p>
          <div className="mt-7">
            <SubmissionForm onDone={() => setFormOpen(false)} />
          </div>
        </div>
      </Modal>
    </>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-nd-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="m13.5 13.5 3.5 3.5" />
    </svg>
  );
}

function useIds() {
  const base = useId();
  return {
    search: `${base}-search`,
    sort: `${base}-sort`,
    location: `${base}-location`,
    formTitle: `${base}-form-title`,
  };
}
