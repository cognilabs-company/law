"use client";

import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { ListChecksIcon } from "lucide-react";
import { aiId } from "@/lib/ai/ids";
import type { StudioAuditEvent } from "@/lib/services/studio";
import { SxButton } from "../Button";
import { Picker } from "../form/Picker";
import { Switch } from "../form/Switch";
import { ActivityIcon, ArchiveIcon, BadgeCheckIcon, ChevronDownIcon, HistoryIcon, MessageSquareTextIcon, PlusIcon, RadioIcon, RotateCcwIcon, SaveIcon, SendIcon, glyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxTable, type SxColumn } from "../layout/Table";
import { SxToolbar } from "../layout/Toolbar";
import type { SxIcon, SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { Avatar, LiveClock, Squircle, useCtorLook, useMonFormat } from "./bits";
import { actsOf, hm, matches, type MonSession } from "./model";

const AI = "admin.studio.monitoring.list";
const PAGE = 60;

const ACT_ICON: Readonly<Record<string, SxIcon>> = {
  create: PlusIcon,
  submit: SendIcon,
  review: BadgeCheckIcon,
  approve: BadgeCheckIcon,
  publish: RadioIcon,
  archive: ArchiveIcon,
  comment: MessageSquareTextIcon,
  rollback: HistoryIcon,
  restore: RotateCcwIcon,
};

export type SessionsProps = {
  sessions: readonly MonSession[];
  events: readonly StudioAuditEvent[];
  shortCount: number;
  showShort: boolean;
  onShowShort: (v: boolean) => void;
  ctor: string;
  onCtor: (v: string) => void;
  ctorOptions: readonly SxOption[];
  user: string;
  onUser: (v: string) => void;
  userOptions: readonly SxOption[];
  now: number;
  loading: boolean;
  whatOf: (s: MonSession) => string;
  roleOf: (role: string) => string;
  server?: MonServerPage;
};

export type MonServerPage = { has: boolean; loaded: number; total: number; busy: boolean; error: unknown; onMore: () => void };

type Row = { s: MonSession; objId: string; objName: string; acts: { k: string; n: number }[]; saves: number };

export function Sessions(p: SessionsProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const fmt = useMonFormat();
  const look = useCtorLook();
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const unknown = t("monitoring.unknownUser");

  const filtered = p.sessions.filter((s) => {
    if (state === "online" && !s.live) return false;
    if (state === "offline" && s.live) return false;
    return matches(q, [s.a.userName, s.a.role, p.roleOf(s.a.role), s.a.constructorCode, s.a.constructorCode ? labels.ctorName(s.a.constructorCode) : "", s.a.objectName]);
  });
  const rows: Row[] = filtered.slice(0, limit).map((s) => {
    const acts = actsOf(s, p.events);
    const made = s.a.objectId ? undefined : acts.find((e) => e.action === "create" && e.targetId);
    const kinds = new Map<string, number>();
    for (const e of acts) if (e.action !== "save") kinds.set(e.action, (kinds.get(e.action) ?? 0) + 1);
    return {
      s,
      objId: s.a.objectId || made?.targetId || "",
      objName: s.a.objectName || made?.title || "",
      acts: [...kinds].map(([k, n]) => ({ k, n })),
      saves: Math.max(s.a.saveCount, acts.filter((e) => e.action === "save").length),
    };
  });
  const dayTotals = new Map<string, { n: number; sec: number }>();
  for (const s of filtered) {
    const d = dayTotals.get(s.day) ?? { n: 0, sec: 0 };
    dayTotals.set(s.day, { n: d.n + 1, sec: d.sec + s.sec });
  }
  const online = p.sessions.filter((s) => s.live).length;
  const stateOpts: SxOption[] = [
    { value: "", label: t("sx.mon.all") },
    { value: "online", label: `${t("monitoring.online")} (${labels.num(online)})` },
    { value: "offline", label: `${t("monitoring.offline")} (${labels.num(p.sessions.length - online)})` },
  ];
  const did = (k: string) => (t.has(`monitoring.did.${k}`) ? t(`monitoring.did.${k}`) : k === "approve" ? t("monitoring.did.review") : t("monitoring.did.other"));

  const columns: SxColumn<Row>[] = [
    {
      key: "user",
      header: t("monitoring.col.user"),
      width: "22%",
      sortValue: (r) => r.s.a.userName,
      cell: (r) => {
        const name = r.s.a.userName || unknown;
        const role = r.s.a.role && r.s.a.role !== "client" ? p.roleOf(r.s.a.role) : "";
        return (
          <span className="sx-mon-who">
            <Avatar name={name} seed={r.s.a.userId || name} live={r.s.live} size="sm" />
            <span className="sx-mon-who__t">
              <b>{name}</b>
              <small>
                <span className="sx-mon-state" data-live={r.s.live ? "" : undefined} data-stale={r.s.stale ? "" : undefined}>
                  {r.s.live ? t("monitoring.online") : r.s.stale ? t("sx.mon.stale") : t("monitoring.offline")}
                </span>
                {role ? ` · ${role}` : ""}
              </small>
            </span>
          </span>
        );
      },
    },
    {
      key: "where",
      header: t("sx.mon.col.where"),
      primary: true,
      cell: (r) => {
        const l = look(r.s.a.constructorCode);
        const what = [r.s.a.constructorCode ? labels.ctorName(r.s.a.constructorCode) : t("sx.mon.studio"), p.whatOf(r.s)].filter(Boolean).join(" · ");
        return (
          <span className="sx-mon-where">
            <Squircle icon={l.icon} hue={l.hue} size="sm" />
            <span className="sx-mon-where__t">
              <b>{r.objName || t("monitoring.noObject")}</b>
              <small>{what}</small>
            </span>
          </span>
        );
      },
    },
    {
      key: "time",
      header: t("sx.mon.col.time"),
      width: "14%",
      sortValue: (r) => (Number.isFinite(r.s.start) ? r.s.start : null),
      cell: (r) => (
        <span className="sx-mon-span sx-num">
          {hm(r.s.start) || "—"}
          <i aria-hidden="true" />
          <b data-live={r.s.live ? "" : undefined}>{r.s.live ? t("monitoring.now") : hm(r.s.end) || "—"}</b>
        </span>
      ),
    },
    {
      key: "dur",
      header: t("sx.mon.col.duration"),
      width: "12%",
      align: "end",
      sortValue: (r) => r.s.sec,
      cell: (r) => (r.s.live ? <LiveClock session={r.s} /> : <span className="sx-num" data-short={r.s.short ? "" : undefined}>{fmt.dur(r.s.sec)}</span>),
    },
    {
      key: "acts",
      header: t("sx.mon.col.acts"),
      width: "26%",
      hideBelow: "md",
      cell: (r) =>
        r.acts.length || r.saves ? (
          <span className="sx-mon-acts">
            {r.saves ? (
              <span className="sx-mon-act" data-hue="blue">
                {glyph(SaveIcon, { size: 13 })}
                {t("monitoring.did.save")}
                <b className="sx-num">×{labels.num(r.saves)}</b>
              </span>
            ) : null}
            {r.acts.map((a) => (
              <span key={a.k} className="sx-mon-act" data-kind={a.k}>
                {glyph(ACT_ICON[a.k] ?? ActivityIcon, { size: 13 })}
                {did(a.k)}
                {a.n > 1 ? <b className="sx-num">×{labels.num(a.n)}</b> : null}
              </span>
            ))}
          </span>
        ) : (
          <span className="sx-mon-muted">{t("monitoring.did.none")}</span>
        ),
    },
  ];

  const ctorLabel = t("monitoring.filterCtor");
  const userLabel = t("monitoring.filterUser");
  const stateLabel = t("monitoring.filterState");

  return (
    <section className="sx-mon-card sx-mon-sessions" data-ai-id={AI} data-ai-type="section" data-ai-label={t("monitoring.listTitle")}>
      <header className="sx-mon-card__head">
        <span className="sx-mon-sq" data-hue="iris" aria-hidden="true">
          {glyph(ListChecksIcon, { size: 18 })}
        </span>
        <div className="sx-mon-card__titles">
          <h2 className="sx-mon-card__title">{t("monitoring.listTitle")}</h2>
          <p className="sx-mon-card__lead">{t("monitoring.privacy")}</p>
        </div>
      </header>
      <SxToolbar
        aiId={`${AI}.filters`}
        search={{ value: q, onChange: setQ, placeholder: t("monitoring.searchPh"), label: t("monitoring.searchPh"), aiId: "admin.studio.monitoring.search.input" }}
        count={p.loading ? undefined : t("sx.mon.count", { n: filtered.length })}
        active={!!(q || state || p.ctor || p.user)}
        onReset={() => {
          setQ("");
          setState("");
          p.onCtor("");
          p.onUser("");
        }}
      >
        <Picker size="sm" label={ctorLabel} placeholder={ctorLabel} options={p.ctorOptions} value={p.ctor} onChange={p.onCtor} searchable aiId="admin.studio.monitoring.filter.constructor" />
        <Picker size="sm" label={userLabel} placeholder={userLabel} options={p.userOptions} value={p.user} onChange={p.onUser} searchable aiId="admin.studio.monitoring.filter.user" />
        <Picker size="sm" label={stateLabel} placeholder={stateLabel} options={stateOpts} value={state} onChange={setState} aiId="admin.studio.monitoring.filter.state" />
      </SxToolbar>
      <div className="sx-mon-sessions__sub">
        <p className="sx-mon-hidden">{!p.showShort && p.shortCount > 0 && !p.loading ? t("sx.mon.short.hidden", { n: p.shortCount }) : null}</p>
        <span className="sx-mon-short">
          <Switch checked={p.showShort} onChange={p.onShowShort} aria-label={t("sx.mon.short.label")} aiId="admin.studio.monitoring.short" aiLabel={t("sx.mon.short.label")} />
          <span aria-hidden="true">
            {t("sx.mon.short.label")} <b className="sx-num">{labels.num(p.shortCount)}</b>
          </span>
        </span>
      </div>
      <SxTable<Row>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.s.key}
        caption={t("monitoring.listTitle")}
        loading={p.loading}
        skeletonRows={5}
        rowHref={(r) => (r.objId ? `/admin/studio/o/${encodeURIComponent(r.objId)}` : undefined)}
        rowTitle={(r) => `${r.s.a.userName || unknown} · ${r.objName || t("monitoring.noObject")}`}
        rowTone={(r) => (r.s.short ? "muted" : undefined)}
        groupBy={(r) => {
          const d = dayTotals.get(r.s.day) ?? { n: 0, sec: 0 };
          return { key: r.s.day || "none", title: fmt.dayName(r.s.day, p.now), meta: t("monitoring.dayMeta", { n: labels.num(d.n), time: fmt.dur(d.sec) }) };
        }}
        empty={p.sessions.length ? <SxEmpty compact icon={ActivityIcon} title={t("monitoring.noMatch")} text={t("monitoring.noMatchText")} /> : <SxEmpty compact icon={ActivityIcon} title={t("sx.mon.emptyTitle")} text={t("sx.mon.emptyText")} />}
        aiId={`${AI}.table`}
      />
      {filtered.length > rows.length ? (
        <div className="sx-mon-sessions__more">
          <SxButton variant="secondary" size="sm" icon={ChevronDownIcon} onClick={() => setLimit((v) => v + PAGE)} aiId={aiId(AI, "more")}>
            {t("sx.mon.more", { n: filtered.length - rows.length })}
          </SxButton>
        </div>
      ) : p.server?.has && !p.loading ? (
        <div className="sx-mon-sessions__more">
          {p.server.error && !p.server.busy ? (
            <p className="sx-mon-sessions__err" role="alert">
              {t("sx.ap3.more.fail")}
            </p>
          ) : null}
          <SxButton variant="secondary" size="sm" icon={ChevronDownIcon} busy={p.server.busy} onClick={p.server.onMore} aiId={aiId(AI, "server-more")}>
            {t("sx.mon.page.more", { n: Math.max(0, p.server.total - p.server.loaded) })}
          </SxButton>
        </div>
      ) : null}
    </section>
  );
}
