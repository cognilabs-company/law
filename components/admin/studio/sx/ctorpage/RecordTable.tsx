"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "../sx-tones.css";
import "./sx-ctorpage.css";
import { useState, type ReactElement, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDownAZIcon, ArrowDownZAIcon, CalendarArrowDownIcon, CalendarArrowUpIcon, Table2Icon } from "lucide-react";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";
import { logApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { archiveStudioRecord, studioObjectIdOf, type StudioConstructor, type StudioRecord, type StudioRecordSource } from "@/lib/services/studio";
import { SxButton } from "../Button";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { Picker } from "../form/Picker";
import {
  ArchiveIcon,
  ArrowDownUpIcon,
  CopyIcon,
  EyeIcon,
  GlobeIcon,
  LayersIcon,
  LayoutGridIcon,
  LayoutPanelTopIcon,
  ListFilterIcon,
  ListOrderedIcon,
  PencilIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Rows3Icon,
  SearchIcon,
} from "../icons";
import { useNow } from "../live";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxPanel } from "../layout/Panel";
import { SxPager, SxTable, type SxColumn, type SxRowAction, type SxSort } from "../layout/Table";
import { SxToolbar } from "../layout/Toolbar";
import { SxSegmented, type SxSegItem } from "../shared/Segmented";
import type { SxHue } from "../tones";
import type { SxOption } from "../types";
import { useStudioLabels, type SxTranslate } from "../useStudioLabels";
import { CloneDialog } from "./CloneDialog";
import { CtorEmpty } from "./CtorEmpty";
import { usePromoInfo } from "./promoRows";
import { isQuietRow, quietBand, quietLast } from "./quiet";
import { RecordCards } from "./RecordCards";
import { RowTools } from "./RowTools";
import { payloadKey, useRowPayloads } from "./rowPayloads";
import type { CtorRecordsState } from "./useCtorRecords";
import { PLACEMENT_VALUES, RUNTIME_STATUS_VALUES, sortOf, STUDIO_STATUS_VALUES, viewOf, type CtorSort, type CtorView } from "./urlState";
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
  hue?: SxHue;
  group?: string;
};

type SourceTab = "all" | StudioRecordSource;

const STUDIO_CLONE = /^\/studio\/objects\/[^/?#]+\/clone$/;
const TABLE_ID = "admin.studio.list.table";

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

export function sortOptions(t: SxTranslate): SxOption[] {
  return [
    { value: "", label: t("sx.cp2.sort.default"), icon: ListOrderedIcon },
    { value: "-updated", label: t("sx.cp2.sort.updatedDesc"), icon: CalendarArrowDownIcon },
    { value: "updated", label: t("sx.cp2.sort.updatedAsc"), icon: CalendarArrowUpIcon },
    { value: "title", label: t("sx.cp2.sort.titleAsc"), icon: ArrowDownAZIcon },
    { value: "-title", label: t("sx.cp2.sort.titleDesc"), icon: ArrowDownZAIcon },
  ];
}

export function tableSortOf(sort: CtorSort | ""): SxSort | null {
  if (!sort) return null;
  return { key: sort.replace(/^-/, ""), dir: sort.startsWith("-") ? "desc" : "asc" };
}

export function sortFromTable(next: SxSort | null): CtorSort | "" {
  if (!next || (next.key !== "title" && next.key !== "updated")) return "";
  return sortOf(`${next.dir === "desc" ? "-" : ""}${next.key}`);
}

const timeOf = (iso: string): number => {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
};

export function sortLoaded(rows: readonly RecordRow[], sort: CtorSort | "", locale: string, groupOf?: (row: RecordRow) => string): RecordRow[] {
  if (!sort) return [...rows];
  const key = sort.replace(/^-/, "");
  const sign = sort.startsWith("-") ? -1 : 1;
  const firstAt = new Map<string, number>();
  rows.forEach((row, i) => {
    const g = groupOf?.(row) ?? "";
    if (!firstAt.has(g)) firstAt.set(g, i);
  });
  const cmp = (a: string | number, b: string | number): number =>
    typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), locale, { numeric: true, sensitivity: "base" });
  return rows
    .map((row, index) => ({
      row,
      index,
      g: firstAt.get(groupOf?.(row) ?? "") ?? 0,
      band: quietBand(row.rec.title, row.rec.status),
      v: key === "title" ? rowTitle(row.rec) : timeOf(row.rec.updatedAt),
    }))
    .sort((a, b) => a.g - b.g || a.band - b.band || cmp(a.v, b.v) * sign || a.index - b.index)
    .map((x) => x.row);
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
    const canOpenEdit = canEdit && !!edit;
    if (view && (!canOpenEdit || edit !== view)) out.push({ key: "view", label: t("sx.ui.view"), icon: EyeIcon, href: () => view });
    if (canOpenEdit) out.push({ key: "edit", label: edit === view ? t("sx.ui.open") : t("sx.ui.edit"), icon: PencilIcon, href: () => edit });
    out.push(...extra);
    if (canEdit && clone.href) out.push({ key: "clone", label: t("sx.ui.clone"), icon: CopyIcon, href: () => clone.href });
    else if (canEdit && clone.studio) out.push({ key: "clone", label: t("sx.ui.clone"), icon: CopyIcon, onSelect: () => setCloneOf(rec) });
    if (canArchive && rec.actions.archive && rec.status !== "archived") out.push({ key: "archive", label: t("sx.ui.archive"), icon: ArchiveIcon, danger: true, onSelect: () => void archive(rec) });
    return out;
  };

  const dialog = <CloneDialog key={cloneOf ? `${cloneOf.source}-${cloneOf.id}` : "none"} rec={cloneOf} onClose={() => setCloneOf(null)} onCloned={refetch} />;
  return { actionsFor, dialog };
}

export function toolsColumn<T>(t: SxTranslate, actionsOf: (row: T) => readonly SxRowAction<T>[], keyOf: (row: T) => string, titleOf: (row: T) => string, base = TABLE_ID): SxColumn<T> {
  return {
    key: "actions",
    header: t("sx.table.actions"),
    srOnlyHeader: true,
    align: "end",
    cell: (row) => <RowTools row={row} actions={actionsOf(row)} base={aiIdOf(base, "row", keyOf(row))} label={t("sx.table.actionsFor", { name: titleOf(row) })} />,
  };
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
        <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} busy={busy} onClick={onRetry} aiId="admin.studio.list.retry">
          {t("sx.ui.retry")}
        </SxButton>
      }
    >
      {errText(error).text || t("sx.ui.loadFail")}
    </SxNote>
  );
}

export function ViewToggle({ value, onChange }: { value: CtorView; onChange: (v: CtorView) => void }): ReactElement {
  const t = useTranslations("studio");
  const items: SxSegItem<CtorView>[] = [
    { value: "table", label: t("sx.cp2.view.table"), icon: Table2Icon, aiId: "admin.studio.list.view.table" },
    { value: "cards", label: t("sx.cp2.view.cards"), icon: LayoutGridIcon, aiId: "admin.studio.list.view.cards" },
  ];
  return <SxSegmented items={items} value={value} onChange={onChange} label={t("sx.cp2.view.label")} size="sm" className="sx-cp-view" aiId="admin.studio.list.view" />;
}

export function RecordTable({ code, ctor, st, variant, canEdit, canArchive, createControl, hue, group }: RecordTableProps): ReactElement {
  const t = useTranslations("studio") as SxTranslate;
  const labels = useStudioLabels();
  const locale = useLocale();
  const now = useNow();
  const name = labels.ctorName(code, ctor?.title);
  const k12 = variant.kind === "k12promo";
  const payloads = useRowPayloads(st.rows, variant.needsPayload);
  const promo = usePromoInfo(k12);
  const acts = useRecordActions({ code, canEdit, canArchive, refetch: st.refetch });
  useAiField("admin.studio.list.search.input", { get: () => st.query.q, set: (v) => st.setQ(String(v ?? "")) });

  const q = st.query;
  const view = viewOf(q.view);
  const sort = sortOf(q.sort);
  const ctx: VariantCtx = { code, labels, t, placements: promo.placements, now };
  let rows: RecordRow[] = st.rows.map((rec) => {
    if (!variant.needsPayload) return { rec };
    const k = payloadKey(rec);
    return { rec, payload: payloads.has(k) ? (payloads.get(k) ?? null) : undefined };
  });
  if (k12) {
    rows = joinPromoRows(rows, promo.byId);
    if (promo.loading) rows = rows.map((r) => ({ ...r, extra: { ...r.extra, promoLoading: true } }));
    if (q.placement) rows = rows.filter((r) => promoPlacementOf(r) === q.placement);
  }
  const ready = (!variant.needsPayload || rows.every((r) => r.payload !== undefined)) && (!k12 || !promo.loading);
  const groupBy = ready && variant.groupBy ? variant.groupBy(ctx) : undefined;
  const shown = sortLoaded(shapeRows(rows, variant, ctx, ready), sort, locale, groupBy ? (r) => groupBy(r).key : undefined);
  const keyOf = (r: RecordRow) => `${r.rec.source}-${r.rec.id}`;
  const titleOf = (r: RecordRow) => rowTitle(r.rec) || t("sx.ui.untitled");
  const actionsOf = (r: RecordRow) => acts.actionsFor<RecordRow>(r.rec);
  const hrefOf = (r: RecordRow) => recordHref(code, r.rec.actions.view);
  const columns = [...variant.columns(ctx), toolsColumn<RecordRow>(t, actionsOf, keyOf, titleOf)];

  const filtered = hasFilters(q);
  const data = st.data;
  const total = data?.total ?? 0;
  const shownTotal = k12 && q.placement ? shown.length : total;
  const caption = t("sx.cpage.caption", { name });

  const reset = (
    <SxButton variant="ghost" size="sm" icon={RotateCcwIcon} onClick={st.reset} aiId="admin.studio.list.reset">
      {t("sx.table.reset")}
    </SxButton>
  );
  const noMatch = <SxEmpty compact icon={SearchIcon} title={t("sx.table.noMatch")} action={reset} />;
  const blank = !filtered && q.page === 0 && !!data && st.current && !st.error && !shown.length;

  const from = q.page * st.limit;
  const footer =
    data && st.paged ? (
      <SxPager
        from={from + 1}
        to={from + st.rows.length}
        total={total}
        busy={!st.current}
        onPrev={() => st.setPage(Math.max(0, q.page - 1))}
        onNext={() => st.setPage(q.page + 1)}
        aiId="admin.studio.list"
      />
    ) : undefined;

  const statusOpts = statusOptions(t, labels);
  const placementOpts: SxOption[] = [{ value: "", label: t("sx.cpage.filter.all") }, ...PLACEMENT_VALUES.map((p) => ({ value: p, label: labels.placement(p) }))];
  const tabs: SxSegItem<SourceTab>[] = [
    { value: "all", label: t("sx.cpage.filter.all"), icon: Rows3Icon, count: st.counts.all, aiId: "admin.studio.list.filters.source.all" },
    { value: "runtime", label: t("sx.cp2.tabs.runtime"), icon: GlobeIcon, count: st.counts.runtime, aiId: "admin.studio.list.filters.source.runtime" },
    { value: "studio", label: t("sx.cp2.tabs.studio"), icon: LayersIcon, count: st.counts.studio, aiId: "admin.studio.list.filters.source.studio" },
  ];
  const loadError = st.error && !data ? <LoadError error={st.error} onRetry={() => void st.retry()} busy={st.retrying} /> : undefined;

  let main: ReactNode;
  if (blank) {
    main = (
      <SxPanel className="sx-cp-panel sx-cp-blank">
        <CtorEmpty code={code} group={group} title={t("sx.cp2.empty.title")} text={canEdit ? t("sx.cpage.emptyText", { name }) : t("sx.cp2.empty.textView")} action={canEdit ? createControl : undefined} />
      </SxPanel>
    );
  } else if (view === "cards") {
    main = (
      <RecordCards
        rows={shown}
        columns={variant.columns(ctx)}
        ctx={ctx}
        caption={caption}
        hrefOf={hrefOf}
        actionsOf={actionsOf}
        groupBy={groupBy}
        loading={st.loading}
        busy={!st.current && !!data}
        error={loadError}
        empty={<SxPanel className="sx-cp-panel">{noMatch}</SxPanel>}
        footer={footer}
      />
    );
  } else {
    main = (
      <SxPanel flush className="sx-cp-panel">
        <SxTable<RecordRow>
          caption={caption}
          aiId={TABLE_ID}
          rows={shown}
          columns={columns}
          rowKey={keyOf}
          rowHref={(r) => hrefOf(r) || undefined}
          rowTitle={titleOf}
          rowTone={(r) => (isQuietRow(r.rec.title, String(r.extra?.status ?? "") || r.rec.status) ? "muted" : undefined)}
          sort={tableSortOf(sort)}
          onSortChange={(next) => st.setSort(sortFromTable(next))}
          groupBy={groupBy}
          loading={st.loading}
          busy={!st.current && !!data}
          error={loadError}
          empty={noMatch}
          footer={footer}
        />
      </SxPanel>
    );
  }

  return (
    <div className="sx-cp" data-variant={variant.kind} data-view={view} data-hue={hue}>
      <div className="sx-cp-bar">
        <SxSegmented<SourceTab>
          items={tabs}
          value={q.source || "all"}
          onChange={(v) => st.setSource(v === "runtime" || v === "studio" ? v : "")}
          label={t("sx.cp2.tabs.label")}
          className="sx-cp-tabs"
          aiId="admin.studio.list.filters.source"
        />
        <ViewToggle value={view} onChange={st.setView} />
      </div>
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
          leadingIcon={ListFilterIcon}
          aiId="admin.studio.list.filters.status"
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
            leadingIcon={LayoutPanelTopIcon}
            aiId="admin.studio.list.filters.placement"
          />
        ) : null}
        <Picker
          size="sm"
          label={t("sx.cp2.sort.label")}
          placeholder={t("sx.cp2.sort.label")}
          options={sortOptions(t)}
          value={sort}
          onChange={(v) => st.setSort(sortOf(v))}
          searchable={false}
          leadingIcon={ArrowDownUpIcon}
          aiId="admin.studio.list.filters.sort"
        />
      </SxToolbar>
      {st.error && data ? <LoadError error={st.error} onRetry={() => void st.retry()} busy={st.retrying} compact /> : null}
      {main}
      {acts.dialog}
    </div>
  );
}
