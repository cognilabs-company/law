"use client";

import "./now.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import PersonName from "@/components/ui/PersonName";
import { fmtAge, fmtAgeMin } from "@/lib/date";
import { useCcxPrefs } from "@/lib/ccx/prefs";
import { isSellerJob, jobsOf, plainKey, rankJobs, toneOf, type NowJob } from "./feed";
import { useClientInfo, useJobDetail, useNowFeed, whoOf } from "./useNow";
import { useJobText } from "./text";
import NowFocus from "./NowFocus";
import NowClient from "./NowClient";
import { CcxEmblem, IcArrowLeft, IcArrowRight, IcNext, IcQueues, IcRefresh, JobIcon } from "../icons";

function JobCard({ job, onPick, i }: { job: NowJob; onPick: () => void; i: number }) {
  const t = useTranslations("admin.ccx.now");
  const text = useJobText();
  const locale = useLocale();
  const tone = toneOf(job);
  const kind = text.kind(job);
  const title = text.title(job);
  const sub = title !== kind ? title : job.leftMin == null ? "" : job.breached ? t("slaOver") : t("slaLeft", { time: fmtAgeMin(job.leftMin, locale) });
  const seller = isSellerJob(job);
  const sellerId = job.cockpit?.sellerUserId ?? "";
  const who = job.clientName ? (
    job.clientName
  ) : job.clientUserId ? (
    <PersonName id={job.clientUserId} fallback={t("unknownClient")} />
  ) : seller && sellerId ? (
    <PersonName id={sellerId} fallback={t("unknownSeller")} />
  ) : (
    <span className="opx-job__none">{seller ? t("unknownSeller") : t("unknownClient")}</span>
  );
  return (
    <button type="button" className="opx-job" data-tone={tone} onClick={onPick} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
      <span className="opx-job__ic" aria-hidden="true">
        <JobIcon kind={job.kind} size={20} />
      </span>
      <span className="opx-job__body">
        <span className="opx-job__top">
          <b>{job.code || kind}</b>
          <i className="opx-job__age opx-num">{fmtAgeMin(job.ageMin, locale)}</i>
        </span>
        <span className="opx-job__who">{who}</span>
        {sub ? <small>{sub}</small> : null}
      </span>
    </button>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div className="opx-now opx-now--wait" aria-busy="true" aria-label={label}>
      <div className="opx-now__main">
        <div className="opx-focus opx-focus--ghost">
          <i className="opx-shim opx-shim--title" />
          <i className="opx-shim opx-shim--who" />
          <i className="opx-shim opx-shim--block" />
          <i className="opx-shim opx-shim--para" />
          <i className="opx-shim opx-shim--acts" />
        </div>
        <div className="opx-c360">
          <i className="opx-shim opx-shim--who" />
          <i className="opx-shim opx-shim--tiles" />
          <i className="opx-shim opx-shim--block" />
        </div>
      </div>
      <div className="opx-next">
        <i className="opx-shim opx-shim--rail" />
      </div>
    </div>
  );
}

export default function CcxNow() {
  const t = useTranslations("admin.ccx.now");
  const locale = useLocale();
  const prefs = useCcxPrefs();
  const { state, now, reload } = useNowFeed();
  const params = useSearchParams();
  const [pick, setPick] = useState(() => params.get("pick") ?? "");
  const [later, setLater] = useState<string[]>([]);
  const [rev, setRev] = useState(0);
  const rail = useRef<HTMLDivElement>(null);

  const jobs = useMemo(() => (state.status === "ready" ? rankJobs(jobsOf(state.feed.queue, state.feed.cockpit, state.feed.at, now), later) : []), [state, now, later]);
  const found = jobs.find((j) => j.key === pick);
  if (!found && jobs.length) setPick(jobs[0].key);
  const current = found ?? jobs[0] ?? null;
  const index = current ? jobs.indexOf(current) : -1;
  const rest = current ? jobs.filter((j) => j !== current) : [];

  const detail = useJobDetail(current, rev);
  const client = useClientInfo(current ? whoOf(current, detail, null).userId : "", rev);
  const who = current ? whoOf(current, detail, client) : null;

  const next = useCallback(() => {
    if (jobs.length < 2) return;
    setPick(jobs[(index + 1) % jobs.length].key);
  }, [jobs, index]);

  const snooze = useCallback(() => {
    if (!current || jobs.length < 2) return;
    setLater((l) => [...l.filter((k) => k !== current.key), current.key]);
    setPick(jobs[(index + 1) % jobs.length].key);
  }, [current, jobs, index]);

  const changed = useCallback(() => {
    setRev((r) => r + 1);
    reload();
  }, [reload]);

  useEffect(() => {
    if (!prefs.keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (!plainKey(e)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        next();
        return;
      }
      if (!["c", "e", "s"].includes(key)) return;
      const el = document.querySelector<HTMLElement>(`.opx-now [data-key="${key}"]`);
      if (!el || el.matches(":disabled")) return;
      e.preventDefault();
      el.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs.keys, next]);

  const slide = (d: number) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: d * el.clientWidth * 0.8, behavior: "smooth" });
  };

  if (state.status === "loading") return <Skeleton label={t("loading")} />;

  if (state.status === "error") {
    return (
      <section className="opx-now-msg" role="alert">
        <span className="opx-now-msg__orb" aria-hidden="true">
          <CcxEmblem size={64} />
        </span>
        <h2>{t("loadFailed")}</h2>
        <p>{t("loadFailedLead")}</p>
        <div className="opx-now-msg__act">
          <button type="button" className="opx-btn opx-btn--main" onClick={reload}>
            <IcRefresh size={18} />
            {t("retry")}
          </button>
          <Link className="opx-btn" href="/admin/call-center?view=queues">
            <IcQueues size={18} />
            {t("allQueues")}
          </Link>
        </div>
      </section>
    );
  }

  const fresh = now - state.feed.at < 60_000;
  const synced = fresh ? t("updatedNow") : t("updated", { ago: fmtAge(state.feed.at, locale, now) });

  if (!current || !who) {
    return (
      <section className="opx-now-msg opx-now-msg--calm" aria-labelledby="opx-empty-h">
        <span className="opx-now-msg__orb" aria-hidden="true">
          <CcxEmblem size={72} />
        </span>
        <h2 id="opx-empty-h">{t("emptyTitle")}</h2>
        <p>{t("emptyLead")}</p>
        <div className="opx-now-msg__act">
          <button type="button" className="opx-btn" onClick={reload}>
            <IcRefresh size={18} />
            {t("refresh")}
          </button>
          <Link className="opx-btn" href="/admin/call-center?view=queues">
            <IcQueues size={18} />
            {t("allQueues")}
          </Link>
        </div>
        <small className="opx-now-msg__sync">{synced}</small>
      </section>
    );
  }

  return (
    <div className="opx-now" data-ai-target="callcenter:now">
      {state.feed.partial ? (
        <p className="opx-now__warn" role="status">
          {t("partial")}
          <button type="button" onClick={reload}>
            {t("retry")}
          </button>
        </p>
      ) : null}

      <div className="opx-now__main">
        <NowFocus
          key={current.key}
          job={current}
          detail={detail}
          who={who}
          position={{ i: index + 1, n: jobs.length }}
          canLater={jobs.length > 1}
          keys={prefs.keys}
          onChanged={changed}
          onLater={snooze}
          onLogged={() => setRev((r) => r + 1)}
        />
        <NowClient who={who} client={client} notes={detail?.customerNotes} seller={isSellerJob(current)} />
      </div>

      <section className="opx-next" aria-labelledby="opx-next-h">
        <header className="opx-next__head">
          <h2 id="opx-next-h">
            {t("upNext")}
            <b className="opx-num">{rest.length}</b>
          </h2>
          <span className="opx-next__sync">
            {synced}
            <button type="button" onClick={reload} aria-label={t("refresh")} title={t("refresh")}>
              <IcRefresh size={16} />
            </button>
          </span>
          <Link className="opx-next__all" href="/admin/call-center?view=queues">
            <IcQueues size={17} />
            {t("allQueues")}
          </Link>
          {rest.length > 2 ? (
            <span className="opx-next__nav">
              <button type="button" onClick={() => slide(-1)} aria-label={t("scrollBack")}>
                <IcArrowLeft size={16} />
              </button>
              <button type="button" onClick={() => slide(1)} aria-label={t("scrollOn")}>
                <IcArrowRight size={16} />
              </button>
            </span>
          ) : null}
          <button type="button" className="opx-next__go" onClick={next} disabled={!rest.length}>
            <IcNext size={18} />
            {t("next")}
            {prefs.keys ? <kbd>N</kbd> : null}
          </button>
        </header>
        {rest.length ? (
          <div className="opx-next__rail" ref={rail}>
            {rest.map((j, i) => (
              <JobCard key={j.key} job={j} i={i} onPick={() => setPick(j.key)} />
            ))}
          </div>
        ) : (
          <p className="opx-next__none">{t("noneNext")}</p>
        )}
      </section>
    </div>
  );
}
