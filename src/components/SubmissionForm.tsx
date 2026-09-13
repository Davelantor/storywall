"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/format";
import {
  canSubmit,
  minutesUntilReset,
  recordSubmission,
  SUBMISSION_LIMIT,
  submissionsRemaining,
} from "@/lib/submission-guard";
import {
  FIELD_LIMITS,
  OPPORTUNITY_TYPES,
  SUGGESTED_TAGS,
  TYPE_META,
  WORK_MODES,
  WORK_MODE_LABEL,
  type OpportunityType,
  type WorkMode,
} from "@/lib/types";
import { validateSubmission, type ValidationErrors } from "@/lib/validation";

type Draft = {
  title: string;
  organisation: string;
  type: OpportunityType | "";
  detail: string;
  tags: string[];
  location: string;
  work_mode: WorkMode | "";
  contact_email: string;
  contact_url: string;
  contact_note: string;
  jd_url: string;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  organisation: "",
  type: "",
  detail: "",
  tags: [],
  location: "",
  work_mode: "",
  contact_email: "",
  contact_url: "",
  contact_note: "",
  jd_url: "",
};

export default function SubmissionForm({
  onDone,
  className,
}: {
  onDone?: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [customTag, setCustomTag] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [showCustomTagInput, setShowCustomTagInput] = useState(false);

  // Honeypot: hidden from people, irresistible to bots.
  const honeypot = useRef<HTMLInputElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const customTagInput = useRef<HTMLInputElement>(null);
  const ids = useIds();

  const detailRemaining = FIELD_LIMITS.detail - draft.detail.length;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    // Clear a field's error as soon as the person starts fixing it.
    if (errors[key as keyof ValidationErrors]) {
      setErrors((previous) => {
        const next = { ...previous };
        delete next[key as keyof ValidationErrors];
        if (key === "contact_email" || key === "contact_url" || key === "contact_note")
          delete next.contact;
        return next;
      });
    }
  };

  const markTouched = (key: keyof Draft) => {
    setTouched((previous) => ({ ...previous, [key]: true }));
    // Validate this field on blur only, so we never scold mid-typing.
    const result = validateSubmission(draft as unknown as Record<string, unknown>);
    if (!result.ok) {
      const fieldError = result.errors[key as keyof ValidationErrors];
      if (fieldError)
        setErrors((previous) => ({ ...previous, [key]: fieldError }));
    }
  };

  const toggleTag = (tag: string) => {
    setDraft((previous) => {
      const has = previous.tags.includes(tag);
      if (has) return { ...previous, tags: previous.tags.filter((t) => t !== tag) };
      if (previous.tags.length >= FIELD_LIMITS.tags) return previous;
      return { ...previous, tags: [...previous.tags, tag] };
    });
  };

  const addCustomTag = () => {
    const tag = customTag.trim().slice(0, FIELD_LIMITS.tagLength);
    if (!tag) return;
    if (draft.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setCustomTag("");
      return;
    }
    if (draft.tags.length >= FIELD_LIMITS.tags) return;
    setDraft((previous) => ({ ...previous, tags: [...previous.tags, tag] }));
    setCustomTag("");
  };

  const filteredTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return SUGGESTED_TAGS;
    return SUGGESTED_TAGS.filter((tag) => tag.toLowerCase().includes(q));
  }, [tagQuery]);

  // Close the tag dropdown on an outside click or Escape.
  useEffect(() => {
    if (!tagMenuOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (!tagMenuRef.current?.contains(event.target as Node)) setTagMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTagMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [tagMenuOpen]);

  const openCustomTagInput = () => {
    setTagMenuOpen(false);
    setShowCustomTagInput(true);
    window.setTimeout(() => customTagInput.current?.focus(), 0);
  };

  const remaining = useMemo(
    () => (status === "done" ? submissionsRemaining() : null),
    [status],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload = {
      ...draft,
      website_url: honeypot.current?.value ?? "",
    };

    const result = validateSubmission(payload as unknown as Record<string, unknown>);
    if (!result.ok) {
      setErrors(result.errors);
      setTouched(
        Object.fromEntries(Object.keys(result.errors).map((key) => [key, true])),
      );
      window.setTimeout(() => errorSummary.current?.focus(), 0);
      return;
    }

    if (!canSubmit()) {
      setFormError(
        `That is ${SUBMISSION_LIMIT} posts from this browser in the last hour. You can post again in about ${minutesUntilReset()} minutes.`,
      );
      return;
    }

    setStatus("sending");
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 422) {
        const body = (await response.json()) as { errors?: ValidationErrors };
        setErrors(body.errors ?? {});
        setStatus("idle");
        window.setTimeout(() => errorSummary.current?.focus(), 0);
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setFormError(
          body.message ??
            "We could not save your post just now. Please try again in a moment.",
        );
        setStatus("idle");
        return;
      }

      recordSubmission();
      setStatus("done");
    } catch {
      setFormError(
        "We could not reach the board. Check your connection and try again.",
      );
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className={cn("text-center", className)}>
        <div
          aria-hidden="true"
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-nd-accent"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7 text-nd-accent"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12.5 9.5 18 20 7" />
          </svg>
        </div>

        <h2 className="mt-5 text-[24px] font-bold text-nd-white">
          Your opportunity is queued for review.
        </h2>
        <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-nd-body">
          The NORDEEP team reviews every post before it goes live. Approved posts
          usually appear on the wall within an hour during summit hours — you do
          not need to do anything else.
        </p>
        {remaining !== null && (
          <p className="mt-3 text-[13px] text-nd-muted">
            You can post {remaining} more {remaining === 1 ? "time" : "times"} this
            hour.
          </p>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/wall" className="nd-btn nd-btn-primary">
            See the wall
          </Link>
          <button
            type="button"
            className="nd-btn nd-btn-ghost"
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setErrors({});
              setTouched({});
              setStatus("idle");
            }}
          >
            Post another
          </button>
          {onDone && (
            <button type="button" className="nd-btn nd-btn-quiet" onClick={onDone}>
              Back to the board
            </button>
          )}
        </div>
      </div>
    );
  }

  const errorList = Object.entries(errors).filter(([, message]) => Boolean(message));

  return (
    <form onSubmit={handleSubmit} noValidate className={cn("space-y-6", className)}>
      {/* Honeypot. Off-screen rather than display:none so naive bots still fill
          it, and hidden from assistive tech and tab order. */}
      <div aria-hidden="true" className="nd-sr-only">
        <label htmlFor={ids.honeypot}>Leave this field empty</label>
        <input
          ref={honeypot}
          id={ids.honeypot}
          name="website_url"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {errorList.length > 0 && (
        <div
          ref={errorSummary}
          tabIndex={-1}
          role="alert"
          className="rounded-[4px] border border-nd-accent-2 bg-nd-surface p-4 focus:outline-none"
        >
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-nd-accent-2">
            {errorList.length === 1
              ? "One field needs attention"
              : `${errorList.length} fields need attention`}
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-[13px] text-nd-body">
            {errorList.map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {formError && (
        <p
          role="alert"
          className="rounded-[4px] border border-nd-accent-2 bg-nd-surface p-4 text-[14px] text-nd-body"
        >
          {formError}
        </p>
      )}

      {/* ---------------------------------------------------------------- */}

      <Field
        id={ids.title}
        label="Role or opportunity title"
        required
        error={touched.title ? errors.title : undefined}
        hint={`${draft.title.length}/${FIELD_LIMITS.title}`}
      >
        <input
          id={ids.title}
          className="nd-field"
          value={draft.title}
          maxLength={FIELD_LIMITS.title}
          onChange={(event) => set("title", event.target.value)}
          onBlur={() => markTouched("title")}
          aria-invalid={touched.title && Boolean(errors.title)}
          aria-describedby={errors.title ? `${ids.title}-error` : undefined}
          placeholder="Senior Cryogenic Control Engineer"
          autoComplete="off"
        />
      </Field>

      <Field
        id={ids.organisation}
        label="Organisation or poster name"
        required
        error={touched.organisation ? errors.organisation : undefined}
        hint={`${draft.organisation.length}/${FIELD_LIMITS.organisation}`}
      >
        <input
          id={ids.organisation}
          className="nd-field"
          value={draft.organisation}
          maxLength={FIELD_LIMITS.organisation}
          onChange={(event) => set("organisation", event.target.value)}
          onBlur={() => markTouched("organisation")}
          aria-invalid={touched.organisation && Boolean(errors.organisation)}
          placeholder="Bluefors"
          autoComplete="organization"
        />
      </Field>

      <fieldset>
        <legend className="nd-label">
          Opportunity type <Required />
        </legend>
        <div className="flex flex-wrap gap-2">
          {OPPORTUNITY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="nd-chip"
              aria-pressed={draft.type === type}
              onClick={() => set("type", type)}
            >
              {TYPE_META[type].label}
            </button>
          ))}
        </div>
        {errors.type && <FieldError id={`${ids.type}-error`}>{errors.type}</FieldError>}
      </fieldset>

      <Field
        id={ids.detail}
        label="Short detail"
        required
        error={touched.detail ? errors.detail : undefined}
        hint={
          <span
            className={cn(
              "tabular-nums",
              detailRemaining < 0
                ? "text-nd-accent-2"
                : detailRemaining <= 30
                  ? "text-nd-accent-hi"
                  : "text-nd-faint",
            )}
          >
            {detailRemaining} left
          </span>
        }
      >
        <textarea
          id={ids.detail}
          className="nd-field min-h-[132px] resize-y"
          value={draft.detail}
          maxLength={FIELD_LIMITS.detail}
          onChange={(event) => set("detail", event.target.value)}
          onBlur={() => markTouched("detail")}
          aria-invalid={touched.detail && Boolean(errors.detail)}
          placeholder="What is the opportunity, who is it for, and what happens next?"
        />
      </Field>

      {/* ------------------------------------------------------------ tags */}

      <fieldset>
        <legend className="nd-label">
          Tags{" "}
          <span className="font-normal normal-case tracking-normal text-nd-faint">
            optional, up to {FIELD_LIMITS.tags}
          </span>
        </legend>

        {draft.tags.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {draft.tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  className="nd-chip"
                  aria-pressed
                  onClick={() => toggleTag(tag)}
                >
                  {tag} <span aria-hidden="true">×</span>
                  <span className="nd-sr-only">Remove tag {tag}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative" ref={tagMenuRef}>
          <button
            type="button"
            className="nd-field flex w-full items-center justify-between text-left disabled:cursor-not-allowed disabled:opacity-40"
            aria-haspopup="listbox"
            aria-expanded={tagMenuOpen}
            disabled={draft.tags.length >= FIELD_LIMITS.tags}
            onClick={() => setTagMenuOpen((open) => !open)}
          >
            <span className="text-nd-faint">
              {draft.tags.length >= FIELD_LIMITS.tags
                ? `${FIELD_LIMITS.tags} tags added`
                : "Choose a tag…"}
            </span>
            <span aria-hidden="true">▾</span>
          </button>

          {tagMenuOpen && (
            <div className="absolute z-10 mt-1 w-full rounded-[4px] border border-nd-line-soft bg-nd-surface shadow-lg">
              <input
                autoFocus
                type="text"
                value={tagQuery}
                onChange={(event) => setTagQuery(event.target.value)}
                placeholder="Search tags…"
                aria-label="Search tags"
                className="nd-field rounded-b-none border-0 border-b border-nd-line-soft"
              />
              <ul role="listbox" aria-multiselectable className="max-h-56 overflow-y-auto p-1">
                {filteredTags.map((tag) => {
                  const selected = draft.tags.includes(tag);
                  const full = draft.tags.length >= FIELD_LIMITS.tags && !selected;
                  return (
                    <li key={tag}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={full}
                        className={cn(
                          "block w-full rounded-[3px] px-3 py-2 text-left text-[14px] text-nd-body hover:bg-nd-surface-2 disabled:cursor-not-allowed disabled:opacity-40",
                          selected && "text-nd-accent",
                        )}
                        onClick={() => toggleTag(tag)}
                      >
                        {selected && <span aria-hidden="true">✓ </span>}
                        {tag}
                      </button>
                    </li>
                  );
                })}
                {filteredTags.length === 0 && (
                  <li className="px-3 py-2 text-[13px] text-nd-faint">No matching tags.</li>
                )}
                <li className="mt-1 border-t border-nd-line-soft pt-1">
                  <button
                    type="button"
                    className="block w-full rounded-[3px] px-3 py-2 text-left text-[14px] text-nd-body hover:bg-nd-surface-2"
                    onClick={openCustomTagInput}
                  >
                    Other — add your own
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>

        {showCustomTagInput && (
          <div className="mt-3 flex gap-2">
            <input
              ref={customTagInput}
              id={ids.customTag}
              className="nd-field max-w-[280px]"
              value={customTag}
              maxLength={FIELD_LIMITS.tagLength}
              placeholder="Add your own tag"
              aria-label="Add your own tag"
              disabled={draft.tags.length >= FIELD_LIMITS.tags}
              onChange={(event) => setCustomTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomTag();
                }
              }}
            />
            <button
              type="button"
              className="nd-btn nd-btn-quiet"
              onClick={addCustomTag}
              disabled={draft.tags.length >= FIELD_LIMITS.tags || !customTag.trim()}
            >
              Add
            </button>
          </div>
        )}
        {errors.tags && <FieldError id={`${ids.customTag}-error`}>{errors.tags}</FieldError>}
      </fieldset>

      {/* -------------------------------------------------------- location */}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          id={ids.location}
          label="Location"
          error={touched.location ? errors.location : undefined}
          optional
        >
          <input
            id={ids.location}
            className="nd-field"
            value={draft.location}
            maxLength={FIELD_LIMITS.location}
            onChange={(event) => set("location", event.target.value)}
            onBlur={() => markTouched("location")}
            placeholder="Espoo, Finland"
            autoComplete="address-level2"
          />
        </Field>

        <fieldset>
          <legend className="nd-label">
            Work mode{" "}
            <span className="font-normal normal-case tracking-normal text-nd-faint">
              optional
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {WORK_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className="nd-chip"
                aria-pressed={draft.work_mode === mode}
                onClick={() => set("work_mode", draft.work_mode === mode ? "" : mode)}
              >
                {WORK_MODE_LABEL[mode]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {/* --------------------------------------------------------- contact */}

      <fieldset className="rounded-[4px] border border-nd-line-soft p-4 sm:p-5">
        <legend className="nd-label px-1">
          How should people reach you? <Required />
        </legend>
        <p className="mb-4 text-[13px] text-nd-muted">
          Fill in at least one. These appear publicly on your card.
        </p>

        {errors.contact && (
          <FieldError id={`${ids.contact}-error`}>{errors.contact}</FieldError>
        )}

        <div className="space-y-5">
          <Field
            id={ids.email}
            label="Email"
            error={touched.contact_email ? errors.contact_email : undefined}
          >
            <input
              id={ids.email}
              type="email"
              inputMode="email"
              className="nd-field"
              value={draft.contact_email}
              onChange={(event) => set("contact_email", event.target.value)}
              onBlur={() => markTouched("contact_email")}
              aria-invalid={touched.contact_email && Boolean(errors.contact_email)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>

          <Field
            id={ids.url}
            label="LinkedIn or website"
            error={touched.contact_url ? errors.contact_url : undefined}
          >
            <input
              id={ids.url}
              type="url"
              inputMode="url"
              className="nd-field"
              value={draft.contact_url}
              onChange={(event) => set("contact_url", event.target.value)}
              onBlur={() => markTouched("contact_url")}
              aria-invalid={touched.contact_url && Boolean(errors.contact_url)}
              placeholder="linkedin.com/in/you"
              autoComplete="url"
            />
          </Field>

          <Field
            id={ids.note}
            label="Or find me at"
            error={touched.contact_note ? errors.contact_note : undefined}
            hint={`${draft.contact_note.length}/${FIELD_LIMITS.contactNote}`}
          >
            <input
              id={ids.note}
              className="nd-field"
              value={draft.contact_note}
              maxLength={FIELD_LIMITS.contactNote}
              onChange={(event) => set("contact_note", event.target.value)}
              onBlur={() => markTouched("contact_note")}
              placeholder="Booth C14"
            />
          </Field>
        </div>
      </fieldset>

      <Field
        id={ids.jd}
        label="Link to a full description"
        error={touched.jd_url ? errors.jd_url : undefined}
        optional
      >
        <input
          id={ids.jd}
          type="url"
          inputMode="url"
          className="nd-field"
          value={draft.jd_url}
          onChange={(event) => set("jd_url", event.target.value)}
          onBlur={() => markTouched("jd_url")}
          aria-invalid={touched.jd_url && Boolean(errors.jd_url)}
          placeholder="https://example.com/careers/the-role"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3 border-t border-nd-line-soft pt-6">
        <button
          type="submit"
          className="nd-btn nd-btn-primary"
          disabled={status === "sending"}
        >
          {status === "sending" ? "Posting…" : "Post opportunity"}
        </button>
        {onDone && (
          <button type="button" className="nd-btn nd-btn-quiet" onClick={onDone}>
            Cancel
          </button>
        )}
        <p className="text-[12px] text-nd-muted">
          Reviewed by the NORDEEP team before it appears.
        </p>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ bits */

function Required() {
  return (
    <span className="text-nd-accent" aria-hidden="true">
      *
    </span>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-[13px] text-nd-accent-2">
      {children}
    </p>
  );
}

function Field({
  id,
  label,
  children,
  error,
  hint,
  required = false,
  optional = false,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="nd-label">
          {label} {required && <Required />}
          {optional && (
            <span className="font-normal normal-case tracking-normal text-nd-faint">
              optional
            </span>
          )}
        </label>
        {hint && <span className="mb-1.5 text-[11px] text-nd-faint">{hint}</span>}
      </div>
      {children}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

function useIds() {
  const base = useId();
  return {
    title: `${base}-title`,
    organisation: `${base}-org`,
    type: `${base}-type`,
    detail: `${base}-detail`,
    customTag: `${base}-tag`,
    location: `${base}-location`,
    contact: `${base}-contact`,
    email: `${base}-email`,
    url: `${base}-url`,
    note: `${base}-note`,
    jd: `${base}-jd`,
    honeypot: `${base}-website`,
  };
}
