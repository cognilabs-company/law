"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  listAssignedUrgentRequests,
  getUrgentRequest,
  isUrgentEvent,
  urgentEventInfo,
  isMissingRoute,
  type UrgentRequest,
} from "@/lib/services/backend";
import { subscribeUserEvents, onUserSocketResync } from "@/lib/userSocket";
import { ApiError, errDetail, logApiError } from "@/lib/http";
import { dateTimeFull } from "@/lib/date";
import { statusLabel, regionLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import Select from "@/components/Select";
import { Skeleton, EmptyState } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import {
  IconBolt,
  IconVideo,
  IconChat,
  IconUsers,
  IconScale,
  IconClock,
  IconCheck,
  IconAlert,
  IconCalendar,
  IconUser,
  IconPhone,
  IconMapPin,
  IconFileText,
  IconRefresh,
  IconChevronRight,
  IconClose,
} from "@/components/icons";

// "Mening Tezkor ishlarim" — the advocate's and lawyer's side of Tezkor
// Advokat, on GET /urgent-advokat/requests/assigned (backend 273953a,
// 2026-09-26).
//
// Before that endpoint existed this screen could not be built: the client's
// own list answers [] for staff and the call-centre detail is 403 for anyone
// outside the call centre, so an advocate assigned to a group second opinion
// was invited to a meeting with no way to read what it was about. The invite
// itself still arrives as the ring card (IncomingCallWatcher); this is where
// the work behind it lives.
//
// It is a PARTICIPANT view, not an operator one. The record carries canManage
// — true for call-centre staff, false for an assigned external advocate — and
// nothing here offers an action that a read-only participant cannot take. The
// backend also withholds the client's phone from an external advocate, so no
// field assumes it is there.
const KINDS = ["video_consultation", "chat_consultation", "second_opinion_single", "second_opinion_group"] as const;
const STATUSES = ["claimed", "scheduled", "in_progress", "meeting_active", "completed", "cancelled"] as const;

const KIND_ICON: Record<string, typeof IconVideo> = {
  video_consultation: IconVideo,
  chat_consultation: IconChat,
  second_opinion_single: IconScale,
  second_opinion_group: IconUsers,
};

type State = { status: "loading" | "ready" | "error" | "missing"; items: UrgentRequest[] };

export default function UrgentAssignedPanel() {
  const t = useTranslations("portal.seller.urgent");
  const tk = useTranslations("portal.client.urgent");
  const tcm = useTranslations("portal.common");
  const te = useTranslations("enums");
  const locale = useLocale();
  const { session } = useAuth();
  // The advocate cabinet calls it "messages", the lawyer one "chat".
  const chatHref = session?.role === "lawyer" ? "/portal/lawyer/chat" : "/portal/advocate/messages";

  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [state, setState] = useState<State>({ status: "loading", items: [] });
  const [openId, setOpenId] = useState("");

  const load = useCallback(
    () =>
      listAssignedUrgentRequests({ status: status || undefined, serviceKind: kind || undefined })
        .then((items) => setState({ status: "ready", items }))
        .catch((e) => {
          logApiError("urgent assigned", e);
          // A backend without the endpoint, and a role it does not apply to,
          // are both "nothing here" rather than a broken page.
          const denied = e instanceof ApiError && (e.status === 401 || e.status === 403);
          setState((s) => ({
            status: isMissingRoute(e) || denied ? "missing" : s.items.length ? "ready" : "error",
            items: s.items,
          }));
        }),
    [status, kind],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Claimed, scheduled, a meeting created, completed, cancelled — every one of
  // them can happen while this page is open and none of them originate here.
  const reload = useRef(load);
  useEffect(() => { reload.current = load; }, [load]);
  useEffect(() => {
    const off = subscribeUserEvents((e) => { if (isUrgentEvent(e.event)) void reload.current(); });
    const offSync = onUserSocketResync(() => void reload.current());
    const onVisible = () => { if (document.visibilityState === "visible") void reload.current(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { off(); offSync(); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const shown = state.items;

  if (state.status === "missing") return null;

  return (
    <section className="ppanel uasg">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconBolt /></span>{t("title")}</b>
        <button type="button" className="btn btn--line btn--sm" onClick={() => void load()} aria-label={tcm("open")} title={tcm("open")}>
          <IconRefresh />
        </button>
      </div>
      <p className="advmuted uasg__lead">{t("lead")}</p>

      <div className="uaq__filters">
        <Select
          value={status}
          onChange={setStatus}
          ariaLabel={t("fStatus")}
          options={[{ value: "", label: t("allStatuses") }, ...STATUSES.map((s) => ({ value: s, label: statusLabel(tcm, s) }))]}
        />
        <Select
          value={kind}
          onChange={setKind}
          ariaLabel={t("fKind")}
          options={[{ value: "", label: t("allKinds") }, ...KINDS.map((k) => ({ value: k, label: tk.has(`kinds.${k}`) ? tk(`kinds.${k}`) : k }))]}
        />
      </div>

      {state.status === "loading" ? (
        <Skeleton rows={3} />
      ) : state.status === "error" ? (
        <EmptyState icon={<IconAlert />} title={tcm("loadError")} text={tcm("loadErrorText")} />
      ) : !shown.length ? (
        <EmptyState icon={<IconBolt />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <ul className="uasg__list">
          {shown.map((r) => {
            const Icon = KIND_ICON[r.serviceKind] ?? IconScale;
            const on = openId === r.id;
            return (
              <li key={r.id} className={`uasg__row${on ? " uasg__row--on" : ""}`}>
                <span className={`uaq__i uaq__i--${r.channel || "video"}`}><Icon /></span>
                <div className="uasg__m">
                  <b>
                    {tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind}
                    {r.channel ? (
                      <em className="uaq__ch">{r.channel === "chat" ? <IconChat /> : <IconVideo />}{r.channel === "chat" ? tk("chChat") : tk("chVideo")}</em>
                    ) : null}
                    {/* A participant who is not call-centre staff can read this
                        record but not act on it; saying so beats offering
                        controls that would 403. */}
                    {!r.canManage ? <em className="uasg__ro">{t("readOnly")}</em> : null}
                  </b>
                  {r.need ? <span className="uasg__need">{r.need}</span> : null}
                  <span className="uasg__sub">
                    {[
                      r.clientName,
                      r.region ? regionLabel(te, r.region) : "",
                      r.directions.length
                        ? r.directions.map((d) => (te.has(`areas.${d}`) ? te(`areas.${d}`) : d)).join(", ")
                        : "",
                      r.createdAt ? dateTimeFull(r.createdAt, locale) : "",
                    ].filter(Boolean).join(" · ")}
                  </span>
                  {r.scheduledAt ? (
                    <span className="uasg__when"><IconCalendar />{t("scheduledFor", { when: dateTimeFull(r.scheduledAt, locale) })}</span>
                  ) : null}
                </div>
                <div className="uasg__r">
                  <em className={`creq__badge uaq__st uaq__st--${r.status || "claimed"}`}>{statusLabel(tcm, r.status)}</em>
                  <div className="uaq__acts">
                    {r.secureChatRoomId ? (
                      <Link href={chatHref} className="btn btn--line btn--sm"><IconChat />{t("openChat")}</Link>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn--soft btn--sm"
                      aria-expanded={on}
                      aria-controls={`uasg-${r.id}`}
                      onClick={() => setOpenId(on ? "" : r.id)}
                    >
                      {tcm("details")}<IconChevronRight />
                    </button>
                  </div>
                </div>
                {on ? <AssignedDetail id={`uasg-${r.id}`} recordId={r.id} fallback={r} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── One record, read through the participant endpoint ──────────────
// The list row already carries most of it, but GET /urgent-advokat/requests/
// {id} is the authoritative read for a participant and is the only place the
// attachments and the status history arrive — so the row is shown immediately
// as a fallback and replaced when the fetch lands.
function AssignedDetail({ id, recordId, fallback }: { id: string; recordId: string; fallback: UrgentRequest }) {
  const t = useTranslations("portal.seller.urgent");
  const tcm = useTranslations("portal.common");
  const te = useTranslations("enums");
  const locale = useLocale();
  const [req, setReq] = useState<UrgentRequest>(fallback);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    getUrgentRequest(recordId)
      .then((r) => { if (alive) setReq(r); })
      .catch((e) => { if (alive) { logApiError("urgent participant detail", e); setErr(errDetail(e) || tcm("loadError")); } });
    return () => { alive = false; };
  }, [recordId, tcm]);

  // Somebody else moving the record while it is open on screen.
  useEffect(() => {
    return subscribeUserEvents((e) => {
      if (!isUrgentEvent(e.event)) return;
      const info = urgentEventInfo(e);
      if (info.recordId && info.recordId !== recordId) return;
      getUrgentRequest(recordId).then(setReq).catch(() => { /* the list refetch covers it */ });
    });
  }, [recordId]);

  const panel = req.groupLawyers;

  return (
    <div className="uamore" id={id}>
      <div className="uamore__block">
        <b><IconUser />{t("client")}</b>
        <p>
          {req.clientName || t("clientHidden")}
          {/* Withheld from an external advocate by the backend — absent, not
              empty, so it is simply not rendered. */}
          {req.clientPhone ? <> · <a href={`tel:${req.clientPhone}`}><IconPhone />{req.clientPhone}</a></> : null}
        </p>
        {req.region ? <span className="advmuted"><IconMapPin />{regionLabel(te, req.region)}</span> : null}
      </div>

      <div className="uamore__block">
        <b><IconFileText />{t("need")}</b>
        <p>{req.need || t("noNeed")}</p>
        {req.directions.length ? (
          <div className="chiprow" style={{ margin: "6px 0 0" }}>
            {req.directions.map((d) => (
              <span key={d} className="fchip">{te.has(`areas.${d}`) ? te(`areas.${d}`) : d}</span>
            ))}
          </div>
        ) : null}
      </div>

      {req.files.length || req.voiceMessages.length ? (
        <div className="uamore__block">
          <b><IconFileText />{t("attachments")}</b>
          <ul className="uamore__files">
            {req.files.map((f, i) => (
              <li key={f.id || `f${i}`}>
                {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> : f.name}
              </li>
            ))}
            {req.voiceMessages.map((v, i) => (
              <li key={v.id || `v${i}`}>
                {v.url ? <audio src={v.url} controls preload="none" /> : v.name}
                {v.durationSeconds ? <span className="advmuted"> {t("seconds", { n: v.durationSeconds })}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {panel.length ? (
        <div className="uamore__block">
          <b><IconUsers />{t("panel")}</b>
          <ul className="uamore__files">
            {panel.map((g) => <li key={g.id}>{g.name}</li>)}
          </ul>
          {req.scheduledAt ? (
            <span className="advmuted"><IconCalendar /> {t("scheduledFor", { when: dateTimeFull(req.scheduledAt, locale) })}</span>
          ) : null}
          {req.meetingNote ? <span className="advmuted">{req.meetingNote}</span> : null}
        </div>
      ) : null}

      {req.operator ? (
        <div className="uamore__block">
          <b><IconUser />{t("operator")}</b>
          <p>{req.operator.name}{req.operator.phone ? ` · ${req.operator.phone}` : ""}</p>
        </div>
      ) : null}

      {req.meetingMinutes || req.amount ? (
        <div className="uamore__block">
          <b><IconClock />{t("terms")}</b>
          <p>
            {[
              req.meetingMinutes ? t("minutesN", { n: req.meetingMinutes }) : "",
              req.amount ? `${fmtUzs(req.amount)} ${te("currency")}` : "",
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
      ) : null}

      {req.resultSummary ? (
        <div className="uamore__block uamore__block--ok">
          <b><IconCheck />{t("result")}</b>
          <p>{req.resultSummary}</p>
          {req.nextAction ? <span className="advmuted">{t("nextAction")}: {req.nextAction}</span> : null}
        </div>
      ) : null}
      {req.cancelReason ? (
        <div className="uamore__block uamore__block--warn">
          <b><IconClose />{t("cancelled")}</b>
          <p>{req.cancelReason}</p>
        </div>
      ) : null}

      {req.statusHistory.length ? (
        <div className="uamore__block">
          <b><IconClock />{t("history")}</b>
          <ol className="uamore__hist">
            {req.statusHistory.map((h, i) => (
              <li key={i}>
                <span>{statusLabel(tcm, h.to)}</span>
                <em>{h.at ? dateTimeFull(h.at, locale) : ""}</em>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {err ? <Notice ok={false} msg={err} /> : null}
    </div>
  );
}
