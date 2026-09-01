# NORDEEP Opportunity Wall

A public opportunity board for the **NORDEEP Deep Tech Business Summit**, 5th
Anniversary Edition — 16–17 September 2026, Espoo.

Anyone at the event can post an opportunity (a job opening, a co-founder search,
a pilot request, available talent, a research collaboration) and anyone can
browse and contact the poster directly. Every submission is reviewed by the
NORDEEP team before it appears.

| Route        | What it is                                                              |
| ------------ | ----------------------------------------------------------------------- |
| `/wall`      | The venue display: animated masonry waterfall, infinite scroll, live updates |
| `/wall?kiosk=1` | Unattended screen mode: no chrome, hidden cursor, continuous auto-scroll |
| `/board`     | The practical feed: search, filters, sort, submission modal             |
| `/board/new` | Standalone submission form (this is what the QR code points at)         |
| `/admin`     | Moderation queue — approve / reject / edit                              |

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 and
Supabase. Dark theme only — that is the brand.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. **No configuration is required to see it running.**
Without Supabase credentials the app serves an in-memory demo store seeded with
the 12 sample opportunities, and shows a "Demo data" banner so nobody mistakes it
for production. Submissions and moderation work in demo mode but are lost when
the server restarts.

To exercise `/admin` locally, add an `.env.local`:

```bash
ADMIN_PASSWORD=any-long-random-string
ADMIN_SESSION_SECRET=another-long-random-string-32-chars-plus
```

---

## Environment variables

Copy `.env.example` to `.env.local` (local) or paste into Vercel's project
settings (deployed).

| Variable                        | Required | Scope  | What it does                                                                 |
| ------------------------------- | -------- | ------ | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes\*    | public | Supabase project URL                                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes\*    | public | Anon key. Safe to expose — every capability is bounded by the RLS policies    |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes\*    | server | Bypasses RLS. Used **only** by `/admin` moderation. Never prefix `NEXT_PUBLIC_` |
| `ADMIN_PASSWORD`                | yes      | server | Password for the moderation queue                                             |
| `ADMIN_SESSION_SECRET`          | yes      | server | HMAC key for the admin session cookie (32+ chars)                             |
| `NEXT_PUBLIC_SITE_URL`          | yes      | public | Public origin. Used for Open Graph URLs and the QR code target                |

\* Omit the three Supabase variables and the app runs against the demo store.

Generate the two admin secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

---

## Database setup

1. Create a Supabase project.
2. **SQL Editor → New query →** paste [`supabase/schema.sql`](supabase/schema.sql) → Run.
   This creates the enums, the `opportunities` table, indexes, the `approved_at`
   trigger, and the row-level security policies.
3. Paste [`supabase/seed.sql`](supabase/seed.sql) → Run. This inserts the 12
   approved sample opportunities so the wall is never empty on day one. It is
   safe to re-run: it clears its own rows first and never touches real posts.

Or with the Supabase CLI:

```bash
supabase db execute --file supabase/schema.sql
supabase db execute --file supabase/seed.sql
```

### Security model

Enforced in the database, not in the client:

| Role                   | SELECT                    | INSERT                        | UPDATE / DELETE |
| ---------------------- | ------------------------- | ----------------------------- | --------------- |
| `anon` / `authenticated` | only `status = 'approved'` | only `status = 'pending'`     | denied          |
| `service_role`         | everything (bypasses RLS) | everything                    | everything      |

So a public reader cannot see a pending or rejected post even by crafting their
own query, and a public writer cannot publish straight to the wall. The
`/admin` routes are the only code path that uses the service role, and each one
checks the signed admin session cookie before touching the database.

`supabase/seed.sql` is generated from `src/lib/seed-data.ts` so the demo store
and the database seed can never drift apart. Regenerate after editing it:

```bash
node scripts/generate-seed-sql.mjs
```

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. **Vercel → Add New → Project →** import the repo. The framework preset is
   detected automatically; no build settings need changing.
3. Add the environment variables from the table above.
4. Deploy.

Set `NEXT_PUBLIC_SITE_URL` to the final public origin **before** the production
deploy — the QR code on the wall and the Open Graph URLs are built from it.

### Spam controls

- **Honeypot** — a hidden `website_url` field. Anything that fills it gets a
  success response and is silently dropped.
- **Per-browser limit** — 3 submissions per session per hour, in `sessionStorage`.
- **Per-IP backstop** — 3 per hour, in-memory, in `src/lib/rate-limit.ts`.

There is deliberately **no CAPTCHA**: it kills conversion at events, and every
post is human-reviewed anyway. Note that the IP backstop is per serverless
instance, so it is best-effort rather than a hard guarantee. Swap it for
Upstash/Redis if you ever need one.

---

## Embedding the wall in an existing page

The app sends `Content-Security-Policy: frame-ancestors *` and deliberately does
**not** send `X-Frame-Options`, so it can be framed from anywhere. Nothing in the
client code touches `window.top` or `window.parent`.

```html
<iframe
  src="https://opportunities.nordeep.com/wall"
  title="NORDEEP Live Opportunity Wall"
  width="100%"
  height="900"
  style="border: 0; display: block;"
  loading="lazy"
></iframe>
```

Notes for embedding:

- Use `/board` instead if you want the searchable feed rather than the display wall.
- Add `?kiosk=1` to drop the header, footer and view toggle — useful when the
  host page already provides its own navigation.
- The masonry column count follows the **iframe's** width, not the host page's,
  so a narrow embed correctly falls back to one or two columns.
- Give the iframe real height. The page scrolls internally; it does not resize
  its frame, and it never forces horizontal scroll on the host.

To restrict who may embed it, replace the wildcard in `next.config.ts`:

```ts
{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://nordeep.com;" }
```

---

## Running the venue screen

Open `/wall?kiosk=1` full-screen (F11) on the display machine. Kiosk mode:

- hides the header, footer and view toggle;
- hides the mouse cursor after 3 seconds of no input;
- scrolls slowly and continuously down the wall, looping back to the top;
- pauses the scroll on any interaction and resumes after 10 seconds of quiet;
- keeps the "+ Post an Opportunity" pill and the QR code visible, so people can
  scan the submission form straight off the screen.

Newly approved posts appear within 20 seconds without a refresh, briefly glowing
in their type's accent colour before settling.

If the operating system requests reduced motion, the scroll animations and the
kiosk auto-scroll are disabled entirely — so use a display machine that does not
have "reduce motion" enabled.

---

## Design

Colours and typography were sampled from the computed styles on nordeep.com
rather than approximated, and are recorded at the top of `src/app/globals.css`:

| Token           | Value     | Where it comes from                    |
| --------------- | --------- | -------------------------------------- |
| Page background | `#000000` | site `body` background                 |
| Body text       | `#E0E0E0` | site `body` colour                     |
| Headings        | `#FFFFFF` | site headings                          |
| Primary accent  | `#E41D5C` | buttons, highlights, `--gt-color-*`    |
| Secondary accent| `#F4524D` | secondary buttons                      |
| Card surfaces   | `#111111` / `#191919` / `#252525` | site panels    |
| Typefaces       | Poppins 400–800, Montserrat 400/700 | site Google Fonts links |

Primary buttons reproduce the site's own rule: `#E41D5C` background, white text,
3px white border, 4px radius, `10px 20px` padding, uppercase 700, `0.2s`
transition, inverting to white background with black text on hover.

Every foreground/background pair in the palette clears **WCAG AA (4.5:1)** against
the surface it actually sits on; the two grey tiers were lightened from the first
draft specifically to satisfy this.

The logo lockup is self-hosted at `public/nordeep-logo.png` (downloaded from
nordeep.com) so the wall does not depend on a third-party request at render time.

---

## Project layout

```
src/
  app/
    wall/page.tsx            display wall (server) → WallClient
    board/page.tsx           feed + filters (server) → BoardClient
    board/new/page.tsx       standalone submission page
    admin/page.tsx           login gate → AdminClient
    api/opportunities/       GET paged public feed · POST public submission
    api/admin/session/       POST sign in · DELETE sign out
    api/admin/moderate/      GET queue · POST approve/reject · PATCH edit
    globals.css              brand tokens and component classes
    opengraph-image.tsx      generated LinkedIn/social preview card
  components/
    WallClient.tsx           masonry, infinite scroll, live polling, kiosk
    BoardClient.tsx          search, filters, sort, URL sync, submission modal
    OpportunityCard.tsx      the card, shared by both pages
    SubmissionForm.tsx       validation, honeypot, character counter
    AdminClient.tsx          moderation queue and inline editor
    wall-hooks.ts            column count, masonry packing, reveal, kiosk
    Modal.tsx                focus trap, Escape, scroll lock
  lib/
    repository.ts            data access (Supabase, or the demo store)
    validation.ts            one validator, used by form, API and moderator edits
    types.ts                 opportunity types, work modes, field limits
    query.ts                 board state ⇄ URL query string
supabase/
  schema.sql                 tables, indexes, triggers, RLS policies
  seed.sql                   12 sample opportunities (generated)
scripts/
  generate-seed-sql.mjs      regenerates seed.sql from src/lib/seed-data.ts
```

---

## Accessibility

- Semantic HTML throughout; real `<button>` and `<a>` elements.
- Visible focus rings (`#FF5C8A`, 2px) on a black ground.
- All form controls have associated labels; errors are announced via
  `role="alert"` and an error summary that receives focus on submit.
- Modals trap focus, close on Escape, and restore focus to the trigger.
- `prefers-reduced-motion: reduce` disables the reveal animations, the arrival
  glow and the kiosk auto-scroll.
- Skip links on both pages.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
```

---

Questions: **nordeep@arcticstartup.com** · [nordeep.com](https://nordeep.com)
