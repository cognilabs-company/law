"use client";

import { useState } from "react";
import { useAuth, isCallCenterUser } from "@/lib/auth";
import CallCenterQueue from "@/components/admin/CallCenterQueue";
import UrgentAdvocateQueue from "@/components/admin/UrgentAdvocateQueue";
import CallCenterBoard from "@/components/admin/CallCenterBoard";
import CcClientSearch from "@/components/admin/CcClientSearch";
import CcCallLog from "@/components/admin/CcCallLog";

// Call-center console (T4-01/T4-02): queue (call-center staff), lead board,
// client lookup with the 360 card, and the call log. The backend limits the
// queue, call log and call logging to call-center staff; client lookup to
// call-center staff or users.manage — other roles see the lookup and get a
// clear "no access" answer instead of a hidden panel.
export default function AdminCallCenter() {
  const { session } = useAuth();
  const cc = isCallCenterUser(session);
  const [callsKey, setCallsKey] = useState(0);
  const onLogged = () => setCallsKey((k) => k + 1);

  return (
    <>
      {cc ? <CallCenterQueue /> : null}
      {/* Tezkor Advokat pool: its own board above the lead board, since its
          rows are claimed and scheduled rather than moved through stages. */}
      {cc ? <UrgentAdvocateQueue /> : null}
      <CallCenterBoard />
      <div className="pgrid2">
        <CcClientSearch canLog={cc} onLogged={onLogged} />
        {cc ? <CcCallLog reloadKey={callsKey} /> : null}
      </div>
    </>
  );
}
