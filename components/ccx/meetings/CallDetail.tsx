"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getAdminCallDetail, type AdminCallDetail } from "@/lib/services/backend";
import { fmtDate, fmtDateTime, fmtDuration, timeOnly } from "@/lib/date";
import { humanize, statusSpecOf } from "@/lib/labels";
import Sheet from "../panel/Sheet";
import { FactStrip, Loading, Note, PanelFoot, Section } from "../panel/bits";
import { IcClock, IcMeeting, IcPhone, IcRefresh, IcShield, IcUser } from "../icons";
import { IcCalendar, IcUsers } from "./glyphs";
import { CALL_TONE, DETAIL_SHOWN, PART_JOINED, PART_TONE, avatarText, partRank, reasonOf, sameDay, useCallStatusMap } from "./model";

type Res = { key: string; d: AdminCallDetail | null; err: unknown };

export default function CallDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("admin.callHistory");
  const tm = useTranslations("admin.meetings");
  const tc = useTranslations("call");
  const tp = useTranslations("admin.ccx.panel");
  const tn = useTranslations("common.notify");
  const x = useTranslations("admin.ccx.meetings");
  const locale = useLocale();
  const callMap = useCallStatusMap();
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<Res | null>(null);
  const [all, setAll] = useState(false);
  const key = `${id}#${tick}`;

  useEffect(() => {
    let alive = true;
    getAdminCallDetail(id)
      .then((d) => {
        if (alive) setRes({ key, d, err: null });
      })
      .catch((e: unknown) => {
        if (alive) setRes({ key, d: null, err: e ?? new Error("failed") });
      });
    return () => {
      alive = false;
    };
  }, [id, key]);

  const cur = res?.key === key ? res : null;
  const d = cur?.d ?? null;
  const partStatus = (s: string) => (t.has(`detail.pstatus.${s}`) ? t(`detail.pstatus.${s}`) : tc.has(`pstatus.${s}`) ? tc(`pstatus.${s}`) : humanize(s));
  const partRole = (r: string) =>
    r === "host" ? tc("hostLabel") : t.has(`detail.role.${r}`) ? t(`detail.role.${r}`) : tc.has(`role.${r}`) ? tc(`role.${r}`) : t("detail.role.participant");
  const title = d?.call.title || t("detailTitle");

  const head = (
    <div className="opx-phead">
      <span className="opx-phead__ic" aria-hidden="true">
        <IcMeeting size={20} />
      </span>
      <b className="opx-mtg-dhead">{title}</b>
      {d?.call.workId ? <span className="opx-phead__tag opx-num">{d.call.workId}</span> : null}
    </div>
  );

  const body = () => {
    if (!d) return null;
    const c = d.call;
    const people = d.participants
      .map((p, i) => ({ p, i }))
      .sort((a, b) => partRank(a.p) - partRank(b.p) || a.i - b.i)
      .map((v) => v.p);
    const guests = d.participants.some((p) => p.role === "host") ? d.participants.filter((p) => p.role !== "host") : d.participants;
    const joined = guests.filter((p) => PART_JOINED.has(p.status)).length;
    const secs = d.durationSeconds || Math.round(d.durationMinutes * 60) || c.durationSeconds;
    const start = c.startedAt || c.createdAt;
    const shown = all ? people : people.slice(0, DETAIL_SHOWN);
    const hidden = people.length - DETAIL_SHOWN;
    const spec = statusSpecOf(callMap, c.status);
    const facts = [
      spec ? { icon: <IcShield size={17} />, label: t("detail.status"), value: <span className="opx-pill" data-tone={CALL_TONE[c.status] ?? "mute"}>{spec.label}</span> } : null,
      start ? { icon: <IcCalendar size={17} />, label: t("detail.started"), value: fmtDate(start, locale) } : null,
      c.status !== "scheduled" && fmtDuration(secs, locale) ? { icon: <IcClock size={17} />, label: t("detail.duration"), value: fmtDuration(secs, locale) } : null,
      guests.length ? { icon: <IcUsers size={17} />, label: t("detail.participants"), value: x("joinedOf", { joined, invited: guests.length }) } : null,
    ].filter((f): f is NonNullable<typeof f> => Boolean(f));
    const rows: [string, string][] = (
      [
        [t("detail.workId"), c.workId],
        [t("detail.type"), tm.has(`formatLabel.${c.callType}`) ? tm(`formatLabel.${c.callType}`) : humanize(c.callType)],
        [t("detail.room"), d.room?.title ?? ""],
        [t("detail.started"), fmtDateTime(c.startedAt, locale)],
        [t("detail.endedAt"), c.endedAt && c.startedAt && sameDay(c.startedAt, c.endedAt) ? timeOnly(c.endedAt, locale) : fmtDateTime(c.endedAt, locale)],
      ] as [string, string][]
    ).filter((r) => r[1]);
    const creatorName = d.creator?.name || c.creatorName;
    const creatorPhone = d.creator?.phone ?? "";
    const dial = creatorPhone.replace(/[^\d+]/g, "");
    return (
      <>
        {facts.length ? <FactStrip facts={facts} /> : null}
        {rows.length ? (
          <Section icon={<IcMeeting size={17} />} title={t("detail.meeting")}>
            <dl className="opx-mtg-dl">
              {rows.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd className="opx-num">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        ) : null}
        {creatorName || creatorPhone ? (
          <Section icon={<IcUser size={17} />} title={t("detail.creator")}>
            <div className="opx-mtg-person">
              <span className="opx-mtg-av" aria-hidden="true">
                {avatarText(creatorName) || <IcUser size={15} />}
              </span>
              <span className="opx-mtg-person__txt">
                <b>{creatorName || t("detail.noName")}</b>
                {creatorPhone ? <small className="opx-num">{creatorPhone}</small> : null}
              </span>
              {dial ? (
                <a className="opx-pbtn opx-pbtn--call" href={`tel:${dial}`}>
                  <IcPhone size={15} />
                  {tp("call")}
                </a>
              ) : null}
            </div>
          </Section>
        ) : null}
        <Section icon={<IcUsers size={17} />} title={t("detail.participants")} count={people.length}>
          {people.length ? (
            <>
              <ul className="opx-mtg-ppl">
                {shown.map((p, i) => (
                  <li key={p.userId || `p${i}`}>
                    <span className="opx-mtg-av" aria-hidden="true">
                      {avatarText(p.name) || <IcUser size={15} />}
                    </span>
                    <span className="opx-mtg-person__txt">
                      <b>{p.name.trim() || t("detail.noName")}</b>
                      <small>{partRole(p.role)}</small>
                    </span>
                    {p.status ? (
                      <span className="opx-pill" data-tone={PART_TONE[p.status] ?? "mute"}>
                        {partStatus(p.status)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {hidden > 0 ? (
                <button type="button" className="opx-pbtn opx-pbtn--ghost opx-mtg-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
                  {all ? t("detail.less") : t("detail.more", { n: hidden })}
                </button>
              ) : null}
            </>
          ) : (
            <p className="opx-pnone">{t("detail.noParticipants")}</p>
          )}
        </Section>
      </>
    );
  };

  return (
    <Sheet label={title} head={head} onClose={onClose}>
      <div className="opx-pscroll">
        {cur?.err ? (
          <Note tone="bad">
            <span className="opx-mtg-errline">
              <span>
                {t("detailError")}
                {reasonOf(cur.err) ? ` ${reasonOf(cur.err)}` : ""}
              </span>
              <button type="button" className="opx-pbtn" onClick={() => setTick((n) => n + 1)}>
                <IcRefresh size={15} />
                {tn("retry")}
              </button>
            </span>
          </Note>
        ) : !cur ? (
          <Loading label={tp("loading")} />
        ) : (
          body()
        )}
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={tp("close")} kbd={false} />
    </Sheet>
  );
}
