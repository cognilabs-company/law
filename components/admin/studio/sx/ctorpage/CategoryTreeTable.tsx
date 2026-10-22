"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "../sx-tones.css";
import "./sx-ctorpage.css";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";
import { logApiError } from "@/lib/http";
import { CATEGORY_PATH_SEP, flattenCategoryTree, getCategoryTree, type CategoryNode, type CategoryRow } from "@/lib/services/categoryTree";
import type { StudioConstructor, StudioRecord } from "@/lib/services/studio";
import { matchesSearch } from "@/lib/searchText";
import type { UserEvent } from "@/lib/userSocket";
import { SxButton } from "../Button";
import { FolderIcon } from "lucide-react";
import { RotateCcwIcon, RefreshCwIcon, FolderOpenIcon, FolderTreeIcon, ListFilterIcon, SearchIcon, PlusIcon, glyph } from "../icons";
import { studioEventCode, useNow, useStudioLive } from "../live";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxPanel } from "../layout/Panel";
import { SxTable, type SxColumn, type SxRowAction } from "../layout/Table";
import type { SxHue } from "../tones";
import { SxToolbar } from "../layout/Toolbar";
import { Picker } from "../form/Picker";
import type { SxOption } from "../types";
import { useStudioLabels, type SxTranslate } from "../useStudioLabels";
import type { CtorQuery } from "./CtorPage";
import { isTestTitle, quietLastBy } from "./quiet";
import { CtorEmpty } from "./CtorEmpty";
import { LoadError, RecordTable, recordHref, toolsColumn, useRecordActions } from "./RecordTable";
import { useCtorRecords } from "./useCtorRecords";
import { genericColumns, rowTitle, updatedText, variantOf, type RecordRow } from "./variants";

export type TreeRow = { row: CategoryRow; rec: StudioRecord | null; match: boolean };

export type TreeStatus = "" | "active" | "inactive";

const CODE = "K01";
const LIVE_MS = 400;
const TREE_EVENTS: ReadonlySet<string> = new Set(["studio.object_published", "studio.object_archived", "studio.object_rollback", "studio.resync"]);

export function treeStatusOf(raw: string): TreeStatus {
  return raw === "active" || raw === "inactive" ? raw : "";
}

export function joinKeyOf(rec: Pick<StudioRecord, "runtimeTargetId" | "recordId">): string {
  return rec.runtimeTargetId || rec.recordId;
}

function siblingBand(r: CategoryRow): number {
  if (!r.node.isActive) return 2;
  return isTestTitle(r.node.title) ? 1 : 0;
}

export function orderTree(rows: readonly CategoryRow[]): CategoryRow[] {
  const kids = new Map<string, CategoryRow[]>();
  for (const r of rows) {
    const parent = r.ancestors[r.ancestors.length - 1] ?? "";
    const list = kids.get(parent);
    if (list) list.push(r);
    else kids.set(parent, [r]);
  }
  const out: CategoryRow[] = [];
  const seen = new Set<string>();
  const walk = (parent: string) => {
    for (const r of quietLastBy(kids.get(parent) ?? [], siblingBand)) {
      if (seen.has(r.node.id)) continue;
      seen.add(r.node.id);
      out.push(r);
      walk(r.node.id);
    }
  };
  walk("");
  for (const r of rows) {
    if (seen.has(r.node.id)) continue;
    seen.add(r.node.id);
    out.push(r);
    walk(r.node.id);
  }
  return out;
}

export function treeHaystack(node: Pick<CategoryNode, "title" | "slug" | "discoveryTerms">): string {
  return `${node.title} ${node.slug} ${node.discoveryTerms.join(" ")}`;
}

export function buildTreeRows(rows: readonly CategoryRow[], recs: readonly StudioRecord[], q: string, status: "" | "active" | "inactive"): TreeRow[] {
  const recById = new Map<string, StudioRecord>();
  for (const rec of recs) {
    const k = joinKeyOf(rec);
    if (k && !recById.has(k)) recById.set(k, rec);
  }
  const ordered = orderTree(rows);
  const term = q.trim();
  const passes = (r: CategoryRow) => (!term || matchesSearch(treeHaystack(r.node), term)) && (!status || (status === "active" ? r.node.isActive : !r.node.isActive));
  if (!term && !status) return ordered.map((row) => ({ row, rec: recById.get(row.node.id) ?? null, match: true }));
  const keep = new Set<string>();
  const hit = new Set<string>();
  for (const r of ordered) {
    if (!passes(r)) continue;
    hit.add(r.node.id);
    keep.add(r.node.id);
    for (const a of r.ancestors) keep.add(a);
  }
  return ordered.filter((r) => keep.has(r.node.id)).map((row) => ({ row, rec: recById.get(row.node.id) ?? null, match: hit.has(row.node.id) }));
}

export function treeDrafts(recs: readonly StudioRecord[], rows: readonly CategoryRow[], q: string): StudioRecord[] {
  const ids = new Set(rows.map((r) => r.node.id));
  const term = q.trim();
  return recs.filter((rec) => !ids.has(joinKeyOf(rec)) && (!term || matchesSearch(rec.title, term)));
}

export function addChildHref(id: string): string {
  return `/admin/studio/o/new?new=${CODE}&kind=sub&parent=${encodeURIComponent(id)}`;
}

type TreeState = { phase: "loading" | "ready" | "error"; nodes: CategoryNode[]; error: unknown };

const START: TreeState = { phase: "loading", nodes: [], error: null };

export function treeIconOf(depth: number, kids: number): typeof FolderIcon {
  if (kids > 0) return depth === 0 ? FolderTreeIcon : FolderOpenIcon;
  return FolderIcon;
}

function TreeName({ tr, t }: { tr: TreeRow; t: SxTranslate }): ReactElement {
  const { node, depth, path } = tr.row;
  const title = node.title.trim() || t("sx.ui.untitled");
  const kids = node.childrenCount || node.children.length;
  const depthStyle = { "--depth": depth } as CSSProperties;
  const guides = Array.from({ length: Math.max(0, depth) }, (_, i) => i);
  return (
    <span
      className="sx-cp-tree"
      style={depthStyle}
      data-ai-id={aiIdOf("admin.studio.list.item", tr.rec?.id || node.id)}
      data-ai-type="list_item"
      data-ai-entity-type={tr.rec?.source === "studio" ? "studio_object" : "studio_runtime_record"}
      data-ai-entity-id={tr.rec?.id || node.id}
      data-ai-label={title}
    >
      {guides.length ? (
        <span className="sx-cp-tree__guides" aria-hidden="true">
          {guides.map((i) => (
            <i key={i} style={{ "--g": i } as CSSProperties} />
          ))}
        </span>
      ) : null}
      <span className="sx-cp-tree__tile" data-kids={kids > 0 ? "" : undefined} data-off={node.isActive ? undefined : ""} aria-hidden="true">
        {glyph(treeIconOf(depth, kids), { size: 16, className: kids > 0 ? "sx-cp-tree__icon" : undefined })}
      </span>
      <span className="sx-cp-tree__body">
        <span className="sx-cp-name__t">{title}</span>
        {kids > 0 ? (
          <span className="sx-cp-name__m">
            <span className="sx-cp-tree__kids">{t("sx.cpage.tree.children", { n: kids })}</span>
          </span>
        ) : null}
        {depth > 0 ? <span className="sx-vh">{t("sx.cpage.tree.parent", { path: path.slice(0, -1).join(CATEGORY_PATH_SEP) })}</span> : null}
      </span>
    </span>
  );
}

export type CategoryTreeTableProps = { ctor: StudioConstructor | null; canEdit: boolean; canArchive: boolean; initial: CtorQuery; createControl?: ReactNode; hue?: SxHue; group?: string };

export function CategoryTreeTable({ ctor, canEdit, canArchive, initial, createControl, hue, group }: CategoryTreeTableProps): ReactElement {
  const t = useTranslations("studio") as SxTranslate;
  const labels = useStudioLabels();
  const now = useNow();
  const [tree, setTree] = useState<TreeState>(START);
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const failed = tree.phase === "error";
  const st = useCtorRecords(CODE, initial, { all: true, local: !failed });
  const acts = useRecordActions({ code: CODE, canEdit, canArchive, refetch: st.refetch });

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    getCategoryTree({ includeInactive: true }, ac.signal).then(
      (nodes) => {
        if (alive) setTree({ phase: "ready", nodes, error: null });
      },
      (e: unknown) => {
        if (!alive || ac.signal.aborted) return;
        logApiError("studio.category_tree", e);
        setTree((cur) => (cur.nodes.length ? { ...cur, phase: "ready", error: e } : { phase: "error", nodes: [], error: e }));
      },
    );
    return () => {
      alive = false;
      ac.abort();
    };
  }, [attempt]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useStudioLive((e: UserEvent) => {
    if (!TREE_EVENTS.has(e.event)) return;
    const c = studioEventCode(e).toUpperCase();
    if (c && c !== CODE) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAttempt((a) => a + 1), LIVE_MS);
  });

  const retryTree = () => {
    setTree((cur) => ({ ...cur, phase: cur.nodes.length ? "ready" : "loading", error: null }));
    setAttempt((a) => a + 1);
  };

  const status = treeStatusOf(st.query.status);
  useAiField(failed ? "" : "admin.studio.list.search.input", { get: () => st.query.q, set: (v) => st.setQ(String(v ?? "")) });

  const flat = useMemo(() => flattenCategoryTree(tree.nodes), [tree.nodes]);
  const rows = buildTreeRows(flat, st.rows, st.query.q, status);
  const drafts = tree.phase === "ready" ? treeDrafts(st.rows, flat, st.query.q) : [];
  const filtered = !!(st.query.q.trim() || status);

  if (failed) {
    return (
      <>
        <SxNote
          tone="warn"
          className="sx-cp-note"
          action={
            <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={retryTree} aiId="admin.studio.list.tree.retry">
              {t("sx.ui.retry")}
            </SxButton>
          }
        >
          {t("sx.cpage.tree.fail")}
        </SxNote>
        <RecordTable code={CODE} ctor={ctor} st={st} variant={variantOf(CODE)} canEdit={canEdit} canArchive={canArchive} createControl={createControl ?? null} hue={hue} group={group} />
      </>
    );
  }

  const actionsOf = (tr: TreeRow): SxRowAction<TreeRow>[] => {
    const extra: SxRowAction<TreeRow>[] = canEdit ? [{ key: "add-child", label: t("sx.cpage.addChild"), icon: PlusIcon, href: () => addChildHref(tr.row.node.id) }] : [];
    return acts.actionsFor<TreeRow>(tr.rec, extra);
  };
  const treeTitle = (tr: TreeRow) => tr.row.node.title.trim() || t("sx.ui.untitled");

  const columns: SxColumn<TreeRow>[] = [
    { key: "name", header: t("sx.cpage.col.title"), primary: true, cell: (tr) => <TreeName tr={tr} t={t} /> },
    {
      key: "status",
      header: t("sx.cpage.col.status"),
      cell: (tr) => (
        <span className="sx-cp-dot" data-on={tr.row.node.isActive ? "" : undefined}>
          {labels.status(tr.row.node.isActive ? "active" : "inactive", "runtime")}
        </span>
      ),
    },
    {
      key: "updated",
      header: t("sx.layout.updated"),
      hideBelow: "md",
      cell: (tr) =>
        tr.rec?.updatedAt ? (
          <time className="sx-cp-when" dateTime={tr.rec.updatedAt} title={labels.dateTime(tr.rec.updatedAt)}>
            {updatedText(tr.rec.updatedAt, { labels, now })}
          </time>
        ) : (
          "—"
        ),
    },
    toolsColumn<TreeRow>(t, actionsOf, (tr) => tr.row.node.id, treeTitle),
  ];

  const statusOpts: SxOption[] = [
    { value: "", label: t("sx.cpage.filter.all") },
    { value: "active", label: labels.status("active", "runtime") },
    { value: "inactive", label: labels.status("inactive", "runtime") },
  ];
  const matched = rows.filter((r) => r.match).length;
  const loading = tree.phase === "loading" && !tree.nodes.length;
  const reset = (
    <SxButton variant="ghost" size="sm" icon={RotateCcwIcon} onClick={st.reset} aiId="admin.studio.list.reset">
      {t("sx.table.reset")}
    </SxButton>
  );
  const empty = filtered ? (
    <SxEmpty compact icon={SearchIcon} title={t("sx.table.noMatch")} action={reset} />
  ) : (
    <CtorEmpty
      code={CODE}
      group={group}
      title={t("sx.cp2.empty.title")}
      text={canEdit ? t("sx.cpage.emptyText", { name: labels.ctorName(CODE, ctor?.title) }) : t("sx.cp2.empty.textView")}
      action={canEdit ? createControl : undefined}
    />
  );
  const draftRows: RecordRow[] = drafts.map((rec) => ({ rec }));

  return (
    <div className="sx-cp" data-variant="k01" data-hue={hue}>
      <SxToolbar
        aiId="admin.studio.list.filters"
        search={{ value: st.query.q, onChange: st.setQ, placeholder: t("sx.cpage.searchPh"), label: t("sx.cpage.searchLabel"), aiId: "admin.studio.list.search.input" }}
        count={tree.phase === "ready" ? t("sx.layout.results", { n: labels.num(matched) }) : undefined}
        active={filtered}
        onReset={st.reset}
      >
        <Picker
          size="sm"
          label={t("sx.cpage.filter.status")}
          placeholder={t("sx.cpage.filter.status")}
          options={statusOpts}
          value={status}
          onChange={st.setStatus}
          searchable={false}
          leadingIcon={ListFilterIcon}
          aiId="admin.studio.list.filters.status"
        />
      </SxToolbar>
      {st.error ? <LoadError error={st.error} onRetry={() => void st.retry()} busy={st.retrying} compact /> : null}
      <SxPanel flush className="sx-cp-panel">
        <SxTable<TreeRow>
          caption={t("sx.cpage.tree.caption")}
          aiId="admin.studio.list.table"
          rows={rows}
          columns={columns}
          rowKey={(tr) => tr.row.node.id}
          rowHref={(tr) => (tr.rec ? recordHref(CODE, tr.rec.actions.view) || undefined : undefined)}
          rowTitle={treeTitle}
          rowTone={(tr) => (!tr.row.node.isActive || isTestTitle(tr.row.node.title) ? "muted" : undefined)}
          loading={loading}
          busy={tree.phase === "loading" && !!tree.nodes.length}
          empty={empty}
        />
      </SxPanel>
      {draftRows.length ? (
        <SxPanel flush title={t("sx.cpage.tree.drafts")} titleAs="h2" className="sx-cp-panel">
          <SxTable<RecordRow>
            caption={t("sx.cpage.tree.drafts")}
            aiId="admin.studio.list.drafts"
            rows={draftRows}
            columns={[
              ...genericColumns({ code: CODE, labels, t, now }),
              toolsColumn<RecordRow>(
                t,
                (r) => acts.actionsFor<RecordRow>(r.rec),
                (r) => `${r.rec.source}-${r.rec.id}`,
                (r) => rowTitle(r.rec) || t("sx.ui.untitled"),
                "admin.studio.list.drafts",
              ),
            ]}
            rowKey={(r) => `${r.rec.source}-${r.rec.id}`}
            rowHref={(r) => recordHref(CODE, r.rec.actions.view) || undefined}
            rowTitle={(r) => rowTitle(r.rec) || t("sx.ui.untitled")}
          />
        </SxPanel>
      ) : null}
      {acts.dialog}
    </div>
  );
}
