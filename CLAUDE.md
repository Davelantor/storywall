# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

The **NORDEEP Opportunity Wall** — a public opportunity board for the NORDEEP
Deep Tech Business Summit (16–17 September 2026, Espoo). Anyone at the event
posts an opportunity; everyone can browse and contact the poster.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4. Posts are
stored as files on disk, no database. Dark is the default theme (the brand),
with an explicit light/dark toggle — see "Theming" below.

| Route           | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `/wall`         | Venue display. Independent columns, each looping seamlessly       |
| `/wall?kiosk=1` | Same, minus the chrome, plus pointer hiding                     |
| `/board`        | Practical feed: search, filters, sort, submission form          |
| `/board/new`    | Standalone submission page (the QR code points here)            |
| `/admin`        | Moderation queue                                                |

## Commands

```bash
npm run dev             # http://localhost:3000
npm run build           # production build; also runs TypeScript
npm run typecheck       # tsc --noEmit
npm run test:moderation # end-to-end check of the pending -> live/rejected pipeline, against a running server
```

No unit test suite. `npm run build` is the gate — it typechecks as part of
the build. `test:moderation` (`scripts/test-moderation-flow.mjs`) drives the
real HTTP API against a running dev/prod server rather than calling
`repository.ts` directly, so it actually proves submission, admin auth,
moderation, and the public feed work end to end; it reads `ADMIN_PASSWORD`
from the environment or `.env.local` and cleans up every post it creates.

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

`WallClient.tsx` orchestrates state (items, arrivals, the live poll);
`WallColumn.tsx` + `wall-hooks.ts` own the actual scrolling. Read this before
touching any of them.

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
back-to-back arrivals (approve a few pending posts in `/admin` in quick
succession) and confirming zero frames where one card's bottom edge passes
the next one's top - check both
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

**Column count is driven by viewport width, and only ever changes while
idle.** `useColumnCount` (wall-hooks.ts) computes the minimum number of
columns whose combined `max-width: 520px` cap (`COLUMN_MAX_WIDTH_PX`, which
must match `.nd-wall-column`) can span the current `window.innerWidth`,
clamped to `[MIN_COLUMNS, MAX_COLUMNS]` (1–8) — not a handful of fixed
breakpoints. Fixed breakpoints left a wide gap between whichever step they
landed on and the next (a venue display at 2560px sat on the same column
count as 1900px, with columns nowhere near their cap and the row visibly
short of the screen edges); computing the minimum count that fills the row
scales continuously across 1080p/1440p/4K/anything in between instead, with
`flex: 1 1 0` on `.nd-wall-column` stretching each one up to, but never
past, its own cap. This is deliberately independent of how many posts
exist — the wall reads as a full row of columns from the very first frame,
before a single post has arrived, and columns simply fill in as posts land;
an earlier version also capped the count by content, which was what caused
the column count to collapse to one at zero posts and then jump around as
the first few arrived.

The count only ever *commits* on a resize while `idle` is true (`WallClient`:
`!arrival && queue.length === 0`) — `useMasonryColumns` clears and rebuilds
every column's assignment from scratch whenever the column count changes, so
recomputing it mid-arrival would reshuffle cards across every column while
one of them is still animating: the exact flicker a continuously-running
display must not have. Because the effect's resize listener is only attached
while `idle`, a resize *during* an arrival is picked up the next time the
wall goes idle, not immediately. Verify by resizing the viewport mid-arrival
and confirming the rendered `.nd-wall-column` count only updates once the
queue is empty and idle for a moment.

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

**Arrivals.** New posts from the poll (`POLL_INTERVAL_MS`, 5s) go into a
**queue**, not straight onto the wall. One is released at a time
(`ARRIVAL_SPACING_MS`) and plays a
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

**Removal.** No animation at all. `WallClient.removeCardImmediately(id)`
drops the item from `items` (and from `queue`, `pinned`, `arrived`,
`settled`, and cancels its flight if it's the one currently mid-arrival) the
moment the live poll notices a previously-`live` post is no longer in the
server's response - a moderator pulling or rejecting it. Every branch is a
functional update or a no-op, so the callback has no dependencies and stays
referentially stable across renders, safe to call from the poll's interval
closure.

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

### Theming

Every colour token in `globals.css` (`--color-nd-*`) is a semantic role -
page background, heading text, body text, three surface tiers, two border
tiers - not a literal shade, and the whole app is built on those roles via
Tailwind utilities (`bg-nd-surface`, `text-nd-muted`, `border-nd-line`, ...).
The light theme is nothing but a second set of values for the same tokens,
under `:root[data-theme="light"]` in `globals.css` - it re-themes everything
built on those utilities at once, with no per-component branching. Dark is
the default (`:root`'s own values, with no attribute needed); light is an
explicit opt-in.

`src/lib/theme.ts` holds the storage key (`nd-theme` in `localStorage`) and
`THEME_INIT_SCRIPT`, a small blocking script run inline in `<head>`
(`layout.tsx`) that sets `data-theme` on `<html>` *before* hydration -
deciding the theme in a React effect instead would paint the default theme
first and visibly flip it. `ThemeToggle.tsx` (styled to match the Wall/Board
`ViewToggle` beside it in `SiteHeader.tsx`) only takes over from there: it
reads the attribute the script already set in a `useEffect` rather than
guessing during its own initial render, which would mismatch whatever the
server rendered.

`--color-nd-accent-hi` and `--color-nd-accent-2` get real light-theme
overrides (darkened) because both are also used as *text* - the dark-theme
shades are light pinks/corals tuned to read against near-black surfaces, and
fail contrast against a white one. `--color-nd-accent` doesn't need one: it
already clears 4.5:1 on white as-is. The same problem shows up in
`TYPE_META` (`src/lib/types.ts`): its `text` field is a literal, always-
pastel shade used as a *background* (BoardClient's selected filter chip,
with black foreground text - that needs it to stay light in both themes),
while `badgeText` is the same hue used as an actual foreground colour
(`TypeBadge`, `DetailSheet`'s "Type" field, the arrival glow border) and is
instead a CSS custom property (`--nd-type-*-text` in `globals.css`) that
resolves to a darkened value in light theme. Keep that split if you touch
either - collapsing them back into one field reintroduces the contrast
failure in one direction or the other.

Two things are deliberately theme-invariant: the QR code panels on `/wall`
stay literal `bg-white` (a QR code needs a white background to scan,
regardless of page theme), and the brand's own button-hover rule (`.nd-btn-
primary:hover` inverting to white background / black text) is copied
verbatim from nordeep.com's real behaviour, not meant to flip with the
page's theme.

### Header controls visibility

`.nd-header-controls` in `globals.css` wraps `ThemeToggle` and `ViewToggle`
in `SiteHeader.tsx` and hides both at `opacity: 0` until hovered or
focused-within - the venue screen should read clean, not busy with controls
nobody at the summit needs to see. Scoped to `@media (hover: hover)`: a
touch device has no hover to reveal them with, and the view toggle is the
only way between Wall and Board, so phones and tablets get both at full
strength always. `opacity: 0` does not remove either nav from the tab
order, just hides it until a keyboard user's tab order reaches it.

## Conventions

- Brand tokens live at the top of `src/app/globals.css`, sampled from the
  computed styles on nordeep.com. Do not approximate new colours — reuse them.
- Every foreground/background pair must clear **WCAG AA (4.5:1)** against the
  surface it sits on, in both themes. The grey tiers were lightened
  specifically for this.
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
