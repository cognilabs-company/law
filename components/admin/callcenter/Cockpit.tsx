"use client";

import "./cockpit.css";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactElement, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import PersonName from "@/components/ui/PersonName";
import { IconArrowRight, IconAward, IconCheck, IconCoins, IconFlag, IconRefresh, IconReply, IconStar, IconUsers } from "@/components/icons";
import { fmtAge } from "@/lib/date";
import { isAborted, isForbidden, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { getCockpit, type Cockpit, type CockpitItem, type CockpitQueue } from "@/lib/services/cockpit";
import type { CcTab } from "@/components/admin/CallCenterConsole";

// TSK-635882 — the operator's marketplace cockpit: every queue's open work
// at a glance, the oldest first, one tap into the queue that handles it.
// Hidden for anyone the backend refuses (call-center lawyers / legal pool).

const LANE: Record<CockpitQueue, { tab: CcTab; Icon: ComponentType<SVGProps<SVGSVGElement>>; tone: string }> = {
  assignments: { tab: "escalations", Icon: IconUsers, tone: "hot" },
  complaints: { tab: "mpComplaints", Icon: IconFlag, tone: "warn" },
  refunds: { tab: "escalations", Icon: IconReply, tone: "bad" },
  payouts: { tab: "payouts", Icon: IconCoins, tone: "acc" },
  payout_recoveries: { tab: "payouts", Icon: IconCoins, tone: "bad" },
  experience: { tab: "experience", Icon: IconAward, tone: "acc" },
  achievements: { tab: "achievements", Icon: IconStar, tone: "acc" },
};
const REFRESH_DEBOUNCE = 400;

function Line({ it, now }: { it: CockpitItem; now: number }): ReactElement {
  const t = useTranslations("callCenter.cockpit");
  const tw = useTranslations("callCenter.escalations.why");
  const locale = useLocale();
  const who = it.ownerName || it.clientName ? it.ownerName || it.clientName : it.clientUserId ? <PersonName id={it.clientUserId} fallback={t("client")} /> : t("client");
  const reason = it.reason && tw.has(it.reason) ? tw(it.reason) : it.reason && t.has(`reason.${it.reason}`) ? t(`reason.${it.reason}`) : "";
  const main =
    it.queue === "refunds" || it.queue === "payouts" || it.queue === "payout_recoveries" ? (
      <>
        {who} · <span className="sx-num">{`${fmtUzs(it.amount)} ${t("som")}`}</span>
      </>
    ) : it.queue === "complaints" ? (
      <>
        {who}
        {it.rating !== null ? ` · ${"★".repeat(Math.max(1, Math.min(5, it.rating)))}` : ""}
      </>
    ) : (
      who
    );
  const age = it.at && now ? t("ago", { ago: fmtAge(it.at, locale, now) }) : "";
  // The backend's own title leads; who and how much follow under it.
  if (it.title)
    return (
      <li className="ckp__it" data-prio={it.priority === "high" || it.priority === "urgent" ? "high" : undefined}>
        <i aria-hidden="true" />
        <span>
          <b>{it.title}</b>
          <small>
            {main}
            {age ? ` · ${age}` : ""}
          </small>
        </span>
      </li>
    );
  const sub = [reason || it.note || it.docTitle, it.workId, age].filter(Boolean).join(" · ");
  return (
    <li className="ckp__it" data-prio={it.priority === "high" || it.priority === "urgent" ? "high" : undefined}>
      <i aria-hidden="true" />
      <span>
        <b>{main}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
    </li>
  );
}

export default function CockpitView({ onGo, onCount }: { onGo: (tab: CcTab) => void; onCount?: (n: number) => void }): ReactElement | null {
  const t = useTranslations("callCenter.cockpit");
  const locale = useLocale();
  const [data, setData] = useState<Cockpit | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [at, setAt] = useState(0);
  // "5 min ago" moves on by itself, once a minute.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  const timer = useRef(0);
  const onCountRef = useRef(onCount);
  useEffect(() => {
    onCountRef.current = onCount;
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const c = await getCockpit(4, signal);
      setData(c);
      setFailed(false);
      const stamp = Date.now();
      setAt(stamp);
      setNow(stamp);
      onCountRef.current?.(c.totalOpen);
    } catch (e) {
      if (isAborted(e)) return;
      if (isForbidden(e)) return setDenied(true);
      logApiError("cockpit", e);
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    // Any marketplace queue moving: one refresh per burst.
    const soon = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void load(), REFRESH_DEBOUNCE);
    };
    const off = subscribeUserEvents((e) => {
      if (/^marketplace\.(assignment_|contact_sla_|complaint_|experience_|achievement_|payout_|refund_)/.test(String(e.event ?? ""))) soon();
    });
    const offResync = onUserSocketResync(soon);
    return () => {
      ctl.abort();
      off();
      offResync();
      window.clearTimeout(timer.current);
    };
  }, [load]);

  if (denied) return null;
  const busiest = data ? data.lanes.filter((l) => l.total > 0).sort((a, b) => b.total - a.total) : [];
  return (
    <section className="ckp" aria-labelledby="ckp-h" data-ai-target="callcenter:cockpit">
      <header className="ckp__hero">
        <div>
          <p className="ckp__eyebrow">
            <span className="ckp__live" aria-hidden="true" />
            {t("eyebrow")}
          </p>
          <h2 id="ckp-h">{t("title")}</h2>
          <p>{data ? (data.totalOpen ? t("lead", { n: data.totalOpen }) : t("leadEmpty")) : t("loading")}</p>
        </div>
        <div className="ckp__total" aria-live="polite">
          <b className="sx-num">{data ? data.totalOpen : "—"}</b>
          <small>{t("open")}</small>
          <button type="button" onClick={() => void load()} aria-label={t("refresh")}>
            <IconRefresh aria-hidden="true" />
            {at && now ? t("updated", { ago: fmtAge(at, locale, now) }) : t("refresh")}
          </button>
        </div>
      </header>
      {failed && !data ? (
        <p className="ckp__fail" role="alert">
          {t("loadFailed")}
          <button type="button" className="btn btn--line btn--sm" onClick={() => void load()}>
            {t("retry")}
          </button>
        </p>
      ) : null}
      {busiest.length ? (
        <p className="ckp__first">
          <IconArrowRight aria-hidden="true" />
          {t("first", { lane: t(`lane.${busiest[0].queue}`), n: busiest[0].total })}
        </p>
      ) : null}
      <div className="ckp__grid">
        {(data?.lanes ?? []).map((l, i) => {
          const meta = LANE[l.queue];
          const items = l.queue === "complaints" ? l.items.filter((x) => !x.quality).concat(l.items.filter((x) => x.quality)) : l.items;
          return (
            <article key={l.queue} className="ckp__lane" data-tone={meta.tone} data-empty={!l.total || undefined} style={{ ["--i" as string]: i }}>
              <div className="ckp__lh">
                <span className="ckp__ic" aria-hidden="true">
                  <meta.Icon />
                </span>
                <span className="ckp__lt">
                  <b>{t(`lane.${l.queue}`)}</b>
                  <small>{t(`laneHint.${l.queue}`)}</small>
                </span>
                <em className="sx-num">{l.total}</em>
              </div>
              {l.total ? (
                <ul className="ckp__items">
                  {items.slice(0, 3).map((it) => (
                    <Line key={it.id} it={it} now={now} />
                  ))}
                </ul>
              ) : (
                <p className="ckp__clear">
                  <IconCheck aria-hidden="true" />
                  {t("clear")}
                </p>
              )}
              {l.total ? (
                <button type="button" className="ckp__go" onClick={() => onGo(l.queue === "complaints" && items[0]?.quality ? "complaints" : meta.tab)}>
                  {t("go", { n: l.total })}
                  <IconArrowRight aria-hidden="true" />
                </button>
              ) : null}
            </article>
          );
        })}
        {!data && !failed ? [0, 1, 2, 3].map((i) => <div key={i} className="ckp__lane ckp__lane--sk" aria-hidden="true" />) : null}
      </div>
    </section>
  );
}
