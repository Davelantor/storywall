export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "nd-theme";

/**
 * Runs inline in <head>, before hydration, so the right theme is already on
 * `<html>` before the browser paints anything - deciding it in a React
 * effect instead would paint the default theme first and visibly flip it,
 * the classic light/dark flash. Reads localStorage directly rather than
 * `prefers-color-scheme`: the toggle is an explicit two-way choice
 * (Dark/Light, not a third "System" option), and dark is what nothing-
 * chosen-yet falls back to, since that's the brand's usual look.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var theme=t==="light"?"light":"dark";document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){}})();`;
