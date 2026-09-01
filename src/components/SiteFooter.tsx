import { cn } from "@/lib/format";

export default function SiteFooter({ wide = false }: { wide?: boolean }) {
  return (
    <footer className="mt-16 border-t border-nd-line-soft bg-nd-black">
      <div
        className={cn(
          wide ? "nd-container-wide" : "nd-container",
          "flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between md:py-12",
        )}
      >
        <div>
          <p className="nd-eyebrow text-nd-accent">
            NORDEEP Deep Tech Business Summit
          </p>
          <p className="mt-2 text-[15px] font-semibold text-nd-white">
            5th Anniversary Edition · 16–17 September 2026 · Espoo, Finland
          </p>
          <p className="mt-1 max-w-[52ch] text-[13px] text-nd-muted">
            Every post is reviewed by the NORDEEP team before it appears on the
            wall.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-col gap-2 text-[14px] md:items-end">
            <li>
              <a
                href="https://nordeep.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-nd-body underline-offset-4 transition-colors duration-200 hover:text-nd-accent hover:underline"
              >
                nordeep.com
              </a>
            </li>
            <li>
              <a
                href="mailto:nordeep@arcticstartup.com"
                className="text-nd-body underline-offset-4 transition-colors duration-200 hover:text-nd-accent hover:underline"
              >
                nordeep@arcticstartup.com
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
