import type { Metadata } from "next";
import Link from "next/link";

import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import SubmissionForm from "@/components/SubmissionForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Post an Opportunity",
  description:
    "Post a job opening, co-founder search, pilot request, available talent or research collaboration to the NORDEEP Opportunity Wall.",
};

/**
 * Standalone submission page. This is what the QR code on the venue screen
 * points at, so it has to stand on its own without the board behind it.
 */
export default function NewOpportunityPage() {
  return (
    <>
      <a href="#main" className="nd-sr-only nd-skip-link">
        Skip to the form
      </a>

      <SiteHeader active="board" showTitle={false} />

      <main id="main" className="nd-container py-10 md:py-14">
        <div className="mx-auto max-w-2xl">
          <nav aria-label="Breadcrumb" className="mb-6">
            <Link
              href="/board"
              className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-nd-muted transition-colors duration-200 hover:text-white"
            >
              <span aria-hidden="true">←</span> Back to the board
            </Link>
          </nav>

          <h1 className="nd-display text-[32px] sm:text-[44px]">
            Post an Opportunity
          </h1>
          <p className="mt-3 max-w-[54ch] text-[15px] leading-relaxed text-nd-body">
            A job opening, a co-founder search, a pilot request, talent looking
            for a team, or a research collaboration. One card, 280 characters,
            reviewed by the NORDEEP team before it appears on the wall.
          </p>

          <div className="mt-10">
            <SubmissionForm />
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
