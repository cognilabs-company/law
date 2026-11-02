"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import PersonName from "@/components/ui/PersonName";
import { fmtAgeMin, shortDateTime } from "@/lib/date";
import { prettyPhone } from "../now/feed";
import { IcAward, IcBolt, IcCheck, IcCoins, IcDoc, IcFlag, IcInbox, IcLayers, IcPhone, IcRefresh, IcScale, IcShield, IcStore, IcTimeline, IcUser } from "../icons";
import { openHref, opensPanel, type FamKey, type QKey, type QView } from "./model";
import { useQText } from "./text";

function IcBan({ size = 18 }: { size?: number }) {
  return (
    <svg className="opx-i" viewBox="0 0 24 24" width={size} height={size} style={{ width: size, height: size }} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function FamIcon({ fam, size = 20 }: { fam: FamKey; size?: number }) {
  switch (fam) {
    case "work":
      return <IcInbox size={size} />;
    case "disputes":
      return <IcScale size={size} />;
    case "verify":
      return <IcShield size={size} />;
    case "money":
      return <IcCoins size={size} />;
    default:
      return <IcUser size={size} />;
  }
}

export function QueueIcon({ queue, size = 18 }: { queue: QKey; size?: number }) {
  switch (queue) {
    case "queue":
      return <IcInbox size={size} />;
    case "urgent":
      return <IcBolt size={size} />;
    case "escalations":
      return <IcLayers size={size} />;
    case "complaints":
      return <IcFlag size={size} />;
    case "mpComplaints":
      return <IcStore size={size} />;
    case "warranty":
      return <IcCheck size={size} />;
    case "cancellations":
      return <IcBan size={size} />;
    case "experience":
      return <IcTimeline size={size} />;
    case "achievements":
      return <IcAward size={size} />;
    case "licenses":
      return <IcDoc size={size} />;
    case "payouts":
      return <IcCoins size={size} />;
    default:
      return <IcRefresh size={size} />;
  }
}

export function WhoName({ job }: { job: QView }) {
  const t = useTranslations("admin.ccx.queues");
  if (job.who) return <>{job.who}</>;
  if (job.whoId) return <PersonName id={job.whoId} fallback={t("noName")} />;
  return <>{t("noName")}</>;
}

export function JobRow({ job, onOpen }: { job: QView; onOpen?: (job: QView) => void }) {
  const locale = useLocale();
  const body = (
    <>
      <IcDoc size={15} />
      <b className="opx-num">{job.code}</b>
      <span className="opx-lrow__who">
        <WhoName job={job} />
      </span>
      <i className="opx-num">{fmtAgeMin(job.ageMin, locale)}</i>
    </>
  );
  return (
    <li>
      {onOpen && opensPanel(job) ? (
        <button type="button" className="opx-lrow" data-tone={job.tone} onClick={() => onOpen(job)}>
          {body}
        </button>
      ) : (
        <Link href={openHref(job)} className="opx-lrow" data-tone={job.tone}>
          {body}
        </Link>
      )}
    </li>
  );
}

export function JobCard({ job, i, onOpen }: { job: QView; i: number; onOpen?: (job: QView) => void }) {
  const t = useTranslations("admin.ccx.queues");
  const locale = useLocale();
  const text = useQText();
  const dial = job.phone.replace(/[^\d+]/g, "");
  return (
    <article className="opx-qcard" data-tone={job.tone} style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}>
      <header className="opx-qcard__head">
        <span className="opx-qcard__ic" aria-hidden="true">
          <QueueIcon queue={job.queue} />
        </span>
        <b className="opx-num">{job.code}</b>
        <i className="opx-qcard__age opx-num">{fmtAgeMin(job.ageMin, locale)}</i>
      </header>
      <div className="opx-qcard__body">
        <div className="opx-qcard__who">
          <span>
            <IcUser size={15} />
            <b>
              <WhoName job={job} />
            </b>
          </span>
          {job.phone ? (
            <span className="opx-num">
              <IcPhone size={15} />
              {prettyPhone(job.phone)}
            </span>
          ) : null}
        </div>
        <p className="opx-qcard__why">
          {text.title(job)}
          {job.detail ? <small>{job.detail}</small> : null}
        </p>
      </div>
      <footer className="opx-qcard__foot">
        {job.mine ? <span className="opx-qcard__mine">{t("mine")}</span> : <time className="opx-num" dateTime={job.at}>{job.at ? shortDateTime(job.at, locale) : ""}</time>}
        <span className="opx-qcard__acts">
          {onOpen && opensPanel(job) ? (
            <button type="button" className="opx-qbtn" onClick={() => onOpen(job)}>
              {t("openJob")}
            </button>
          ) : (
            <Link href={openHref(job)} className="opx-qbtn">
              {t("openJob")}
            </Link>
          )}
          {dial ? (
            <a href={`tel:${dial}`} className="opx-qbtn opx-qbtn--call">
              <IcPhone size={15} />
              {t("call")}
            </a>
          ) : null}
        </span>
      </footer>
    </article>
  );
}
