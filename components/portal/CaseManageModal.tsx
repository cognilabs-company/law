"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateCase, type BackendCase } from "@/lib/services/backend";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { IconUser } from "@/components/icons";
import OrderStatusPanel from "@/components/portal/OrderStatusPanel";
import CaseAiTools from "@/components/portal/CaseAiTools";

const STATUSES = ["new", "active", "investigation", "court", "appeal", "completed", "archived"];

export default function CaseManageModal({
  target,
  onClose,
  onSaved,
}: {
  target: (BackendCase & { clientName?: string }) | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("portal.caseManage");
  const tc = useTranslations("portal.common");
  const [status, setStatus] = useState(target?.status || "active");
  const [stage, setStage] = useState(target?.stage || "");
  const [nextAction, setNextAction] = useState(target?.nextAction || "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  // Reset the form when a different case is opened (during render, not in an effect).
  const [prevTarget, setPrevTarget] = useState(target);
  if (target !== prevTarget) {
    setPrevTarget(target);
    if (target) {
      setStatus(target.status || "active");
      setStage(target.stage || "");
      setNextAction(target.nextAction || "");
      setNote(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await updateCase(target.id, {
        status,
        stage: stage.trim() || undefined,
        next_action: nextAction.trim() || undefined,
      });
      setNote({ ok: true, msg: t("saved") });
      onSaved();
      setTimeout(onClose, 900);
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  const statusOpts = STATUSES.map((s) => ({ value: s, label: tc.has(`status.${s}`) ? tc(`status.${s}`) : s }));

  return (
    <Modal open={!!target} onClose={onClose} title={t("title")}>
      {target ? (
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
          <div className="cmcase__head">
            {target.clientName ? <span className="pcase__client"><IconUser />{target.clientName}</span> : null}
            <b>{target.caseType || target.title || "—"}</b>
            {target.description ? <p className="advmuted">{target.description}</p> : null}
          </div>
          <div>
            <label>{t("status")}</label>
            <Select value={status} onChange={setStatus} options={statusOpts} ariaLabel={t("status")} />
          </div>
          <div>
            <label>{t("stage")}</label>
            <input value={stage} onChange={(e) => setStage(e.target.value)} placeholder={t("stagePh")} />
          </div>
          <div>
            <label>{t("nextAction")}</label>
            <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder={t("nextActionPh")} />
          </div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
            {busy ? t("saving") : t("save")}
          </button>
          {target.orderId ? <OrderStatusPanel orderId={target.orderId} side="seller" onChanged={onSaved} /> : null}
          <CaseAiTools caseId={target.id} />
        </form>
      ) : null}
    </Modal>
  );
}
