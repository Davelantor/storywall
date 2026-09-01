import type { Metadata } from "next";

import BoardClient from "@/components/BoardClient";
import { ConnectionNotice } from "@/components/Notice";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { BOARD_PAGE_SIZE } from "@/lib/constants";
import { parseBoardState } from "@/lib/query";
import { listFacets, listOpportunities } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Opportunity Board",
  description:
    "Search and filter every opportunity posted at the NORDEEP Deep Tech Business Summit: jobs, co-founders, pilots, available talent and research collaborations.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BoardPage({ searchParams }: Props) {
  const params = await searchParams;
  const state = parseBoardState(params);
  const openForm = params.post === "1";

  const [feed, facets] = await Promise.all([
    listOpportunities({
      q: state.q,
      types: state.types,
      locations: state.locations,
      modes: state.modes,
      sort: state.sort,
      limit: BOARD_PAGE_SIZE,
      offset: 0,
    }),
    listFacets(),
  ]);

  if (!feed.ok) {
    return (
      <>
        <SiteHeader active="board" />
        <main id="main" className="nd-container py-20">
          <ConnectionNotice message={feed.message} />
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <a href="#main" className="nd-sr-only nd-skip-link">
        Skip to the opportunities
      </a>

      <SiteHeader active="board" />

      <main id="main" className="nd-container py-8 md:py-10">
        <BoardClient
          initialItems={feed.data.items}
          initialTotal={feed.data.total}
          initialHasMore={feed.data.hasMore}
          initialNextOffset={feed.data.nextOffset}
          initialState={state}
          locations={facets.ok ? facets.data.locations : []}
          openForm={openForm}
        />
      </main>

      <SiteFooter />
    </>
  );
}
