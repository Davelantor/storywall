"use client";

import { useId } from "react";

import { absoluteTime } from "@/lib/format";
import { TYPE_META, WORK_MODE_LABEL, type Opportunity } from "@/lib/types";

import Modal, { ModalClose } from "./Modal";
import { ContactLinks, TypeBadge } from "./OpportunityCard";
import RelativeTime from "./RelativeTime";

/** Full detail view for a single opportunity, opened by tapping a card. */
export default function DetailSheet({
  opportunity,
  onClose,
}: {
  opportunity: Opportunity | null;
  onClose: () => void;
}) {
  const titleId = useId();

  return (
    <Modal
      open={opportunity !== null}
      onClose={onClose}
      labelledBy={titleId}
      variant="sheet"
    >
      {opportunity && (
        <div className="relative p-6 pt-14 sm:p-8 sm:pt-14">
          <ModalClose onClose={onClose} />

          <TypeBadge type={opportunity.type} />

          <h2
            id={titleId}
            className="mt-4 text-[24px] font-bold leading-[1.15] text-nd-white sm:text-[30px]"
          >
            {opportunity.title}
          </h2>

          <p className="mt-2 text-[15px] font-medium text-nd-body">
            {opportunity.organisation}
          </p>

          <p className="mt-5 text-[15px] leading-[1.75] text-nd-body">
            {opportunity.detail}
          </p>

          {opportunity.tags.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2">
              {opportunity.tags.map((tag) => (
                <li key={tag} className="nd-tag">
                  {tag}
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-nd-line-soft pt-6 text-[14px]">
            {opportunity.location && (
              <div>
                <dt className="nd-eyebrow text-nd-faint">Location</dt>
                <dd className="mt-1 text-nd-white">{opportunity.location}</dd>
              </div>
            )}
            {opportunity.work_mode && (
              <div>
                <dt className="nd-eyebrow text-nd-faint">Work mode</dt>
                <dd className="mt-1 text-nd-white">
                  {WORK_MODE_LABEL[opportunity.work_mode]}
                </dd>
              </div>
            )}
            <div>
              <dt className="nd-eyebrow text-nd-faint">Posted</dt>
              <dd className="mt-1 text-nd-white">
                <RelativeTime iso={opportunity.created_at} />
                <span className="block text-[12px] text-nd-muted">
                  {absoluteTime(opportunity.created_at)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="nd-eyebrow text-nd-faint">Type</dt>
              <dd
                className="mt-1 font-semibold"
                style={{ color: TYPE_META[opportunity.type].badgeText }}
              >
                {TYPE_META[opportunity.type].label}
              </dd>
            </div>
          </dl>

          <div className="mt-7 border-t border-nd-line-soft pt-6">
            <h3 className="nd-eyebrow text-nd-faint">Get in touch</h3>
            <ContactLinks opportunity={opportunity} className="mt-3 gap-y-3" />
          </div>
        </div>
      )}
    </Modal>
  );
}
