"use client";

import { Suspense, useState } from "react";
import { useAuth, isCallCenterUser } from "@/lib/auth";
import CallCenterQueue from "@/components/admin/CallCenterQueue";
import UrgentAdvocateQueue from "@/components/admin/UrgentAdvocateQueue";
import QualityComplaints from "@/components/admin/QualityComplaints";
import CallCenterBoard from "@/components/admin/CallCenterBoard";
import CcClientSearch from "@/components/admin/CcClientSearch";
import CcCallLog from "@/components/admin/CcCallLog";
import CallCenterConsole, { CcTabPanel, useCcConsole } from "@/components/admin/CallCenterConsole";

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
  const con = useCcConsole(cc);

  return (
    <CallCenterConsole con={con}>
      <CcTabPanel con={con} tab="queue">
        {cc ? <CallCenterQueue onCount={con.count.queue} /> : null}
      </CcTabPanel>
      {/* Tezkor Advokat pool: its own board above the lead board, since its
          rows are claimed and scheduled rather than moved through stages. */}
      <CcTabPanel con={con} tab="urgent">
        {cc ? <UrgentAdvocateQueue onCount={con.count.urgent} /> : null}
      </CcTabPanel>
      {/* Quality complaints: their own queue, as §9 asks, because a complaint
          is not a lead and does not move through the board's stages — an
          operator rules on it once and it is done. Call-centre only: the
          endpoint answers 403 to everyone else. */}
      <CcTabPanel con={con} tab="complaints">
        {cc ? <QualityComplaints onCount={con.count.complaints} /> : null}
      </CcTabPanel>
      <CcTabPanel con={con} tab="leads">
        <CallCenterBoard />
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

export default function AdminCallCenter() {
  return (
    <Suspense fallback={null}>
      <AdminCallCenterConsole />
    </Suspense>
  );
}
