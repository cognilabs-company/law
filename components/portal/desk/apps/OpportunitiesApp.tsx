"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { acceptOrder, declineOrder, DECLINE_REASONS, listOpenOrders, type BackendOrder, type DeclineReason } from "@/lib/services/backend";
import { errDetail, isConflict, isForbidden } from "@/lib/http";
import { shortDateTime } from "@/lib/date";
import { useOrderStatusLabel } from "@/lib/orderStatus";
import { IconAlert, IconBriefcase, IconCheck, IconClock, IconClose, IconCoins, IconMapPin, IconRefresh } from "@/components/icons";
import { App, Banner, Btn, Dialog, Empty, Field, Loading, Select, Tag, TextArea, Tool, Toolbar, useOs, useToast } from "../kit/kit";
import type { NativeProps } from "../native";
import "./opportunities.css";

// New opportunities as a desktop program, an inbox of requests: each with
// the time left to answer counting down, the chosen one in full on the
// right with Accept and Decline (a reason asked for in a sheet). Requests
// taken by someone else meanwhile leave the list.

type Outcome = "accept" | "decline" | "taken";

export default function OpportunitiesApp({ openApp, base }: NativeProps) {
  const t = useTranslations("portal.advocate.opportunities");
  const tc = useTranslations("portal.common");
  const tr = useTranslations("portal.common.declineReasons");
  const d = useTranslations("portal.desk.opps");
  const locale = useLocale();
  const os = useOs();
  const label = useOrderStatusLabel();
  const [orders, setOrders] = useState<BackendOrder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<Record<string, Outcome>>({});
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState("");
  const [blocked, setBlocked] = useState("");
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<DeclineReason>("busy");
  const [note, setNote] = useState("");
  const [now, setNow] = useState(0);
  const [tick, setTick] = useState(0);
  const [toast, say] = useToast();

  useEffect(() => {
    let alive = true;
    listOpenOrders()
      .then((l) => alive && setOrders(l))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [tick]);
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(h);
    };
  }, []);

  const list = (orders ?? []).filter((o) => done[o.id] !== "taken");
  const current = list.find((o) => o.id === sel) ?? null;
  const left = (o: BackendOrder) => {
    if (!o.confirmationDeadlineAt || !now) return null;
    const at = new Date(o.confirmationDeadlineAt).getTime();
    return Number.isNaN(at) ? null : Math.max(0, Math.floor((at - now) / 1000));
  };
  const timer = (o: BackendOrder) => {
    const s = left(o);
    if (s === null) return null;
    return (
      <Tag tone={s === 0 ? "err" : s < 300 ? "warn" : "info"}>
        <IconClock aria-hidden />
        {s === 0 ? d("timeUp") : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}
      </Tag>
    );
  };

  async function act(o: BackendOrder, action: "accept" | "decline") {
    if (busy) return;
    setBusy(action);
    try {
      if (action === "accept") await acceptOrder(o.id);
      else await declineOrder(o.id, reason, note.trim());
      setDone((x) => ({ ...x, [o.id]: action }));
      setAsking(false);
      setNote("");
      say(action === "accept" ? tc("accepted") : tc("declined"));
    } catch (e) {
      if (isConflict(e)) {
        setDone((x) => ({ ...x, [o.id]: "taken" }));
        setSel("");
        say(tc("orderTaken"), "err");
      } else if (isForbidden(e)) setBlocked(errDetail(e) || tc("orderForbidden"));
      else say(tc("orderActionFailed"), "err");
    } finally {
      setBusy("");
    }
  }

  return (
    <App name="opps">
      <Toolbar title={t("title")} subtitle={orders ? t("count", { n: list.length }) : undefined}>
        <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
      </Toolbar>
      <div className="dxo-body">
        <section className="dxo-list" aria-label={t("title")}>
          <p className="dxo-intro">{t("intro")}</p>
          {orders === null ? (
            failed ? (
              <Empty icon={<IconAlert />} title={d("loadError")} />
            ) : (
              <Loading label={d("loading")} />
            )
          ) : !list.length ? (
            <Empty icon={<IconBriefcase />} title={t("emptyTitle")} text={t("emptyText")} />
          ) : (
            <div className="dxo-scroll" role="listbox" aria-label={t("title")}>
              {list.map((o) => (
                <div key={o.id} role="option" tabIndex={sel === o.id ? 0 : -1} aria-selected={sel === o.id} className={`dxo-row${sel === o.id ? " is-on" : ""}${done[o.id] ? ` is-${done[o.id]}` : ""}`} onClick={() => setSel(o.id)}>
                  <span className="dxo-row__top">
                    <b>{o.title || o.serviceName || "—"}</b>
                    {done[o.id] ? <Tag tone={done[o.id] === "accept" ? "ok" : "neutral"}>{done[o.id] === "accept" ? tc("accepted") : tc("declined")}</Tag> : timer(o)}
                  </span>
                  <small>
                    {o.region ? (
                      <span>
                        <IconMapPin aria-hidden />
                        {o.region}
                      </span>
                    ) : null}
                    {o.budget ? (
                      <span>
                        <IconCoins aria-hidden />
                        {o.budget}
                      </span>
                    ) : null}
                    <span>{shortDateTime(o.createdAt, locale)}</span>
                  </small>
                </div>
              ))}
            </div>
          )}
        </section>
        <article className="dxo-detail">
          {current ? (
            <>
              <header>
                <span className="dxo-detail__ic" aria-hidden>
                  <IconBriefcase />
                </span>
                <div>
                  <h2>{current.title || current.serviceName || "—"}</h2>
                  <p>{label(current.status)}</p>
                </div>
                {timer(current)}
              </header>
              <dl className="dxo-facts">
                {current.serviceName && current.serviceName !== current.title ? (
                  <div>
                    <dt>{d("service")}</dt>
                    <dd>{current.serviceName}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{d("region")}</dt>
                  <dd>{current.region || "—"}</dd>
                </div>
                <div>
                  <dt>{d("budget")}</dt>
                  <dd>{current.budget || "—"}</dd>
                </div>
                <div>
                  <dt>{d("received")}</dt>
                  <dd>{shortDateTime(current.createdAt, locale)}</dd>
                </div>
                {current.confirmationDeadlineAt ? (
                  <div>
                    <dt>{d("answerBy")}</dt>
                    <dd>{shortDateTime(current.confirmationDeadlineAt, locale)}</dd>
                  </div>
                ) : null}
              </dl>
              {blocked ? <Banner tone="warn" title={blocked} /> : null}
              {done[current.id] === "accept" ? (
                <Banner tone="ok" title={tc("accepted")}>
                  <Btn small onClick={() => openApp("marketplaceOrders", `${base}/marketplace-orders`)}>
                    {d("toOrders")}
                  </Btn>
                </Banner>
              ) : done[current.id] === "decline" ? (
                <Banner tone="neutral" title={tc("declined")} />
              ) : (
                <footer>
                  <Btn kind="primary" icon={<IconCheck />} busy={busy === "accept"} disabled={!!busy || !!blocked} onClick={() => void act(current, "accept")}>
                    {tc("accept")}
                  </Btn>
                  <Btn icon={<IconClose />} disabled={!!busy || !!blocked} onClick={() => setAsking(true)}>
                    {tc("decline")}
                  </Btn>
                </footer>
              )}
            </>
          ) : (
            <Empty icon={<IconBriefcase />} title={d("pick")} text={os === "win" ? t("intro") : undefined} />
          )}
        </article>
      </div>
      <Dialog
        open={asking && !!current}
        title={tr("title")}
        onClose={() => setAsking(false)}
        onSubmit={() => current && void act(current, "decline")}
        width={460}
        actions={
          <>
            <Btn onClick={() => setAsking(false)}>{d("cancel")}</Btn>
            <Btn kind="primary" type="submit" busy={busy === "decline"} disabled={reason === "other" && !note.trim()}>
              {tr("confirm")}
            </Btn>
          </>
        }
      >
        <p className="dx-dlg__text">{tr("lead")}</p>
        <Field label={tr("reason")}>
          <Select ariaLabel={tr("reason")} value={reason} onChange={setReason} options={DECLINE_REASONS.map((r) => ({ value: r, label: tr(r) }))} />
        </Field>
        <Field label={reason === "other" ? tr("noteRequired") : tr("note")}>
          <TextArea value={note} onChange={setNote} rows={3} placeholder={tr("notePh")} maxLength={500} />
        </Field>
      </Dialog>
      {toast}
    </App>
  );
}
