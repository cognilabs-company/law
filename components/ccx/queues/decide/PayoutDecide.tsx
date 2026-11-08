"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, errDetail, isForbidden } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { markPayoutPaid, resolvePayoutRecovery, type Payout, type PayoutStatus, type Recovery } from "@/lib/services/payouts";
import { CaseBox, FactStrip, Field, Note, PanelFoot, type Fact } from "../../panel/bits";
import { IcClock, IcCoins, IcDoc, IcLayers, IcShield } from "../../icons";
import Party from "./Party";
import { focusFirstError } from "./focus";
import type { DecideProps } from "./types";

const STATUS_TONE: Record<PayoutStatus, string> = { due: "warn", processing: "info", failed: "hot", recovery: "warn", review: "info", held: "mute", paid: "ok", other: "mute" };

export default function PayoutDecide({ job, item, onDone, onClose, onDirty }: DecideProps<Payout | Recovery>) {
  const t = useTranslations("callCenter.payouts");
  const tx = useTranslations("admin.ccx.panel");
  const tc = useTranslations("admin.ccx.cases");
  const tcom = useTranslations("common");
  const locale = useLocale();
  const recovery = job.queue === "recoveries";
  const box = useRef<HTMLDivElement>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refErr, setRefErr] = useState("");
  const [err, setErr] = useState("");
  // A 403: this account may not settle it — the form and button leave.
  const [denied, setDenied] = useState(false);

  const stage = "stage" in item && item.stage !== "other" ? item.stage : "";
  const percent = "percent" in item ? item.percent : null;

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    onDirty(true);
  };

  const submit = async () => {
    if (busy || denied) return;
    const ref = reference.trim();
    if (!ref) {
      setRefErr(t("err.reference"));
      focusFirstError(box.current);
      return;
    }
    setRefErr("");
    setErr("");
    setBusy(true);
    try {
      if (recovery) await resolvePayoutRecovery(item.id, { reference: ref, note: note.trim() });
      else await markPayoutPaid(item.id, { reference: ref, note: note.trim() });
      onDone(recovery ? t("doneRecovered") : t("donePaid"));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      if (isForbidden(e)) {
        setDenied(true);
        onDirty(false);
        setErr(errDetail(e) || tcom("forbidden"));
        return;
      }
      setErr(code && t.has(`code.${code}`) ? t(`code.${code}`) : errDetail(e) || t("err.generic"));
    } finally {
      setBusy(false);
    }
  };

  const facts: Fact[] = [
    { icon: <IcDoc size={17} />, label: tx("service"), value: item.serviceTitle || t("noOrder") },
    ...(stage ? [{ icon: <IcLayers size={17} />, label: tc("stage"), value: percent !== null && percent > 0 ? `${t(`stage.${stage}`)} · ${percent}%` : t(`stage.${stage}`) }] : []),
    { icon: <IcCoins size={17} />, label: tx("amount"), value: <span className="opx-num">{`${fmtUzs(item.amount)} ${t("som")}`}</span> },
    { icon: <IcClock size={17} />, label: tx("created"), value: item.createdAt ? shortDateTime(item.createdAt, locale) : "—" },
  ];

  return (
    <>
      <div className="opx-pscroll" ref={box}>
        <Party role={tx("seller")} id={item.seller?.id} name={item.seller?.name} empty={t("noSeller")} />
        <FactStrip facts={facts} />
        <CaseBox
          icon={<IcShield size={18} />}
          label={tx("status")}
          title={
            <span className="opx-pill opx-fpill" data-tone={STATUS_TONE[item.status]}>
              {t(`status.${item.status}`)}
            </span>
          }
        >
          {item.reason ? <p>{item.reason}</p> : null}
        </CaseBox>
        {denied ? null : (
          <>
            <Note tone="info">{recovery ? t("recoverPolicy") : t("policy")}</Note>
            <section className="opx-psec">
              <Field label={t("reference")} value={reference} onChange={edit(setReference)} max={120} required hint={t("referenceHelp")} error={refErr} />
              <Field label={t("note")} value={note} onChange={edit(setNote)} max={1000} multiline />
            </section>
          </>
        )}
        {err ? <Note tone="bad">{err}</Note> : null}
      </div>
      {denied ? (
        <PanelFoot onCancel={onClose} cancelLabel={tx("close")} />
      ) : (
        <PanelFoot onCancel={onClose} primary={() => void submit()} primaryLabel={recovery ? t("markRecovered") : t("markPaid")} busy={busy} />
      )}
    </>
  );
}
