"use client";

import { useState, type CSSProperties, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { SxButton, SxLinkButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { shortDateTime } from "@/lib/date";
import { marketChatHref, marketPhaseOf, type MarketOrder } from "@/lib/services/marketplace";
import { marketErrorInfo, startMarketOrder, type OrderStart, type RuntimeConfig, type RuntimeDuration } from "@/lib/services/marketRuntime";
import { useMarketError } from "../useMarketError";
import { useTick } from "../OrderExtras";
import { durationParts } from "./deadline";
import { useDurationText } from "./OrderFacts";
import { BellRingIcon, CalendarCheckIcon, ListChecksIcon, MessageSquareTextIcon, RocketIcon, TimerIcon, glyph } from "./icons";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

const UNIT_MS = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 } as const;
const WHAT = [
  ["checklist", ListChecksIcon],
  ["chat", MessageSquareTextIcon],
  ["deadline", TimerIcon],
  ["notify", BellRingIcon],
] as const;

// Where the deadline would land if the seller started now, on this device's
// clock. Calendar time only: business days depend on the backend's own
// weekday rules, and the backend fixes the real date on start anyway.
function dueIfStartedNow(now: number, d: RuntimeDuration | null): number {
  const parts = durationParts(d);
  if (!now || !parts || d?.calendar === "business") return Number.NaN;
  if (parts.unit === "month") {
    const at = new Date(now);
    at.setMonth(at.getMonth() + parts.n);
    return at.getTime();
  }
  return now + parts.n * UNIT_MS[parts.unit];
}

export default function StartWork({ o, aiBase, runtime, onStarted, onRefresh }: { o: MarketOrder; aiBase: string; runtime: RuntimeConfig | null; onStarted: (r: OrderStart) => void; onRefresh?: () => void }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.start");
  const to = useTranslations("marketplace.orders");
  const locale = useLocale();
  const marketErr = useMarketError();
  const durationText = useDurationText();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const once = useSameTickGuard();
  const [err, setErr] = useState<SxDialogErrorText>(null);
  const [done, setDone] = useState<OrderStart | null>(null);
  const showing = !done && o.canStart && marketPhaseOf(o) === "paid";
  const now = useTick(showing, 30_000);

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
  const previewAt = dueIfStartedNow(now, duration);

  function close() {
    if (busy) return;
    setOpen(false);
    setErr(null);
  }

  async function run() {
    if (busy || !once()) return;
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
    <SxPanel title={t("title")} className="mod-start" aiId={`${aiBase}.start-panel`}>
      <span className="mod-start__ico" aria-hidden="true">
        {glyph(RocketIcon, { size: 24 })}
      </span>
      <div className="mod-start__what">
        <p className="mod-start__what-title">{t("whatTitle")}</p>
        <ol className="mod-start__steps">
          {WHAT.map(([key, icon], i) => (
            <li key={key} className="mod-start__step" style={{ "--i": i } as CSSProperties}>
              <span className="mod-start__step-ico" aria-hidden="true">
                {glyph(icon, { size: 18 })}
              </span>
              <span>{t(`what.${key}`)}</span>
            </li>
          ))}
        </ol>
      </div>
      {Number.isFinite(previewAt) ? (
        <p className="mod-start__preview">
          {glyph(CalendarCheckIcon, { size: 18 })}
          <span>{t.rich("preview", { date: shortDateTime(new Date(previewAt).toISOString(), locale), b: (chunks) => <b>{chunks}</b> })}</span>
        </p>
      ) : null}
      <div className="mod-start__acts">
        <SxButton variant="primary" icon={RocketIcon} onClick={() => setOpen(true)} aiId={`${aiBase}.start`}>
          {t("button")}
        </SxButton>
        {durationLine ? (
          <p className="mod-start__duration">
            {glyph(TimerIcon, { size: 16 })}
            <span>{t("duration", { duration: durationLine })}</span>
          </p>
        ) : null}
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
