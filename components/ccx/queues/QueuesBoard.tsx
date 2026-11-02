"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CcCall } from "@/lib/services/backend";
import { fmtAgeMin, shortDateTime } from "@/lib/date";
import { prettyPhone } from "../now/feed";
import { IcArrowRight, IcPhone } from "../icons";
import { FAMILIES, type FamKey, type LaneView, type QKey, type QView } from "./model";
import { FamIcon, JobRow } from "./parts";

type Props = {
  lanes: Partial<Record<QKey, LaneView>>;
  calls: CcCall[] | null;
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

export default function QueuesBoard({ lanes, calls, onDrill, onRetry, onOpen }: Props) {
  const t = useTranslations("admin.ccx.queues");
  const locale = useLocale();

  return (
    <div className="opx-board">
      {FAMILIES.map((f, fi) => {
        const visible = f.queues.map((q) => lanes[q]).filter((l): l is LaneView => Boolean(l) && l?.status !== "denied");
        if (f.key !== "people" && !visible.length) return null;
        const total = visible.reduce((n, l) => n + (l.status === "ready" ? l.count : 0), 0);
        return (
          <section key={f.key} className="opx-col" data-fam={f.key} aria-labelledby={`opx-col-${f.key}`} style={{ animationDelay: `${fi * 60}ms` }}>
            <header className="opx-col__head">
              <span className="opx-col__ic" aria-hidden="true">
                <FamIcon fam={f.key} />
              </span>
              <h3 id={`opx-col-${f.key}`}>{t(`fam.${f.key}`)}</h3>
              {f.key !== "people" ? <b className="opx-col__n opx-num">{total}</b> : null}
            </header>

            {f.key === "people" ? (
              <>
                <section className="opx-lane">
                  <header className="opx-lane__head">
                    <h4>{t("people.leads")}</h4>
                  </header>
                  <p className="opx-lane__note">{t("people.leadsLead")}</p>
                  <Link href="/admin/call-center?view=crm&s=leads" className="opx-lane__all">
                    {t("people.leadsGo")}
                    <IcArrowRight size={14} />
                  </Link>
                </section>
                <section className="opx-lane">
                  <header className="opx-lane__head">
                    <h4>{t("people.clients")}</h4>
                  </header>
                  {calls ? <CallRows calls={calls} max={3} /> : <p className="opx-lane__note">{t("people.clientsLead")}</p>}
                  <Link href="/admin/call-center?view=clients" className="opx-lane__all">
                    {t("people.clientsGo")}
                    <IcArrowRight size={14} />
                  </Link>
                </section>
              </>
            ) : (
              visible.map((l) =>
                l.status === "failed" ? (
                  <section key={l.queue} className="opx-lane is-failed">
                    <header className="opx-lane__head">
                      <h4>{t(`q.${l.queue}`)}</h4>
                    </header>
                    <p className="opx-lane__empty">
                      {t("failed")}
                      <button type="button" onClick={onRetry}>
                        {t("retry")}
                      </button>
                    </p>
                  </section>
                ) : !l.jobs.length ? (
                  <section key={l.queue} className="opx-lane is-empty">
                    <header className="opx-lane__head">
                      <h4>{t(`q.${l.queue}`)}</h4>
                      <span className="opx-lane__quiet">{t("empty")}</span>
                    </header>
                  </section>
                ) : (
                  <section key={l.queue} className="opx-lane">
                    <header className="opx-lane__head">
                      <h4>{t(`q.${l.queue}`)}</h4>
                      <b className="opx-lane__n opx-num">{l.count}</b>
                    </header>
                    {l.oldest ? (
                      <span className="opx-oldest" data-tone={l.oldest.tone}>
                        {t("oldest", { time: fmtAgeMin(l.oldest.ageMin, locale) })}
                      </span>
                    ) : null}
                    <ul className="opx-lane__rows">
                      {l.jobs.slice(0, 2).map((j) => (
                        <JobRow key={j.key} job={j} onOpen={onOpen} />
                      ))}
                    </ul>
                    {l.queue === "urgent" ? (
                      <Link href="/admin/call-center?view=urgent" className="opx-lane__all">
                        {t("all")}
                        <IcArrowRight size={14} />
                      </Link>
                    ) : (
                      <button type="button" className="opx-lane__all" onClick={() => onDrill(f.key, l.queue)}>
                        {t("all")}
                        <IcArrowRight size={14} />
                      </button>
                    )}
                  </section>
                ),
              )
            )}
          </section>
        );
      })}
    </div>
  );
}
