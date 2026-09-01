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
| `/wall`         | Venue display. Masonry waterfall that scrolls in a seamless loop |
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

`WallClient.tsx` + `wall-hooks.ts` carry most of the complexity. Read this
before touching either.

**Seamless loop.** Each column renders N identical copies, every copy forced to
the same integer height — the *period*. Scrolling one period past the top of
the track shows pixels identical to one period earlier, so subtracting the
period from `scrollY` is invisible. The wrap runs on manual scrolling too.

Invariants that keep the seam invisible — break any and it visibly jitters:

- **Copy heights must be an exact integer.** Padding columns out with a
  fractional `margin-bottom` let them drift a pixel apart. Each copy gets an
  explicit `height` instead.
- **The period is a CSS variable (`--nd-period`), not React state.** While an
  arrival gap opens, the ResizeObserver fires every frame; re-rendering a
  hundred cards per frame to change one number is not affordable.
- **`overflow-anchor: none` on the track.** Scroll anchoring nudges the
  position a few pixels after the programmatic jump.
- **Wrap threshold uses `offsetTop`, not `getBoundingClientRect()`.** The rect
  is fractional and scroll-relative, and made the threshold wobble.

Verify periodicity after any change by measuring every card's offset against
its twin one copy down: there must be exactly **one** distinct delta.

**Auto-scroll.** Always on (not just kiosk), ~26px/s. Pauses while the pointer
rests on a card, resuming 1s after it leaves. Deliberate gestures — wheel,
touch, keys, clicks — hold it for 10s instead. Plain `mousemove` does *not*
pause; it only wakes the pointer for kiosk mode.

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
- **The footer is unreachable on `/wall`.** The loop wraps before it. Contact
  details live on `/board` and `/board/new`.
- **Framing is intentional.** `frame-ancestors *` and no `X-Frame-Options`, so
  the wall can be embedded. Nothing may touch `window.top` or `window.parent`.
- Field limits (`FIELD_LIMITS` in `src/lib/types.ts`) are enforced in three
  places: the form, the validator, and CHECK constraints in the schema.
