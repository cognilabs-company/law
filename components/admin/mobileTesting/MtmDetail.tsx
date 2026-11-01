"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import DatePicker from "@/components/DatePicker";
import ListPager, { usePaged } from "@/components/ui/ListPager";
import { fmtDate, fmtNum } from "@/lib/date";
import { isPrimaryOnly } from "@/lib/services/superadvokat";
import { MTM_MAX_DAYS, getMtmInstallation, rangeProblem, tashToday, type MtmDetail as Detail, type MtmSession } from "@/lib/services/mobileTesting";
import { IconChevronLeft, IconSmartphone, IconUser } from "@/components/icons";
import { Badge, LiveBar, MtmEmpty, MtmError, MtmForbidden, MtmFrame, MtmSkeleton, StaleBadge, TashTime, TzNote, sessionIcon, sessionTone, useLabels, useMinutes, useMtmLive, useMtmLoad } from "./MtmBits";
import UsageChart from "./UsageChart";

const LIVE = ["mobile_testing.installation_registered", "mobile_testing.usage_updated", "mobile_testing.session_stale"] as const;

// One test phone (contract §4): device card, current tester card, daily
// chart and table, and the session timeline. With no range picked the
// backend's default (the latest 30 days) is read and its dates shown.
export default function MtmDetail({ installationId, backDate }: { installationId: string; backDate: string }) {
  const td = useTranslations("admin.mtm.detail");
  const locale = useLocale();
  const [range, setRange] = useState({ from: "", to: "" });
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const [problem, setProblem] = useState("");

  const res = useMtmLoad<Detail>((s) => getMtmInstallation(installationId, range, s), `${installationId}:${range.from}:${range.to}`);
  const online = useMtmLive(LIVE, () => res.reload(true), (e) => {
    const id = e.installation_id ?? (e.data && typeof e.data === "object" ? (e.data as Record<string, unknown>).installation_id : undefined);
    return typeof id !== "string" || !id || id === installationId;
  });

  const back = `/admin/mobile-testing${/^\d{4}-\d{2}-\d{2}$/.test(backDate) ? `?date=${backDate}` : ""}`;
  const d = res.data;
  const from = draft?.from ?? (range.from || d?.dateFrom || "");
  const to = draft?.to ?? (range.to || d?.dateTo || "");
  const today = tashToday();

  const apply = () => {
    const p = rangeProblem(from, to);
    if (p) {
      setProblem(td(`range.${p}`, { max: MTM_MAX_DAYS }));
      return;
    }
    setProblem("");
    setDraft(null);
    setRange({ from, to });
  };
  const setOne = (k: "from" | "to", v: string) => {
    setProblem("");
    setDraft({ from, to, [k]: v });
  };
  const reset = () => {
    setProblem("");
    setDraft(null);
    setRange({ from: "", to: "" });
  };

  if (res.status === "error" && isPrimaryOnly(res.error)) {
    return (
      <MtmFrame>
        <MtmForbidden />
      </MtmFrame>
    );
  }

  return (
    <MtmFrame lead={td("lead")}>
      <div className="mtm-bar">
        <Link href={back} className="btn btn--line btn--sm mtm-back">
          <IconChevronLeft aria-hidden="true" />
          {td("back")}
        </Link>
        <LiveBar online={online} at={res.at} refreshing={res.refreshing} failed={res.refreshFailed} onRefresh={() => res.reload(true)} />
      </div>

      <section className="mtm-panel mtm-range" aria-label={td("range.label")}>
        <div className="mtm-range__f">
          <span className="mtm-field__l">{td("range.from")}</span>
          <DatePicker value={from} onChange={(v) => setOne("from", v)} placeholder={td("range.from")} ariaLabel={td("range.from")} max={to || today || undefined} />
        </div>
        <div className="mtm-range__f">
          <span className="mtm-field__l">{td("range.to")}</span>
          <DatePicker value={to} onChange={(v) => setOne("to", v)} placeholder={td("range.to")} ariaLabel={td("range.to")} min={from || undefined} max={today || undefined} />
        </div>
        <div className="mtm-range__a">
          <button type="button" className="btn btn--pri btn--sm" onClick={apply} disabled={!draft}>
            {td("range.apply")}
          </button>
          {range.from || draft ? (
            <button type="button" className="btn btn--line btn--sm" onClick={reset}>
              {td("range.reset")}
            </button>
          ) : null}
        </div>
        <p className={`mtm-range__note${problem ? " mtm-range__note--bad" : ""}`} role={problem ? "alert" : undefined}>
          {problem || td("range.hint", { max: MTM_MAX_DAYS })}
        </p>
      </section>

      {res.status === "loading" ? (
        <MtmSkeleton rows={6} />
      ) : res.status === "error" ? (
        <MtmError error={res.error} onRetry={() => res.reload(false)} />
      ) : d ? (
        <Body d={d} />
      ) : null}
      <span className="sr-only" aria-live="polite">
        {d ? td("periodLive", { from: fmtDate(d.dateFrom, locale), to: fmtDate(d.dateTo, locale) }) : ""}
      </span>
    </MtmFrame>
  );
}

function Body({ d }: { d: Detail }) {
  const t = useTranslations("admin.mtm");
  const td = useTranslations("admin.mtm.detail");
  const locale = useLocale();
  const L = useLabels();
  const minutes = useMinutes();
  const it = d.installation;
  const row = (label: string, value: ReactNode) => (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <>
      <div className="mtm-two">
        <section className="mtm-panel mtm-info" aria-labelledby="mtm-dev">
          <header className="mtm-info__h">
            <span className="mtm-info__ic" aria-hidden="true">
              <IconSmartphone />
            </span>
            <div>
              <h2 id="mtm-dev">{L.device(it.manufacturer, it.model)}</h2>
              <p>
                {L.platform(it.platform)}
                {it.osVersion ? ` ${it.osVersion}` : ""}
              </p>
            </div>
            <Badge tone={it.status === "active" ? "ok" : "off"}>{L.installStatus(it.status)}</Badge>
          </header>
          <dl className="mtm-dl">
            {row(td("appVersion"), it.appVersion ? (it.versionCode !== null ? td("appWithCode", { v: it.appVersion, code: it.versionCode }) : it.appVersion) : t("none"))}
            {row(t("col.track"), L.track(it.track))}
            {row(td("language"), L.language(it.locale))}
            {row(td("build"), it.isTest ? td("testBuild") : td("notTestBuild"))}
            {row(td("firstSeen"), <TashTime iso={it.firstSeenAt} />)}
            {row(td("lastSeen"), <TashTime iso={it.lastSeenAt} />)}
          </dl>
        </section>
        <section className="mtm-panel mtm-info" aria-labelledby="mtm-tester">
          <header className="mtm-info__h">
            <span className="mtm-info__ic mtm-info__ic--p" aria-hidden="true">
              <IconUser />
            </span>
            <div>
              <h2 id="mtm-tester">{it.tester?.name || t("noTester")}</h2>
              <p>{td("currentTester")}</p>
            </div>
          </header>
          {it.tester ? (
            <dl className="mtm-dl">
              {row(td("lexgoId"), it.tester.lexgoId || t("none"))}
              {row(td("phone"), it.tester.phone || t("none"))}
            </dl>
          ) : (
            <p className="mtm-muted">{td("noTesterText")}</p>
          )}
        </section>
      </div>

      <section className="mtm-panel" aria-labelledby="mtm-chart-h">
        <div className="mtm-panel__h">
          <div>
            <h2 id="mtm-chart-h">{td("chartTitle")}</h2>
            <p>{td("period", { from: fmtDate(d.dateFrom, locale), to: fmtDate(d.dateTo, locale) })}</p>
          </div>
          <TzNote />
        </div>
        {d.daily.length ? (
          <UsageChart daily={d.daily} from={d.dateFrom} to={d.dateTo} />
        ) : (
          <MtmEmpty icon={<IconSmartphone aria-hidden="true" />} title={td("noDaily")} text={td("noDailyText")} />
        )}
      </section>

      {d.daily.length ? (
        <section className="mtm-panel" aria-labelledby="mtm-daily-h">
          <div className="mtm-panel__h">
            <h2 id="mtm-daily-h">{td("dailyTitle")}</h2>
            <TzNote />
          </div>
          <div className="mtm-tablewrap mtm-tablewrap--always">
            <table className="mtm-table mtm-table--daily" data-testid="mtm-daily">
              <thead>
                <tr>
                  <th scope="col">{td("day")}</th>
                  <th scope="col">{t("col.minutes")}</th>
                  <th scope="col">{t("col.sessions")}</th>
                  <th scope="col">{t("col.first")}</th>
                  <th scope="col">{t("col.last")}</th>
                </tr>
              </thead>
              <tbody>
                {[...d.daily].reverse().map((x) => (
                  <tr key={x.date}>
                    <th scope="row">{fmtDate(x.date, locale)}</th>
                    <td>{minutes(x.foregroundMinutes)}</td>
                    <td className="mtm-num">{fmtNum(x.sessions, locale)}</td>
                    <td>
                      <TashTime iso={x.firstActivityAt} date={false} />
                    </td>
                    <td>
                      <TashTime iso={x.lastActivityAt} date={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <Timeline sessions={d.sessions} />
    </>
  );
}

const SESSION_CAP = 500;

function Timeline({ sessions }: { sessions: MtmSession[] }) {
  const t = useTranslations("admin.mtm");
  const td = useTranslations("admin.mtm.detail");
  const minutes = useMinutes();
  const paged = usePaged(sessions, 30, sessions);
  return (
    <section className="mtm-panel" aria-labelledby="mtm-tl-h">
      <div className="mtm-panel__h">
        <div>
          <h2 id="mtm-tl-h">{td("timeline")}</h2>
          <p>{sessions.length >= SESSION_CAP ? td("timelineCap", { n: SESSION_CAP }) : td("timelineCount", { n: sessions.length })}</p>
        </div>
        <TzNote />
      </div>
      {sessions.length ? (
        <>
          <ol className="mtm-tl" data-testid="mtm-timeline">
            {paged.visible.map((s, i) => (
              <li key={s.id || i} className="mtm-tl__i" data-tone={sessionTone(s.status)}>
                <span className="mtm-tl__dot" aria-hidden="true">
                  {sessionIcon(s.status)}
                </span>
                <div className="mtm-tl__body">
                  <div className="mtm-tl__top">
                    {s.status === "stale" ? (
                      <StaleBadge />
                    ) : (
                      <Badge tone={sessionTone(s.status)}>{t.has(`sessionStatus.${s.status}`) ? t(`sessionStatus.${s.status}`) : t("sessionStatus.other")}</Badge>
                    )}
                    <span className="mtm-tl__when">
                      <TashTime iso={s.startedAt} />
                      <span aria-hidden="true"> → </span>
                      {s.endedAt ? <TashTime iso={s.endedAt} date={false} /> : <span className="mtm-muted">{s.status === "active" ? td("stillOpen") : t("none")}</span>}
                    </span>
                  </div>
                  <div className="mtm-tl__meta">
                    {s.foregroundMinutes !== null ? <span>{td("foreground", { v: minutes(s.foregroundMinutes) })}</span> : s.foregroundSeconds !== null ? <span>{td("foreground", { v: minutes(s.foregroundSeconds / 60) })}</span> : null}
                    {s.lastHeartbeatAt ? (
                      <span>
                        {td("heartbeat")} <TashTime iso={s.lastHeartbeatAt} date={false} />
                      </span>
                    ) : null}
                    {s.appVersion ? <span>{t("appValue", { v: s.appVersion })}</span> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <ListPager {...paged.bind} />
        </>
      ) : (
        <MtmEmpty icon={<IconSmartphone aria-hidden="true" />} title={td("noSessions")} text={td("noSessionsText")} />
      )}
    </section>
  );
}
