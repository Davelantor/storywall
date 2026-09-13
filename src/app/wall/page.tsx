import type { Metadata } from "next";

import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import WallClient from "@/components/WallClient";
import { ConnectionNotice, NoPostsYet } from "@/components/Notice";
import { WALL_MAX_ITEMS } from "@/lib/constants";
import { boardUrl, qrSvg, submissionUrl } from "@/lib/qr";
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

  const [feed, qr, boardQr] = await Promise.all([
    listOpportunities({ limit: WALL_MAX_ITEMS, offset: 0, sort: "newest" }),
    qrSvg(submissionUrl()),
    qrSvg(boardUrl()),
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
    <div className="flex h-dvh flex-col overflow-hidden">
      <a href="#main" className="nd-sr-only nd-skip-link">
        Skip to the wall
      </a>

      {/* Kiosk mode hides all navigation chrome for the unattended screen.
          Each column now scrolls itself independently, so the page as a
          whole never scrolls - the header just sits at the top of this
          fixed-height column rather than needing to stay pinned there. */}
      {!kiosk && <SiteHeader active="wall" size="display" />}

      <main
        id="main"
        className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4 sm:px-6 md:pt-6"
        aria-label="Opportunity wall"
      >
        {items.length === 0 ? (
          <NoPostsYet />
        ) : (
          <WallClient
            initialItems={items}
            kiosk={kiosk}
            qrSvg={qr}
            boardQrSvg={boardQr}
          />
        )}
      </main>

      {/* No footer here: with the page fixed to the viewport height and
          never scrolling, it would never be reachable. Contact details live
          on /board and /board/new. */}
    </div>
  );
}
