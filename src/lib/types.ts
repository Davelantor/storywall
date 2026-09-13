export const OPPORTUNITY_TYPES = [
  "job_opening",
  "co_founder",
  "pilot_partnership",
  "research_collaboration",
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const WORK_MODES = ["on_site", "hybrid", "remote"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

// Three lifecycle stages: a submission is "pending" review, then a moderator
// either approves it straight onto the public wall/board ("live") or turns
// it away ("rejected"). There is deliberately no separate staging status
// between review and public - approving *is* releasing.
export const STATUSES = ["pending", "live", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

/** Label + colour treatment for each opportunity type badge. */
export const TYPE_META: Record<
  OpportunityType,
  { label: string; text: string; border: string; bg: string; glow: string }
> = {
  job_opening: {
    label: "Job Opening",
    text: "#FF5C8A",
    border: "rgba(228, 29, 92, 0.55)",
    bg: "rgba(228, 29, 92, 0.14)",
    glow: "rgba(228, 29, 92, 0.55)",
  },
  co_founder: {
    label: "Co-Founder",
    text: "#FF9A72",
    border: "rgba(244, 82, 77, 0.55)",
    bg: "rgba(244, 82, 77, 0.14)",
    glow: "rgba(244, 82, 77, 0.55)",
  },
  pilot_partnership: {
    label: "Pilot / Partnership",
    text: "#7FD4FF",
    border: "rgba(56, 168, 235, 0.55)",
    bg: "rgba(56, 168, 235, 0.14)",
    glow: "rgba(56, 168, 235, 0.55)",
  },
  research_collaboration: {
    label: "Research Collaboration",
    text: "#C9A9FF",
    border: "rgba(150, 110, 240, 0.55)",
    bg: "rgba(150, 110, 240, 0.14)",
    glow: "rgba(150, 110, 240, 0.55)",
  },
};

export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  on_site: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

/** Suggested tags, drawn from the NORDEEP programme tracks. */
export const SUGGESTED_TAGS = [
  "Quantum",
  "Photonics",
  "Semiconductors",
  "Robotics",
  "Biotech",
  "Materials",
  "Space",
  "AI Infrastructure",
  "Dual-Use",
  "Energy",
] as const;

export const FIELD_LIMITS = {
  title: 70,
  organisation: 50,
  detail: 280,
  location: 60,
  contactNote: 80,
  tags: 4,
  tagLength: 24,
} as const;

/** A row as returned to the public (approved posts only). */
export type Opportunity = {
  id: string;
  title: string;
  organisation: string;
  type: OpportunityType;
  detail: string;
  tags: string[];
  location: string | null;
  work_mode: WorkMode | null;
  contact_email: string | null;
  contact_url: string | null;
  contact_note: string | null;
  jd_url: string | null;
  created_at: string;
  approved_at: string | null;
};

/** A row in the moderation queue, which also carries status. */
export type ModeratedOpportunity = Opportunity & { status: Status };

export type OpportunityInput = {
  title: string;
  organisation: string;
  type: OpportunityType;
  detail: string;
  tags: string[];
  location: string | null;
  work_mode: WorkMode | null;
  contact_email: string | null;
  contact_url: string | null;
  contact_note: string | null;
  jd_url: string | null;
};

export type SortOrder = "newest" | "organisation";

export type OpportunityPage = {
  items: Opportunity[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
};

export function isOpportunityType(v: unknown): v is OpportunityType {
  return typeof v === "string" && (OPPORTUNITY_TYPES as readonly string[]).includes(v);
}

export function isWorkMode(v: unknown): v is WorkMode {
  return typeof v === "string" && (WORK_MODES as readonly string[]).includes(v);
}
