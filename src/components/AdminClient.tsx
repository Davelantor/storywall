"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { cn, relativeTime } from "@/lib/format";
import {
  FIELD_LIMITS,
  OPPORTUNITY_TYPES,
  STATUSES,
  TYPE_META,
  WORK_MODES,
  WORK_MODE_LABEL,
  type ModeratedOpportunity,
  type OpportunityType,
  type Status,
  type WorkMode,
} from "@/lib/types";
import { validateSubmission, type ValidationErrors } from "@/lib/validation";

import Modal, { ModalClose } from "./Modal";
import { TypeBadge } from "./OpportunityCard";

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pending review",
  approved: "On the wall",
  rejected: "Rejected",
};

type Props = {
  initialItems: ModeratedOpportunity[];
  initialCounts: Record<Status, number>;
  demo: boolean;
};

export default function AdminClient({
  initialItems,
  initialCounts,
  demo,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Status>("pending");
  const [items, setItems] = useState(initialItems);
  const [counts, setCounts] = useState(initialCounts);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ModeratedOpportunity | null>(null);

  const load = useCallback(async (status: Status) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/moderate?status=${status}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.reload();
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { items: ModeratedOpportunity[] };
      setItems(body.items);
    } catch {
      setError("We could not load the queue just now.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch on tab change only. The first paint is already served by
  // initialItems, and `items` must stay out of the dependencies - load() sets
  // it, so including it would make this effect retrigger itself forever.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void load(tab);
  }, [tab, load]);

  async function moderate(id: string, status: Status) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setItems((previous) => previous.filter((item) => item.id !== id));
      setCounts((previous) => ({
        ...previous,
        [tab]: Math.max(0, previous[tab] - 1),
        [status]: previous[status] + 1,
      }));
      router.refresh();
    } catch {
      setError("That change did not save. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="nd-display text-[30px]">Moderation queue</h1>
          <p className="mt-1.5 text-[14px] text-nd-muted">
            Approve a post and it appears on the wall within 20 seconds.
          </p>
        </div>
        <SignOutButton />
      </div>

      {demo && (
        <p className="mt-6 rounded-[4px] border border-nd-line bg-nd-surface p-4 text-[13px] text-nd-muted">
          Running on in-memory demo data. Moderation decisions here last only
          until the server restarts.
        </p>
      )}

      {/* Toggle buttons rather than an ARIA tablist: there is one shared panel
          below, and aria-pressed carries the state honestly without needing
          tabpanel wiring and arrow-key navigation. */}
      <div
        role="group"
        aria-label="Filter the queue by status"
        className="mt-8 flex flex-wrap gap-2 border-b border-nd-line-soft pb-4"
      >
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={tab === status}
            className="nd-chip"
            onClick={() => setTab(status)}
          >
            {STATUS_LABEL[status]}
            <span
              className={cn(
                "ml-1 tabular-nums",
                tab === status ? "text-white" : "text-nd-faint",
              )}
            >
              {counts[status]}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-6 text-[14px] text-nd-accent-2">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-4" aria-live="polite">
        {loading && <p className="text-[13px] text-nd-muted">Loading…</p>}

        {!loading && items.length === 0 && (
          <p className="rounded-[4px] border border-nd-line-soft bg-nd-surface p-8 text-center text-[15px] text-nd-muted">
            {tab === "pending"
              ? "Nothing waiting for review. Good work."
              : `No ${STATUS_LABEL[tab].toLowerCase()} posts.`}
          </p>
        )}

        {!loading &&
          items.map((item) => (
            <article
              key={item.id}
              className="rounded-[4px] border border-nd-line-soft bg-nd-surface p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <TypeBadge type={item.type} />
                <span
                  className="text-[11px] uppercase tracking-[0.08em] text-nd-faint"
                  suppressHydrationWarning
                >
                  {relativeTime(item.created_at)}
                </span>
              </div>

              <h2 className="mt-3 text-[18px] font-bold text-nd-white">
                {item.title}
              </h2>
              <p className="mt-1 text-[13px] text-nd-muted">{item.organisation}</p>
              <p className="mt-3 text-[14px] leading-relaxed text-nd-body">
                {item.detail}
              </p>

              <dl className="mt-4 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                <Row label="Tags" value={item.tags.join(", ") || "—"} />
                <Row
                  label="Location"
                  value={
                    [item.location, item.work_mode && WORK_MODE_LABEL[item.work_mode]]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  }
                />
                <Row label="Email" value={item.contact_email ?? "—"} />
                <Row label="Link" value={item.contact_url ?? "—"} />
                <Row label="Find me at" value={item.contact_note ?? "—"} />
                <Row label="Full JD" value={item.jd_url ?? "—"} />
              </dl>

              <div className="mt-5 flex flex-wrap gap-2 border-t border-nd-line-soft pt-4">
                {item.status !== "approved" && (
                  <button
                    type="button"
                    className="nd-btn nd-btn-primary"
                    disabled={busyId === item.id}
                    onClick={() => moderate(item.id, "approved")}
                  >
                    Approve
                  </button>
                )}
                {item.status !== "rejected" && (
                  <button
                    type="button"
                    className="nd-btn nd-btn-quiet"
                    disabled={busyId === item.id}
                    onClick={() => moderate(item.id, "rejected")}
                  >
                    Reject
                  </button>
                )}
                {item.status === "rejected" && (
                  <button
                    type="button"
                    className="nd-btn nd-btn-quiet"
                    disabled={busyId === item.id}
                    onClick={() => moderate(item.id, "pending")}
                  >
                    Back to pending
                  </button>
                )}
                <button
                  type="button"
                  className="nd-btn nd-btn-ghost"
                  onClick={() => setEditing(item)}
                >
                  Edit
                </button>
              </div>
            </article>
          ))}
      </div>

      <EditModal
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          setItems((previous) =>
            previous.map((item) => (item.id === updated.id ? updated : item)),
          );
          setEditing(null);
          router.refresh();
        }}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-nd-faint">{label}:</dt>
      <dd className="min-w-0 break-words text-nd-body">{value}</dd>
    </div>
  );
}

function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="nd-btn nd-btn-quiet"
      onClick={async () => {
        await fetch("/api/admin/session", { method: "DELETE" });
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

/* ========================================================================= */

function EditModal({
  item,
  onClose,
  onSaved,
}: {
  item: ModeratedOpportunity | null;
  onClose: () => void;
  onSaved: (updated: ModeratedOpportunity) => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState<ModeratedOpportunity | null>(item);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setDraft(item);
    setErrors({});
    setFailure(null);
  }, [item]);

  const set = <K extends keyof ModeratedOpportunity>(
    key: K,
    value: ModeratedOpportunity[K],
  ) => setDraft((previous) => (previous ? { ...previous, [key]: value } : previous));

  async function save() {
    if (!draft) return;
    const validation = validateSubmission(draft as unknown as Record<string, unknown>);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch("/api/admin/moderate", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draft.id, ...validation.value }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      onSaved({ ...draft, ...validation.value });
    } catch {
      setFailure("That edit did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={draft !== null} onClose={onClose} labelledBy={titleId}>
      {draft && (
        <div className="relative p-6 pt-14">
          <ModalClose onClose={onClose} />
          <h2 id={titleId} className="nd-display text-[24px]">
            Edit post
          </h2>

          <div className="mt-6 space-y-5">
            <EditField label="Title" error={errors.title}>
              <input
                className="nd-field"
                value={draft.title}
                maxLength={FIELD_LIMITS.title}
                onChange={(event) => set("title", event.target.value)}
              />
            </EditField>

            <EditField label="Organisation" error={errors.organisation}>
              <input
                className="nd-field"
                value={draft.organisation}
                maxLength={FIELD_LIMITS.organisation}
                onChange={(event) => set("organisation", event.target.value)}
              />
            </EditField>

            <EditField label="Type" error={errors.type}>
              <select
                className="nd-field cursor-pointer"
                value={draft.type}
                onChange={(event) =>
                  set("type", event.target.value as OpportunityType)
                }
              >
                {OPPORTUNITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_META[type].label}
                  </option>
                ))}
              </select>
            </EditField>

            <EditField
              label={`Detail (${draft.detail.length}/${FIELD_LIMITS.detail})`}
              error={errors.detail}
            >
              <textarea
                className="nd-field min-h-[120px] resize-y"
                value={draft.detail}
                maxLength={FIELD_LIMITS.detail}
                onChange={(event) => set("detail", event.target.value)}
              />
            </EditField>

            <EditField label="Tags (comma separated)" error={errors.tags}>
              <input
                className="nd-field"
                value={draft.tags.join(", ")}
                onChange={(event) =>
                  set(
                    "tags",
                    event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                      .slice(0, FIELD_LIMITS.tags),
                  )
                }
              />
            </EditField>

            <div className="grid gap-5 sm:grid-cols-2">
              <EditField label="Location" error={errors.location}>
                <input
                  className="nd-field"
                  value={draft.location ?? ""}
                  maxLength={FIELD_LIMITS.location}
                  onChange={(event) => set("location", event.target.value || null)}
                />
              </EditField>

              <EditField label="Work mode" error={errors.work_mode}>
                <select
                  className="nd-field cursor-pointer"
                  value={draft.work_mode ?? ""}
                  onChange={(event) =>
                    set("work_mode", (event.target.value || null) as WorkMode | null)
                  }
                >
                  <option value="">Not specified</option>
                  {WORK_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {WORK_MODE_LABEL[mode]}
                    </option>
                  ))}
                </select>
              </EditField>
            </div>

            <EditField label="Email" error={errors.contact_email}>
              <input
                className="nd-field"
                value={draft.contact_email ?? ""}
                onChange={(event) => set("contact_email", event.target.value || null)}
              />
            </EditField>

            <EditField label="Link" error={errors.contact_url}>
              <input
                className="nd-field"
                value={draft.contact_url ?? ""}
                onChange={(event) => set("contact_url", event.target.value || null)}
              />
            </EditField>

            <EditField label="Find me at" error={errors.contact_note}>
              <input
                className="nd-field"
                value={draft.contact_note ?? ""}
                maxLength={FIELD_LIMITS.contactNote}
                onChange={(event) => set("contact_note", event.target.value || null)}
              />
            </EditField>

            <EditField label="Full description URL" error={errors.jd_url}>
              <input
                className="nd-field"
                value={draft.jd_url ?? ""}
                onChange={(event) => set("jd_url", event.target.value || null)}
              />
            </EditField>

            {errors.contact && (
              <p role="alert" className="text-[13px] text-nd-accent-2">
                {errors.contact}
              </p>
            )}
            {failure && (
              <p role="alert" className="text-[13px] text-nd-accent-2">
                {failure}
              </p>
            )}
          </div>

          <div className="mt-7 flex gap-3 border-t border-nd-line-soft pt-5">
            <button
              type="button"
              className="nd-btn nd-btn-primary"
              onClick={save}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className="nd-btn nd-btn-quiet" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function EditField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* Implicit association: the control is a descendant of its own label. */}
      <label>
        <span className="nd-label">{label}</span>
        {children}
      </label>
      {error && <p className="mt-1.5 text-[13px] text-nd-accent-2">{error}</p>}
    </div>
  );
}
