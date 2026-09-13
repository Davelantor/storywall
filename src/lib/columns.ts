export type ColumnsPreference = "auto" | number;

export const COLUMNS_STORAGE_KEY = "nd-wall-columns";
/** Fired on manual changes so an already-mounted wall in the same tab picks
 * it up - the "storage" event only fires in *other* tabs. */
export const COLUMNS_CHANGE_EVENT = "nd-columns-change";

export const MIN_MANUAL_COLUMNS = 1;
export const MAX_MANUAL_COLUMNS = 10;

function isValidManualCount(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_MANUAL_COLUMNS &&
    value <= MAX_MANUAL_COLUMNS
  );
}

/** Reads the visitor's column-count preference, defaulting to "auto" when unset or invalid. */
export function readColumnsPreference(): ColumnsPreference {
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw || raw === "auto") return "auto";
    const parsed = Number(raw);
    return isValidManualCount(parsed) ? parsed : "auto";
  } catch {
    return "auto";
  }
}

/**
 * Persists the preference and notifies any wall already mounted in this tab.
 * Unlike the theme toggle, this can't just flip a CSS variable that the page
 * reacts to on its own - the column count is real React state computed in
 * `useColumnCount` (wall-hooks.ts), so a same-tab change needs an explicit
 * signal.
 */
export function writeColumnsPreference(value: ColumnsPreference): void {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, String(value));
  } catch {
    // Private browsing / storage disabled - the choice just won't persist.
  }
  window.dispatchEvent(
    new CustomEvent<ColumnsPreference>(COLUMNS_CHANGE_EVENT, { detail: value }),
  );
}
