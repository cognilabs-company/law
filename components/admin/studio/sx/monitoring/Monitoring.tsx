"use client";

import "../sx-tones.css";
import "./sx-monitoring.css";
import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { CalendarRangeIcon, UserRoundIcon } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { aiId } from "@/lib/ai/ids";
import { studioErrorOf, studioCtorRank, useStudioAccess } from "@/lib/services/studio";
import { SxButton } from "../Button";
import { DateField } from "../form/DateField";
import { ActivityIcon, GlobeIcon, HistoryIcon, RefreshCwIcon, XIcon, glyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxPage, gateOf } from "../layout/Page";
import { useNow } from "../live";
import { SxSegmented } from "../shared/Segmented";
import type { SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { ActivityChart } from "./ActivityChart";
import { useCtorLook } from "./bits";
import { Feed } from "./Feed";
import { MonKpis, type MonKpiData } from "./Kpis";
import { Lanes } from "./Lanes";
import { MON_PERIODS, axisOf, bucketsOf, inRange, overlaps, peopleOf, rangeIsOpen, sessionOf, sortSessions, type MonPeriod, type MonSession } from "./model";
import { NowCard } from "./NowCard";
import { Sessions } from "./Sessions";
import { useMonitoring } from "./useMonitoring";

const AI = "admin.studio.monitoring";

export default function StudioMonitoringPage(): ReactElement {
  const t = useTranslations("studio");
  const acc = useStudioAccess();
  const enabled = gateOf(acc, "admin") === "open";
  const [period, setPeriod] = useState<MonPeriod>("today");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const m = useMonitoring(period, dateFrom, dateTo, enabled);
  const now = useNow(30_000);
  const open = now ? rangeIsOpen(m.range, now) : period !== "yesterday";
  const loading = m.phase === "loading" || !m.settled;

  const status = (
    <span className="sx-mon-pulse" data-on={open && !loading ? "" : undefined} role="status">
      {open ? <i aria-hidden="true" /> : glyph(HistoryIcon, { size: 14 })}
      {open ? t("sx.mon.live") : t("sx.mon.closed")}
    </span>
  );
  const actions = (
    <IconButton
      className="sx-ibtn sx-mon-refresh"
      variant="line"
      label={t("monitoring.refresh")}
      icon={glyph(RefreshCwIcon, { size: 18, className: m.busy ? "sx-mon-spin" : undefined })}
      onClick={() => void m.refresh()}
      busy={m.busy}
      aiId={`${AI}.refresh`}
    />
  );

  return (
    <SxPage title={t("sx.nav.monitoring")} lead={t("screens.monitoring.lead")} icon={glyph(ActivityIcon, { size: 20 })} section="monitoring" need="admin" status={status} actions={actions} aiId={AI}>
      <Body m={m} now={now} open={open} loading={loading} period={period} dateFrom={dateFrom} dateTo={dateTo} setPeriod={setPeriod} setDateFrom={setDateFrom} setDateTo={setDateTo} />
    </SxPage>
  );
}

type BodyProps = {
  m: ReturnType<typeof useMonitoring>;
  now: number;
  open: boolean;
  loading: boolean;
  period: MonPeriod;
  dateFrom: string;
  dateTo: string;
  setPeriod: (p: MonPeriod) => void;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
};

function Body({ m, now, open, loading, period, dateFrom, dateTo, setPeriod, setDateFrom, setDateTo }: BodyProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const look = useCtorLook();
  const [user, setUser] = useState("");
  const [ctor, setCtor] = useState("");
  const [showShort, setShowShort] = useState(false);
  const unknown = t("monitoring.unknownUser");

  const screenName = (v: string) => {
    const k = v.trim().toLowerCase();
    if (!k) return "";
    if (/-editor$|^editor$/.test(k)) return t("monitoring.screen.editor");
    return t.has(`monitoring.screen.${k}`) ? t(`monitoring.screen.${k}`) : "";
  };
  const actionName = (v: string) => {
    const k = v.trim().toLowerCase();
    if (!k || /-editor$/.test(k)) return "";
    return t.has(`monitoring.action.${k}`) ? t(`monitoring.action.${k}`) : "";
  };
  const whatOf = (s: MonSession) => [screenName(s.a.screen), actionName(s.a.lastAction)].filter((x, i, all) => x && all.indexOf(x) === i).join(" · ");
  const roleOf = (r: string) => labels.role(r);
  const uidOf = (s: MonSession) => s.a.userId || s.a.userName;

  const all = m.rows.map((r) => sessionOf(r, now)).filter((s) => overlaps(s, m.range));
  const ctorScoped = ctor ? all.filter((s) => s.a.constructorCode === ctor) : all;
  const scoped = user ? ctorScoped.filter((s) => uidOf(s) === user) : ctorScoped;
  const visible = showShort ? scoped : scoped.filter((s) => !s.short);
  const shortCount = scoped.filter((s) => s.short).length;

  const objCtor = new Map(all.filter((s) => s.a.objectId).map((s) => [s.a.objectId, s.a.constructorCode]));
  const evRange = m.events ? m.events.filter((e) => inRange(e.at, m.range)) : null;
  const evScoped = evRange ? evRange.filter((e) => (!user || e.userId === user) && (!ctor || objCtor.get(e.targetId) === ctor)) : null;
  const plain = !user && !ctor;

  const kpi: MonKpiData = {
    users: new Set(scoped.map(uidOf)).size,
    online: new Set(scoped.filter((s) => s.live).map(uidOf)).size,
    sessions: scoped.filter((s) => !s.short).length,
    short: shortCount,
    sec: scoped.reduce((n, s) => n + s.sec, 0),
    saves: scoped.reduce((n, s) => n + s.a.saveCount, 0),
    savedObjects: new Set(scoped.filter((s) => s.a.saveCount > 0 && s.a.objectId).map((s) => s.a.objectId)).size,
    objects: evScoped ? evScoped.filter((e) => e.action === "create").length : plain && m.summary ? m.summary.objectsCreated : null,
    submitted: evScoped ? evScoped.filter((e) => e.action === "submit").length : plain && m.summary ? m.summary.submittedForApproval : null,
  };

  const lanePeople = peopleOf(ctorScoped, m.users);
  const topPeople = peopleOf(scoped, m.users);
  const axis = axisOf(m.range, ctorScoped, now);
  const buckets = axis ? bucketsOf(axis, scoped, now) : [];
  const live = sortSessions(scoped.filter((s) => s.live));
  const lastOff = all.filter((s) => !s.live && Number.isFinite(s.end)).reduce<MonSession | null>((best, s) => (!best || s.end > best.end ? s : best), null);
  const recent = scoped.filter((s) => !s.live && !s.short && Number.isFinite(s.end)).sort((x, y) => y.end - x.end).slice(0, 3);
  const tableRows = [...visible].sort((x, y) => y.day.localeCompare(x.day) || Number(y.live) - Number(x.live) || (Number.isFinite(y.start) ? y.start : 0) - (Number.isFinite(x.start) ? x.start : 0));

  const names = new Map<string, string>();
  for (const u of m.users) if (u.id && u.name) names.set(u.id, u.name);
  for (const s of all) if (s.a.userId && s.a.userName && !names.has(s.a.userId)) names.set(s.a.userId, s.a.userName);
  const nameOf = (id: string) => names.get(id) || unknown;

  const codes = [...new Set(all.map((s) => s.a.constructorCode).filter(Boolean))].sort((a, b) => studioCtorRank(a) - studioCtorRank(b) || a.localeCompare(b));
  if (ctor && !codes.includes(ctor)) codes.push(ctor);
  const ctorOptions: SxOption[] = [
    { value: "", label: t("sx.mon.all") },
    ...codes.map((c) => ({ value: c, label: `${labels.ctorName(c)} (${labels.num(all.filter((s) => s.a.constructorCode === c).length)})`, icon: look(c).icon })),
  ];
  const peopleAll = peopleOf(all, m.users);
  const userOptions: SxOption[] = [
    { value: "", label: t("sx.mon.all") },
    ...[...peopleAll].sort((a, b) => (a.name || unknown).localeCompare(b.name || unknown)).map((p) => ({ value: p.id, label: `${p.name || unknown} (${labels.num(p.list.length)})` })),
  ];
  if (user && !peopleAll.some((p) => p.id === user)) userOptions.push({ value: user, label: nameOf(user) });

  const periodItems = MON_PERIODS.map((p) => ({ value: p, label: p === "all" ? t("sx.mon.period.all") : t(`monitoring.period.${p}`), aiId: aiId(AI, "period", p) }));
  const periodBar = (
    <div className="sx-mon-period" data-ai-id={`${AI}.period`} data-ai-type="group" data-ai-label={t("monitoring.periodTitle")}>
      <SxSegmented<MonPeriod>
        items={periodItems}
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setDateFrom("");
          setDateTo("");
        }}
        label={t("monitoring.periodTitle")}
        className="sx-mon-period__seg"
      />
      <div className="sx-mon-period__range" data-on={period === "custom" ? "" : undefined}>
        <span className="sx-mon-period__ricon" aria-hidden="true">
          {glyph(CalendarRangeIcon, { size: 16 })}
        </span>
        <DateField
          value={dateFrom}
          onChange={(v) => {
            const next = v ?? "";
            setDateFrom(next);
            setPeriod(next || dateTo ? "custom" : "today");
          }}
          label={t("monitoring.dateFrom")}
          max={dateTo || undefined}
          aiId={`${AI}.date.from`}
        />
        <span className="sx-mon-period__dash" aria-hidden="true">
          –
        </span>
        <DateField
          value={dateTo}
          onChange={(v) => {
            const next = v ?? "";
            setDateTo(next);
            setPeriod(next || dateFrom ? "custom" : "today");
          }}
          label={t("monitoring.dateTo")}
          min={dateFrom || undefined}
          aiId={`${AI}.date.to`}
        />
      </div>
      <span className="sx-mon-period__tz">
        {glyph(GlobeIcon, { size: 14 })}
        {t("sx.mon.tz")}
      </span>
    </div>
  );

  const focus =
    user || ctor ? (
      <div className="sx-mon-focus" role="group" aria-label={t("sx.mon.focus.label")}>
        <span className="sx-mon-focus__h">{t("sx.mon.focus.label")}</span>
        {user ? (
          <button type="button" className="sx-mon-focus__chip" onClick={() => setUser("")} aria-label={t("sx.mon.focus.remove", { name: nameOf(user) })} data-ai-id={`${AI}.focus.user`} data-ai-type="button" data-ai-label={nameOf(user)}>
            {glyph(UserRoundIcon, { size: 14 })}
            <span>{nameOf(user)}</span>
            {glyph(XIcon, { size: 14 })}
          </button>
        ) : null}
        {ctor ? (
          <button type="button" className="sx-mon-focus__chip" onClick={() => setCtor("")} aria-label={t("sx.mon.focus.remove", { name: labels.ctorName(ctor) })} data-ai-id={`${AI}.focus.ctor`} data-ai-type="button" data-ai-label={labels.ctorName(ctor)}>
            {glyph(look(ctor).icon, { size: 14 })}
            <span>{labels.ctorName(ctor)}</span>
            {glyph(XIcon, { size: 14 })}
          </button>
        ) : null}
        <SxButton
          variant="ghost"
          size="sm"
          onClick={() => {
            setUser("");
            setCtor("");
          }}
          aiId={`${AI}.focus.clear`}
        >
          {t("sx.mon.focus.clear")}
        </SxButton>
      </div>
    ) : null;

  if (m.phase === "error" && m.settled) {
    const kind = studioErrorOf(m.error).kind;
    const retry = (
      <SxButton variant="secondary" size="sm" icon={RefreshCwIcon} busy={m.busy} onClick={() => void m.refresh()} aiId={`${AI}.retry`}>
        {t("sx.ui.retry")}
      </SxButton>
    );
    return (
      <div className="sx-mon">
        {periodBar}
        {kind === "missing" || kind === "not_found" ? (
          <SxEmpty icon={ActivityIcon} title={t("screens.monitoring.title")} text={t("monitoring.missing")} action={retry} />
        ) : (
          <SxNote tone="error" title={t("sx.ui.errorTitle")} action={retry}>
            {t("sx.ui.loadFail")}
          </SxNote>
        )}
      </div>
    );
  }

  const key = `${period}|${dateFrom}|${dateTo}|${user}|${ctor}`;
  return (
    <div className="sx-mon" aria-busy={loading || undefined}>
      {periodBar}
      {focus}
      {m.error && m.phase === "ready" ? (
        <SxNote tone="warn" title={t("sx.mon.staleTitle")}>
          {t("sx.ui.loadFail")}
        </SxNote>
      ) : null}
      <div className="sx-mon-bento">
        <NowCard open={open} live={live} lastOff={lastOff} recent={recent} people={topPeople} now={now} loading={loading} whatOf={whatOf} />
        <MonKpis data={kpi} loading={loading} />
      </div>
      <div className="sx-mon-split">
        <div className="sx-mon-split__main">
          <ActivityChart axis={axis} buckets={buckets} loading={loading} />
          <Lanes axis={axis} people={lanePeople} selected={user} onSelect={setUser} showShort={showShort} now={now} loading={loading} />
        </div>
        <aside className="sx-mon-split__side">
          <Feed key={key} events={evScoped} nameOf={nameOf} now={now} loading={loading} />
        </aside>
      </div>
      <Sessions
        key={`${period}|${dateFrom}|${dateTo}`}
        sessions={tableRows}
        events={evRange ?? []}
        shortCount={shortCount}
        showShort={showShort}
        onShowShort={setShowShort}
        ctor={ctor}
        onCtor={setCtor}
        ctorOptions={ctorOptions}
        user={user}
        onUser={setUser}
        userOptions={userOptions}
        now={now}
        loading={loading}
        whatOf={whatOf}
        roleOf={roleOf}
      />
    </div>
  );
}
