"use client";

import "./ccFocus.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import PersonName from "@/components/ui/PersonName";
import { IconArrowRight, IconCheck, IconChevronLeft, IconChevronRight, IconLock, IconRefresh } from "@/components/icons";
import { fmtAge } from "@/lib/date";
import { isAborted, isForbidden, logApiError, parseServerTime } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { getCockpit, type Cockpit, type CockpitItem, type CockpitQueue } from "@/lib/services/cockpit";
import type { CcTab } from "@/components/admin/CallCenterConsole";

const TAB: Record<CockpitQueue, CcTab> = {
  assignments: "escalations",
  complaints: "mpComplaints",
  refunds: "escalations",
  payouts: "payouts",
  payout_recoveries: "payouts",
  experience: "experience",
  achievements: "achievements",
};

// A complaint about a document request or an urgent call is a quality
// complaint: it lives in the "complaints" tab, not the marketplace one.
const tabOf = (it: CockpitItem): CcTab => (it.queue === "complaints" && it.quality ? "complaints" : TAB[it.queue]);

const TONE: Record<CockpitQueue, string> = {
  assignments: "hot",
  complaints: "warn",
  refunds: "hot",
  payouts: "acc",
  payout_recoveries: "warn",
  experience: "calm",
  achievements: "calm",
};

const MONEY: CockpitQueue[] = ["refunds", "payouts", "payout_recoveries"];
const RING_SPAN_MS = 2 * 60 * 60 * 1000;
const REFRESH_DEBOUNCE = 400;
const C = 2 * Math.PI * 34;

function ageOf(it: CockpitItem, now: number): number {
  const at = parseServerTime(it.at);
  return Number.isFinite(at) && now > at ? now - at : 0;
}

function toneOfAge(ms: number): string {
  if (ms >= 24 * 60 * 60 * 1000) return "hot";
  if (ms >= 60 * 60 * 1000) return "warn";
  return "ok";
}

type Say = (k: string, v?: Record<string, number>) => string;

function clock(ms: number, t: Say): string {
  const m = Math.floor(ms / 60000);
  if (m >= 1440) return t("ageD", { n: Math.floor(m / 1440) });
  if (m >= 60) return t("ageH", { n: Math.floor(m / 60) });
  return t("ageM", { n: m });
}

// `tabs`: the console's tabs this operator can open. A queue the backend
// refuses (403) hides its tab, so a job from it says so instead of a dead
// "open the queue" button.
export default function CcFocus({ onGo, onCount, tabs }: { onGo: (tab: CcTab) => void; onCount?: (n: number) => void; tabs?: readonly CcTab[] }): ReactElement | null {
  const t = useTranslations("callCenter.focus");
  const tc = useTranslations("callCenter.cockpit");
  const tw = useTranslations("callCenter.escalations.why");
  const locale = useLocale();
  const [data, setData] = useState<Cockpit | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [at, setAt] = useState(0);
  const [now, setNow] = useState(0);
  const [cursor, setCursor] = useState(0);
  const timer = useRef(0);
  const onCountRef = useRef(onCount);
  useEffect(() => {
    onCountRef.current = onCount;
  });

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const c = await getCockpit(8, signal);
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
    const soon = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void load(), REFRESH_DEBOUNCE);
    };
    const off = subscribeUserEvents((e) => {
      if (/^marketplace\.(assignment_|contact_sla_|contact_started|complaint_|experience_|achievement_|payout_|refund_)/.test(String(e.event ?? ""))) soon();
    });
    const offResync = onUserSocketResync(soon);
    return () => {
      ctl.abort();
      off();
      offResync();
      window.clearTimeout(timer.current);
    };
  }, [load]);

  const queue = useMemo(() => {
    const all = (data?.lanes ?? []).flatMap((l) => l.items);
    return all.slice().sort((a, b) => (parseServerTime(a.at) || 0) - (parseServerTime(b.at) || 0));
  }, [data]);

  if (denied) return null;

  const at0 = Math.min(cursor, Math.max(0, queue.length - 1));
  const focus = queue[at0] ?? null;
  const rest = queue.filter((_, i) => i !== at0);
  const who = (it: CockpitItem) =>
    it.ownerName || it.clientName ? it.ownerName || it.clientName : it.clientUserId ? <PersonName id={it.clientUserId} fallback={tc("client")} /> : tc("client");
  const reasonOf = (it: CockpitItem) => (it.reason && tw.has(it.reason) ? tw(it.reason) : it.reason && tc.has(`reason.${it.reason}`) ? tc(`reason.${it.reason}`) : "");

  const age = focus ? ageOf(focus, now) : 0;
  const tone = toneOfAge(age);
  const frac = Math.max(0.04, Math.min(1, age / RING_SPAN_MS));

  return (
    <section className="ccf" aria-labelledby="ccf-h" data-ai-target="callcenter:cockpit">
      <div className="ccf__focus">
        <header className="ccf__head">
          <h2 id="ccf-h">{t("title")}</h2>
          {queue.length ? (
            <span className="ccf__pos">
              <button type="button" disabled={at0 === 0} onClick={() => setCursor(at0 - 1)} aria-label={t("prev")}>
                <IconChevronLeft aria-hidden="true" />
              </button>
              <b className="cc-num">{t("pos", { i: at0 + 1, n: queue.length })}</b>
              <button type="button" disabled={at0 >= queue.length - 1} onClick={() => setCursor(at0 + 1)} aria-label={t("next")}>
                <IconChevronRight aria-hidden="true" />
              </button>
            </span>
          ) : null}
          <button type="button" className="ccf__sync" onClick={() => void load()} aria-label={tc("refresh")}>
            <IconRefresh aria-hidden="true" />
            {at && now ? tc("updated", { ago: fmtAge(at, locale, now) }) : tc("refresh")}
          </button>
        </header>

        {focus ? (
          <>
            <div className="ccf__id">
              <span className="ccf__idl">{t("workId")}</span>
              <b className="cc-num">{focus.workId || focus.title || "—"}</b>
              <span className="ccf__tags">
                <i className="ccf__tag" data-tone={TONE[focus.queue]}>
                  {tc(`lane.${focus.queue}`)}
                </i>
                {focus.priority === "high" || focus.priority === "urgent" ? (
                  <i className="ccf__tag" data-tone="hot">
                    {t("urgent")}
                  </i>
                ) : null}
              </span>
            </div>

            <div className="ccf__ring" data-tone={tone} role="img" aria-label={t("waitingFor", { time: clock(age, t) })}>
              <svg viewBox="0 0 80 80" aria-hidden="true">
                <circle cx="40" cy="40" r="34" className="ccf__track" />
                <circle cx="40" cy="40" r="34" className="ccf__arc" strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`} />
              </svg>
              <span>
                <b className="cc-num">{clock(age, t)}</b>
                <small>{t("waiting")}</small>
              </span>
            </div>

            <dl className="ccf__facts">
              <div>
                <dt>{t("client")}</dt>
                <dd>{who(focus)}</dd>
              </div>
              {focus.title && focus.workId ? (
                <div>
                  <dt>{t("what")}</dt>
                  <dd>{focus.title}</dd>
                </div>
              ) : null}
              {reasonOf(focus) ? (
                <div>
                  <dt>{t("reason")}</dt>
                  <dd>{reasonOf(focus)}</dd>
                </div>
              ) : null}
              {MONEY.includes(focus.queue) && focus.amount ? (
                <div>
                  <dt>{t("amount")}</dt>
                  <dd className="cc-num">{`${fmtUzs(focus.amount)} ${tc("som")}`}</dd>
                </div>
              ) : null}
              {focus.rating !== null ? (
                <div>
                  <dt>{t("rating")}</dt>
                  <dd>{"★".repeat(Math.max(1, Math.min(5, focus.rating)))}</dd>
                </div>
              ) : null}
              {focus.docTitle ? (
                <div>
                  <dt>{t("doc")}</dt>
                  <dd>{focus.docTitle}</dd>
                </div>
              ) : null}
            </dl>

            {focus.note ? <p className="ccf__note">{focus.note}</p> : null}

            <div className="ccf__acts">
              {tabs && !tabs.includes(tabOf(focus)) ? (
                <p className="ccf__locked" role="note">
                  <IconLock aria-hidden="true" />
                  {tc("noAccess")}
                </p>
              ) : (
                <button type="button" className="ccf__btn ccf__btn--pri" onClick={() => onGo(tabOf(focus))} data-ai-id="call_center.focus.open">
                  <IconArrowRight aria-hidden="true" />
                  {t("go")}
                </button>
              )}
              {at0 < queue.length - 1 ? (
                <button type="button" className="ccf__btn" onClick={() => setCursor(at0 + 1)} data-ai-id="call_center.focus.skip">
                  {t("skip")}
                </button>
              ) : null}
            </div>
          </>
        ) : failed ? (
          <p className="ccf__empty" role="alert">
            {tc("loadFailed")}
            <button type="button" className="ccf__btn" onClick={() => void load()}>
              {tc("retry")}
            </button>
          </p>
        ) : data ? (
          <p className="ccf__empty">
            <IconCheck aria-hidden="true" />
            {t("empty")}
            <small>{t("emptyText")}</small>
          </p>
        ) : (
          <p className="ccf__empty" aria-busy="true">
            {tc("loading")}
          </p>
        )}
      </div>

      <div className="ccf__next">
        <header className="ccf__head">
          <h3>{t("nextTitle")}</h3>
          <span className="ccf__count cc-num">{t("inQueue", { n: queue.length })}</span>
        </header>
        <ol className="ccf__list">
          {rest.map((it) => {
            const a = ageOf(it, now);
            const i = queue.indexOf(it);
            return (
              <li key={it.id}>
                <button type="button" className="ccf__row" data-tone={TONE[it.queue]} onClick={() => setCursor(i)}>
                  <b className="cc-num">{it.workId || "—"}</b>
                  <span className="ccf__rw">
                    <span>{who(it)}</span>
                    <small>
                      {tc(`lane.${it.queue}`)}
                      {reasonOf(it) ? ` · ${reasonOf(it)}` : it.title ? ` · ${it.title}` : ""}
                    </small>
                  </span>
                  <em className="cc-num" data-tone={toneOfAge(a)}>
                    {clock(a, t)}
                  </em>
                </button>
              </li>
            );
          })}
          {!rest.length && data ? <li className="ccf__none">{t("noMore")}</li> : null}
        </ol>
      </div>
    </section>
  );
}
