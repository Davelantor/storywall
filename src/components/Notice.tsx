import Link from "next/link";

/**
 * Calm failure state. Shown instead of an error stack whenever the database is
 * unreachable, so the venue screen degrades to something presentable.
 */
export function ConnectionNotice({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-[4px] border border-nd-line bg-nd-surface p-8 text-center">
      <p className="nd-eyebrow text-nd-accent">Standing by</p>
      <h2 className="mt-3 text-[22px] font-bold text-nd-white">{message}</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-nd-muted">
        The board is still there — this is a connection problem on our side, and
        it usually clears on its own. Try again in a moment.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/board" className="nd-btn nd-btn-primary">
          Reload the board
        </Link>
        <a
          href="mailto:nordeep@arcticstartup.com"
          className="nd-btn nd-btn-ghost"
        >
          Tell the team
        </a>
      </div>
    </div>
  );
}

/** Shown when filters match nothing. Never a blank screen. */
export function EmptyState({ onClear }: { onClear?: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="nd-eyebrow text-nd-faint">No matches</p>
      <h2 className="mt-3 text-[22px] font-bold text-nd-white">
        Nothing matches those filters yet.
      </h2>
      <p className="mt-3 text-[14px] leading-relaxed text-nd-muted">
        The wall fills up as the summit runs. Widen the search, or post the
        opportunity you were hoping to find.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {onClear && (
          <button type="button" onClick={onClear} className="nd-btn nd-btn-primary">
            Clear filters
          </button>
        )}
        <Link href="/board/new" className="nd-btn nd-btn-ghost">
          + Post an Opportunity
        </Link>
      </div>
    </div>
  );
}

/** Shown when the board is genuinely empty (day zero, before any approvals). */
export function NoPostsYet() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="nd-eyebrow text-nd-accent">The wall is open</p>
      <h2 className="mt-3 text-[22px] font-bold text-nd-white">
        No opportunities have been posted yet.
      </h2>
      <p className="mt-3 text-[14px] leading-relaxed text-nd-muted">
        Be the first. Posts appear here once the NORDEEP team has reviewed them.
      </p>
      <Link href="/board/new" className="nd-btn nd-btn-primary mt-6">
        + Post an Opportunity
      </Link>
    </div>
  );
}
