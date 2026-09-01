import type { Metadata } from "next";

import AdminClient from "@/components/AdminClient";
import AdminLogin from "@/components/AdminLogin";
import { ConnectionNotice } from "@/components/Notice";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { adminAuthConfigured, isAdminAuthenticated } from "@/lib/admin-session";
import { countByStatus, listForModeration } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Moderation",
  // The queue contains unreviewed public submissions; keep it out of indexes.
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const configured = adminAuthConfigured();
  const authenticated = configured && (await isAdminAuthenticated());

  return (
    <>
      <SiteHeader active="admin" showTitle={false} />

      <main id="main" className="nd-container py-12 md:py-16">
        {!configured ? (
          <SetupNotice />
        ) : !authenticated ? (
          <AdminLogin />
        ) : (
          <AuthenticatedQueue />
        )}
      </main>

      <SiteFooter />
    </>
  );
}

async function AuthenticatedQueue() {
  const [queue, counts] = await Promise.all([
    listForModeration("pending"),
    countByStatus(),
  ]);

  if (!queue.ok) {
    return <ConnectionNotice message={queue.message} />;
  }

  return (
    <AdminClient
      initialItems={queue.data}
      initialCounts={
        counts.ok ? counts.data : { pending: queue.data.length, approved: 0, rejected: 0 }
      }
      demo={queue.demo}
    />
  );
}

function SetupNotice() {
  return (
    <div className="mx-auto max-w-xl rounded-[4px] border border-nd-line bg-nd-surface p-8">
      <p className="nd-eyebrow text-nd-accent">Setup needed</p>
      <h1 className="mt-3 text-[24px] font-bold text-nd-white">
        Moderation is not configured yet.
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-nd-body">
        Set these environment variables and redeploy. Both need to be long random
        strings — see <code className="text-nd-white">.env.example</code>.
      </p>
      <ul className="mt-5 space-y-2 text-[13px]">
        <li className="rounded-[3px] border border-nd-line-soft bg-nd-black px-3 py-2 font-mono text-nd-body">
          ADMIN_PASSWORD
        </li>
        <li className="rounded-[3px] border border-nd-line-soft bg-nd-black px-3 py-2 font-mono text-nd-body">
          ADMIN_SESSION_SECRET
        </li>
        <li className="rounded-[3px] border border-nd-line-soft bg-nd-black px-3 py-2 font-mono text-nd-body">
          SUPABASE_SERVICE_ROLE_KEY
        </li>
      </ul>
    </div>
  );
}
