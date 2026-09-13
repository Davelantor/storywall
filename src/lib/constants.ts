/** Shared between server data access and client feeds, so safe on both sides. */
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

/**
 * The wall shows the most recent approved posts and loops them seamlessly, so
 * it needs the whole set up front rather than paging. Bounded because every
 * extra card lengthens the loop and is duplicated once per copy in the DOM.
 */
export const WALL_MAX_ITEMS = 100;

/** The Board loads a denser first page than the Wall. */
export const BOARD_PAGE_SIZE = 30;

/** How often the wall asks for newly approved posts. */
export const POLL_INTERVAL_MS = 5_000;
