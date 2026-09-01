import {
  isOpportunityType,
  isWorkMode,
  type OpportunityType,
  type SortOrder,
  type WorkMode,
} from "./types";

/**
 * The Board's full UI state. It round-trips through the URL query string so any
 * filtered view can be shared or bookmarked.
 */
export type BoardState = {
  q: string;
  types: OpportunityType[];
  locations: string[];
  modes: WorkMode[];
  sort: SortOrder;
};

export const EMPTY_BOARD_STATE: BoardState = {
  q: "",
  types: [],
  locations: [],
  modes: [],
  sort: "newest",
};

type ParamSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function read(source: ParamSource, key: string): string[] {
  if (source instanceof URLSearchParams) {
    const all = source.getAll(key);
    return all.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  }
  const raw = source[key];
  if (raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

function first(source: ParamSource, key: string): string {
  return read(source, key)[0] ?? "";
}

export function parseBoardState(source: ParamSource): BoardState {
  const sortRaw = first(source, "sort");
  return {
    q: (source instanceof URLSearchParams
      ? (source.get("q") ?? "")
      : typeof source.q === "string"
        ? source.q
        : ""
    ).slice(0, 120),
    types: read(source, "type").filter(isOpportunityType),
    locations: read(source, "loc"),
    modes: read(source, "mode").filter(isWorkMode),
    sort: sortRaw === "organisation" ? "organisation" : "newest",
  };
}

/** Serialises state back to a query string, omitting anything at its default. */
export function boardStateToQuery(state: BoardState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.types.length) params.set("type", state.types.join(","));
  if (state.locations.length) params.set("loc", state.locations.join(","));
  if (state.modes.length) params.set("mode", state.modes.join(","));
  if (state.sort !== "newest") params.set("sort", state.sort);
  return params.toString();
}

export function isBoardStateEmpty(state: BoardState): boolean {
  return (
    !state.q.trim() &&
    state.types.length === 0 &&
    state.locations.length === 0 &&
    state.modes.length === 0
  );
}

/** Query string for the paged feed API. */
export function feedApiQuery(
  state: BoardState,
  opts: { offset: number; limit: number },
): string {
  const params = new URLSearchParams(boardStateToQuery(state));
  params.set("offset", String(opts.offset));
  params.set("limit", String(opts.limit));
  return params.toString();
}

/** Toggles a value in a multi-select filter array. */
export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}
