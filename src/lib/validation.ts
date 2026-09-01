import {
  FIELD_LIMITS,
  isOpportunityType,
  isWorkMode,
  type OpportunityInput,
} from "./types";

export type FieldName =
  | "title"
  | "organisation"
  | "type"
  | "detail"
  | "tags"
  | "location"
  | "work_mode"
  | "contact"
  | "contact_email"
  | "contact_url"
  | "contact_note"
  | "jd_url";

export type ValidationErrors = Partial<Record<FieldName, string>>;

export type ValidationResult =
  | { ok: true; value: OpportunityInput }
  | { ok: false; errors: ValidationErrors };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Accepts only absolute http(s) URLs, so we never emit a javascript: href. */
export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Adds https:// when the user typed a bare domain, then validates. */
export function normaliseUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return isValidHttpUrl(withScheme) ? withScheme : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function normaliseTags(input: unknown): string[] {
  const list = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const tag = str(raw).replace(/\s+/g, " ").slice(0, FIELD_LIMITS.tagLength);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * Validates a raw submission payload. Runs unchanged in the browser (for inline
 * feedback) and on the server (as the authoritative check).
 */
export function validateSubmission(raw: Record<string, unknown>): ValidationResult {
  const errors: ValidationErrors = {};

  const title = str(raw.title);
  if (!title) errors.title = "Give the opportunity a title.";
  else if (title.length > FIELD_LIMITS.title)
    errors.title = `Keep this under ${FIELD_LIMITS.title} characters.`;

  const organisation = str(raw.organisation);
  if (!organisation) errors.organisation = "Tell people who is posting.";
  else if (organisation.length > FIELD_LIMITS.organisation)
    errors.organisation = `Keep this under ${FIELD_LIMITS.organisation} characters.`;

  const type = str(raw.type);
  if (!type) errors.type = "Pick an opportunity type.";
  else if (!isOpportunityType(type)) errors.type = "Pick one of the listed types.";

  const detail = str(raw.detail);
  if (!detail) errors.detail = "Add a sentence or two of detail.";
  else if (detail.length > FIELD_LIMITS.detail)
    errors.detail = `Keep this under ${FIELD_LIMITS.detail} characters.`;

  const tags = normaliseTags(raw.tags);
  if (tags.length > FIELD_LIMITS.tags)
    errors.tags = `Choose up to ${FIELD_LIMITS.tags} tags.`;

  const location = str(raw.location);
  if (location.length > FIELD_LIMITS.location)
    errors.location = `Keep this under ${FIELD_LIMITS.location} characters.`;

  const workModeRaw = str(raw.work_mode);
  let work_mode: OpportunityInput["work_mode"] = null;
  if (workModeRaw) {
    if (isWorkMode(workModeRaw)) work_mode = workModeRaw;
    else errors.work_mode = "Pick on-site, hybrid or remote.";
  }

  const emailRaw = str(raw.contact_email);
  let contact_email: string | null = null;
  if (emailRaw) {
    if (isValidEmail(emailRaw)) contact_email = emailRaw;
    else errors.contact_email = "That does not look like an email address.";
  }

  const urlRaw = str(raw.contact_url);
  let contact_url: string | null = null;
  if (urlRaw) {
    contact_url = normaliseUrl(urlRaw);
    if (!contact_url) errors.contact_url = "Add a full link, e.g. https://…";
  }

  const noteRaw = str(raw.contact_note);
  let contact_note: string | null = noteRaw || null;
  if (noteRaw.length > FIELD_LIMITS.contactNote)
    errors.contact_note = `Keep this under ${FIELD_LIMITS.contactNote} characters.`;

  const jdRaw = str(raw.jd_url);
  let jd_url: string | null = null;
  if (jdRaw) {
    jd_url = normaliseUrl(jdRaw);
    if (!jd_url) errors.jd_url = "Add a full link, e.g. https://…";
  }

  // At least one way to reach the poster. Checked only once the individual
  // contact fields are themselves well-formed, so we do not double-report.
  const hasContact = Boolean(contact_email || contact_url || contact_note);
  const contactFieldsValid =
    !errors.contact_email && !errors.contact_url && !errors.contact_note;
  if (!hasContact && contactFieldsValid)
    errors.contact = "Add at least one way for people to reach you.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      title,
      organisation,
      type: type as OpportunityInput["type"],
      detail,
      tags: tags.slice(0, FIELD_LIMITS.tags),
      location: location || null,
      work_mode,
      contact_email,
      contact_url,
      contact_note,
      jd_url,
    },
  };
}
