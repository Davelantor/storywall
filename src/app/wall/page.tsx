import type { Metadata } from "next";

import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import WallClient from "@/components/WallClient";
import { ConnectionNotice, NoPostsYet } from "@/components/Notice";
import { WALL_MAX_ITEMS } from "@/lib/constants";
import { qrSvg, submissionUrl } from "@/lib/qr";
import { listOpportunities } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live Opportunity Wall",
  description:
    "The live wall of deep tech opportunities posted at the NORDEEP Deep Tech Business Summit, 16–17 September 2026.",
};

type Props = {
  searchParams: Promise<{ kiosk?: string | string[] }>;
};

export default async function WallPage({ searchParams }: Props) {
  const params = await searchParams;
  const kioskParam = Array.isArray(params.kiosk) ? params.kiosk[0] : params.kiosk;
  const kiosk = kioskParam === "1" || kioskParam === "true";

  const [feed, qr] = await Promise.all([
    listOpportunities({ limit: WALL_MAX_ITEMS, offset: 0, sort: "newest" }),
    qrSvg(submissionUrl()),
  ]);

  if (!feed.ok) {
    return (
      <>
        <SiteHeader active="wall" size="display" />
        <main id="main" className="nd-container-wide py-20">
          <ConnectionNotice message={feed.message} />
        </main>
        <SiteFooter wide />
      </>
    );
  }

  const { items } = feed.data;

  return (
    <>
      <a href="#main" className="nd-sr-only nd-skip-link">
        Skip to the wall
      </a>

      {/* Kiosk mode hides all navigation chrome for the unattended screen. */}
      {!kiosk && <SiteHeader active="wall" size="display" />}

      <main
        id="main"
        className="nd-container-wide pb-24 pt-6 md:pt-10"
        aria-label="Opportunity wall"
      >
        {items.length === 0 ? (
          <NoPostsYet />
        ) : (
          <WallClient
            initialItems={items}
            kiosk={kiosk}
            qrSvg={qr}
          />
        )}
      </main>

      {!kiosk && <SiteFooter wide />}
    </>
  );
}
