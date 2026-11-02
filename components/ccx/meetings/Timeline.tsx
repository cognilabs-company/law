"use client";

import { useLocale, useTranslations } from "next-intl";
import { parseServerTime } from "@/lib/http";
import { fmtDateTime, fmtDuration, localDay, shortDate, timeOnly } from "@/lib/date";
import { statusSpecOf } from "@/lib/labels";
import { IcCheck, IcClock, IcClose, IcMeeting, IcPhone, IcUser } from "../icons";
import { IcOpen, IcUsers } from "./glyphs";
import { avatarText, domSafe, secondsOf, stateOf, useCallStatusMap, END_TONE, LIVE, OUT, type HistoryItem } from "./model";

type Props = {
  items: HistoryItem[];
  minute: number;
  sessionId: string;
  uid: string;
  canDetail: boolean;
  mixed: boolean;
  onJoin: (c: HistoryItem) => void;
  onDetail: (callId: string) => void;
};

type JoinState = { show: boolean; ok: boolean; why: string };

function EndIcon({ status, size }: { status: string; size: number }) {
  if (status === "cancelled") return <IcClose size={size} />;
  if (status === "expired") return <IcClock size={size} />;
  return <IcCheck size={size} />;
}

export default function Timeline({ items, minute, sessionId, uid, canDetail, mixed, onJoin, onDetail }: Props) {
  const t = useTranslations("admin.meetings");
  const tc = useTranslations("call");
  const tch = useTranslations("admin.callHistory");
  const x = useTranslations("admin.ccx.meetings");
  const locale = useLocale();
  const callMap = useCallStatusMap();
  const nowMs = minute * 60000;
  const today = minute ? localDay(nowMs) : "";
  const thisYear = today.slice(0, 4);
  const isToday = (iso: string) => Boolean(today) && localDay(iso) === today;
  const when = (iso: string) => fmtDateTime(iso, locale, localDay(iso).slice(0, 4) !== thisYear);
  const clock = (iso: string) => (isToday(iso) ? timeOnly(iso, locale) : when(iso));
  const statusOf = (s: string) => statusSpecOf(callMap, s)?.label ?? "";

  const startsIn = (iso: string) => {
    const at = parseServerTime(iso);
    if (!minute || !Number.isFinite(at)) return "";
    if (Math.floor(at / 60000) <= minute) return "";
    const mins = Math.ceil((at - nowMs) / 60000);
    if (mins <= 0) return "";
    if (mins < 60) return t("startsInMin", { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 48) return t("startsInHour", { n: hours });
    return t("startsInDay", { n: Math.floor(hours / 24) });
  };

  const joinState = (c: HistoryItem): JoinState => {
    if (!LIVE.has(c.callStatus) || OUT.has(c.status)) return { show: false, ok: false, why: "" };
    const at = parseServerTime(c.startedAt);
    if (c.callStatus === "scheduled" && Number.isFinite(at) && Math.floor(at / 60000) > minute) {
      return {
        show: true,
        ok: false,
        why: isToday(c.startedAt) ? t("opensAt", { time: timeOnly(c.startedAt, locale) }) : t("opensOn", { date: when(c.startedAt) }),
      };
    }
    if (c.canStartNow === false) return { show: true, ok: false, why: t("joinClosed") };
    return { show: true, ok: true, why: "" };
  };

  return (
    <ol className={`opx-mtg-tl${mixed ? " is-mixed" : ""}`}>
      {items.map((c, i) => {
        const state = stateOf(c);
        const mine = c.callerUserId === sessionId;
        const audio = c.callType === "audio";
        const js = joinState(c);
        const whyId = `${uid}-why-${domSafe(c.callId)}`;
        const dur = state === "done" || state === "out" ? fmtDuration(secondsOf(c), locale) : "";
        const left = state === "next" && c.startedAt ? startsIn(c.startedAt) : "";
        const host = c.callerName || tc("someone");
        const day = c.startedAt && !isToday(c.startedAt) ? shortDate(localDay(c.startedAt), locale) : "";
        return (
          <li key={c.callId} className="opx-mtg-item" data-state={state} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
            <span className="opx-mtg-dot" aria-hidden="true" />
            <div className="opx-mtg-rail">
              <time className="opx-num" dateTime={c.startedAt || undefined}>
                <b>{c.startedAt ? timeOnly(c.startedAt, locale) : "—"}</b>
                {day ? <small>{day}</small> : null}
              </time>
              {state === "next" ? null : (
                <span className="opx-mtg-rail__st" data-tone={state === "done" ? END_TONE[c.callStatus] : undefined}>
                  {state === "live" ? <i className="opx-mtg-pulse" aria-hidden="true" /> : state === "done" ? <EndIcon status={c.callStatus} size={13} /> : null}
                  {state === "live" ? x("now") : statusOf(c.callStatus)}
                </span>
              )}
            </div>
            <article className="opx-mtg-card" aria-label={c.title || t("untitled")}>
              <div className="opx-mtg-card__top">
                <h3 title={c.title || t("untitled")}>{c.title || t("untitled")}</h3>
                <div className="opx-mtg-card__chips">
                  {dur ? (
                    <span className="opx-mtg-chip opx-num">
                      <IcClock size={15} />
                      {dur}
                    </span>
                  ) : null}
                  <span className="opx-mtg-chip">
                    {audio ? <IcPhone size={15} /> : <IcMeeting size={15} />}
                    {t.has(`formatLabel.${c.callType}`) ? t(`formatLabel.${c.callType}`) : c.callType}
                  </span>
                  {canDetail && !js.show ? (
                    <button type="button" className="opx-mtg-icon" aria-label={tch("detailTitle")} title={tch("detailTitle")} aria-haspopup="dialog" onClick={() => onDetail(c.callId)}>
                      <IcOpen size={17} />
                    </button>
                  ) : null}
                </div>
              </div>
              {state === "live" && c.startedAt ? <p className="opx-mtg-card__when opx-num">{t("since", { time: clock(c.startedAt) })}</p> : null}
              {state === "next" && c.startedAt ? (
                <p className="opx-mtg-card__when opx-num">
                  <span>{t("startsAt", { time: clock(c.startedAt) })}</span>
                  {left ? <span className="is-soon">{left}</span> : null}
                </p>
              ) : null}
              <div className="opx-mtg-card__foot">
                <div className="opx-mtg-host">
                  <span className="opx-mtg-av" aria-hidden="true">
                    {avatarText(host) || <IcUser size={15} />}
                  </span>
                  <span className="opx-mtg-host__txt">
                    {mine ? (
                      <b>{t("hostedByYou")}</b>
                    ) : (
                      <>
                        <b>{host}</b>
                        <small>{tc("hostLabel")}</small>
                      </>
                    )}
                  </span>
                  {c.participantCount > 0 ? (
                    <span className="opx-mtg-chip opx-mtg-chip--soft opx-num">
                      <IcUsers size={15} />
                      {tch("participantCount", { n: c.participantCount })}
                    </span>
                  ) : null}
                </div>
                <div className="opx-mtg-card__acts">
                  {state === "out" ? (
                    <span className="opx-pill" data-tone="hot">
                      {c.status === "declined" ? t("youDeclined") : t("youRemoved")}
                    </span>
                  ) : null}
                  {js.show ? (
                    <div className="opx-mtg-joinbox">
                      <button
                        type="button"
                        className={`opx-mtg-join${js.ok && state === "live" ? " is-live" : ""}`}
                        disabled={!js.ok}
                        aria-describedby={js.why ? whyId : undefined}
                        onClick={() => onJoin(c)}
                      >
                        {audio ? <IcPhone size={18} /> : <IcMeeting size={18} />}
                        {t("join")}
                      </button>
                      {js.why ? (
                        <span id={whyId} className="opx-mtg-why">
                          {js.why}
                        </span>
                      ) : null}
                    </div>
                  ) : state === "done" ? (
                    <span className="opx-mtg-done" data-tone={END_TONE[c.callStatus]}>
                      <EndIcon status={c.callStatus} size={15} />
                      {statusOf(c.callStatus) || t("callStatus.ended")}
                    </span>
                  ) : null}
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
