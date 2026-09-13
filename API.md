# API reference

Three route handlers under `src/app/api/`. All request/response bodies are
JSON. None of this is a versioned or external API — it exists to serve this
app's own client components — but it's documented here since it's the
contract between the client components and `src/lib/repository.ts`.

Validation for every write goes through the single validator in
`src/lib/validation.ts` (`validateSubmission`) — the same function backs the
public submission form, this API, and moderator edits. See
[`src/lib/types.ts`](src/lib/types.ts) for the full `Opportunity` shape,
`FIELD_LIMITS`, `OPPORTUNITY_TYPES`, and `WORK_MODES`.

## `GET /api/opportunities`

Paged, filtered feed of **approved (`live`) posts only**. Public, no auth.
Used by `/board` and by the wall's live poll.

**Query parameters** (all optional):

| Param    | Type                              | Notes                                      |
| -------- | --------------------------------- | ------------------------------------------- |
| `q`      | string                            | Free-text search across title, organisation, detail, tags, location |
| `type`   | comma-separated `OpportunityType` | Repeatable or comma-joined                  |
| `loc`    | comma-separated string            | Exact location match                        |
| `mode`   | comma-separated `WorkMode`        | `on_site` \| `hybrid` \| `remote`           |
| `sort`   | `newest` \| `organisation`        | Defaults to `newest`                        |
| `limit`  | number                            | Defaults to 24, capped at 100               |
| `offset` | number                            | Defaults to 0                               |

**200** response:

```json
{
  "items": [ /* Opportunity[] */ ],
  "total": 42,
  "hasMore": true,
  "nextOffset": 24
}
```

**503** on a data-layer failure: `{ "error": "unreachable", "message": "..." }`.

Always sent with `cache-control: no-store`.

## `POST /api/opportunities`

Public submission. Always lands in `pending/` — never directly `live`.

**Body:** the `Opportunity` input fields (`title`, `organisation`, `type`,
`detail`, `tags`, `location`, `work_mode`, `contact_email`, `contact_url`,
`contact_note`, `jd_url`) plus `website_url`, a honeypot field that must be
sent empty.

**Responses:**

| Status | Meaning |
| ------ | ------- |
| `201`  | Saved as pending. Body: `{ "queued": true }` |
| `202`  | Honeypot tripped — treated as a bot. Same success shape (`{ "queued": true }`) so scrapers learn nothing; nothing is actually saved |
| `400`  | Body was not valid JSON |
| `422`  | Failed validation. Body: `{ "message": "...", "errors": ValidationErrors }` |
| `429`  | Rate limited — 3 submissions/hour per client (`src/lib/rate-limit.ts`). Body includes a `retry-after` header (seconds) |
| `503`  | Data layer failure |

## `POST /api/admin/session`

Exchanges the moderation password for a signed, HTTP-only session cookie.
Requires `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` to be configured.

**Body:** `{ "password": "..." }`

| Status | Meaning |
| ------ | ------- |
| `200`  | Cookie set. Body: `{ "ok": true }` |
| `401`  | Wrong password |
| `429`  | Rate limited — same 3/hour bucket as public submissions, but a separate key (`admin-login:<client>`) |
| `503`  | `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` not configured |

Session cookie (`nordeep_admin`) is an HMAC-signed `expiresAt.signature`
token good for 8 hours (`src/lib/admin-session.ts`) — there is no
server-side session store.

## `DELETE /api/admin/session`

Signs out: clears the cookie. Always `200 { "ok": true }`.

## `GET /api/admin/moderate?status=pending`

The moderation queue for one status. Requires the admin cookie.

**Query:** `status` — one of `pending` (default) | `live` | `rejected`.

| Status | Meaning |
| ------ | ------- |
| `200`  | Body: `{ "items": ModeratedOpportunity[] }` (an `Opportunity` plus its `status`) |
| `400`  | Unknown `status` value |
| `401`  | Not signed in |
| `503`  | Data layer failure |

## `POST /api/admin/moderate`

Approve, reject, or otherwise move one post between lifecycle folders.
Requires the admin cookie.

**Body:** `{ "id": "...", "status": "pending" | "live" | "rejected" }`

Setting `status` to `live` writes the post straight onto the public
board/wall — there is no separate "approved" staging step. Setting it back
to `pending` (e.g. "Pull from wall") returns it to the queue.

| Status | Meaning |
| ------ | ------- |
| `200`  | `{ "ok": true }` |
| `400`  | Missing/invalid `id` or `status` |
| `401`  | Not signed in |
| `503`  | Data layer failure (including "post no longer exists") |

## `PATCH /api/admin/moderate`

Edits a post's fields in place, wherever it currently lives (its status is
unchanged). Requires the admin cookie. Runs through the same
`validateSubmission` as a public submission.

**Body:** `{ "id": "...", ...OpportunityInput }`

| Status | Meaning |
| ------ | ------- |
| `200`  | `{ "ok": true }` |
| `400`  | Missing/invalid `id` |
| `401`  | Not signed in |
| `422`  | Failed validation. Body: `{ "message": "...", "errors": ValidationErrors }` |
| `503`  | Data layer failure |
