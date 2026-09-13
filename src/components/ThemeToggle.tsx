"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/format";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing / storage disabled - the choice just won't persist.
  }
}

/**
 * Light/dark switch, styled to match the Wall/Board view toggle beside it.
 * The theme itself is applied before hydration by the blocking script in
 * layout.tsx (see there for why), so this component doesn't decide the
 * initial theme - it reads whatever that script already set on `<html>` and
 * only takes over from there. Reading it in an effect (rather than during
 * the initial render) avoids a hydration mismatch: the server always
 * renders not knowing the visitor's stored preference.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme | undefined) ?? "dark");
  }, []);

  const pick = (next: Theme) => {
    applyTheme(next);
    setTheme(next);
  };

  // Keep in sync with the `base` string in SiteHeader.tsx's ViewToggle -
  // inline-flex is what makes this match its <button>s to that one's <a>s
  // pixel-for-pixel despite the different default element display.
  const base =
    "inline-flex items-center justify-center px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors duration-200 rounded-[2px]";

  return (
    <nav aria-label="Switch theme">
      <ul className="flex items-center gap-1 rounded-[4px] border border-nd-line bg-nd-surface p-0.5">
        <li>
          <button
            type="button"
            aria-pressed={theme === "dark"}
            className={cn(
              base,
              theme === "dark"
                ? "bg-nd-accent text-white"
                : "text-nd-muted hover:text-nd-white",
            )}
            onClick={() => pick("dark")}
          >
            Dark
          </button>
        </li>
        <li>
          <button
            type="button"
            aria-pressed={theme === "light"}
            className={cn(
              base,
              theme === "light"
                ? "bg-nd-accent text-white"
                : "text-nd-muted hover:text-nd-white",
            )}
            onClick={() => pick("light")}
          >
            Light
          </button>
        </li>
      </ul>
    </nav>
  );
}
