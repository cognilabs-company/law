"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CrmLead } from "@/lib/services/crm";
import Sheet from "../../panel/Sheet";
import { Field, PanelFoot } from "../../panel/bits";
import { IcClose } from "../../icons";
import { DateTimeField } from "./fields";
import { fromLocalInput } from "./util";

export default function RejectSheet({ lead, onClose, onSend }: { lead: CrmLead; onClose: () => void; onSend: (reason: string, next: string | null) => Promise<void> }) {
  const t = useTranslations("crm.board");
  const [reason, setReason] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const bad = reason.trim().length < 3;
  const title = t("rejectTitle", { lead: lead.title || lead.workId });

  const send = async () => {
    setTried(true);
    if (bad || busy) return;
    setBusy(true);
    try {
      await onSend(reason.trim(), next ? fromLocalInput(next) : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      label={title}
      onClose={onClose}
      dirty={!!reason}
      head={
        <div className="opx-ld-shead" data-tone="hot">
          <span className="opx-ld-shead__ic" aria-hidden="true">
            <IcClose size={20} />
          </span>
          <span className="opx-ld-shead__txt">
            <b>{title}</b>
            <small className="opx-num">{lead.workId}</small>
          </span>
        </div>
      }
    >
      <div className="opx-pscroll opx-ld-form">
        <Field label={t("rejectReason")} value={reason} onChange={setReason} multiline rows={4} max={2000} required error={tried && bad ? t("rejectNeed") : undefined} />
        <DateTimeField label={t("rejectNext")} value={next} onChange={setNext} />
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={t("cancel")} primary={() => void send()} primaryLabel={t("rejectOk")} busy={busy} danger />
    </Sheet>
  );
}
