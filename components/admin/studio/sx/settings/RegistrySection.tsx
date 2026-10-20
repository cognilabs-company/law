"use client";

import "../sx-tones.css";
import "./sx-settings.css";
import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { logApiError } from "@/lib/http";
import { syncStudioConstructors, useStudioRegistry, type StudioConstructor } from "@/lib/services/studio";
import { toast } from "@/lib/toast";
import { SxButton } from "../Button";
import { isSlugPath } from "../editor/slug";
import { SxDialog } from "../editor/SxDialog";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { Picker } from "../form/Picker";
import { CircleCheckIcon, CircleDashedIcon, FileTextIcon, GROUP_ICON, LayersIcon, RefreshCwIcon, RocketIcon, ShieldCheckIcon, ctorIcon, glyph, groupIcon } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxTable, type SxColumn, type SxRowGroup } from "../layout/Table";
import { SxToolbar } from "../layout/Toolbar";
import { SxCount } from "../shared/Count";
import { SxRing } from "../shared/Ring";
import { groupHue } from "../tones";
import type { SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { SET_AI, TAB_HUE, TAB_ICON, byCtorRank, groupKeyOf, matchesTerms } from "./model";
import { SectionHead, Squircle } from "./parts";

const AI = `${SET_AI}.registry`;
const SHOW_REQ = 3;

type Row = { ctor: StudioConstructor; gk: string; gOrder: number; name: string; target: string };

export function RegistrySection(): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const errText = useEditorErrorText();
  const reg = useStudioRegistry();
  const [ask, setAsk] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [q, setQ] = useState("");
  const [groupF, setGroupF] = useState("");
  const [apprF, setApprF] = useState("");

  async function sync() {
    setSyncing(true);
    try {
      const res = await syncStudioConstructors();
      setAsk(false);
      toast(res.count ? t("settings.registry.synced", { n: labels.num(res.count) }) : t("settings.registry.syncedNoCount"), { tone: "ok" });
    } catch (e) {
      logApiError("studio.registry.sync", e);
      setAsk(false);
      toast(errText(e).text || t("settings.registry.syncFail"), { tone: "err" });
    } finally {
      setSyncing(false);
    }
  }

  const targetOf = (key: string) => {
    if (!key) return "";
    if (t.has(`settings.registry.target.${key}`)) return t(`settings.registry.target.${key}`);
    if (t.has(`sx.set.target.${key}`)) return t(`sx.set.target.${key}`);
    return labels.option(key);
  };
  const groupOrder = new Map(reg.groups.map((g) => [g.key, g.order]));
  const rows: Row[] = reg.items
    .map((ctor) => {
      const gk = groupKeyOf(ctor.code, reg.groups, reg.items);
      return { ctor, gk, gOrder: groupOrder.get(gk) ?? 999, name: labels.ctorName(ctor.code, ctor.title), target: targetOf(ctor.runtimeTarget) };
    })
    .sort((a, b) => a.gOrder - b.gOrder || byCtorRank(a.ctor.code, b.ctor.code));

  const total = rows.length;
  const needN = rows.filter((r) => r.ctor.approvalRequired).length;
  const freeN = total - needN;
  const doneN = rows.filter((r) => r.ctor.completed).length;
  const recN = rows.reduce((s, r) => s + (r.ctor.recordCount ?? 0), 0);
  const pct = total ? Math.round((doneN / total) * 100) : 0;

  const shown = rows.filter((r) => {
    if (groupF && r.gk !== groupF) return false;
    if (apprF === "yes" && !r.ctor.approvalRequired) return false;
    if (apprF === "no" && r.ctor.approvalRequired) return false;
    const req = r.ctor.schema.required;
    return matchesTerms([r.ctor.code, r.ctor.title, r.name, r.ctor.runtimeTarget, r.target, ...req, ...req.map((f) => labels.field(f, { ctor: r.ctor.code }))], q);
  });

  const all: SxOption = { value: "", label: t("common.all") };
  const groups = [...reg.groups].sort((a, b) => a.order - b.order);
  const groupOpts: SxOption[] = [all, ...groups.map((g) => ({ value: g.key, label: `${labels.groupName(g.key, g.title)} (${labels.num(rows.filter((r) => r.gk === g.key).length)})`, icon: GROUP_ICON[g.key] }))];
  const apprOpts: SxOption[] = [
    all,
    { value: "yes", label: `${t("settings.registry.approvalYes")} (${labels.num(needN)})`, icon: ShieldCheckIcon },
    { value: "no", label: `${t("settings.registry.approvalNo")} (${labels.num(freeN)})`, icon: RocketIcon },
  ];

  const groupBy = (r: Row): SxRowGroup => {
    const g = reg.groups.find((x) => x.key === r.gk);
    const n = shown.filter((x) => x.gk === r.gk).length;
    return {
      key: r.gk || "other",
      title: "",
      meta: (
        <span className="sx-st-ghead" data-hue={groupHue(r.gk, g?.order ?? 1)}>
          <span className="sx-st-ghead__ico" aria-hidden="true">
            {glyph(groupIcon(r.gk), { size: 15 })}
          </span>
          <span className="sx-st-ghead__t">{r.gk ? labels.groupName(r.gk, g?.title) : t("sx.set.reg.otherGroup")}</span>
          <span className="sx-st-ghead__n sx-num">{labels.num(n)}</span>
        </span>
      ),
    };
  };

  const columns: SxColumn<Row>[] = [
    {
      key: "ctor",
      header: t("settings.registry.col.ctor"),
      primary: true,
      width: "30%",
      cell: (r) => {
        const g = reg.groups.find((x) => x.key === r.gk);
        return (
          <span className="sx-st-ctor">
            <Squircle icon={ctorIcon(r.ctor.code, r.gk)} hue={groupHue(r.gk, g?.order ?? 1)} size="sm" />
            <span className="sx-st-ctor__m">
              <span className="sx-st-ctor__name">{r.name}</span>
              <span className="sx-st-ctor__code">{r.ctor.code}</span>
            </span>
          </span>
        );
      },
    },
    {
      key: "target",
      header: t("settings.registry.col.target"),
      hideBelow: "md",
      cell: (r) => (r.target ? <span className="sx-st-target">{r.target}</span> : <span className="sx-st-dim">—</span>),
    },
    {
      key: "approval",
      header: t("settings.registry.col.approval"),
      cell: (r) =>
        r.ctor.approvalRequired ? (
          <span className="sx-st-badge" data-tone="need">
            {glyph(ShieldCheckIcon, { size: 14 })}
            {t("settings.registry.approvalYes")}
          </span>
        ) : (
          <span className="sx-st-badge" data-tone="free">
            {glyph(RocketIcon, { size: 14 })}
            {t("settings.registry.approvalNo")}
          </span>
        ),
    },
    {
      key: "required",
      header: t("settings.registry.col.required"),
      hideBelow: "lg",
      width: "26%",
      cell: (r) => {
        const req = r.ctor.schema.required.filter((f) => !isSlugPath(f));
        if (!req.length) return <span className="sx-st-dim">{t("common.none")}</span>;
        const names = req.map((f) => labels.field(f, { ctor: r.ctor.code }));
        return (
          <span className="sx-st-chips">
            {names.slice(0, SHOW_REQ).map((f, i) => (
              <span key={req[i]} className="sx-st-field">
                {f}
              </span>
            ))}
            {names.length > SHOW_REQ ? (
              <span className="sx-st-more" title={names.slice(SHOW_REQ).join(", ")}>
                +{labels.num(names.length - SHOW_REQ)}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "records",
      header: t("sx.set.reg.colRecords"),
      numeric: true,
      sortValue: (r) => r.ctor.recordCount,
      cell: (r) => (r.ctor.recordCount === null ? <span className="sx-st-dim">—</span> : labels.num(r.ctor.recordCount)),
    },
  ];

  const syncBtn = (
    <SxButton icon={RefreshCwIcon} busy={syncing} onClick={() => setAsk(true)} aiId={`${AI}.sync`}>
      {t("settings.registry.sync")}
    </SxButton>
  );

  const loading = reg.avail === "checking" && !total;
  const filtered = Boolean(q.trim() || groupF || apprF);

  const kpi = (key: string, icon: typeof LayersIcon, value: number, label: string, tone: string, i: number) => (
    <li key={key} className="sx-st-kpi sx-enter" data-tone={tone} style={{ ["--i" as string]: i }}>
      <span className="sx-st-kpi__ico" aria-hidden="true">
        {glyph(icon, { size: 18 })}
      </span>
      <SxCount value={value} format={labels.num} className="sx-st-kpi__n" />
      <span className="sx-st-kpi__l">{label}</span>
    </li>
  );

  return (
    <div className="sx-st-stack">
      <SectionHead
        icon={TAB_ICON.registry}
        hue={TAB_HUE.registry}
        title={t("sx.set.nav.registry.title")}
        lead={t("settings.registry.lead", { n: labels.num(total) })}
        actions={total ? syncBtn : null}
        titleId="sx-set-registry-title"
      >
        {total ? (
          <div className="sx-st-band">
            <SxRing value={pct} label={t("sx.set.reg.ringLabel")} size={72} stroke={7}>
              <span className="sx-st-band__pct sx-num">{pct}%</span>
            </SxRing>
            <div className="sx-st-band__ring">
              <b className="sx-num">{t("sx.set.reg.doneOf", { done: labels.num(doneN), total: labels.num(total) })}</b>
              <span>{t("sx.set.reg.doneLabel")}</span>
            </div>
            <ul className="sx-st-kpis" aria-label={t("sx.set.reg.kpis")}>
              {kpi("total", LayersIcon, total, t("sx.set.reg.kpiTotal"), "all", 0)}
              {kpi("need", ShieldCheckIcon, needN, t("settings.registry.approvalYes"), "need", 1)}
              {kpi("free", RocketIcon, freeN, t("settings.registry.approvalNo"), "free", 2)}
              {kpi("records", FileTextIcon, recN, t("sx.set.reg.kpiRecords"), "rec", 3)}
            </ul>
          </div>
        ) : null}
      </SectionHead>

      {reg.error && total ? (
        <SxNote
          tone="error"
          action={
            <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={() => void reg.reload()} aiId={`${AI}.retry`}>
              {t("sx.ui.retry")}
            </SxButton>
          }
        >
          {errText(reg.error).text}
        </SxNote>
      ) : null}

      <section className="sx-st-card sx-st-tablecard" data-ai-id={`${AI}.list`} data-ai-type="section" data-ai-label={t("settings.registry.title")}>
        {!loading && !total ? (
          <SxEmpty icon={LayersIcon} title={t("settings.registry.emptyTitle")} text={t("settings.registry.emptyText")} action={syncBtn} />
        ) : (
          <>
            <SxToolbar
              aiId={`${AI}.filters`}
              search={{ value: q, onChange: (v) => setQ(v.slice(0, 80)), placeholder: t("settings.registry.searchPh"), label: t("settings.registry.searchPh"), aiId: `${AI}.search.input` }}
              count={total ? t("sx.set.reg.count", { n: labels.num(shown.length) }) : undefined}
              active={filtered}
              onReset={() => {
                setQ("");
                setGroupF("");
                setApprF("");
              }}
            >
              <Picker size="sm" label={t("settings.registry.filterGroup")} placeholder={t("settings.registry.filterGroup")} options={groupOpts} value={groupF} onChange={setGroupF} searchable={false} aiId={`${AI}.filter.group`} />
              <Picker size="sm" label={t("settings.registry.filterApproval")} placeholder={t("settings.registry.filterApproval")} options={apprOpts} value={apprF} onChange={setApprF} searchable={false} aiId={`${AI}.filter.approval`} />
            </SxToolbar>
            <SxTable
              rows={shown}
              columns={columns}
              rowKey={(r) => r.ctor.code}
              caption={t("settings.registry.title")}
              loading={loading}
              skeletonRows={6}
              groupBy={groupBy}
              rowHref={(r) => `/admin/studio/c/${encodeURIComponent(r.ctor.code)}`}
              rowTitle={(r) => r.name}
              empty={<SxEmpty compact icon={CircleDashedIcon} title={t("settings.common.noMatch")} text={t("settings.common.noMatchText")} />}
              aiId={AI}
            />
          </>
        )}
      </section>

      <SxDialog
        open={ask}
        onClose={() => setAsk(false)}
        title={t("settings.registry.confirmTitle")}
        size="sm"
        busy={syncing}
        aiId={`${AI}.sync-confirm`}
        footer={
          <>
            <SxButton onClick={() => setAsk(false)} disabled={syncing} aiId={`${AI}.sync-confirm.cancel`}>
              {t("sx.ui.cancel")}
            </SxButton>
            <SxButton variant="primary" icon={RefreshCwIcon} busy={syncing} onClick={() => void sync()} aiId={`${AI}.sync-confirm.confirm`}>
              {t("settings.registry.sync")}
            </SxButton>
          </>
        }
      >
        <div className="sx-st-confirm" data-tone="on">
          <Squircle icon={RefreshCwIcon} hue="jade" />
          <p>{t("settings.registry.confirmText")}</p>
        </div>
        <ul className="sx-st-points">
          {[t("settings.registry.confirmP1"), t("settings.registry.confirmP2")].map((p) => (
            <li key={p}>
              {glyph(CircleCheckIcon, { size: 16 })}
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </SxDialog>
    </div>
  );
}
