"use client";

import { useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { SxButton, SxLinkButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { shortDateTime } from "@/lib/date";
import { marketChatHref, marketPhaseOf, type MarketOrder } from "@/lib/services/marketplace";
import { marketErrorInfo, startMarketOrder, type OrderStart, type RuntimeConfig } from "@/lib/services/marketRuntime";
import { useMarketError } from "../useMarketError";
import { useDurationText } from "./OrderFacts";
import { MessageSquareTextIcon, RocketIcon } from "./icons";

export default function StartWork({ o, aiBase, runtime, onStarted, onRefresh }: { o: MarketOrder; aiBase: string; runtime: RuntimeConfig | null; onStarted: (r: OrderStart) => void; onRefresh?: () => void }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.start");
  const to = useTranslations("marketplace.orders");
  const locale = useLocale();
  const marketErr = useMarketError();
  const durationText = useDurationText();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<SxDialogErrorText>(null);
  const [done, setDone] = useState<OrderStart | null>(null);

  if (done) {
    const roomId = done.chat?.roomId || o.roomId;
    const due = done.expectedCompletedAt || o.expectedCompletedAt;
    return (
      <SxNote
        tone="success"
        role="status"
        title={t("doneTitle")}
        action={
          roomId ? (
            <SxLinkButton variant="primary" size="sm" icon={MessageSquareTextIcon} href={marketChatHref({ roomId, workId: o.workId, serviceTitle: o.serviceTitle })} aiId={`${aiBase}.start.chat`}>
              {to("openChat")}
            </SxLinkButton>
          ) : undefined
        }
      >
        {due ? t("doneDue", { date: shortDateTime(due, locale) }) : t("doneNoDue")}
      </SxNote>
    );
  }

  if (!o.canStart || marketPhaseOf(o) !== "paid") return null;

  const duration = o.duration ?? (runtime && runtime.duration.value > 0 ? runtime.duration : null);
  const durationLine = durationText(duration);

  function close() {
    if (busy) return;
    setOpen(false);
    setErr(null);
  }

  async function run() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await startMarketOrder(o.id, o.urls.start);
      setOpen(false);
      setDone(r);
      onStarted(r);
    } catch (e) {
      const fallback = t("error");
      const msg = marketErr(e, fallback);
      setErr({ title: fallback, text: msg === fallback ? "" : msg });
      if (marketErrorInfo(e)?.status === 409) onRefresh?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SxPanel title={t("title")} lead={t("lead")} className="mod-start" aiId={`${aiBase}.start-panel`}>
      {durationLine ? <p className="mod-start__duration">{t("duration", { duration: durationLine })}</p> : null}
      <div className="mod-start__acts">
        <SxButton variant="primary" icon={RocketIcon} onClick={() => setOpen(true)} aiId={`${aiBase}.start`}>
          {t("button")}
        </SxButton>
      </div>
      <SxDialog
        open={open}
        onClose={close}
        title={t("confirmTitle")}
        description={t("lead")}
        busy={busy}
        size="sm"
        initialFocus=".mod-start__confirm"
        aiId={`${aiBase}.start-modal`}
        footer={
          <>
            <SxButton variant="primary" className="mod-start__confirm" icon={RocketIcon} busy={busy} onClick={() => void run()} aiId={`${aiBase}.start.confirm`}>
              {busy ? t("starting") : t("confirm")}
            </SxButton>
            <SxButton variant="ghost" disabled={busy} onClick={close}>
              {t("keep")}
            </SxButton>
          </>
        }
      >
        {durationLine ? <p className="mod-start__duration">{t("duration", { duration: durationLine })}</p> : null}
        <SxDialogError error={err} />
      </SxDialog>
    </SxPanel>
  );
}
