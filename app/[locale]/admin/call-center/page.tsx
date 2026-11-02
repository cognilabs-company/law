"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth, isCallCenterUser, sessionRoles } from "@/lib/auth";
import CallCenterQueue from "@/components/admin/CallCenterQueue";
import UrgentAdvocateQueue from "@/components/admin/UrgentAdvocateQueue";
import QualityComplaints from "@/components/admin/QualityComplaints";
import CancellationQueue from "@/components/admin/callcenter/cancellations/CancellationQueue";
import EscalationQueue from "@/components/admin/callcenter/EscalationQueue";
import MarketplaceComplaints from "@/components/admin/callcenter/MarketplaceComplaints";
import WarrantyQueue from "@/components/admin/callcenter/WarrantyQueue";
import { ExperienceQueue } from "@/components/admin/callcenter/ExperienceReview";
import PayoutQueue from "@/components/admin/callcenter/PayoutQueue";
import CcFocus from "@/components/admin/callcenter/CcFocus";
import { AchievementQueue } from "@/components/admin/callcenter/AchievementReview";
import { AdvocateLicenseQueue } from "@/components/admin/callcenter/AdvocateLicenseReview";
import CrmBoardEmbed from "@/components/crm/CrmBoardEmbed";
import CcClientSearch from "@/components/admin/CcClientSearch";
import CcCallLog from "@/components/admin/CcCallLog";
import CallCenterConsole, { CcTabPanel, REVIEW_PERMISSION, useCcConsole } from "@/components/admin/CallCenterConsole";
import MarketWatcher from "@/components/marketplace/MarketWatcher";

const CcxNow = dynamic(() => import("@/components/ccx/now/CcxNow"), { ssr: false });
const CcxQueues = dynamic(() => import("@/components/ccx/queues/CcxQueues"), { ssr: false });
const CcxUrgent = dynamic(() => import("@/components/ccx/urgent/CcxUrgent"), { ssr: false });
const CcxClients = dynamic(() => import("@/components/ccx/clients/CcxClients"), { ssr: false });
const CcxCrm = dynamic(() => import("@/components/ccx/crm/CcxCrm"), { ssr: false });
const CcxSupport = dynamic(() => import("@/components/ccx/support/CcxSupport"), { ssr: false });
const CcxMeetings = dynamic(() => import("@/components/ccx/meetings/CcxMeetings"), { ssr: false });
const CcxTasks = dynamic(() => import("@/components/ccx/tasks/CcxTasks"), { ssr: false });
const CcxAnalytics = dynamic(() => import("@/components/ccx/analytics/CcxAnalytics"), { ssr: false });
const CcxProfile = dynamic(() => import("@/components/ccx/profile/CcxProfile"), { ssr: false });

// Call-center console (T4-01/T4-02): queue (call-center staff), lead board,
// client lookup with the 360 card, and the call log. The backend limits the
// queue, call log and call logging to call-center staff; client lookup to
// call-center staff or users.manage — other roles see the lookup and get a
// clear "no access" answer instead of a hidden panel.
function AdminCallCenterConsole() {
  const { session } = useAuth();
  const cc = isCallCenterUser(session);
  const [logged, setLogged] = useState({ key: 0, phone: "" });
  const onLogged = (phone = "") => setLogged((s) => ({ key: s.key + 1, phone }));
  // Verification queues follow the review permission, not the role (2026-10-29 §1).
  const canReview = (session?.permissions ?? []).includes(REVIEW_PERMISSION);
  const con = useCcConsole(cc, canReview);

  return (
    <CallCenterConsole con={con}>
      {/* Live cards for new cancellation requests, discussions and
          escalations (contract 2026-10-26 §14). */}
      {cc ? <MarketWatcher role="client" staff /> : null}
      {/* TSK-635882: every marketplace queue at a glance (operators only). */}
      <CcTabPanel con={con} tab="cockpit">
        {cc ? <CcFocus onGo={con.select} onCount={con.count.cockpit} tabs={con.tabs} /> : null}
      </CcTabPanel>
      <CcTabPanel con={con} tab="queue">
        {cc ? <CallCenterQueue onCount={con.count.queue} /> : null}
      </CcTabPanel>
      {/* Tezkor Advokat pool: its own board above the lead board, since its
          rows are claimed and scheduled rather than moved through stages. */}
      <CcTabPanel con={con} tab="urgent">
        {cc ? <UrgentAdvocateQueue onCount={con.count.urgent} /> : null}
      </CcTabPanel>
      {/* Declined or expired assignments (TSK-131840). */}
      <CcTabPanel con={con} tab="escalations">
        {cc ? <EscalationQueue onCount={con.count.escalations} /> : null}
      </CcTabPanel>
      {/* Quality complaints: their own queue, as §9 asks, because a complaint
          is not a lead and does not move through the board's stages — an
          operator rules on it once and it is done. Call-centre only: the
          endpoint answers 403 to everyone else. */}
      <CcTabPanel con={con} tab="complaints">
        {cc ? <QualityComplaints onCount={con.count.complaints} /> : null}
      </CcTabPanel>
      {/* Marketplace complaints hold the seller's payout until ruled on;
          warranty claims are the LexGo guarantee. */}
      <CcTabPanel con={con} tab="mpComplaints">
        {cc ? <MarketplaceComplaints onCount={con.count.mpComplaints} /> : null}
      </CcTabPanel>
      <CcTabPanel con={con} tab="warranty">
        {cc ? <WarrantyQueue onCount={con.count.warranty} /> : null}
      </CcTabPanel>
      <CcTabPanel con={con} tab="cancellations">
        {cc ? <CancellationQueue onCount={con.count.cancellations} /> : null}
      </CcTabPanel>
      <CcTabPanel con={con} tab="experience">
        {canReview ? <ExperienceQueue onCount={con.count.experience} /> : null}
      </CcTabPanel>
      {/* TSK-906326: seller payout stages and recoveries, paid by hand
          until an automatic payout provider exists. */}
      <CcTabPanel con={con} tab="achievements">
        {canReview ? <AchievementQueue onCount={con.count.achievements} /> : null}
      </CcTabPanel>
      {/* 2026-10-29 §4.3: advocate-status certificates and suspensions. */}
      <CcTabPanel con={con} tab="licenses">
        {canReview ? <AdvocateLicenseQueue onCount={con.count.licenses} /> : null}
      </CcTabPanel>
      <CcTabPanel con={con} tab="payouts">
        {cc ? <PayoutQueue onCount={con.count.payouts} /> : null}
      </CcTabPanel>
      <CcTabPanel con={con} tab="leads">
        <CrmBoardEmbed />
      </CcTabPanel>
      <CcTabPanel con={con} tab="clients">
        <div className="pgrid2">
          <CcClientSearch canLog={cc} onLogged={onLogged} request={con.search} />
          {cc ? <CcCallLog reloadKey={logged.key} loggedPhone={logged.phone} /> : null}
        </div>
      </CcTabPanel>
    </CallCenterConsole>
  );
}

function AdminCallCenterPage() {
  const { session } = useAuth();
  const params = useSearchParams();
  const roles = sessionRoles(session);
  const operator = isCallCenterUser(session) && !roles.includes("superadmin") && !roles.includes("admin");
  if (!operator) return <AdminCallCenterConsole />;
  const tab = params.get("tab") ?? "";
  if (tab === "urgent") return <CcxUrgent />;
  if (tab === "clients") return <CcxClients />;
  if (tab === "leads") return <CcxCrm />;
  if (tab && tab !== "queue" && tab !== "cockpit") return <CcxQueues />;
  switch (params.get("view")) {
    case "queues":
      return <CcxQueues />;
    case "urgent":
      return <CcxUrgent />;
    case "clients":
      return <CcxClients />;
    case "crm":
      return <CcxCrm />;
    case "support":
      return <CcxSupport />;
    case "meetings":
      return <CcxMeetings />;
    case "tasks":
      return <CcxTasks />;
    case "analytics":
      return <CcxAnalytics />;
    case "profile":
      return <CcxProfile />;
    default:
      return <CcxNow />;
  }
}

export default function AdminCallCenter() {
  return (
    <Suspense fallback={null}>
      <AdminCallCenterPage />
    </Suspense>
  );
}
