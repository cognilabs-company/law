"use client";

import { useMemo, useState } from "react";
import { ApiError } from "@/lib/http";
import { buildPeople, KINDS, type PersonKind } from "@/lib/liveOffice/model";
import { HrmError, HrmHead, HrmLoading, HrmStat, useNow } from "@/components/internal/HrmUi";
import { IconClock, IconRefresh, IconSearch, IconUsers, IconBolt, IconHistory } from "@/components/icons";
import Character, { CharacterDefs } from "./Character";
import { AwayPanel, FeedPanel } from "./Feed";
import OfficeFloor from "./OfficeFloor";
import PersonPanel from "./PersonPanel";
import { useOffice } from "./useOffice";
import { useOfficeText } from "./text";

export default function LiveOffice() {
  const { t, kind, ago } = useOfficeText();
  const office = useOffice();
  const tick = useNow(15_000);
  const now = Math.max(tick, office.updatedAt);
  const people = useMemo(() => (now ? buildPeople(office.rows, office.dir, now) : []), [office.rows, office.dir, now]);
  const [kinds, setKinds] = useState<PersonKind[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState("");

  const needle = q.trim().toLowerCase();
  const shown = people.filter((p) => (!kinds.length || kinds.includes(p.kind)) && (!needle || p.name.toLowerCase().includes(needle)));
  const inOffice = shown.filter((p) => p.status !== "away");
  const working = inOffice.filter((p) => p.status === "working").length;
  const countOf = (k: PersonKind) => people.filter((p) => p.kind === k && p.status !== "away").length;
  const toggle = (k: PersonKind) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const pickedPerson = people.find((p) => p.id === picked) ?? null;
  const forbidden = office.error instanceof ApiError && office.error.status === 403;

  return (
    <div className="hrm-page lo-page">
      <CharacterDefs />
      <HrmHead
        kicker={t("kicker")}
        title={t("title")}
        lead={t("lead")}
        actions={
          <>
            <span className={`lo-live${office.phase === "ready" ? "" : " lo-live--off"}`} aria-live="polite">
              <i aria-hidden />
              {t("live")}
              {office.updatedAt ? <small>{t("updated", { ago: ago(office.updatedAt, now) })}</small> : null}
            </span>
            <button type="button" className="btn btn--line btn--sm" onClick={() => void office.reload()} disabled={office.busy}>
              <IconRefresh className={office.busy ? "lo-spin" : undefined} />
              {t("refresh")}
            </button>
          </>
        }
      />

      {office.phase === "error" ? (
        <HrmError text={forbidden ? t("forbidden") : t("error")} onRetry={forbidden ? undefined : () => void office.reload()} retryLabel={t("retry")} />
      ) : office.phase === "loading" ? (
        <HrmLoading rows={3} />
      ) : (
        <>
          <div className="hrm-stats">
            <HrmStat icon={IconUsers} label={t("stats.inOffice")} value={inOffice.length} hint={t("stats.inOfficeHint")} />
            <HrmStat icon={IconBolt} tone="ok" label={t("stats.working")} value={working} hint={t("stats.workingHint")} />
            <HrmStat icon={IconClock} tone="warn" label={t("stats.idle")} value={inOffice.length - working} hint={t("stats.idleHint")} />
            <HrmStat icon={IconHistory} tone="violet" label={t("stats.today")} value={shown.length} hint={t("stats.todayHint")} />
          </div>

          <div className="lo-bar">
            <label className="lo-search">
              <IconSearch aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
            </label>
            <div className="lo-kinds" role="group" aria-label={t("legend")}>
              <button type="button" className={`lo-kind${kinds.length ? "" : " is-on"}`} aria-pressed={!kinds.length} onClick={() => setKinds([])}>
                {t("all")}
              </button>
              {KINDS.map((k) => (
                <button key={k} type="button" className={`lo-kind lo-kind--${k}${kinds.includes(k) ? " is-on" : ""}`} aria-pressed={kinds.includes(k)} onClick={() => toggle(k)}>
                  <span className="lo-kind__av" aria-hidden>
                    <Character id={k} kind={k} pose="head" />
                  </span>
                  {kind(k)}
                  <b>{countOf(k)}</b>
                </button>
              ))}
            </div>
          </div>

          <div className="lo-legend" aria-hidden>
            <span><i className="lo-legend__dot" />{t("status.working")}</span>
            <span><i className="lo-legend__dot lo-legend__dot--idle" />{t("status.idle")}</span>
            <span className="lo-legend__walk"><Character id="legend" kind="lead" pose="walk" />{t("moving")}</span>
          </div>

          <OfficeFloor people={inOffice} selected={picked} onPick={setPicked} />

          <div className="lo-below">
            <FeedPanel people={shown} now={now} onPick={setPicked} />
            <AwayPanel people={shown} onPick={setPicked} />
          </div>

          {pickedPerson ? <PersonPanel key={pickedPerson.id} person={pickedPerson} now={now} onClose={() => setPicked("")} /> : null}
        </>
      )}
    </div>
  );
}
