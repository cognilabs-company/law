"use client";

import "./queues.css";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { useCcxPrefs } from "@/lib/ccx/prefs";
import { fmtAge, fmtAgeMin } from "@/lib/date";
import { plainKey } from "../now/feed";
import { CcxEmblem, IcArrowLeft, IcFlag, IcGrid, IcLayers, IcQueues, IcRefresh } from "../icons";
import { useSearchParams } from "next/navigation";
import { FAMILIES, QUEUE_OF_TAB, familyOf, laneViews, openHref, opensPanel, type FamKey, type LaneView, type QFilter, type QKey, type QView } from "./model";
import JobPanel from "./JobPanel";
import { useQueues } from "./useQueues";
import QueuesBoard, { CallRows } from "./QueuesBoard";
import { FamIcon, JobCard, QueueIcon } from "./parts";
import Select from "@/components/Select";

type Mode = "board" | "family";

const MODE_KEY = "lexgo_ccx_queues_mode";
const FILTERS: QFilter[] = ["all", "mine", "late"];

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "family" ? "family" : "board";
  } catch {
    return "board";
  }
}

function saveMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {}
}

const isToday = (iso: string, now: number) => {
  const d = new Date(iso);
  const n = new Date(now);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

export default function CcxQueues() {
  const t = useTranslations("admin.ccx.queues");
  const locale = useLocale();
  const prefs = useCcxPrefs();
  const { session } = useAuth();
  const { state, now, reload } = useQueues(session?.id ?? "");
  const params = useSearchParams();
  const router = useRouter();
  const fromTab = QUEUE_OF_TAB[params.get("tab") ?? ""];
  const [mode, setModeState] = useState<Mode>(() => (fromTab ? "family" : readMode()));
  const [filter, setFilter] = useState<QFilter>("all");
  const [famPick, setFamPick] = useState<FamKey>(() => (fromTab ? familyOf(fromTab) : "work"));
  const [lanePick, setLanePick] = useState<QKey | "">(() => fromTab ?? "");
  const [open, setOpen] = useState<QView | null>(null);
  const [newest, setNewest] = useState(false);

  const lanes = useMemo(() => (state.status === "ready" ? laneViews(state.lanes, state.at, now, filter) : {}), [state, now, filter]);
  const visible = (q: QKey) => {
    const l = lanes[q];
    return l && l.status !== "denied" ? l : null;
  };
  const families = FAMILIES.filter((f) => f.key === "people" || f.queues.some((q) => visible(q)));
  const fam = families.find((f) => f.key === famPick) ?? families[0];
  const famLanes = (fam?.queues ?? []).map((q) => visible(q)).filter((l): l is LaneView => Boolean(l));
  const lane = famLanes.find((l) => l.queue === lanePick) ?? famLanes[0] ?? null;
  const jobs = lane ? (newest ? lane.jobs.slice().reverse() : lane.jobs) : [];

  const setMode = (m: Mode) => {
    setModeState(m);
    saveMode(m);
  };
  const drill = (f: FamKey, q: QKey) => {
    setFamPick(f);
    setLanePick(q);
    setMode("family");
  };
  const pickFamily = (f: FamKey) => {
    setFamPick(f);
    setLanePick("");
  };

  useEffect(() => {
    if (mode !== "family" || !prefs.keys || !lane) return;
    const onKey = (e: KeyboardEvent) => {
      if (!plainKey(e)) return;
      if (e.key === "Enter") {
        const first = newest ? lane.jobs[lane.jobs.length - 1] : lane.jobs[0];
        if (!first || (e.target instanceof Element && e.target.closest("button, a, [role='button']"))) return;
        e.preventDefault();
        if (opensPanel(first)) setOpen(first);
        else router.push(openHref(first));
        return;
      }
      if (famLanes.length < 2 || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      e.preventDefault();
      const i = famLanes.indexOf(lane);
      const next = famLanes[(i + (e.key === "ArrowRight" ? 1 : -1) + famLanes.length) % famLanes.length];
      setLanePick(next.queue);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, prefs.keys, famLanes, lane, newest, router]);

  if (state.status === "loading") {
    return (
      <div className="opx-qs" aria-busy="true" aria-label={t("loading")}>
        <i className="opx-shim opx-qs__shim-head" />
        <div className="opx-qs__shim-grid">
          {FAMILIES.map((f) => (
            <i key={f.key} className="opx-shim opx-qs__shim-col" />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <section className="opx-qs-msg" role="alert">
        <span className="opx-qs-msg__orb" aria-hidden="true">
          <CcxEmblem size={64} />
        </span>
        <h2>{t("loadFailed")}</h2>
        <p>{t("loadFailedLead")}</p>
        <button type="button" className="opx-qbtn opx-qbtn--call" onClick={reload}>
          <IcRefresh size={16} />
          {t("retry")}
        </button>
      </section>
    );
  }

  const ready = Object.values(lanes).filter((l): l is LaneView => Boolean(l) && l?.status === "ready");
  const openTotal = ready.reduce((n, l) => n + (filter === "all" ? l.count : l.jobs.length), 0);
  const lateTotal = ready.reduce((n, l) => n + l.late, 0);
  const failed = Object.values(lanes).filter((l) => l?.status === "failed").length;
  const synced = now - state.at < 60_000 ? t("updatedNow") : t("updated", { ago: fmtAge(state.at, locale, now) });
  const todayCalls = (state.calls ?? []).filter((c) => isToday(c.createdAt, now)).length;

  return (
    <div className="opx-qs" data-ai-target="callcenter:queues">
      <header className="opx-qhead">
        <Link href="/admin/call-center" className="opx-qhead__back">
          <IcArrowLeft size={16} />
          {t("back")}
        </Link>
        <h2>{t("title")}</h2>
        <span className="opx-qhead__stat">
          <IcLayers size={17} />
          <b className="opx-num">{t("open", { n: openTotal })}</b>
        </span>
        {lateTotal ? (
          <span className="opx-qhead__stat is-late">
            <IcFlag size={17} />
            <b className="opx-num">{t("late", { n: lateTotal })}</b>
          </span>
        ) : null}
        <div className="opx-qhead__tools">
          <div className="opx-seg" role="group" aria-label={t("filterAria")}>
            {FILTERS.map((f) => (
              <button key={f} type="button" className={filter === f ? "is-on" : undefined} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`filter.${f}`)}
              </button>
            ))}
          </div>
          <div className="opx-seg opx-seg--mode" role="group" aria-label={t("modeAria")}>
            <button type="button" className={mode === "board" ? "is-on" : undefined} aria-pressed={mode === "board"} onClick={() => setMode("board")}>
              <IcGrid size={16} />
              {t("mode.board")}
            </button>
            <button type="button" className={mode === "family" ? "is-on" : undefined} aria-pressed={mode === "family"} onClick={() => setMode("family")}>
              <IcQueues size={16} />
              {t("mode.family")}
            </button>
          </div>
          <button type="button" className="opx-qhead__sync" onClick={reload} aria-label={`${t("refresh")} · ${synced}`} title={synced}>
            <IcRefresh size={17} />
          </button>
        </div>
      </header>

      {failed ? (
        <p className="opx-qs__warn" role="status">
          {t("partial", { n: failed })}
          <button type="button" onClick={reload}>
            {t("retry")}
          </button>
        </p>
      ) : null}

      {mode === "board" ? (
        <QueuesBoard lanes={lanes} calls={state.calls} onDrill={drill} onRetry={reload} onOpen={setOpen} />
      ) : (
        <div className="opx-fam">
          <div className="opx-fam__cards" role="group" aria-label={t("famAria")}>
            {families.map((f, i) => {
              const ls = f.queues.map((q) => visible(q)).filter((l): l is LaneView => Boolean(l) && l?.status === "ready");
              const count = ls.reduce((n, l) => n + l.count, 0);
              const late = ls.reduce((n, l) => n + l.late, 0);
              const oldest = ls.map((l) => l.oldest).filter(Boolean).sort((a, b) => (b?.ageMin ?? 0) - (a?.ageMin ?? 0))[0];
              const on = fam?.key === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  className={`opx-famcard${on ? " is-on" : ""}`}
                  data-fam={f.key}
                  onClick={() => pickFamily(f.key)}
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <span className="opx-famcard__top">
                    <span className="opx-famcard__ic" aria-hidden="true">
                      <FamIcon fam={f.key} size={22} />
                    </span>
                    <b>{t(`fam.${f.key}`)}</b>
                  </span>
                  <span className="opx-famcard__n opx-num">{f.key === "people" ? todayCalls : count}</span>
                  {f.key === "people" ? (
                    <small>{t("people.today")}</small>
                  ) : (
                    <>
                      {late ? <span className="opx-famcard__late opx-num">{t("lateN", { n: late })}</span> : <span className="opx-famcard__calm">{t("noLate")}</span>}
                      <small className="opx-num">{oldest ? t("oldest", { time: fmtAgeMin(oldest.ageMin, locale) }) : t("empty")}</small>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {fam?.key === "people" ? (
            <div className="opx-fam__people">
              <section className="opx-qcard opx-qcard--link">
                <h3>{t("people.leads")}</h3>
                <p>{t("people.leadsLead")}</p>
                <Link href="/admin/call-center?view=crm&s=leads" className="opx-qbtn opx-qbtn--call">
                  {t("people.leadsGo")}
                </Link>
              </section>
              <section className="opx-qcard opx-qcard--link">
                <h3>{t("people.clients")}</h3>
                {state.calls ? <CallRows calls={state.calls} max={5} /> : <p>{t("people.clientsLead")}</p>}
                <Link href="/admin/call-center?view=clients" className="opx-qbtn opx-qbtn--call">
                  {t("people.clientsGo")}
                </Link>
              </section>
            </div>
          ) : (
            <>
              <div className="opx-fam__bar">
                <div className="opx-fam__tabs" role="group" aria-label={t("queueAria")}>
                  {famLanes.map((l) => (
                    <button key={l.queue} type="button" aria-pressed={lane?.queue === l.queue} className={`opx-qtab${lane?.queue === l.queue ? " is-on" : ""}`} onClick={() => setLanePick(l.queue)}>
                      <QueueIcon queue={l.queue} size={16} />
                      {t(`q.${l.queue}`)}
                      <b className="opx-num">{l.status === "failed" ? "!" : l.count}</b>
                    </button>
                  ))}
                </div>
                <span className="opx-fam__sort">
                  <Select value={newest ? "new" : "old"} ariaLabel={t("sortAria")} onChange={(v) => setNewest(v === "new")} options={[{ value: "old", label: t("sort.old") }, { value: "new", label: t("sort.new") }]} />
                </span>
              </div>

              {lane?.status === "failed" ? (
                <p className="opx-qs__warn" role="status">
                  {t("failed")}
                  <button type="button" onClick={reload}>
                    {t("retry")}
                  </button>
                </p>
              ) : jobs.length ? (
                <div className="opx-fam__grid" key={`${lane?.queue}-${filter}-${newest}`}>
                  {jobs.map((j, i) => (
                    <JobCard key={j.key} job={j} i={i} onOpen={setOpen} />
                  ))}
                </div>
              ) : (
                <p className="opx-fam__none">{filter === "all" ? t("emptyLane") : t("emptyFilter")}</p>
              )}

            </>
          )}
        </div>
      )}
      {open ? <JobPanel key={open.key} job={open} onClose={() => setOpen(null)} onChanged={reload} /> : null}
    </div>
  );
}
