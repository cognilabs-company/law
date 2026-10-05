"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { IconChat, IconCheck, IconClock, IconPhone, IconUsers, IconVideo } from "@/components/icons";
import { ApiError, errDetail } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { setReturnTo } from "@/lib/returnTo";
import {
  PREFERRED_CHANNELS,
  activePurchaseOf,
  requestMarketplacePurchase,
  type ActivePurchase,
  type MarketPurchase,
  type MarketService,
  type PreferredChannel,
} from "@/lib/services/marketplace";
import { deliveryLabel } from "./bits";

const CHANNEL_ICON = { chat: IconChat, audio: IconPhone, video: IconVideo, meeting: IconUsers } as const;
const NOTE_MAX = 1000;
export const CLIENT_ORDERS_HREF = "/portal/client/marketplace-orders";

export default function PurchaseDialog({
  sellerUserId,
  sellerName,
  service,
  returnPath,
  onClose,
  onStale,
}: {
  sellerUserId: string;
  sellerName: string;
  service: MarketService | null;
  returnPath: string;
  onClose: () => void;
  onStale: (what: "seller" | "service") => void;
}) {
  const t = useTranslations("marketplace.purchase");
  const tm = useTranslations("marketplace");
  const te = useTranslations("enums");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [channel, setChannel] = useState<PreferredChannel>("chat");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<MarketPurchase | null>(null);
  const [active, setActive] = useState<ActivePurchase | null>(null);

  const key = service?.id ?? "";
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setNote("");
    setChannel("chat");
    setTime("");
    setErr("");
    setDone(null);
    setActive(null);
  }

  if (!service) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  const quick = [t("quick.today"), t("quick.evening"), t("quick.tomorrow"), t("quick.week")];
  const step = done ? 1 : 0;

  async function submit() {
    if (busy || done || !service) return;
    if (note.length > NOTE_MAX) {
      setErr(t("noteTooLong"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await requestMarketplacePurchase(sellerUserId, service.id, { note, preferredChannel: channel, preferredTime: time });
      setDone(r);
    } catch (e) {
      const act = activePurchaseOf(e);
      if (act) {
        setActive(act);
      } else if (e instanceof ApiError && e.status === 401) {
        setReturnTo(returnPath);
        router.push("/login");
      } else if (e instanceof ApiError && e.status === 404) {
        const noService = /ko'rsatmaydi/i.test(e.detail || "");
        setErr(noService ? t("staleService") : t("staleSeller"));
        onStale(noService ? "service" : "seller");
      } else if (e instanceof ApiError && e.status === 422) {
        setErr(Object.values(e.fieldErrors)[0] || errDetail(e) || t("error"));
      } else {
        setErr(errDetail(e) || t("error"));
      }
    } finally {
      setBusy(false);
    }
  }

  const delivery = deliveryLabel(tm, service.deliveryMinutes);

  return (
    <Modal open onClose={onClose} title={t("title")}>
      <div className="mk-buy">
        <ol className="mk-steps" aria-label={t("title")}>
          {(["request", "confirm", "chat"] as const).map((s, i) => (
            <li key={s} className={i < step ? "is-done" : i === step ? "is-now" : ""}>
              <span>{i < step ? <IconCheck /> : i + 1}</span>
              {t(`steps.${s}`)}
            </li>
          ))}
        </ol>

        <div className="mk-buy__ticket">
          <div>
            <small>{t("seller")}</small>
            <b>{sellerName}</b>
            <p>{service.title}</p>
            {delivery ? (
              <span className="mk-buy__eta">
                <IconClock />
                {delivery}
              </span>
            ) : null}
          </div>
          <div className="mk-buy__sum">
            <small>{t("total")}</small>
            <b>{fmtUzs(done?.amount || service.price)}</b>
            <span>{service.currency === "UZS" ? te("currency") : service.currency}</span>
          </div>
        </div>

        {done ? (
          <div className="mk-receipt" role="status">
            <span className="mk-receipt__stamp" aria-hidden="true">
              <IconCheck />
            </span>
            <b>{t("sentTitle")}</b>
            {done.workId ? <span className="wid">{done.workId}</span> : null}
            <span className="mk-pending">
              <i aria-hidden="true" />
              {t("pending")}
            </span>
            <p>{t("sentLead")}</p>
            {!done.telegramSent ? <Notice ok={false} msg={t("notDelivered")} /> : null}
            <div className="mk-buy__acts">
              <Link href={CLIENT_ORDERS_HREF} className="btn btn--grad">
                {t("toOrders")}
              </Link>
              <button type="button" className="btn btn--line" onClick={onClose}>
                {t("close")}
              </button>
            </div>
          </div>
        ) : active ? (
          <div className="mk-receipt mk-receipt--warn" role="status">
            <b>{t("active")}</b>
            {active.workId ? <span className="wid">{active.workId}</span> : null}
            <div className="mk-buy__acts">
              <Link href={CLIENT_ORDERS_HREF} className="btn btn--grad">
                {t("activeOpen")}
              </Link>
              <button type="button" className="btn btn--line" onClick={onClose}>
                {t("close")}
              </button>
            </div>
          </div>
        ) : (
          <form
            className="mk-buy__form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <fieldset className="mk-buy__ch" data-ai-target="marketplace:purchase-channel">
              <legend>{t("channel")}</legend>
              <div className="mk-seg">
                {PREFERRED_CHANNELS.map((c) => {
                  const Icon = CHANNEL_ICON[c];
                  return (
                    <button key={c} type="button" className="mk-seg__b" aria-pressed={channel === c} onClick={() => setChannel(c)}>
                      <Icon />
                      {t(`channels.${c}`)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="mk-in" data-ai-target="marketplace:purchase-note">
              <span>{t("note")}</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePh")} maxLength={NOTE_MAX} rows={3} />
              <em>{note.length}/{NOTE_MAX}</em>
            </label>
            <label className="mk-in" data-ai-target="marketplace:purchase-time">
              <span>{t("time")}</span>
              <input value={time} onChange={(e) => setTime(e.target.value)} placeholder={t("timePh")} maxLength={120} />
            </label>
            <div className="mk-quick">
              {quick.map((q) => (
                <button key={q} type="button" className="mk-chip mk-chip--sm" aria-pressed={time === q} onClick={() => setTime(time === q ? "" : q)}>
                  {q}
                </button>
              ))}
            </div>
            <p className="mk-buy__note">{t("totalNote")}</p>
            {err ? <Notice ok={false} msg={err} /> : null}
            <button type="submit" className="btn btn--grad btn--full btn--lg" disabled={busy} data-ai-target="button:marketplace-purchase-submit">
              {busy ? t("sending") : t("submit")}
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}
