"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { errDetail, isForbidden } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { REFUND_NOTE_MIN, decideRefund, refundErrorOf, refundNeedsNote, type RefundAction, type RefundRequest } from "@/lib/services/refunds";
import { CaseBox, Choice, FactStrip, Field, Note, PanelFoot, type Fact } from "../../panel/bits";
import { IcClock, IcCoins, IcDoc, IcRefresh, IcShield } from "../../icons";
import Party from "./Party";
import { focusFirstError } from "./focus";
import type { DecideProps } from "./types";

// A refund Click or ATMOS could not make on its own (2026-11-21 contract §2):
// try the provider again, record a refund made outside it (a bank transfer),
// or refuse it. The last two need a note of at least 5 characters.
export default function RefundDecide({ item, onDone, onClose, onDirty }: DecideProps<RefundRequest>) {
  const t = useTranslations("callCenter.refunds");
  const tx = useTranslations("admin.ccx.panel");
  const tcom = useTranslations("common");
  const locale = useLocale();
  const box = useRef<HTMLDivElement>(null);
  const [action, setAction] = useState<RefundAction>("retry_provider");
  const [note, setNote] = useState("");
  const [noteErr, setNoteErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Already decided elsewhere, or not this account's to decide: no form.
  const [closed, setClosed] = useState(false);
  const [providerError, setProviderError] = useState(item.providerError);

  const pick = (a: string) => {
    setAction(a as RefundAction);
    setNoteErr("");
    setErr("");
    onDirty(true);
  };

  const submit = async () => {
    if (busy || closed) return;
    const text = note.trim();
    if (refundNeedsNote(action) && text.length < REFUND_NOTE_MIN) {
      setNoteErr(t("err.note", { n: REFUND_NOTE_MIN }));
      focusFirstError(box.current);
      return;
    }
    setNoteErr("");
    setErr("");
    setBusy(true);
    try {
      await decideRefund(item.id, action, refundNeedsNote(action) ? text : "");
      onDone(t(`done.${action}`));
    } catch (e) {
      if (isForbidden(e)) {
        setClosed(true);
        onDirty(false);
        setErr(errDetail(e) || tcom("forbidden"));
        return;
      }
      const re = refundErrorOf(e);
      if (re.refund?.providerError) setProviderError(re.refund.providerError);
      if (re.key === "alreadyDecided") {
        setClosed(true);
        onDirty(false);
      }
      if (re.key === "noteRequired") {
        setNoteErr(t("err.note", { n: REFUND_NOTE_MIN }));
        return;
      }
      setErr(re.key === "generic" ? errDetail(e) || t("err.generic") : t(`err.${re.key}`));
    } finally {
      setBusy(false);
    }
  };

  const provider = item.provider === "atmos" ? "ATMOS" : item.provider === "click" ? "Click" : "";
  const facts: Fact[] = [
    { icon: <IcDoc size={17} />, label: tx("service"), value: item.serviceTitle || item.orderWorkId || "—" },
    { icon: <IcCoins size={17} />, label: tx("amount"), value: <span className="opx-num">{`${fmtUzs(item.amount)} ${t("som")}`}</span> },
    { icon: <IcRefresh size={17} />, label: t("type"), value: t.has(`types.${item.refundType}`) ? t(`types.${item.refundType}`) : item.refundType || "—" },
    { icon: <IcClock size={17} />, label: tx("created"), value: item.createdAt ? shortDateTime(item.createdAt, locale) : "—" },
  ];

  return (
    <>
      <div className="opx-pscroll" ref={box} data-ai-id="ccx.refunds.decide">
        <Party role={t("client")} id={item.clientUserId} name={item.clientName} empty={t("noClient")} />
        <FactStrip facts={facts} />
        <CaseBox
          icon={<IcShield size={18} />}
          label={tx("status")}
          title={
            <span className="opx-pill opx-fpill" data-tone={item.status === "operator_required" ? "hot" : "info"}>
              {t.has(`status.${item.status}`) ? t(`status.${item.status}`) : item.status}
            </span>
          }
        >
          {providerError ? (
            <p>
              <b>{provider ? t("providerErrorOf", { provider }) : t("providerError")}</b> {providerError}
            </p>
          ) : null}
          {item.reason ? (
            <p>
              <b>{t("reason")}</b> {item.reason}
            </p>
          ) : null}
        </CaseBox>
        {closed ? null : (
          <>
            <Note tone="info">{t("policy")}</Note>
            <section className="opx-psec">
              <Choice
                label={t("action")}
                value={action}
                onChange={pick}
                options={[
                  { value: "retry_provider", label: provider ? t("actions.retryOf", { provider }) : t("actions.retry_provider"), hint: t("hints.retry_provider") },
                  { value: "confirm_manual_refund", label: t("actions.confirm_manual_refund"), hint: t("hints.confirm_manual_refund") },
                  { value: "reject", label: t("actions.reject"), hint: t("hints.reject"), danger: true },
                ]}
              />
              {refundNeedsNote(action) ? (
                <Field
                  label={t("note")}
                  value={note}
                  onChange={(v) => {
                    setNote(v);
                    onDirty(true);
                  }}
                  max={1000}
                  multiline
                  required
                  placeholder={action === "reject" ? t("notePhReject") : t("notePhManual")}
                  hint={t("noteHelp", { n: REFUND_NOTE_MIN })}
                  error={noteErr}
                />
              ) : null}
            </section>
          </>
        )}
        {err ? <Note tone="bad">{err}</Note> : null}
      </div>
      {closed ? (
        <PanelFoot onCancel={onClose} cancelLabel={tx("close")} />
      ) : (
        <PanelFoot onCancel={onClose} primary={() => void submit()} primaryLabel={t(`submit.${action}`)} busy={busy} danger={action === "reject"} />
      )}
    </>
  );
}
