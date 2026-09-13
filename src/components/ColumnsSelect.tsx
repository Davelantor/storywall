"use client";

import { useEffect, useState } from "react";

import {
  MAX_MANUAL_COLUMNS,
  MIN_MANUAL_COLUMNS,
  readColumnsPreference,
  writeColumnsPreference,
  type ColumnsPreference,
} from "@/lib/columns";

const COLUMN_OPTIONS = Array.from(
  { length: MAX_MANUAL_COLUMNS - MIN_MANUAL_COLUMNS + 1 },
  (_, index) => MIN_MANUAL_COLUMNS + index,
);

/**
 * Overrides the wall's auto-computed column count (see useColumnCount in
 * wall-hooks.ts). "Auto" is the default and matches the pre-existing
 * width-based behaviour; a number pins it regardless of viewport width.
 * Reads/writes the same preference useColumnCount does, via a small
 * localStorage + custom-event channel (src/lib/columns.ts) rather than
 * React state, since this control and the wall it affects aren't in the
 * same component tree - see writeColumnsPreference for why.
 */
export default function ColumnsSelect() {
  const [value, setValue] = useState<ColumnsPreference | null>(null);

  useEffect(() => {
    setValue(readColumnsPreference());
  }, []);

  return (
    <nav aria-label="Wall column count">
      <div className="flex items-center gap-1 rounded-[4px] border border-nd-line bg-nd-surface p-0.5">
        <select
          aria-label="Number of wall columns"
          // A fixed height rather than matching ThemeToggle/ViewToggle's
          // padding-based sizing: a <select>'s own closed-state box ignores
          // line-height for its height (unlike a <button>, which inherits
          // it), so the same px-3/py-1.5 classes render a couple of pixels
          // shorter here regardless. h-[30.7px] is that button's own
          // measured content height - keep the two in sync if either changes.
          className="inline-flex h-[30.7px] items-center justify-center rounded-[2px] bg-transparent px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-nd-muted transition-colors duration-200 hover:text-nd-white focus:text-nd-white focus:outline-none"
          value={value ?? "auto"}
          onChange={(event) => {
            const next: ColumnsPreference =
              event.target.value === "auto" ? "auto" : Number(event.target.value);
            writeColumnsPreference(next);
            setValue(next);
          }}
        >
          <option value="auto">Auto</option>
          {COLUMN_OPTIONS.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
}
