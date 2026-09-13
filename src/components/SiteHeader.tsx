import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/format";

import ColumnsSelect from "./ColumnsSelect";
import ThemeToggle from "./ThemeToggle";

type Props = {
  active: "wall" | "board" | "admin";
  /** The wall gets the wider container and a larger title. */
  size?: "display" | "compact";
  /** Pages that carry their own heading (the form, moderation) hide the title. */
  showTitle?: boolean;
};

/**
 * One compact bar: logo, page title, view toggle. No second masthead row - the
 * title sits inline in the header itself.
 */
export default function SiteHeader({
  active,
  size = "compact",
  showTitle = true,
}: Props) {
  const isDisplay = size === "display";

  return (
    <header className="border-b border-nd-line-soft bg-nd-black">
      <div
        className={cn(
          isDisplay ? "nd-container-wide" : "nd-container",
          "flex flex-wrap items-center justify-between gap-x-8 gap-y-2 py-2 md:py-2.5",
        )}
      >
        {/* Full width below sm so the toggle wraps to its own line: logo, title
            and toggle cannot share 375px without the title collapsing. */}
        <div className="flex w-full min-w-0 items-center gap-4 sm:w-auto sm:flex-1 md:gap-6">
          <a
            href="https://nordeep.com"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 transition-opacity duration-200 hover:opacity-80"
            aria-label="NORDEEP — 5th Anniversary Edition, opens nordeep.com in a new tab"
          >
            <Image
              src="/nordeep-logo.png"
              alt="NORDEEP 5th Anniversary Edition, 16–17 September 2026"
              width={1000}
              height={358}
              priority
              className="h-6 w-auto md:h-8"
            />
          </a>

          {showTitle && (
            <div className="min-w-0 flex-1 border-l border-nd-line pl-4 md:pl-6">
              <h1
                className={cn(
                  "nd-display",
                  isDisplay
                    ? "text-[15px] sm:text-[18px] lg:text-[22px]"
                    : "text-[14px] sm:text-[17px] lg:text-[19px]",
                )}
              >
                Live Opportunity <span className="text-nd-accent">Wall</span>
              </h1>
              {/* Single line, truncated rather than wrapped - a second line
                  was the tallest thing in the header, driving its height. */}
              <p className="hidden truncate whitespace-nowrap text-[12px] leading-snug text-nd-muted md:block">
                Where the global deep tech ecosystem posts, discovers, and acts
                on real-time opportunities.
              </p>
            </div>
          )}
        </div>

        {/* All invisible until pointed at (see .nd-header-controls) - the
            venue screen stays clean, and hovering any one of them reveals
            the whole cluster since they read as one control group. Column
            count only makes sense on the wall itself. */}
        <div className="nd-header-controls ml-auto flex items-center gap-2">
          <ThemeToggle />
          {active === "wall" && <ColumnsSelect />}
          <ViewToggle active={active} />
        </div>
      </div>
    </header>
  );
}

function ViewToggle({ active }: { active: Props["active"] }) {
  // inline-flex rather than the browser's default `inline` for an <a> -
  // an inline box's padding doesn't add to its line-box height the way an
  // inline-block's does, which left this a few pixels shorter than
  // ThemeToggle's <button>s (block-level by default) despite identical
  // padding. Keep this in sync with the `base` string in ThemeToggle.tsx.
  const base =
    "inline-flex items-center justify-center px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors duration-200 rounded-[2px]";

  return (
    <nav aria-label="Switch view">
      <ul className="flex items-center gap-1 rounded-[4px] border border-nd-line bg-nd-surface p-0.5">
        <li>
          <Link
            href="/wall"
            aria-current={active === "wall" ? "page" : undefined}
            className={cn(
              base,
              active === "wall"
                ? "bg-nd-accent text-white"
                : "text-nd-muted hover:text-nd-white",
            )}
          >
            Wall
          </Link>
        </li>
        <li>
          <Link
            href="/board"
            aria-current={active === "board" ? "page" : undefined}
            className={cn(
              base,
              active === "board"
                ? "bg-nd-accent text-white"
                : "text-nd-muted hover:text-nd-white",
            )}
          >
            Board
          </Link>
        </li>
      </ul>
    </nav>
  );
}
