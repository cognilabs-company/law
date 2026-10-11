"use client";

import { useEffect, useState } from "react";
import DatePicker from "@/components/DatePicker";
import { getLiveEmployee, stopBusy, type LiveActivity, type LiveEmployeeDetail, type LivePerson } from "@/lib/services/internalLive";
import { IconAlert, IconChartBar, IconClock, IconFlag } from "@/components/icons";
import { HrmAvatar, HrmDrawer, HrmEmpty, HrmError, HrmLoading, HrmSection, useHrmFormat, useNow } from "@/components/internal/HrmUi";
import { LiveStatus, ObjectLink, ReasonModal, apiMessage, dayIso, hms, shownStatus, useLiveText } from "./bits";

export type CorrectionTarget = { targetType: string; targetId: string; title: string; type: string };

// One person's Live Office record (§10): what they are doing now, their
// departments (primary and additional), the activity timeline with links to
// the real objects, presence sessions, busy intervals and the daily summary.
export default function LiveEmployeeDrawer({
  person,
  onClose,
  canManage,
  isMe,
  unitName,
  roomName,
  inactiveAfter,
  liveEvents,
  onAnalytics,
  onCorrect,
  onBusyStopped,
}: {
  person: LivePerson | null;
  onClose: () => void;
  canManage: boolean;
  isMe: boolean;
  unitName: (id: string) => string;
  roomName: (id: string) => string;
  inactiveAfter: number;
  liveEvents: LiveActivity[];
  onAnalytics: (employeeId: string) => void;
  onCorrect: (target: CorrectionTarget) => void;
  onBusyStopped: () => void;
}) {
  const { t, module, membership, status: statusName } = useLiveText();
  const f = useHrmFormat();
  const now = useNow(30_000);
  const [range, setRange] = useState({ from: dayIso(6), to: dayIso(0) });
  const [data, setData] = useState<{ id: string; key: string; d: LiveEmployeeDetail } | null>(null);
  const [err, setErr] = useState("");
  const [stopping, setStopping] = useState(false);
  const id = person?.id ?? "";
  const key = `${id}|${range.from}|${range.to}`;

  useEffect(() => {
    if (!id) return;
    const c = new AbortController();
    getLiveEmployee(id, { from: range.from, to: range.to, limit: 500 }, c.signal)
      .then((d) => {
        if (!c.signal.aborted) {
          setData({ id, key, d });
          setErr("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setErr(apiMessage(e, t("errors.load")));
      });
    return () => c.abort();
  }, [id, key, range.from, range.to, t]);

  if (!person) return null;
  const d = data?.key === key ? data.d : null;
  const status = shownStatus(person.status, person.lastSeenAt, now, inactiveAfter);
  // Events that arrived over the socket since the drawer opened come first.
  const seen = new Set((d?.timeline ?? []).map((a) => a.id).filter(Boolean));
  const timeline = [...liveEvents.filter((a) => !a.id || !seen.has(a.id)), ...(d?.timeline ?? [])];
  const busy = person.busy && !person.busy.endedAt ? person.busy : null;
  const canStop = Boolean(busy?.id) && (isMe || canManage);

  return (
    <HrmDrawer
      open
      onClose={onClose}
      title={person.name}
      sub={[person.position, person.code].filter(Boolean).join(" · ")}
      head={<HrmAvatar name={person.name} size="lg" />}
      footer={
        <button type="button" className="btn btn--line btn--sm" onClick={() => onAnalytics(person.id)}>
          <IconChartBar />
          {t("detail.analytics")}
        </button>
      }
    >
      <div className="lv-now">
        <LiveStatus value={status} />
        <div className="lv-now__t">
          {busy ? (
            <>
              <b>{t("detail.busyNow")}</b>
              <span>{busy.reason}</span>
              {busy.startedAt ? <small>{t("detail.since", { time: f.dateTime(busy.startedAt) })}</small> : null}
            </>
          ) : person.activity?.label ? (
            <>
              <b>{person.activity.detailUrl ? <ObjectLink href={person.activity.detailUrl}>{person.activity.label}</ObjectLink> : person.activity.label}</b>
              <small>{[module(person.activity.module), person.activity.at ? f.dateTime(person.activity.at) : ""].filter(Boolean).join(" · ")}</small>
            </>
          ) : (
            <span className="hrm-muted">{t("board.noActivity")}</span>
          )}
          {person.lastSeenAt ? <small>{t("detail.lastSeen", { time: f.dateTime(person.lastSeenAt) })}</small> : null}
        </div>
        {canStop ? (
          <button type="button" className="btn btn--line btn--sm" onClick={() => setStopping(true)}>
            {t("busy.stop")}
          </button>
        ) : null}
      </div>

      <div className="lv-range">
        <DatePicker value={range.from} onChange={(v) => v && setRange((r) => ({ ...r, from: v }))} placeholder={t("filters.from")} ariaLabel={t("filters.from")} max={range.to} />
        <span aria-hidden>—</span>
        <DatePicker value={range.to} onChange={(v) => v && setRange((r) => ({ ...r, to: v }))} placeholder={t("filters.to")} ariaLabel={t("filters.to")} min={range.from} />
      </div>
      {err ? <HrmError text={err} /> : null}

      {!d && !err ? (
        <HrmLoading rows={5} />
      ) : d ? (
        <>
          <HrmSection label={t("detail.memberships")} aside={<span className="hrm-count">{d.memberships.length}</span>}>
            {d.memberships.length ? (
              <ul className="lv-mem">
                {d.memberships.map((m) => (
                  <li key={m.id || `${m.unitId}-${m.type}`} className={m.status !== "active" ? "is-off" : ""}>
                    <span className={`lv-mtype lv-mtype--${m.type}`}>{membership(m.type)}</span>
                    <b>{unitName(m.unitId) || "—"}</b>
                    {m.roomId ? <small>{roomName(m.roomId)}</small> : null}
                    <small>{[m.from ? f.date(m.from) : "", m.to ? f.date(m.to) : t("detail.open")].filter(Boolean).join(" — ")}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hrm-muted">{t("detail.noMemberships")}</p>
            )}
          </HrmSection>

          <HrmSection label={t("detail.days")}>
            {d.days.length ? (
              <div className="hrm-table-wrap">
                <table className="hrm-table lv-days">
                  <thead>
                    <tr>
                      <th>{t("cols.date")}</th>
                      <th className="hrm-num">{t("cols.online")}</th>
                      <th className="hrm-num">{t("cols.active")}</th>
                      <th className="hrm-num">{t("cols.inactive")}</th>
                      <th className="hrm-num">{t("cols.busy")}</th>
                      <th className="hrm-num">{t("cols.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.days.map((x) => (
                      <tr key={x.date}>
                        <td>{f.date(x.date)}</td>
                        <td className="hrm-num">{hms(x.online)}</td>
                        <td className="hrm-num">{hms(x.active)}</td>
                        <td className="hrm-num">{hms(x.inactive)}</td>
                        <td className="hrm-num">{hms(x.busy)}{x.busyCount ? <small> ×{x.busyCount}</small> : null}</td>
                        <td className="hrm-num">{x.actions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="hrm-muted">{t("detail.noDays")}</p>
            )}
          </HrmSection>

          <HrmSection label={t("detail.timeline")} aside={<span className="hrm-count">{timeline.length}</span>}>
            {timeline.length ? (
              <ol className="lv-tl">
                {timeline.slice(0, 200).map((a, i) => (
                  <li key={a.id || `${a.at}-${i}`}>
                    <time>{a.at ? f.dateTime(a.at) : "—"}</time>
                    <span className="lv-tl__b">
                      <b>{a.detailUrl ? <ObjectLink href={a.detailUrl}>{a.label || a.code || module(a.module)}</ObjectLink> : a.label || a.code || module(a.module)}</b>
                      <small>{[module(a.module), a.unitId ? unitName(a.unitId) : "", a.roomId ? roomName(a.roomId) : ""].filter(Boolean).join(" · ")}</small>
                    </span>
                    {isMe && a.id ? (
                      <button type="button" className="lv-tl__fix" title={t("corrections.report")} aria-label={t("corrections.report")} onClick={() => onCorrect({ targetType: "activity_event", targetId: a.id, title: a.label, type: "activity" })}>
                        <IconFlag />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <HrmEmpty icon={IconClock} title={t("detail.noTimeline")} />
            )}
          </HrmSection>

          <HrmSection label={t("detail.sessions")} aside={<span className="hrm-count">{d.sessions.length}</span>}>
            {d.sessions.length ? (
              <ul className="hrm-list">
                {d.sessions.slice(0, 50).map((s, i) => (
                  <li key={s.id || i}>
                    <span className="hrm-list__t">
                      <b>{f.dateTime(s.startedAt)}{s.endedAt ? ` — ${f.time(s.endedAt)}` : ""}</b>
                      <small>{[s.platform, s.status ? statusName(s.status) : ""].filter(Boolean).join(" · ")}</small>
                    </span>
                    <b className="hrm-num">{s.seconds ? hms(s.seconds) : "—"}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hrm-muted">{t("detail.noSessions")}</p>
            )}
          </HrmSection>

          <HrmSection label={t("detail.busyIntervals")} aside={<span className="hrm-count">{d.busy.length}</span>}>
            {d.busy.length ? (
              <ul className="hrm-list">
                {d.busy.map((b, i) => (
                  <li key={b.id || i}>
                    <span className="hrm-list__t">
                      <b>{b.reason}</b>
                      <small>
                        {f.dateTime(b.startedAt)}
                        {b.endedAt ? ` — ${f.time(b.endedAt)}` : ` · ${t("detail.ongoing")}`}
                        {b.stopReason ? ` · ${b.stopReason}` : ""}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hrm-muted">{t("detail.noBusy")}</p>
            )}
          </HrmSection>

          {isMe ? (
            <button type="button" className="btn btn--line btn--sm lv-wrong" onClick={() => onCorrect({ targetType: "employee", targetId: person.id, title: "", type: "department" })}>
              <IconAlert />
              {t("corrections.wrongPlace")}
            </button>
          ) : null}
        </>
      ) : null}

      <ReasonModal
        open={stopping}
        title={t("busy.stopTitle")}
        lead={isMe ? undefined : t("busy.stopOtherLead", { name: person.name })}
        label={t("busy.stopReason")}
        placeholder={t("busy.stopPh")}
        submitLabel={t("busy.stop")}
        onClose={() => setStopping(false)}
        onSubmit={async (reason) => {
          await stopBusy(busy!.id, reason);
          onBusyStopped();
        }}
      />
    </HrmDrawer>
  );
}
