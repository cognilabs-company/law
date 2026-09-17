"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { acceptOrder, declineOrder, DECLINE_REASONS, type DeclineReason } from "@/lib/services/backend";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { errDetail, isConflict, isForbidden } from "@/lib/http";
import { IconAlert, IconCheck, IconClose, IconLock } from "@/components/icons";
import { useSellerCabinet } from "./SellerCabinet";

type Outcome = "accept" | "decline" | "taken";

// Accept / decline controls for an open order (lawyer dashboard, marketplace,
// advocate opportunities). Shows a resolved badge once actioned.
// 409 = another seller already took the order → "taken" (onDone lets the list
// drop the card); 403 = this account may not act → actions hidden with the reason.
export default function OrderActions({
  orderId,
  onDone,
}: {
  orderId: string;
  onDone?: (action: Outcome) => void;
}) {
  const tc = useTranslations("portal.common");
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  const [done, setDone] = useState<null | Outcome>(null);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // available_actions.accept_orders from the seller cabinet (allowed until it loads).
  const cabinet = useSellerCabinet();
  const canAct = cabinet.data ? cabinet.data.actions.acceptOrders : true;
  // T2-10 decline reason (S-20 list; "other" needs a note).
  const tr = useTranslations("portal.common.declineReasons");
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState<DeclineReason>("busy");
  const [reasonNote, setReasonNote] = useState("");
  const reasonOpts = DECLINE_REASONS.map((r) => ({ value: r, label: tr(r) }));

  async function run(action: "accept" | "decline") {
    if (busy || done || !canAct || forbidden) return;
    if (action === "decline" && !askReason) { setAskReason(true); return; }
    if (action === "decline" && reason === "other" && !reasonNote.trim()) return;
    setBusy(action);
    setFailed(false);
    try {
      if (action === "accept") await acceptOrder(orderId);
      else { await declineOrder(orderId, reason, reasonNote.trim()); setAskReason(false); }
      setDone(action);
      onDone?.(action);
    } catch (e) {
      if (isConflict(e)) {
        setDone("taken");
        onDone?.("taken");
      } else if (isForbidden(e)) {
        setForbidden(errDetail(e) || tc("orderForbidden"));
      } else {
        setFailed(true); // button re-enables
      }
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <span className={`pcase__done pcase__done--${done}`}>
        {done === "accept" ? <IconCheck /> : done === "taken" ? <IconAlert /> : <IconClose />}
        {done === "accept" ? tc("accepted") : done === "taken" ? tc("orderTaken") : tc("declined")}
      </span>
    );
  }

  if (forbidden) {
    return (
      <span className="pcase__done pcase__done--blocked">
        <IconLock />
        {forbidden}
      </span>
    );
  }

  return (
    <div className="pcase__act">
      <button className="btn btn--pri btn--sm" type="button" disabled={!!busy || !canAct} onClick={() => run("accept")}>
        {busy === "accept" ? tc("accepting") : tc("accept")}
      </button>
      <button className="btn btn--line btn--sm" type="button" disabled={!!busy || !canAct} onClick={() => run("decline")}>
        {tc("decline")}
      </button>
      {failed ? <span className="pcase__err" role="alert">{tc("orderActionFailed")}</span> : null}
      <Modal open={askReason} onClose={() => setAskReason(false)} title={tr("title")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <p className="advmuted">{tr("lead")}</p>
          <div>
            <label>{tr("reason")}</label>
            <Select value={reason} onChange={(v) => setReason(v as DeclineReason)} options={reasonOpts} ariaLabel={tr("reason")} />
          </div>
          <div>
            <label>{reason === "other" ? tr("noteRequired") : tr("note")}</label>
            <textarea rows={3} value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} placeholder={tr("notePh")} />
          </div>
          <button className="btn btn--pri btn--full" type="button" disabled={!!busy || (reason === "other" && !reasonNote.trim())} onClick={() => run("decline")}>
            {busy === "decline" ? tr("declining") : tr("confirm")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
