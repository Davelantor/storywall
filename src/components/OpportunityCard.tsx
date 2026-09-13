"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn, prettyUrl } from "@/lib/format";
import { TYPE_META, WORK_MODE_LABEL, type Opportunity } from "@/lib/types";

import CardOpenTarget from "./CardOpenTarget";
import RelativeTime from "./RelativeTime";

export type CardVariant = "wall" | "board";

type Props = {
  opportunity: Opportunity;
  variant: CardVariant;
  /** Opens the full detail sheet - used for taps on mobile. */
  onOpen?: (opportunity: Opportunity) => void;
  /** Highlights a post that has just arrived via the live feed. */
  arrived?: boolean;
  className?: string;
};

export function TypeBadge({
  type,
  className,
}: {
  type: Opportunity["type"];
  className?: string;
}) {
  const meta = TYPE_META[type];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] border px-2 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.12em]",
        className,
      )}
      style={{
        color: meta.text,
        borderColor: meta.border,
        backgroundColor: meta.bg,
      }}
    >
      {meta.label}
    </span>
  );
}

/** Location and work mode, shown as quiet metadata above the contact links. */
function MetaLine({ opportunity }: { opportunity: Opportunity }) {
  const bits: string[] = [];
  if (opportunity.location) bits.push(opportunity.location);
  if (opportunity.work_mode) bits.push(WORK_MODE_LABEL[opportunity.work_mode]);
  if (bits.length === 0) return null;

  return (
    <p className="text-[12px] leading-snug text-nd-muted">
      {bits.join(" · ")}
    </p>
  );
}

export function ContactLinks({
  opportunity,
  className,
  compact = false,
}: {
  opportunity: Opportunity;
  className?: string;
  /**
   * Compact keeps only the direct routes to the poster - their email and their
   * link. The Wall uses it; the Board and the detail sheet have room for the
   * full-description link and the "find me at" note as well.
   */
  compact?: boolean;
}) {
  const linkClass =
    "relative z-10 inline-flex max-w-full items-center gap-1.5 text-[12px] font-semibold text-nd-accent-hi underline-offset-4 transition-colors duration-200 hover:text-white hover:underline";

  const showJd = !compact && opportunity.jd_url;
  const showNote = !compact && opportunity.contact_note;

  const hasAny =
    opportunity.contact_email || opportunity.contact_url || showJd || showNote;

  if (!hasAny) return null;

  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {opportunity.contact_email && (
        <li className="min-w-0">
          <a
            href={`mailto:${opportunity.contact_email}`}
            className={linkClass}
            aria-label={`Email ${opportunity.organisation} at ${opportunity.contact_email}`}
          >
            <span className="truncate">{opportunity.contact_email}</span>
          </a>
        </li>
      )}

      {opportunity.contact_url && (
        <li className="min-w-0">
          <a
            href={opportunity.contact_url}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            <span className="truncate">{prettyUrl(opportunity.contact_url)}</span>
            <ExternalIcon />
          </a>
        </li>
      )}

      {showJd && (
        <li className="min-w-0">
          {/* showJd narrows to the URL string here; jd_url itself does not. */}
          <a
            href={showJd}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            <span className="truncate">Full description</span>
            <ExternalIcon />
          </a>
        </li>
      )}

      {showNote && (
        <li className="min-w-0">
          <span className="text-[12px] font-semibold text-nd-body">
            {opportunity.contact_note}
          </span>
        </li>
      )}
    </ul>
  );
}

function ExternalIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="h-2.5 w-2.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 1.5h6v6" />
      <path d="M10.5 1.5 5 7" />
      <path d="M9 7.5v3h-7.5V3h3" />
    </svg>
  );
}

export default function OpportunityCard({
  opportunity,
  variant,
  onOpen,
  arrived = false,
  className,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const detailRef = useRef<HTMLParagraphElement>(null);
  const detailId = useId();
  const isWall = variant === "wall";
  const meta = TYPE_META[opportunity.type];

  // The Board clamps long copy; the Wall always shows the full 280 characters,
  // because the resulting height variance is what gives the wall its texture.
  const clamped = !isWall && !expanded;

  // Whether the clamp actually hides anything depends on the column width, not
  // the character count, so measure it. Skipped while expanded, which keeps the
  // last measured value and stops the "Less" control from vanishing.
  useEffect(() => {
    if (isWall || expanded) return;
    const element = detailRef.current;
    if (!element) return;

    const measure = () =>
      setOverflowing(element.scrollHeight - element.clientHeight > 2);

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isWall, expanded, opportunity.detail]);

  return (
    <article
      className={cn(
        "nd-card nd-card-interactive h-full",
        arrived && "nd-arrived",
        className,
      )}
      style={
        arrived
          ? ({
              "--nd-arrive-glow": meta.glow,
              "--nd-arrive-border": meta.text,
            } as React.CSSProperties)
          : undefined
      }
    >
      {/* The Wall shows the type badge but stays stripped of organisation,
          tags and timestamp otherwise. The Board keeps all of those, because
          its filter chips and Organisation A-Z sort act on exactly those
          fields. */}
      <TypeBadge type={opportunity.type} className="self-start" />

      <h3
        className={cn(
          "font-bold leading-[1.15] text-nd-white",
          isWall ? "mt-3 text-[19px] xl:text-[21px]" : "mt-3 text-[17px]",
        )}
      >
        {onOpen ? (
          <CardOpenTarget onOpen={() => onOpen(opportunity)}>
            {opportunity.title}
          </CardOpenTarget>
        ) : (
          opportunity.title
        )}
      </h3>

      {!isWall && (
        <p className="mt-1.5 truncate text-[13px] font-medium text-nd-muted">
          {opportunity.organisation}
        </p>
      )}

      <p
        id={detailId}
        ref={detailRef}
        className={cn(
          "mt-3 text-[14px] leading-[1.65] text-nd-body",
          clamped && "line-clamp-4",
        )}
      >
        {opportunity.detail}
      </p>

      {!isWall && overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={detailId}
          className="relative z-10 mt-1.5 self-start text-[12px] font-bold uppercase tracking-[0.1em] text-nd-accent-hi transition-colors duration-200 hover:text-white"
        >
          {expanded ? "Less" : "More"}
        </button>
      )}

      {!isWall && opportunity.tags.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {opportunity.tags.map((tag) => (
            <li key={tag} className="nd-tag">
              {tag}
            </li>
          ))}
        </ul>
      )}

      {/* Contact row, pinned to the bottom of the card. */}
      <div className="mt-auto flex flex-col gap-2 pt-5">
        <MetaLine opportunity={opportunity} />
        <div className="flex items-end justify-between gap-3 border-t border-nd-line-soft pt-3">
          <ContactLinks
            opportunity={opportunity}
            compact={isWall}
            className="min-w-0 flex-1"
          />
          {!isWall && (
            <RelativeTime
              iso={opportunity.created_at}
              className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-nd-faint"
            />
          )}
        </div>
      </div>
    </article>
  );
}
