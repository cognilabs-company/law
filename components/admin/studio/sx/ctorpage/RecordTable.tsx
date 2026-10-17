"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-ctorpage.css";
import { useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { useAiField } from "@/lib/ai/registry";
import { logApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { archiveStudioRecord, studioObjectIdOf, type StudioConstructor, type StudioRecord, type StudioRecordSource } from "@/lib/services/studio";
import { SxButton } from "../Button";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { Picker } from "../form/Picker";
import { ArchiveIcon, ArrowCounterClockwiseIcon, ArrowsClockwiseIcon, CopyIcon, EyeIcon, MagnifyingGlassIcon, PencilSimpleIcon } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxPanel } from "../layout/Panel";
import { SxPager, SxTable, type SxRowAction } from "../layout/Table";
import { SxToolbar } from "../layout/Toolbar";
import type { SxOption } from "../types";
import { useStudioLabels, type SxTranslate } from "../useStudioLabels";
import { CloneDialog } from "./CloneDialog";
import { usePromoInfo } from "./promoRows";
import { isQuietRow, quietLast } from "./quiet";
import { payloadKey, useRowPayloads } from "./rowPayloads";
import type { CtorRecordsState } from "./useCtorRecords";
import { PLACEMENT_VALUES, RUNTIME_STATUS_VALUES, STUDIO_STATUS_VALUES } from "./urlState";
import { joinPromoRows, promoPlacementOf, rowTitle, type CtorVariant, type RecordRow, type VariantCtx } from "./variants";

export type { RecordRow } from "./variants";

export type RecordTableProps = {
  code: string;
  ctor: StudioConstructor | null;
  st: CtorRecordsState;
  variant: CtorVariant;
  canEdit: boolean;
  canArchive: boolean;
  createControl: ReactNode;
};

const STUDIO_CLONE = /^\/studio\/objects\/[^/?#]+\/clone$/;

export function recordHref(code: string, url: string): string {
  const oid = studioObjectIdOf(url);
  if (oid) return `/admin/studio/o/${encodeURIComponent(oid)}`;
  if (url.includes("/form-context")) return `/admin/studio/o/new?new=${encodeURIComponent(code)}&ctx=${encodeURIComponent(url)}`;
  return "";
}

export function cloneTargetOf(code: string, rec: StudioRecord): { href: string; studio: boolean } {
  const url = rec.actions.clone;
  if (!url) return { href: "", studio: false };
  if (url.includes("/form-context")) return { href: recordHref(code, url), studio: false };
  return { href: "", studio: STUDIO_CLONE.test(url) };
}

export function statusOptions(t: SxTranslate, labels: { status(raw: string, source?: StudioRecordSource): string }): SxOption[] {
  return [
    { value: "", label: t("sx.cpage.filter.all") },
    ...RUNTIME_STATUS_VALUES.map((s) => ({ value: s, label: labels.status(s, "runtime") })),
    ...STUDIO_STATUS_VALUES.map((s) => ({ value: s, label: labels.status(s) })),
  ];
}

export type RecordActions = {
  actionsFor: <T>(rec: StudioRecord | null, extra?: readonly SxRowAction<T>[]) => SxRowAction<T>[];
  dialog: ReactNode;
};

export function useRecordActions({ code, canEdit, canArchive, refetch }: { code: string; canEdit: boolean; canArchive: boolean; refetch: () => void }): RecordActions {
  const t = useTranslations("studio");
  const errText = useEditorErrorText();
  const [cloneOf, setCloneOf] = useState<StudioRecord | null>(null);

  const archive = async (rec: StudioRecord) => {
    const ok = await confirmDialog({
      title: t("sx.editor.archiveDlg.title"),
      text: t("sx.editor.archiveDlg.text"),
      confirmLabel: t("sx.editor.archiveDlg.confirm"),
      cancelLabel: t("sx.ui.cancel"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await archiveStudioRecord(rec.actions.archive);
      notify.success(t("sx.editor.toast.archived"));
      refetch();
    } catch (e) {
      logApiError("studio.archive", e);
      notify.error(errText(e).title, { error: e });
    }
  };

  const actionsFor = <T,>(rec: StudioRecord | null, extra: readonly SxRowAction<T>[] = []): SxRowAction<T>[] => {
    if (!rec) return [...extra];
    const view = recordHref(code, rec.actions.view);
    const edit = recordHref(code, rec.actions.edit);
    const clone = cloneTargetOf(code, rec);
    const out: SxRowAction<T>[] = [];
    if (view) out.push({ key: "view", label: t("sx.ui.view"), icon: EyeIcon, href: () => view });
    if (canEdit && edit) out.push({ key: "edit", label: t("sx.ui.edit"), icon: PencilSimpleIcon, href: () => edit });
    out.push(...extra);
    if (canEdit && clone.href) out.push({ key: "clone", label: t("sx.ui.clone"), icon: CopyIcon, href: () => clone.href });
    else if (canEdit && clone.studio) out.push({ key: "clone", label: t("sx.ui.clone"), icon: CopyIcon, onSelect: () => setCloneOf(rec) });
    if (canArchive && rec.actions.archive && rec.status !== "archived") out.push({ key: "archive", label: t("sx.ui.archive"), icon: ArchiveIcon, danger: true, onSelect: () => void archive(rec) });
    return out;
  };

  const dialog = <CloneDialog key={cloneOf ? `${cloneOf.source}-${cloneOf.id}` : "none"} rec={cloneOf} onClose={() => setCloneOf(null)} onCloned={refetch} />;
  return { actionsFor, dialog };
}

export function hasFilters(q: { q: string; status: string; source: string; placement: string }): boolean {
  return !!(q.q.trim() || q.status || q.source || q.placement);
}

export function shapeRows(rows: readonly RecordRow[], variant: CtorVariant, ctx: VariantCtx, ready: boolean): RecordRow[] {
  if (ready && variant.sort) return variant.sort(rows, ctx);
  return quietLast(rows, (r) => r.rec.title, (r) => r.rec.status);
}

export function LoadError({ error, onRetry, busy, compact = false }: { error: unknown; onRetry: () => void; busy: boolean; compact?: boolean }): ReactElement {
  const t = useTranslations("studio");
  const errText = useEditorErrorText();
  return (
    <SxNote
      tone="error"
      title={compact ? undefined : t("sx.ui.errorTitle")}
      className={compact ? "sx-cp-note" : undefined}
      action={
        <SxButton variant="ghost" size="sm" icon={ArrowsClockwiseIcon} busy={busy} onClick={onRetry} aiId="admin.studio.list.retry">
          {t("sx.ui.retry")}
        </SxButton>
      }
    >
      {errText(error).text || t("sx.ui.loadFail")}
    </SxNote>
  );
}

export function RecordTable({ code, ctor, st, variant, canEdit, canArchive, createControl }: RecordTableProps): ReactElement {
  const t = useTranslations("studio") as SxTranslate;
  const labels = useStudioLabels();
  const name = labels.ctorName(code, ctor?.title);
  const k12 = variant.kind === "k12promo";
  const payloads = useRowPayloads(st.rows, variant.needsPayload);
  const promo = usePromoInfo(k12);
  const acts = useRecordActions({ code, canEdit, canArchive, refetch: st.refetch });
  useAiField("admin.studio.list.search.input", { get: () => st.query.q, set: (v) => st.setQ(String(v ?? "")) });

  const ctx: VariantCtx = { code, labels, t, placements: promo.placements };
  let rows: RecordRow[] = st.rows.map((rec) => {
    if (!variant.needsPayload) return { rec };
    const k = payloadKey(rec);
    return { rec, payload: payloads.has(k) ? (payloads.get(k) ?? null) : undefined };
  });
  if (k12) {
    rows = joinPromoRows(rows, promo.byId);
    if (promo.loading) rows = rows.map((r) => ({ ...r, extra: { ...r.extra, promoLoading: true } }));
    if (st.query.placement) rows = rows.filter((r) => promoPlacementOf(r) === st.query.placement);
  }
  const ready = (!variant.needsPayload || rows.every((r) => r.payload !== undefined)) && (!k12 || !promo.loading);
  const shown = shapeRows(rows, variant, ctx, ready);
  const groupBy = ready && variant.groupBy ? variant.groupBy(ctx) : undefined;
  const columns = variant.columns(ctx);

  const q = st.query;
  const filtered = hasFilters(q);
  const data = st.data;
  const total = data?.total ?? 0;
  const shownTotal = k12 && q.placement ? shown.length : total;

  const reset = (
    <SxButton variant="ghost" size="sm" icon={ArrowCounterClockwiseIcon} onClick={st.reset} aiId="admin.studio.list.reset">
      {t("sx.table.reset")}
    </SxButton>
  );
  const empty =
    !filtered && q.page === 0 ? (
      <SxEmpty title={t("sx.table.empty")} text={canEdit ? t("sx.cpage.emptyText", { name }) : undefined} action={canEdit ? createControl : undefined} />
    ) : (
      <SxEmpty compact icon={MagnifyingGlassIcon} title={t("sx.table.noMatch")} action={reset} />
    );

  const from = q.page * st.limit;
  const split =
    data && (data.runtimeTotal || data.studioTotal) ? (
      <p className="sx-cp-split">{t("sx.cpage.split", { runtime: labels.num(data.runtimeTotal), studio: labels.num(data.studioTotal) })}</p>
    ) : null;
  const footer =
    data && (st.paged || split) ? (
      <div className="sx-cp-foot">
        {st.paged ? (
          <SxPager
            from={from + 1}
            to={from + st.rows.length}
            total={total}
            busy={!st.current}
            onPrev={() => st.setPage(Math.max(0, q.page - 1))}
            onNext={() => st.setPage(q.page + 1)}
            aiId="admin.studio.list"
          />
        ) : null}
        {split}
      </div>
    ) : undefined;

  const statusOpts = statusOptions(t, labels);
  const sourceOpts: SxOption[] = [
    { value: "", label: t("sx.cpage.filter.all") },
    { value: "runtime", label: t("sx.cpage.source.runtime") },
    { value: "studio", label: t("sx.cpage.source.studio") },
  ];
  const placementOpts: SxOption[] = [{ value: "", label: t("sx.cpage.filter.all") }, ...PLACEMENT_VALUES.map((p) => ({ value: p, label: labels.placement(p) }))];

  return (
    <div className="sx-cp" data-variant={variant.kind}>
      <SxToolbar
        aiId="admin.studio.list.filters"
        search={{ value: q.q, onChange: st.setQ, placeholder: t("sx.cpage.searchPh"), label: t("sx.cpage.searchLabel"), aiId: "admin.studio.list.search.input" }}
        count={data ? t("sx.layout.results", { n: labels.num(shownTotal) }) : undefined}
        active={filtered}
        onReset={st.reset}
      >
        <Picker
          size="sm"
          label={t("sx.cpage.filter.status")}
          placeholder={t("sx.cpage.filter.status")}
          options={statusOpts}
          value={q.status}
          onChange={st.setStatus}
          searchable={false}
          aiId="admin.studio.list.filters.status"
        />
        <Picker
          size="sm"
          label={t("sx.cpage.filter.source")}
          placeholder={t("sx.cpage.filter.source")}
          options={sourceOpts}
          value={q.source}
          onChange={(v) => st.setSource(v === "runtime" || v === "studio" ? v : "")}
          searchable={false}
          aiId="admin.studio.list.filters.source"
        />
        {k12 ? (
          <Picker
            size="sm"
            label={t("sx.cpage.filter.placement")}
            placeholder={t("sx.cpage.filter.placement")}
            options={placementOpts}
            value={q.placement}
            onChange={st.setPlacement}
            searchable={false}
            aiId="admin.studio.list.filters.placement"
          />
        ) : null}
      </SxToolbar>
      {st.error && data ? <LoadError error={st.error} onRetry={() => void st.retry()} busy={st.retrying} compact /> : null}
      <SxPanel flush className="sx-cp-panel">
        <SxTable<RecordRow>
          caption={t("sx.cpage.caption", { name })}
          aiId="admin.studio.list.table"
          rows={shown}
          columns={columns}
          rowKey={(r) => `${r.rec.source}-${r.rec.id}`}
          rowHref={(r) => recordHref(code, r.rec.actions.view) || undefined}
          rowTitle={(r) => rowTitle(r.rec) || t("sx.ui.untitled")}
          rowTone={(r) => (isQuietRow(r.rec.title, String(r.extra?.status ?? "") || r.rec.status) ? "muted" : undefined)}
          rowActions={(r) => acts.actionsFor<RecordRow>(r.rec)}
          groupBy={groupBy}
          loading={st.loading}
          busy={!st.current && !!data}
          error={st.error && !data ? <LoadError error={st.error} onRetry={() => void st.retry()} busy={st.retrying} /> : undefined}
          empty={empty}
          footer={footer}
        />
      </SxPanel>
      {acts.dialog}
    </div>
  );
}
