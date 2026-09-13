# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

The **NORDEEP Opportunity Wall** — a public opportunity board for the NORDEEP
Deep Tech Business Summit (16–17 September 2026, Espoo). Anyone at the event
posts an opportunity; everyone can browse and contact the poster.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4. Posts are
stored as files on disk, no database. Dark theme only — that is the brand.

| Route           | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `/wall`         | Venue display. Independent columns, each looping seamlessly       |
| `/wall?kiosk=1` | Same, minus the chrome, plus pointer hiding                     |
| `/board`        | Practical feed: search, filters, sort, submission form          |
| `/board/new`    | Standalone submission page (the QR code points here)            |
| `/admin`        | Moderation queue                                                |

## Commands

```bash
npm run dev        # http://localhost:3000
npm run build      # production build; also runs TypeScript
npm run typecheck  # tsc --noEmit
```

No test suite. `npm run build` is the gate — it typechecks as part of the build.

## Running the file store

Posts live under `DATA_DIR` (defaults to `./data`), one JSON file per post,
in `pending/` `live/` `rejected/`. On first run — a fresh checkout, or
`DATA_DIR` pointing at a directory that does not exist yet —
`src/lib/repository.ts` creates the three folders and seeds `live/` from
`src/lib/seed-data.ts`, so `npm run dev` shows a populated wall with no setup.
`data/` is gitignored, so a fresh checkout re-seeds again; a running instance
with real posts in it is never re-seeded. `ensureDirs()` also runs a one-time
migration that folds any leftover `approved/` folder (from before that
staging status was removed) into `live/`, so upgrading an existing install
never strands posts a moderator had already approved.

For `/admin` locally, put this in `.env.local`:

```bash
ADMIN_PASSWORD=any-long-random-string
ADMIN_SESSION_SECRET=another-long-random-string-32-chars-plus
```

## Architecture

### Data access

Everything goes through `src/lib/repository.ts`, which is `server-only`. It
returns a discriminated `RepoResult`, never throws at callers, and pages
render a calm `ConnectionNotice` on failure rather than an error stack.

Each post is a JSON file (`Opportunity` fields + `status`) under one of three
folders in `DATA_DIR`, and a post's folder **is** its status — there is no
separate database enforcing the boundary, so the API routes are the only
thing that does:

| Status      | Folder       | Who can reach it                                          |
| ----------- | ------------ | ----------------------------------------------------------- |
| `pending`   | `pending/`   | written by `POST /api/opportunities` (public); read by admin only |
| `live`      | `live/`      | read by `GET /api/opportunities` and `/wall` (public); written only by admin's approve action |
| `rejected`  | `rejected/`  | admin only, kept for audit                                    |

`/admin` routes are the only code path that moves a file between folders, and
each checks the signed admin cookie first. Moving a post is a read + rewrite
into the new folder (status/timestamps updated) + delete of the old file, not
a bare rename — see the header comment in `repository.ts` for why (the new
file must exist before the old one is removed, so a crash mid-move can only
ever duplicate a post, never lose it).

There used to be a fourth `approved` status between `pending` and `live` -
approving and releasing were two separate moderator actions. That staging
step was deliberately dropped: approving a post now writes it straight to
`live` (`AdminClient.tsx`'s single "Approve" button), and "Pull from wall"
sends a live post back to `pending` rather than to a staging folder. If you
ever reintroduce an in-between review stage, do it as a deliberate decision,
not by accident - and update `STATUSES` in `src/lib/types.ts`, `AdminClient.tsx`'s
buttons, and this section together.

### Validation

`src/lib/validation.ts` is the single validator, used unchanged by the
submission form (inline feedback), the public API (authoritative), and
moderator edits. Do not add a second one.

### The wall

`WallClient.tsx` orchestrates state (items, arrivals, debug shortcuts, the
live poll); `WallColumn.tsx` + `wall-hooks.ts` own the actual scrolling. Read
this before touching any of them.

**Columns are fully independent.** Each `WallColumn` is its own scroll
container — own `scrollTop`, own loop period, own hover-pause — capped to
`max-width: 520px` (`.nd-wall-column`) so the wall reads as a row of separate
tickers rather than one wide masonry block. There is **no state shared
between columns at all**: no shared period, no shared scroll position, no
cross-column gap redistribution. This is deliberate, and the reason it's
built this way: a card landing in one column cannot move a single card in
another, because there is nothing left connecting them to move. (An earlier
design shared one `window.scrollY` and one period across all columns, which
needed increasingly elaborate machinery - frozen gaps, scroll compensation
math - just to stop an insertion in one column from visibly shifting every
other one. That machinery is gone; the independence makes it unnecessary.)
The page itself does not scroll on `/wall` - `wall/page.tsx` fixes the whole
layout to `h-dvh`, header at the top, the row of columns filling the rest.

**Seamless loop, per column.** Each `WallColumn` renders N identical copies of
its own item list, every copy forced to the same integer height - that
column's own *period*. Scrolling one period past the top shows pixels
identical to one period earlier, so subtracting the period from the column's
own `scrollTop` is invisible. The wrap runs on manual scrolling (wheel/touch
inside that column) too.

Invariants that keep the seam invisible — break any and it visibly jitters:

- **Copy heights must be an exact integer.** A fractional period lets the
  copies drift a pixel apart. Each copy gets an explicit `height` instead.
- **The period is a CSS variable (`--nd-period`) on the column, not React
  state.** While this column's own arrival slot is open the ResizeObserver
  fires every frame; re-rendering a hundred cards per frame to change one
  number is not affordable.
- **`overflow-anchor: none` on the column.** Scroll anchoring nudges the
  position a few pixels after the programmatic jump.
- **Measurement uses `el.scrollTop`, not the window.** Each column scrolls
  itself; there is no page-level `scrollY` or `offsetTop` walk involved at all.
- **The period is never frozen while a slot is open, and must not be.** The
  slot's `grid-template-rows` animation grows this column's real content
  height every frame; `measure()` tracks it every frame too; via the same
  ResizeObserver that already fires continuously for a CSS-transition-driven
  resize. Each per-copy wrapper's declared `height` comes from `--nd-period`,
  and every card after that copy is positioned relative to that declared
  height, not its actual content - so if the period fell behind the content
  growing inside it even briefly, the next copy down would render on top of
  the overflow instead of being pushed out of the way: cards visibly
  overlapping mid-arrival. (An earlier design froze this, back when every
  column shared one period and unfreezing it would have dragged every other
  column's cards apart in sympathy each frame. That risk doesn't exist any
  more now that each column measures only itself, and re-freezing it
  reintroduces the overlap - keep it live.)
- **Card spacing is `margin-bottom` per card, not the container's `gap`.**
  `gap` is one value for the whole flex container - there is no way to make
  one pair's spacing start at zero and animate while every other pair is
  already at its final size. The arriving card's wrapper gets its own
  `margin-bottom`, starting at zero and transitioning to `--nd-card-gap`
  (20px) in lockstep with its `.nd-slot`'s `grid-template-rows` - same
  duration and easing, both drawn from `--nd-arrival-motion` on
  `.nd-column-stack` so the two can't drift apart. Without this the moment
  the slot mounts, CSS spacing applies in full immediately (it doesn't wait
  for content), so everything below jumps down by one whole gap before the
  row has grown at all - the arriving card's *total* footprint, height and
  gap together, must start at genuinely zero.
- **The arriving card's margin rule must exclude `:last-child`.**
  `[data-slot="true"][data-open="true"]` has higher specificity than
  `*:last-child`, so without a `:not(:last-child)` guard on the slot rule, a
  slot that happens to be the last card in its column (an arrival into an
  otherwise-empty column, or the tail card after a `WALL_MAX_ITEMS` trim)
  gets a phantom 20px trailing margin for as long as it's open, inflating
  that column's period. Verify by forcing that exact case (a column with a
  single card, currently mid-arrival) and checking computed `margin-bottom`
  is `0px`, not `20px`.

Verify periodicity after any change by measuring every card's `offsetTop`
(not `getBoundingClientRect()` - it's scroll-relative and drifts mid-script)
against its twin one copy down, *within that column*: there must be exactly
**one** distinct delta per column. Verify the arrival specifically by sampling
every adjacent card pair's bounding rect at ~30ms intervals through several
back-to-back arrivals (numpad **+** fired repeatedly) and confirming zero
frames where one card's bottom edge passes the next one's top - check both
within a copy and across a copy boundary (the last card of one copy against
the first card of the next), since the overlap this guards against only
shows up at that boundary.

**Column balance.** `useMasonryColumns` (wall-hooks.ts) still packs items
across columns so they *look* reasonably even - each new item goes to
whichever column currently holds the least estimated content
(`estimateHeight()`, cheap and text-length-based). This no longer has
anything to do with the loop being seamless (each column's period is simply
whatever its own content adds up to); it only affects how balanced the
columns look next to each other. A column left shorter than its neighbours
just runs a shorter loop cycle, not a gap.

**Column count only ever changes while idle.** `useColumnCount` takes an
`idle` flag (`WallClient`: `!arrival && queue.length === 0`) alongside the
live item count, and only *commits* a new column count while `idle` is true -
the item count itself is always tracked live via a ref, just not acted on
until then. `useMasonryColumns` clears and rebuilds every column's
assignment from scratch whenever the column count changes, so committing it
mid-arrival would reshuffle cards across every column while one of them is
still animating: the exact flicker a continuously-running display must not
have. The first version of this fix instead froze the column count to
whatever the item count was at mount and never revisited it - simpler, but
wrong in a different way: a kiosk opened early in the two-day event with a
handful of approved posts would stay capped at that count for its entire
run, never widening as hundreds more posts arrive. Tracking the value live
but only *committing* it at a quiet moment keeps both properties: the wall
still grows into more columns as real content accumulates, it just never
does so while something is visibly in motion. A side effect worth knowing:
because the effect's resize listener is only attached while `idle`, a window
resize *during* an arrival doesn't recompute the column count either - it
picks up the new viewport width the next time the wall goes idle, same as an
item-count change would. Verify by firing enough debug arrivals
(numpad **+**) to cross `MIN_CARDS_PER_COLUMN`'s threshold and confirming
the rendered `.nd-wall-column` count stays constant throughout the burst,
then rises once the queue is empty and idle for a moment.

`pickLandingSpot()` in `WallClient` picks an arrival's column the same way:
whichever on-screen column currently holds the least estimated content, among
cards the viewer can actually see (so the gap opens somewhere visible). It
uses the *estimated* per-column totals from the `columns` packing, not a DOM
measurement - each column's real layout is now private to that `WallColumn`
instance, so `WallClient` has no ref into it to measure directly, and doesn't
need one.

**Auto-scroll.** Always on (not just kiosk), ~26px/s, per column. Exactly one
rule governs whether a given column is moving: it scrolls whenever the
pointer is not resting on one of *its own* cards, and stops the instant it
is — no delay in either direction, and nothing else (a click, a keypress, a
wheel nudge) holds it still or wakes it. Hovering a card in one column has no
effect on any other. An arrival landing does not pause its column either —
the whole point of the entrance is that it plays out against a wall that
keeps moving. Kiosk's cursor-hiding (`useCursorIdle`) runs on its own
independent, page-level idle clock and has no bearing on whether any column
is scrolling. There is deliberately no keyboard-focus equivalent of
hover-pause, so a keyboard user tabbing through cards does not get one held
still to read — flag this if it comes up.

**Reduced motion.** `WallColumn` renders a single copy and switches its own
`overflow-y` from `hidden` to `auto`: without a loop there is only the one
real copy, so it needs to be an ordinary, manually-scrollable list rather
than content clipped behind a fixed-height box with nothing bringing the rest
of it into view.

**Arrivals.** New posts from the 20s poll go into a **queue**, not straight onto
the wall. One is released at a time (`ARRIVAL_SPACING_MS`) and plays a
three-beat entrance in `ArrivalFlight.tsx`: slide in from a random edge → hold
centre stage above everything → settle into the gap, which opens only as the
card starts travelling to it. Party poppers (`src/lib/confetti.ts`, canvas,
no dependency) fire at launch and at centre stage.

The landing spot is chosen from cards *currently on screen* so the gap opens
where it can be seen; the chosen column is passed to `useMasonryColumns` as a
`pinned` override.

**Background tabs.** `requestAnimationFrame` is fully suspended when hidden.
Both the flight and the gap have timer-based fallbacks — timers are throttled
but never stopped — otherwise one arrival strands off-screen and blocks the
whole queue. Keep those fallbacks if you rework the animation.

**Reveal animation.** Cards fade and rise via a **CSS transition**, not
keyframes: an animation with `fill-mode: both` holds its `from` state whenever
the browser is not advancing it (a backgrounded tab), leaving the wall blank.
Hiding is scoped to `[data-reveal="on"]`, set in a layout effect, so a JS
failure leaves cards visible rather than at `opacity: 0` forever. A viewport
sweep backs up the IntersectionObserver, which browsers suppress when hidden.

**Removal.** No animation at all - the opposite instinct from an arrival.
`WallClient.removeCard(id)` adds the id to a `pendingRemoval` set and renders
nothing differently: the card keeps scrolling exactly as before, in every
loop copy, until it leaves on its own. A 400ms interval
(`REMOVAL_CHECK_MS`) checks each pending id against every element still
carrying its `data-card-id`, using each one's own `.nd-wall-column`
ancestor for the bounds - a plain viewport check would treat a card that has
scrolled below one column's clipped bottom as "visible" because a neighbour
column happens to run taller. Only once *no* rendered copy of that id
overlaps its own column's bounds does the check actually filter it out of
`items`. This was a deliberate correction from an earlier shrink-to-zero
attempt: any animated collapse changes the column's live content height
mid-flight, and that height *is* the loop's period - shrinking it while
other cards share the same period moved cards that were never marked for
removal. Never dropping the item's footprint at all, only its rendered
existence once it's already outside the clipped area, is what keeps every
other card untouched.

Dropping an id from `items` still changes that column's `--nd-period` by
one card's footprint (see the "Column slack" note above on why compensation
of that shift can only anchor one loop copy exactly), so the check also
withholds the drop while the column's own viewport straddles two copies -
`Math.floor(scrollTop / period) !== Math.floor((scrollTop + clientHeight - 1)
/ period)` - so the compensation that runs in `WallColumn`'s `measure()` has
zero residual by construction when the drop lands. A column sparse enough
that a full period never fits under one viewport height would straddle
forever, so a pending id stuck past `REMOVAL_STRADDLE_TIMEOUT_MS` (6s) is
dropped anyway rather than left pending indefinitely.

Several ids can be pending removal at once - each is independent, there is
no queue. Reduced motion skips the wait entirely: `removeCard` filters the
item out of `items` immediately, since there is no scroll for it to
disappear into.

### Card variants

`OpportunityCard` takes `variant: "wall" | "board"`. They deliberately differ:

- **Wall** — title, detail, location/work-mode, contact. Nothing else.
- **Board** — also type badge, organisation, tags, timestamp, full-description
  link, "find me at" note.

The Board keeps those because its filter chips and Organisation A–Z sort act on
exactly those fields. Do not "unify" the variants without addressing that.

Whole-card tapping is `CardOpenTarget.tsx`: a stretched `::after` overlay. It
relies on the card being positioned (`.nd-card` sets `position: relative`), and
anything inside that must stay clickable needs `relative z-10`. The focus ring
is drawn on the overlay so it outlines the clickable area.

### Debug shortcuts

On `/wall`, **numpad +** injects a ready-made sample post
(`src/lib/debug-samples.ts`) straight into the arrival queue, **numpad −**
removes all of them (instantly, no wait - a hard reset for testing, not a
rehearsal of removal itself), and **Delete** (or Backspace) marks one random
currently-visible card for removal - debug or real, any card on the wall,
since removal isn't debug-id-scoped the way the sample posts are. Client-side
only: never touches the database, skips the rate limiter and moderation, and
vanishes on reload. Enabled in development always; in production only with
`?debug=1`.

## Conventions

- Brand tokens live at the top of `src/app/globals.css`, sampled from the
  computed styles on nordeep.com. Do not approximate new colours — reuse them.
- Every foreground/background pair must clear **WCAG AA (4.5:1)** against the
  surface it sits on. The grey tiers were lightened specifically for this.
- Reusable styling goes in `@layer components` in `globals.css` (`.nd-btn`,
  `.nd-card`, `.nd-chip`, `.nd-slot`, `.nd-card-target`). Tailwind utilities
  for one-offs.
- `prefers-reduced-motion` must disable the reveal, the auto-scroll, the
  arrival flight and the confetti. The wall falls back to a single copy and an
  ordinary page.
- Duplicated loop copies are `inert` so nothing is announced or focused twice.
- Client components read state as props from server components; only `/board`
  syncs state to the URL.

## Gotchas

- **`DATA_DIR` must be a real, persistent, backed-up path in production** — a
  VPS disk, not a serverless/ephemeral filesystem. Nothing else guarantees
  posts survive a redeploy or restart.
- **The wall is capped at `WALL_MAX_ITEMS` (100).** It loads the whole set up
  front because a loop needs finite content — there is no pagination on `/wall`.
- **There is no footer on `/wall`.** The page is fixed to the viewport height
  (`h-dvh`) and never scrolls - each column scrolls itself instead - so a
  footer below the fold would never be reachable. It was removed rather than
  left in as dead markup. Contact details live on `/board` and `/board/new`.
- **Framing is intentional.** `frame-ancestors *` and no `X-Frame-Options`, so
  the wall can be embedded. Nothing may touch `window.top` or `window.parent`.
- Field limits (`FIELD_LIMITS` in `src/lib/types.ts`) are enforced in two
  places: the form and the validator. Keep them in sync.
