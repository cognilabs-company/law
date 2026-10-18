"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { MoonStarIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { SxCount } from "../shared/Count";
import { SxProgress } from "../shared/Progress";
import { ClockIcon, RadioTowerIcon, TrophyIcon, glyph } from "../icons";
import { useStudioLabels } from "../useStudioLabels";
import { enterStyle } from "../hooks";
import { Avatar, LiveClock, Squircle, useCtorLook, useMonFormat } from "./bits";
import { hm, type MonPerson, type MonSession } from "./model";

const AI = "admin.studio.monitoring.now";
const MAX_LIVE = 5;

export type NowCardProps = {
  open: boolean;
  live: readonly MonSession[];
  lastOff: MonSession | null;
  recent: readonly MonSession[];
  people: readonly MonPerson[];
  now: number;
  loading: boolean;
  whatOf: (s: MonSession) => string;
};

export function NowCard({ open, live, lastOff, recent, people, now, loading, whatOf }: NowCardProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const fmt = useMonFormat();
  const look = useCtorLook();
  const unknown = t("monitoring.unknownUser");
  const liveUsers = new Set(live.map((s) => s.a.userId || s.a.userName)).size;

  if (!open) {
    const top = people.filter((p) => p.sec > 0).slice(0, 4);
    const max = top.reduce((m, p) => Math.max(m, p.sec), 0) || 1;
    return (
      <section className="sx-mon-now" data-mode="closed" data-ai-id={AI} data-ai-type="section" data-ai-label={t("sx.mon.now.topTitle")}>
        <header className="sx-mon-now__head">
          <span className="sx-mon-now__badge" data-off="">
            {glyph(TrophyIcon, { size: 16 })}
          </span>
          <div className="sx-mon-now__titles">
            <h2 className="sx-mon-now__title">{t("sx.mon.now.topTitle")}</h2>
            <p className="sx-mon-now__lead">{t("sx.mon.now.topLead")}</p>
          </div>
        </header>
        {loading ? (
          <NowSkeleton />
        ) : top.length ? (
          <ol className="sx-mon-top">
            {top.map((p, i) => (
              <li key={p.id} className="sx-mon-top__i sx-enter" style={enterStyle(i)}>
                <Avatar name={p.name || unknown} seed={p.id} />
                <div className="sx-mon-top__body">
                  <div className="sx-mon-top__row">
                    <b className="sx-mon-top__name">{p.name || unknown}</b>
                    <span className="sx-mon-top__val sx-num">{fmt.dur(p.sec)}</span>
                  </div>
                  <SxProgress value={(p.sec / max) * 100} label={`${p.name || unknown}: ${fmt.dur(p.sec)}`} />
                  <small className="sx-mon-top__meta">{t("sx.mon.now.topMeta", { n: labels.num(p.sessions), s: labels.num(p.saves) })}</small>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="sx-mon-now__empty">
            {glyph(MoonStarIcon, { size: 22 })}
            <p>{t("sx.mon.now.topNone")}</p>
          </div>
        )}
      </section>
    );
  }

  const shown = live.slice(0, MAX_LIVE);
  return (
    <section className="sx-mon-now" data-mode={live.length ? "live" : "idle"} data-ai-id={AI} data-ai-type="section" data-ai-label={t("monitoring.kpi.online")}>
      <header className="sx-mon-now__head">
        <span className="sx-mon-now__badge" data-off={live.length ? undefined : ""}>
          {glyph(RadioTowerIcon, { size: 16 })}
        </span>
        <div className="sx-mon-now__titles">
          <h2 className="sx-mon-now__title">{t("monitoring.kpi.online")}</h2>
          <p className="sx-mon-now__lead">{t("monitoring.kpi.onlineHint")}</p>
        </div>
        <span className="sx-mon-now__big" aria-label={t("sx.mon.now.count", { n: liveUsers })}>
          <SxCount value={loading ? null : liveUsers} />
        </span>
      </header>
      {loading ? (
        <NowSkeleton />
      ) : live.length ? (
        <ul className="sx-mon-live">
          {shown.map((s, i) => {
            const name = s.a.userName || unknown;
            const obj = s.a.objectName || t("monitoring.noObject");
            const l = look(s.a.constructorCode);
            const what = [s.a.constructorCode ? labels.ctorName(s.a.constructorCode) : "", whatOf(s)].filter(Boolean).join(" · ");
            return (
              <li key={s.key} className="sx-mon-live__i sx-enter" style={enterStyle(i)} data-ai-id={aiId(AI, "row", s.key)} data-ai-type="card" data-ai-label={`${name} · ${obj}`}>
                <Avatar name={name} seed={s.a.userId || name} live size="lg" />
                <div className="sx-mon-live__body">
                  <div className="sx-mon-live__who">
                    <b>{name}</b>
                    <small>{t("monitoring.since", { t: hm(s.start) || "—" })}</small>
                  </div>
                  <div className="sx-mon-live__where">
                    <Squircle icon={l.icon} hue={l.hue} size="sm" />
                    <span className="sx-mon-live__obj">
                      {s.a.objectId ? (
                        <Link href={`/admin/studio/o/${encodeURIComponent(s.a.objectId)}`} className="sx-mon-link" data-ai-id={aiId(AI, "row", s.key, "open")} data-ai-type="link" data-ai-label={obj}>
                          {obj}
                        </Link>
                      ) : (
                        <span>{obj}</span>
                      )}
                      {what ? <small>{what}</small> : null}
                    </span>
                  </div>
                </div>
                <span className="sx-mon-live__timer">
                  {glyph(ClockIcon, { size: 14 })}
                  <LiveClock session={s} />
                </span>
              </li>
            );
          })}
          {live.length > shown.length ? <li className="sx-mon-live__more">{t("sx.mon.now.more", { n: live.length - shown.length })}</li> : null}
        </ul>
      ) : (
        <div className="sx-mon-now__empty">
          <span className="sx-mon-now__moon">{glyph(MoonStarIcon, { size: 22 })}</span>
          <div>
            <p className="sx-mon-now__none">{t("monitoring.liveNone")}</p>
            {lastOff ? (
              <p className="sx-mon-now__last">
                {t("monitoring.liveLast", {
                  name: lastOff.a.userName || unknown,
                  ago: fmt.ago(lastOff.end, now) || "—",
                  where: lastOff.a.constructorCode ? labels.ctorName(lastOff.a.constructorCode) : t("sx.mon.studio"),
                })}
              </p>
            ) : null}
          </div>
        </div>
      )}
      {!loading && recent.length ? (
        <div className="sx-mon-recent">
          <h3 className="sx-mon-recent__h">{t("sx.mon.now.recent")}</h3>
          <ul className="sx-mon-recent__list">
            {recent.map((s) => {
              const name = s.a.userName || unknown;
              return (
                <li key={s.key} className="sx-mon-recent__i">
                  <Avatar name={name} seed={s.a.userId || name} size="sm" />
                  <span className="sx-mon-recent__t">
                    <b>{name}</b>
                    <small>{[s.a.constructorCode ? labels.ctorName(s.a.constructorCode) : t("sx.mon.studio"), fmt.dur(s.sec)].join(" · ")}</small>
                  </span>
                  <time className="sx-num" dateTime={new Date(s.end).toISOString()} title={hm(s.end)}>
                    {fmt.ago(s.end, now)}
                  </time>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function NowSkeleton(): ReactElement {
  return (
    <div className="sx-mon-now__sk" aria-hidden="true">
      <span className="sx-sk" />
      <span className="sx-sk" />
      <span className="sx-sk" />
    </div>
  );
}
