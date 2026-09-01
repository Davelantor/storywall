# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

The **NORDEEP Opportunity Wall** — a public opportunity board for the NORDEEP
Deep Tech Business Summit (16–17 September 2026, Espoo). Anyone at the event
posts an opportunity; everyone can browse and contact the poster.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase.
Dark theme only — that is the brand.

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
node scripts/generate-seed-sql.mjs   # regenerate supabase/seed.sql
```

No test suite. `npm run build` is the gate — it typechecks as part of the build.

## Running without Supabase

With no Supabase credentials the app serves an **in-memory demo store** seeded
from `src/lib/seed-data.ts`, so `npm run dev` shows a populated wall with no
setup. Submissions and moderation work but are lost on restart.

The store hangs off `globalThis` (`src/lib/repository.ts`). This is deliberate:
Next gives route handlers and pages **separate module graphs**, so a plain
module-level array would leave `/api/opportunities` and `/admin` with private
copies, and a post submitted through the API would never reach the queue.

For `/admin` locally, put this in `.env.local`:

```bash
ADMIN_PASSWORD=any-long-random-string
ADMIN_SESSION_SECRET=another-long-random-string-32-chars-plus
```

## Architecture

### Data access

Everything goes through `src/lib/repository.ts`, which is `server-only` and
switches between Supabase and the demo store. It returns a discriminated
`RepoResult`, never throws at callers, and pages render a calm
`ConnectionNotice` on failure rather than an error stack.

Security lives in the database, not the client (`supabase/schema.sql`):

| Role                     | SELECT                  | INSERT                | UPDATE / DELETE |
| ------------------------ | ----------------------- | --------------------- | --------------- |
| `anon` / `authenticated` | only `status='approved'` | only `status='pending'` | denied          |
| `service_role`           | everything              | everything            | everything      |

`/admin` routes are the only code path using the service role, and each checks
the signed admin cookie first. Public inserts deliberately omit `.select()` —
the read policy would reject returning the freshly inserted pending row.

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
- **A column's own arrival slot freezes its own measurement**
  (`arrivalInFlight` in `WallColumn`) while the slot's `grid-template-rows`
  animation is changing this column's height every frame - recomputed once,
  after the slot is torn down. This no longer has any effect beyond the one
  column, since nothing reads across columns any more.

Verify periodicity after any change by measuring every card's `offsetTop`
(not `getBoundingClientRect()` - it's scroll-relative and drifts mid-script)
against its twin one copy down, *within that column*: there must be exactly
**one** distinct delta per column.

**Column balance.** `useMasonryColumns` (wall-hooks.ts) still packs items
across columns so they *look* reasonably even - each new item goes to
whichever column currently holds the least estimated content
(`estimateHeight()`, cheap and text-length-based). This no longer has
anything to do with the loop being seamless (each column's period is simply
whatever its own content adds up to); it only affects how balanced the
columns look next to each other. A column left shorter than its neighbours
just runs a shorter loop cycle, not a gap.

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
(`src/lib/debug-samples.ts`) straight into the arrival queue, and **numpad −**
removes all of them. Client-side only: never touches the database, skips the
rate limiter and moderation, and vanishes on reload. Enabled in development
always; in production only with `?debug=1`.

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

- **`supabase/seed.sql` is generated.** Edit `src/lib/seed-data.ts` and rerun
  the script; never hand-edit the SQL.
- **The wall is capped at `WALL_MAX_ITEMS` (100).** It loads the whole set up
  front because a loop needs finite content — there is no pagination on `/wall`.
- **There is no footer on `/wall`.** The page is fixed to the viewport height
  (`h-dvh`) and never scrolls - each column scrolls itself instead - so a
  footer below the fold would never be reachable. It was removed rather than
  left in as dead markup. Contact details live on `/board` and `/board/new`.
- **Framing is intentional.** `frame-ancestors *` and no `X-Frame-Options`, so
  the wall can be embedded. Nothing may touch `window.top` or `window.parent`.
- Field limits (`FIELD_LIMITS` in `src/lib/types.ts`) are enforced in three
  places: the form, the validator, and CHECK constraints in the schema.
