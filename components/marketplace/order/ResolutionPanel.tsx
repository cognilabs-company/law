"use client";

import "./deal.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { useMarketError } from "@/components/marketplace/useMarketError";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { subscribeUserEvents } from "@/lib/userSocket";
import { chooseOrderResolution, escalationClosed, getOrderRefund, getOrderTimeline, idemKeyFor, idemLost, idemSettle, isResolutionEvent, type IdemSlot, type OrderRefund, type ResolutionChoice, type TimelineItem } from "@/lib/services/resolution";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import { useCountdown } from "@/lib/useCountdown";
import type { OrderSectionProps } from "./types";

// The client's side of an assignment the seller declined or let expire
// (TSK-131840): when the call center offers a choice, another specialist or
// a full refund, the client picks one here; a refund's progress follows.
// The buttons come from the offer and show only while the backend says
// `can_choose`; the deadline is the backend's, the countdown only redraws.

const REFUND_STATUSES = new Set(["refund_pending", "refunded"]);


export default function ResolutionPanel({ o, view, aiBase, onRefresh }: OrderSectionProps & { onRefresh: () => void }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.resolution");
  const ts = useTranslations("portal.common.orderStatus");
  const locale = useLocale();
  const marketError = useMarketError();
  const [choice, setChoice] = useState<ResolutionChoice | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const once = useSameTickGuard();
  const slot = useRef<IdemSlot["current"]>(null);
  const [error, setError] = useState<SxDialogErrorText>(null);
  const [chosen, setChosen] = useState<ResolutionChoice | "">("");
  // A lost answer freezes the note: only the same request goes again.
  const [lost, setLost] = useState(false);
  const [refund, setRefund] = useState<OrderRefund | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const r = o.resolution;
  const offer = r?.offer ?? null;
  const refunding = REFUND_STATUSES.has(o.status) || !!r?.refund;
  const involved = !!r || o.status === "resolution_required" || refunding;
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  });

  useEffect(() => {
    if (!involved) return;
    const ctl = new AbortController();
    const load = () => {
      getOrderTimeline(o.id, ctl.signal).then(setTimeline, (e) => !isAborted(e) && logApiError("order.timeline", e));
      if (refunding) getOrderRefund(o.id, ctl.signal).then(setRefund, (e) => !isAborted(e) && logApiError("order.refund", e));
    };
    load();
    const off = subscribeUserEvents((ev) => {
      if (!isResolutionEvent(ev.event)) return;
      const id = String(ev.order_id ?? (ev.data as { order_id?: unknown } | undefined)?.order_id ?? "");
      if (id && id !== o.id) return;
      load();
      refreshRef.current();
    });
    return () => {
      ctl.abort();
      off();
    };
  }, [involved, refunding, o.id, o.status]);

  const left = useCountdown(r?.canChoose ? (offer?.deadlineAt ?? "") : "", () => refreshRef.current());
  if (view !== "client" || !involved) return null;
  const ai = `${aiBase}.resolution`;
  const rf = refund ?? r?.refund ?? null;

  async function submit() {
    if (!choice || busy || !once()) return;
    setBusy(true);
    setError(null);
    const box: IdemSlot = { current: slot.current };
    const key = idemKeyFor(box, `${o.id}:${choice}:${note.trim()}`);
    slot.current = box.current;
    try {
      await chooseOrderResolution(o.id, choice, note, key);
      idemSettle(box);
      slot.current = box.current;
      setChosen(choice);
      setChoice("");
      onRefresh();
    } catch (e) {
      idemSettle(box, e);
      slot.current = box.current;
      if (escalationClosed(e)) {
        setChoice("");
        onRefresh();
        return;
      }
      setLost(idemLost(e));
      const fallback = t("error");
      const msg = marketError(e, fallback);
      setError({ title: fallback, text: idemLost(e) ? t("lost") : msg === fallback ? "" : msg });
    } finally {
      setBusy(false);
    }
  }

  const eventLabel = (it: TimelineItem) => {
    if (it.type === "refund" && t.has(`refund.${it.status}`)) return `${t("refundStatus")}: ${t(`refund.${it.status}`)}`;
    if (t.has(`event.${it.status}`)) return t(`event.${it.status}`);
    if (it.status && ts.has(it.status)) return ts(it.status);
    return t.has(`event.${it.type}`) ? t(`event.${it.type}`) : it.status || it.type;
  };
  const clock = left === null ? "" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <SxPanel className="mcr" title={t("title")} lead={r?.canChoose && offer ? t("leadChoose") : refunding ? t("leadRefund") : t("leadWorking")} aiId={ai}>
      {chosen ? <SxNote tone="success">{t(`chosen.${chosen}`)}</SxNote> : null}
      {r?.canChoose && offer && !chosen ? (
        <>
          {offer.message ? <blockquote className="mcr-quote">{offer.message}</blockquote> : null}
          {clock ? (
            <p className="mcr-meta" aria-live="off">
              {t("deadline", { time: clock })}
            </p>
          ) : null}
          <div className="mcr-actions">
            {offer.options.includes("reassign") ? (
              <SxButton variant="primary" onClick={() => setChoice("reassign")} aiId={`${ai}.reassign`}>
                {t("choice.reassign")}
              </SxButton>
            ) : null}
            {offer.options.includes("refund") ? (
              <SxButton variant="secondary" onClick={() => setChoice("refund")} aiId={`${ai}.refund`}>
                {t("choice.refund")}
              </SxButton>
            ) : null}
          </div>
        </>
      ) : null}
      {offer?.status === "expired" && !r?.canChoose ? <SxNote tone="info">{t("expired")}</SxNote> : null}
      {rf ? (
        <div className="mcr-refund" role="status">
          <p className="mcr-meta">
            {t("refundStatus")}: <b>{t.has(`refund.${rf.status}`) ? t(`refund.${rf.status}`) : rf.status || "—"}</b>
            {rf.amount !== null ? ` · ${fmtUzs(rf.amount)} ${rf.currency === "UZS" ? t("som") : rf.currency}` : ""}
          </p>
          {!rf.providerEnabled && rf.status !== "not_charged" ? <small className="mcr-meta">{t("manual")}</small> : null}
        </div>
      ) : null}
      {timeline.length ? (
        <ol className="mcr-timeline" aria-label={t("timeline")}>
          {timeline.map((it) => (
            <li key={it.id || `${it.type}-${it.at}`}>
              <time>{it.at ? shortDateTime(it.at, locale) : ""}</time>
              <span>{eventLabel(it)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {choice ? (
        <SxDialog
          open
          onClose={() => !busy && !lost && setChoice("")}
          title={t(`confirm.${choice}`)}
          description={t(`confirmText.${choice}`)}
          busy={busy}
          aiId={`${ai}.dialog`}
          footer={
            <>
              <SxButton variant="secondary" onClick={() => setChoice("")} disabled={busy || lost}>
                {t("back")}
              </SxButton>
              <SxButton variant={choice === "refund" ? "danger" : "primary"} busy={busy} onClick={() => void submit()} aiId={`${ai}.submit`}>
                {t(`submit.${choice}`)}
              </SxButton>
            </>
          }
        >
          <Field id={`${ai}-note`} label={t("note")}>
            {(a) => <TextArea {...a} value={note} onChange={setNote} minRows={3} maxLength={1000} placeholder={t("notePh")} readOnly={lost} />}
          </Field>
          <SxDialogError error={error} />
        </SxDialog>
      ) : null}
    </SxPanel>
  );
}
