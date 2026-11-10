"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CcCall } from "@/lib/services/backend";
import { fmtAgeMin, shortDateTime } from "@/lib/date";
import { prettyPhone } from "../now/feed";
import { IcArrowRight, IcChevron, IcPhone } from "../icons";
import { FAMILIES, type FamKey, type LaneView, type QKey, type QView } from "./model";
import { FamIcon } from "./parts";

type Props = {
  lanes: Partial<Record<QKey, LaneView>>;
  calls: CcCall[] | null;
  canLeads: boolean;
  onDrill: (fam: FamKey, queue: QKey) => void;
  onRetry: () => void;
  onOpen: (job: QView) => void;
};

export function CallRows({ calls, max }: { calls: CcCall[]; max: number }) {
  const t = useTranslations("admin.ccx.queues");
  const locale = useLocale();
  const recent = calls.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, max);
  if (!recent.length) return <p className="opx-lane__empty">{t("people.noCalls")}</p>;
  return (
    <ul className="opx-lane__rows">
      {recent.map((c) => (
        <li key={c.id} className="opx-lrow opx-lrow--call" data-st={c.status}>
          <IcPhone size={15} />
          <b className="opx-num">{prettyPhone(c.phone)}</b>
          <i className="opx-num">{shortDateTime(c.createdAt, locale)}</i>
        </li>
      ))}
    </ul>
  );
}

export default function QueuesBoard({ lanes, calls, canLeads, onDrill, onRetry, onOpen }: Props) {
  const t = useTranslations("admin.ccx.queues");
  const [showEmpty, setShowEmpty] = useState(false);
  const rows = FAMILIES.flatMap((f) => f.queues.map((q) => ({ fam: f.key, lane: lanes[q] })).filter((r): r is { fam: FamKey; lane: LaneView } => Boolean(r.lane) && r.lane?.status !== "denied"));
  const busy = rows.filter((r) => r.lane.status !== "failed" && r.lane.jobs.length);
  const failed = rows.filter((r) => r.lane.status === "failed");
  const empty = rows.filter((r) => r.lane.status !== "failed" && !r.lane.jobs.length);
  const first = [...busy].sort((a, b) => (b.lane.oldest?.ageMin ?? 0) - (a.lane.oldest?.ageMin ?? 0))[0];
  const oldest = first?.lane.oldest ?? first?.lane.jobs[0];

  return (
    <div className="opx-board2">
      {oldest ? (
        <section className="opx-board2__do">
          <span className="opx-board2__ic" aria-hidden="true">
            <FamIcon fam={first.fam} />
          </span>
          <button type="button" className="opx-pbtn opx-pbtn--main" onClick={() => onOpen(oldest)}>
            {t("doOldest")}
            <IcArrowRight size={22} />
          </button>
        </section>
      ) : null}

      <ul className="opx-board2__rows">
        {busy.map(({ fam, lane: l }) => (
          <li key={l.queue}>
            {l.queue === "urgent" ? (
              <Link href="/admin/call-center?view=urgent" className="opx-board2__row" data-tone={l.oldest?.tone}>
                <QueueRow fam={fam} lane={l} />
              </Link>
            ) : (
              <button type="button" className="opx-board2__row" data-tone={l.oldest?.tone} onClick={() => onDrill(fam, l.queue)}>
                <QueueRow fam={fam} lane={l} />
              </button>
            )}
          </li>
        ))}
        {failed.map(({ fam, lane: l }) => (
          <li key={l.queue}>
            <button type="button" className="opx-board2__row is-failed" onClick={onRetry}>
              <span className="opx-board2__fam" aria-hidden="true">
                <FamIcon fam={fam} />
              </span>
              <b>{t(`q.${l.queue}`)}</b>
              <em>{t("retry")}</em>
            </button>
          </li>
        ))}
      </ul>

      <div className="opx-board2__links">
        {canLeads ? (
          <Link href="/admin/call-center?view=crm&s=leads" className="opx-pbtn">
            {t("people.leadsGo")}
            <IcArrowRight size={15} />
          </Link>
        ) : null}
        <Link href="/admin/call-center?view=clients" className="opx-pbtn">
          {t("people.clientsGo")}
          <IcArrowRight size={15} />
        </Link>
        {empty.length ? (
          <button type="button" className="opx-pbtn opx-board2__quiet" aria-expanded={showEmpty} onClick={() => setShowEmpty((o) => !o)}>
            {t("emptyQueues", { n: empty.length })}
            <IcChevron size={15} />
          </button>
        ) : null}
      </div>
      {showEmpty ? (
        <ul className="opx-board2__empty">
          {empty.map(({ lane: l }) => (
            <li key={l.queue}>{t(`q.${l.queue}`)}</li>
          ))}
        </ul>
      ) : null}
      {calls && calls.length ? (
        <section className="opx-lane">
          <header className="opx-lane__head">
            <h4>{t("people.clients")}</h4>
          </header>
          <CallRows calls={calls} max={3} />
        </section>
      ) : null}
    </div>
  );
}

function QueueRow({ fam, lane: l }: { fam: FamKey; lane: LaneView }) {
  const t = useTranslations("admin.ccx.queues");
  const locale = useLocale();
  return (
    <>
      <span className="opx-board2__fam" aria-hidden="true">
        <FamIcon fam={fam} />
      </span>
      <b>{t(`q.${l.queue}`)}</b>
      {l.oldest ? (
        <em className="opx-num" data-tone={l.oldest.tone}>
          {fmtAgeMin(l.oldest.ageMin, locale)}
        </em>
      ) : null}
      <strong className="opx-num">{l.count}</strong>
      <IcArrowRight size={18} />
    </>
  );
}
