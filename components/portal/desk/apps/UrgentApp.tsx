"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getUrgentRequest, isUrgentEvent, listAssignedUrgentRequests, urgentEventInfo, type UrgentRequest } from "@/lib/services/backend";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { dateTimeFull } from "@/lib/date";
import { humanize, regionLabel, statusLabel, statusSpecOf } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { matchesSearch } from "@/lib/searchText";
import { useUrgentStatuses } from "@/components/admin/UrgentAdvocateQueue";
import { IconAlert, IconBolt, IconCalendar, IconChat, IconCheck, IconClock, IconClose, IconFileText, IconMapPin, IconPhone, IconRefresh, IconUser, IconUsers, IconVideo } from "@/components/icons";
import { App, Banner, Btn, Empty, Loading, Search, Sidebar, Tag, Tool, Toolbar, useOs, type NavSection, type Tone } from "../kit/kit";
import type { NativeProps } from "../native";
import "./urgent.css";

// Tezkor Advokat cases as a desktop program: the ones that need attention
// first (a meeting running, one scheduled, one taken), then the rest; the
// chosen case in full — the client, what they need, files and voice notes,
// the advocate panel, the terms, the result, the history — with the way
// into its meeting and its chat.

type Stage = "active" | "completed" | "cancelled" | "all";
const RANK = new Map([["meeting_active", 0], ["scheduled", 1], ["claimed", 2], ["in_progress", 2], ["open_pool", 3]]);
const DONE = new Set(["completed", "cancelled", "expired"]);
const rank = (s: string) => RANK.get(s) ?? (DONE.has(s) ? 9 : 5);
const stageOf = (r: UrgentRequest): Stage => (r.status === "completed" ? "completed" : r.status === "cancelled" || r.status === "expired" ? "cancelled" : "active");
const toneOf = (s: string): Tone => (s === "meeting_active" ? "err" : s === "scheduled" ? "warn" : s === "completed" ? "ok" : DONE.has(s) ? "neutral" : "accent");

export default function UrgentApp({ openApp }: NativeProps) {
  const t = useTranslations("portal.seller.urgent");
  const tk = useTranslations("portal.client.urgent");
  const tcm = useTranslations("portal.common");
  const tf = useTranslations("portal.workFilters");
  const d = useTranslations("portal.desk.urgent");
  const urg = useUrgentStatuses();
  const locale = useLocale();
  const os = useOs();
  const [items, setItems] = useState<UrgentRequest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [stage, setStage] = useState<Stage>("active");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const load = useCallback(
    () =>
      listAssignedUrgentRequests({})
        .then((l) => {
          setItems(l);
          setFailed(false);
        })
        .catch(() => setFailed(true)),
    [],
  );
  useEffect(() => {
    const h = setTimeout(() => void load(), 0);
    const off = subscribeUserEvents((e) => isUrgentEvent(e.event) && void load());
    const offSync = onUserSocketResync(() => void load());
    return () => {
      clearTimeout(h);
      off();
      offSync();
    };
  }, [load]);

  const all = useMemo(() => items ?? [], [items]);
  const kind = (r: UrgentRequest) => (tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || humanize(r.serviceKind));
  const shown = all
    .filter((r) => (stage === "all" || stageOf(r) === stage) && (!q.trim() || matchesSearch([r.clientName, r.workId, r.need, kind(r)].join(" "), q)))
    .sort((a, b) => rank(a.status) - rank(b.status) || (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  const current = all.find((r) => r.id === sel) ?? null;
  const label = (s: string) => statusSpecOf(urg, s, statusLabel(tcm, s))?.label ?? s;
  const count = (s: Stage) => all.filter((r) => s === "all" || stageOf(r) === s).length;
  const sections: NavSection[] = [
    {
      id: "s",
      title: os === "mac" ? tf("stageLabel") : undefined,
      items: [
        { id: "active", label: tf("stage.active"), icon: <IconBolt />, count: count("active") || undefined },
        { id: "completed", label: tf("stage.completed"), icon: <IconCheck />, count: count("completed") || undefined },
        { id: "cancelled", label: tf("stage.cancelled"), icon: <IconClose />, count: count("cancelled") || undefined },
        { id: "all", label: tf("stage.all"), icon: <IconFileText />, count: count("all") || undefined },
      ],
    },
  ];
  const join = (r: UrgentRequest) => openApp("messages", `/portal/chat/${encodeURIComponent(r.secureChatRoomId)}?join=${encodeURIComponent(r.callId)}`);

  return (
    <App name="urgent" sidebar={<Sidebar label={t("title")} sections={sections} value={stage} onChange={(id) => setStage(id as Stage)} header={os === "win" ? <Search value={q} onChange={setQ} placeholder={tf("searchUrgent")} wide /> : undefined} />}>
      <Toolbar title={t("title")} subtitle={items ? d("count", { n: shown.length }) : undefined} end={os === "mac" ? <Search value={q} onChange={setQ} placeholder={tf("searchUrgent")} /> : undefined}>
        <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => void load()} />
      </Toolbar>
      <div className="dxu-body">
        <section className="dxu-list" aria-label={t("title")}>
          {items === null ? (
            failed ? (
              <Empty icon={<IconAlert />} title={d("loadError")} />
            ) : (
              <Loading label={d("loading")} />
            )
          ) : !shown.length ? (
            <Empty icon={<IconBolt />} title={q ? tf("emptyFiltered") : t("empty")} text={q ? undefined : t("emptyText")} />
          ) : (
            <div className="dxu-scroll" role="listbox" aria-label={t("title")}>
              {shown.map((r) => (
                <div key={r.id} role="option" tabIndex={sel === r.id ? 0 : -1} aria-selected={sel === r.id} className={`dxu-row${sel === r.id ? " is-on" : ""}${r.status === "meeting_active" ? " is-live" : ""}`} onClick={() => setSel(r.id)}>
                  <span className="dxu-row__top">
                    <b>{kind(r)}</b>
                    <Tag tone={toneOf(r.status)}>{label(r.status)}</Tag>
                  </span>
                  <small>{[r.workId, r.clientName].filter(Boolean).join(" · ")}</small>
                  {r.scheduledAt && (r.status === "scheduled" || r.status === "meeting_active") ? (
                    <span className="dxu-when">
                      <IconCalendar aria-hidden />
                      {dateTimeFull(r.scheduledAt, locale)}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
        {current ? <Detail key={current.id} fallback={current} kind={kind(current)} label={label} onJoin={() => join(current)} onChat={() => openApp("messages", `/portal/chat/${encodeURIComponent(current.secureChatRoomId)}`)} /> : <div className="dxu-none"><Empty icon={<IconBolt />} title={d("pick")} text={t("lead")} /></div>}
      </div>
    </App>
  );
}

function Detail({ fallback, kind, label, onJoin, onChat }: { fallback: UrgentRequest; kind: string; label: (s: string) => string; onJoin: () => void; onChat: () => void }) {
  const t = useTranslations("portal.seller.urgent");
  const te = useTranslations("enums");
  const locale = useLocale();
  const [r, setR] = useState(fallback);
  useEffect(() => {
    let alive = true;
    const get = () => getUrgentRequest(fallback.id).then((x) => alive && setR(x)).catch(() => undefined);
    void get();
    const off = subscribeUserEvents((e) => {
      if (!isUrgentEvent(e.event)) return;
      const info = urgentEventInfo(e);
      if (!info.recordId || info.recordId === fallback.id) void get();
    });
    return () => {
      alive = false;
      off();
    };
  }, [fallback.id]);
  const canJoin = !!r.callId && !!r.secureChatRoomId;
  const block = (icon: ReactNode, title: string, body: ReactNode, tone = "") => (
    <section className={`dxu-box${tone ? ` is-${tone}` : ""}`}>
      <h3>
        {icon}
        {title}
      </h3>
      {body}
    </section>
  );
  return (
    <article className="dxu-detail" aria-label={kind}>
      <header>
        <span className="dxu-detail__ic" aria-hidden>
          {r.serviceKind.includes("video") || r.serviceKind.includes("express") ? <IconVideo /> : <IconBolt />}
        </span>
        <div>
          <h2>{kind}</h2>
          <p>
            {r.workId ? <code>{r.workId}</code> : null}
            <Tag tone={toneOf(r.status)}>{label(r.status)}</Tag>
          </p>
        </div>
      </header>
      {r.scheduledAt && (r.status === "scheduled" || r.status === "meeting_active") ? <Banner tone={r.status === "meeting_active" ? "err" : "warn"} title={t("upcoming")}>{dateTimeFull(r.scheduledAt, locale)}</Banner> : null}
      <div className="dxu-acts">
        {r.callId || r.status === "scheduled" || r.status === "meeting_active" ? (
          <Btn kind="primary" icon={<IconVideo />} disabled={!canJoin} title={canJoin ? undefined : t("joinWaiting")} onClick={onJoin}>
            {t("joinMeeting")}
          </Btn>
        ) : null}
        {r.secureChatRoomId ? (
          <Btn icon={<IconChat />} onClick={onChat}>
            {t("openChat")}
          </Btn>
        ) : null}
      </div>
      {block(
        <IconUser aria-hidden />,
        t("client"),
        <div className="dxu-lines">
          <span>{r.clientName || t("clientHidden")}</span>
          {r.clientPhone ? (
            <a href={`tel:${r.clientPhone}`}>
              <IconPhone aria-hidden />
              {r.clientPhone}
            </a>
          ) : null}
          {r.region ? (
            <span className="dxu-muted">
              <IconMapPin aria-hidden />
              {regionLabel(te, r.region)}
            </span>
          ) : null}
        </div>,
      )}
      {block(
        <IconFileText aria-hidden />,
        t("need"),
        <>
          <p className="dxu-text">{r.need || t("noNeed")}</p>
          {r.directions.length ? (
            <span className="dxu-tags">
              {r.directions.map((x) => (
                <Tag key={x}>{te.has(`areas.${x}`) ? te(`areas.${x}`) : humanize(x)}</Tag>
              ))}
            </span>
          ) : null}
        </>,
      )}
      {r.files.length || r.voiceMessages.length
        ? block(
            <IconFileText aria-hidden />,
            t("attachments"),
            <ul className="dxu-files">
              {r.files.map((f, i) => (
                <li key={f.id || `f${i}`}>{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> : f.name}</li>
              ))}
              {r.voiceMessages.map((v, i) => (
                <li key={v.id || `v${i}`}>
                  {v.url ? <audio src={v.url} controls preload="none" /> : v.name}
                  {v.durationSeconds ? <span className="dxu-muted"> {t("seconds", { n: v.durationSeconds })}</span> : null}
                </li>
              ))}
            </ul>,
          )
        : null}
      {r.groupLawyers.length
        ? block(
            <IconUsers aria-hidden />,
            t("panel"),
            <>
              <ul className="dxu-files">
                {r.groupLawyers.map((g) => (
                  <li key={g.id}>{g.name}</li>
                ))}
              </ul>
              {r.meetingNote ? <p className="dxu-muted">{r.meetingNote}</p> : null}
            </>,
          )
        : null}
      {r.operator ? block(<IconUser aria-hidden />, t("operator"), <p className="dxu-text">{[r.operator.name, r.operator.phone].filter(Boolean).join(" · ")}</p>) : null}
      {r.meetingMinutes || r.amount ? block(<IconClock aria-hidden />, t("terms"), <p className="dxu-text">{[r.meetingMinutes ? t("minutesN", { n: r.meetingMinutes }) : "", r.amount ? `${fmtUzs(r.amount)} ${te("currency")}` : ""].filter(Boolean).join(" · ")}</p>) : null}
      {r.resultSummary ? block(<IconCheck aria-hidden />, t("result"), <><p className="dxu-text">{r.resultSummary}</p>{r.nextAction ? <p className="dxu-muted">{t("nextAction")}: {r.nextAction}</p> : null}</>, "ok") : null}
      {r.cancelReason ? block(<IconClose aria-hidden />, t("cancelled"), <p className="dxu-text">{r.cancelReason}</p>, "warn") : null}
      {r.statusHistory.length
        ? block(
            <IconClock aria-hidden />,
            t("history"),
            <ol className="dxu-hist">
              {r.statusHistory.map((h, i) => (
                <li key={i}>
                  <span>{label(h.to)}</span>
                  <em>{h.at ? dateTimeFull(h.at, locale) : ""}</em>
                </li>
              ))}
            </ol>,
          )
        : null}
    </article>
  );
}
