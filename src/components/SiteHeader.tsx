import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/format";

type Props = {
  active: "wall" | "board" | "admin";
  /** The wall gets the wider container and a larger title. */
  size?: "display" | "compact";
  /** Pages that carry their own heading (the form, moderation) hide the title. */
  showTitle?: boolean;
  /**
   * Pins the header to the top of the viewport instead of scrolling away with
   * the page. Used on the wall, where the page itself scrolls continuously -
   * without this the header would scroll off within a few seconds of the
   * auto-scroll starting and never return.
   */
  sticky?: boolean;
};

/**
 * One compact bar: logo, page title, view toggle. No second masthead row - the
 * title sits inline in the header itself.
 */
export default function SiteHeader({
  active,
  size = "compact",
  showTitle = true,
  sticky = false,
}: Props) {
  const isDisplay = size === "display";

  return (
    <header
      className={cn(
        "border-b border-nd-line-soft bg-nd-black",
        sticky && "sticky top-0 z-30",
      )}
    >
      <div
        className={cn(
          isDisplay ? "nd-container-wide" : "nd-container",
          "flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-4 md:py-5",
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
              className="h-9 w-auto md:h-11"
            />
          </a>

          {showTitle && (
            <div className="min-w-0 border-l border-nd-line pl-4 md:pl-6">
              <h1
                className={cn(
                  "nd-display",
                  isDisplay
                    ? "text-[17px] sm:text-[22px] lg:text-[28px]"
                    : "text-[16px] sm:text-[20px] lg:text-[24px]",
                )}
              >
                Live Opportunity <span className="text-nd-accent">Wall</span>
              </h1>
              <p className="mt-0.5 hidden max-w-[68ch] text-[12px] leading-snug text-nd-muted md:block lg:text-[13px]">
                Where the global deep tech ecosystem posts, discovers, and acts
                on real-time opportunities.
              </p>
            </div>
          )}
        </div>

        <ViewToggle active={active} />
      </div>
    </header>
  );
}

function ViewToggle({ active }: { active: Props["active"] }) {
  const base =
    "px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors duration-200 rounded-[2px]";

  return (
    <nav aria-label="Switch view" className="nd-view-toggle ml-auto">
      <ul className="flex items-center gap-1 rounded-[4px] border border-nd-line bg-nd-surface p-1">
        <li>
          <Link
            href="/wall"
            aria-current={active === "wall" ? "page" : undefined}
            className={cn(
              base,
              active === "wall"
                ? "bg-nd-accent text-white"
                : "text-nd-muted hover:text-white",
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
                : "text-nd-muted hover:text-white",
            )}
          >
            Board
          </Link>
        </li>
      </ul>
    </nav>
  );
}
