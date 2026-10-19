"use client";

import "../sx-core.css";
import "./sx-ctorpage.css";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { loadStudioReference, type StudioRecord } from "@/lib/services/studio";
import { GlobeIcon, LayersIcon, glyph } from "../icons";
import { sxStatus } from "../status";
import { StatusPill } from "../StatusPill";
import type { SxColumn, SxRowGroup } from "../layout/Table";
import type { StudioLabels, SxTranslate } from "../useStudioLabels";
import { promoJoinId, sortByPlacement, type PromoInfo } from "./promoRows";
import { isTestTitle, quietLast } from "./quiet";
import type { CtorRecord } from "./recordsApi";

export type RecordRow = { rec: CtorRecord; payload?: Readonly<Record<string, unknown>> | null; extra?: Readonly<Record<string, unknown>> };

export type VariantCtx = { code: string; labels: StudioLabels; t: SxTranslate; placements?: readonly string[]; now?: number };

export type CtorVariantKind = "generic" | "k31" | "k33" | "k34" | "k12promo";

export type CtorVariant = {
  kind: CtorVariantKind;
  columns: (ctx: VariantCtx) => readonly SxColumn<RecordRow>[];
  groupBy?: (ctx: VariantCtx) => ((row: RecordRow) => SxRowGroup) | undefined;
  needsPayload: boolean;
  sort?: (rows: readonly RecordRow[], ctx?: VariantCtx) => RecordRow[];
};

const SCOPE_SOURCE: Readonly<Record<string, string>> = {
  service: "/studio/reference/services",
  category: "/studio/reference/service-categories",
};
const REF_LIMIT = 100;
const refCache = new Map<string, Promise<ReadonlyMap<string, string>>>();

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const numOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const timeOf = (iso: string): number => {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
};

export function rowTitle(r: StudioRecord): string {
  return r.title.trim();
}

export function recTest(r: CtorRecord): boolean | null {
  return r.meta?.isTest ?? null;
}

export function isTestRow(r: CtorRecord): boolean {
  return recTest(r) ?? isTestTitle(r.title);
}

export function TestBadge({ t }: { t: SxTranslate }): ReactElement {
  return (
    <span className="sx-cp-tag sx-cp-tag--test" title={t("sx.cpage.testHint")}>
      {t("sx.cpage.test")}
    </span>
  );
}

export function compareVersions(a: string, b: string): number {
  const pa = str(a).replace(/^v/i, "").split(/[.\-_ ]+/);
  const pb = str(b).replace(/^v/i, "").split(/[.\-_ ]+/);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    const nx = /^\d+$/.test(x) ? Number(x) : null;
    const ny = /^\d+$/.test(y) ? Number(y) : null;
    if (nx !== null && ny !== null) {
      if (nx !== ny) return nx - ny;
      continue;
    }
    if (x === y) continue;
    if (!x) return -1;
    if (!y) return 1;
    return x.localeCompare(y);
  }
  return 0;
}

export function k31RuleKey(row: RecordRow): string {
  return str(row.payload?.rule_key) || rowTitle(row.rec);
}

function isActiveFlag(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

export function sortK31(rows: readonly RecordRow[]): RecordRow[] {
  const ordered = quietLast(rows, (r) => r.rec.title, (r) => r.rec.status, (r) => recTest(r.rec));
  const buckets = new Map<string, RecordRow[]>();
  for (const row of ordered) {
    const k = k31RuleKey(row);
    const list = buckets.get(k);
    if (list) list.push(row);
    else buckets.set(k, [row]);
  }
  const out: RecordRow[] = [];
  for (const [key, list] of buckets) {
    const byVersion = list
      .map((row, index) => ({ row, index }))
      .sort((a, b) => compareVersions(str(b.row.payload?.version), str(a.row.payload?.version)) || a.index - b.index)
      .map((x) => x.row);
    const current = byVersion.find((r) => isActiveFlag(r.payload?.is_active)) ?? null;
    const rest = current ? byVersion.filter((r) => r !== current) : byVersion;
    const final = current ? [current, ...rest] : rest;
    const groupTitle = rowTitle(final[0].rec) || key;
    for (const row of final) out.push({ ...row, extra: { ...row.extra, groupKey: key, groupTitle, groupSize: list.length, current: row === current } });
  }
  return out;
}

export function promoPlacementOf(row: RecordRow): string {
  return str((row.extra as Partial<PromoInfo> | undefined)?.placement);
}

export const K12_DELETED_GROUP = "__deleted";
const GONE_STATUSES: ReadonlySet<string> = new Set(["deleted", "removed"]);

function k12GroupOf(row: RecordRow, order: readonly string[]): string {
  const p = promoPlacementOf(row);
  if (order.includes(p)) return p;
  const status = (str((row.extra as Partial<PromoInfo> | undefined)?.status) || row.rec.status).toLowerCase();
  return GONE_STATUSES.has(status) ? K12_DELETED_GROUP : "";
}

export function sortK12(rows: readonly RecordRow[], order: readonly string[]): RecordRow[] {
  const ordered = quietLast(rows, (r) => r.rec.title, (r) => str((r.extra as Partial<PromoInfo> | undefined)?.status) || r.rec.status, (r) => recTest(r.rec));
  const placed = sortByPlacement(ordered, promoPlacementOf, order).map((row) => ({ row, key: k12GroupOf(row, order) }));
  const sorted = [...placed.filter((x) => x.key !== K12_DELETED_GROUP), ...placed.filter((x) => x.key === K12_DELETED_GROUP)];
  const sizes = new Map<string, number>();
  for (const { key } of sorted) sizes.set(key, (sizes.get(key) ?? 0) + 1);
  return sorted.map(({ row, key }) => ({ ...row, extra: { ...row.extra, groupKey: key, groupSize: sizes.get(key) ?? 0 } }));
}

export function joinPromoRows(rows: readonly RecordRow[], byId: ReadonlyMap<string, PromoInfo>): RecordRow[] {
  return rows.map((row) => {
    const info = byId.get(promoJoinId(row.rec));
    return info ? { ...row, extra: { ...row.extra, ...info } } : row;
  });
}

function loadRefLabels(source: string): Promise<ReadonlyMap<string, string>> {
  const hit = refCache.get(source);
  if (hit) return hit;
  const p = loadStudioReference(source, "", REF_LIMIT).then(
    (items) => new Map(items.flatMap((i) => [[i.value, i.label] as [string, string], [i.id, i.label] as [string, string]])),
    () => {
      refCache.delete(source);
      return new Map<string, string>();
    },
  );
  refCache.set(source, p);
  return p;
}

function ScopeName({ type, id, labels }: { type: string; id: string; labels: StudioLabels }): ReactElement {
  const source = SCOPE_SOURCE[type] ?? "";
  const [got, setGot] = useState<{ key: string; label: string } | null>(null);
  const key = `${source}|${id}`;
  useEffect(() => {
    if (!source || !id) return;
    let alive = true;
    void loadRefLabels(source).then((map) => {
      if (alive) setGot({ key, label: map.get(id) ?? "" });
    });
    return () => {
      alive = false;
    };
  }, [source, id, key]);
  const label = got && got.key === key ? got.label : "";
  return <span className="sx-cp-scope__name">{label || labels.unknownRef(id)}</span>;
}

function Skel(): ReactElement {
  return <span className="sx-sk sx-cp-sk" aria-hidden="true" />;
}

const DASH = "—";

function pcell(row: RecordRow, fn: (p: Readonly<Record<string, unknown>>) => ReactNode): ReactNode {
  if (row.payload === undefined) return <Skel />;
  if (row.payload === null) return DASH;
  const v = fn(row.payload);
  return v === "" || v === null || v === undefined ? DASH : v;
}

function TitleCell({ row, ctx, meta }: { row: RecordRow; ctx: VariantCtx; meta?: readonly ReactNode[] }): ReactElement {
  const r = row.rec;
  const title = rowTitle(r) || ctx.t("sx.ui.untitled");
  const parts: ReactNode[] = [];
  if (isTestRow(r)) parts.push(<TestBadge t={ctx.t} />);
  if (meta) parts.push(...meta);
  if (r.version) parts.push(ctx.t("sx.layout.version", { n: r.version }));
  if (r.owner) parts.push(r.owner);
  if (r.source === "runtime" && r.studioObjectId) parts.push(ctx.t("sx.cpage.hasDraft"));
  const shown = parts.filter((p) => p !== "" && p !== null && p !== undefined && p !== false);
  return (
    <span
      className="sx-cp-name"
      data-ai-id={aiIdOf("admin.studio.list.item", r.id)}
      data-ai-type="list_item"
      data-ai-entity-type={r.source === "studio" ? "studio_object" : "studio_runtime_record"}
      data-ai-entity-id={r.id}
      data-ai-label={title}
    >
      <StatusTile status={r.status} source={r.source} />
      <span className="sx-cp-name__body">
        <span className="sx-cp-name__t">{title}</span>
        {shown.length ? (
          <span className="sx-cp-name__m">
            {shown.map((p, i) => (
              <span key={i} className="sx-cp-name__part">
                {p}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function StatusTile({ status, source, size = "md" }: { status: string; source: StudioRecord["source"]; size?: "md" | "lg" }): ReactElement {
  const info = sxStatus(status, source);
  return (
    <span className="sx-cp-tile" data-tone={info.tone} data-size={size} aria-hidden="true">
      {glyph(info.icon, { size: size === "lg" ? 20 : 17 })}
    </span>
  );
}

export function updatedText(iso: string, ctx: Pick<VariantCtx, "labels" | "now">): string {
  return ctx.now ? ctx.labels.ago(iso, ctx.now) : ctx.labels.date(iso);
}

export function titleColumn(ctx: VariantCtx, meta?: (row: RecordRow) => readonly ReactNode[]): SxColumn<RecordRow> {
  return {
    key: "title",
    header: ctx.t("sx.cpage.col.title"),
    primary: true,
    cell: (row) => <TitleCell row={row} ctx={ctx} meta={meta?.(row)} />,
    sortValue: (row) => rowTitle(row.rec) || null,
  };
}

export function sourceColumn(ctx: VariantCtx): SxColumn<RecordRow> {
  return {
    key: "source",
    header: ctx.t("sx.cpage.col.source"),
    hideBelow: "md",
    cell: (row) => (
      <span className="sx-cp-src" data-src={row.rec.source}>
        {glyph(row.rec.source === "runtime" ? GlobeIcon : LayersIcon, { size: 14 })}
        {ctx.t(`sx.cpage.source.${row.rec.source}`)}
      </span>
    ),
  };
}

export function statusColumn(ctx: VariantCtx, hideBelow?: "md" | "lg"): SxColumn<RecordRow> {
  return {
    key: "status",
    header: ctx.t("sx.cpage.col.status"),
    hideBelow,
    cell: (row) => (row.rec.status ? <StatusPill status={row.rec.status} source={row.rec.source} size="sm" /> : DASH),
  };
}

export function updatedColumn(ctx: VariantCtx): SxColumn<RecordRow> {
  return {
    key: "updated",
    header: ctx.t("sx.layout.updated"),
    hideBelow: "md",
    cell: (row) =>
      row.rec.updatedAt ? (
        <time className="sx-cp-when" dateTime={row.rec.updatedAt} title={ctx.labels.dateTime(row.rec.updatedAt)}>
          {updatedText(row.rec.updatedAt, ctx)}
        </time>
      ) : (
        DASH
      ),
    sortValue: (row) => timeOf(row.rec.updatedAt) || null,
  };
}

export function genericColumns(ctx: VariantCtx): readonly SxColumn<RecordRow>[] {
  return [titleColumn(ctx), sourceColumn(ctx), statusColumn(ctx), updatedColumn(ctx)];
}

const GENERIC: CtorVariant = { kind: "generic", columns: genericColumns, needsPayload: false };

const K31: CtorVariant = {
  kind: "k31",
  needsPayload: true,
  columns: (ctx) => [
    titleColumn(ctx, (row) => [row.extra?.current === true ? <span className="sx-cp-tag">{ctx.t("sx.cpage.k31.current")}</span> : null]),
    {
      key: "version",
      header: ctx.t("sx.cpage.k31.version"),
      cell: (row) => pcell(row, (p) => (str(p.version) ? <span className="sx-code">{str(p.version)}</span> : "")),
    },
    {
      key: "scope",
      header: ctx.t("sx.cpage.k31.scope"),
      hideBelow: "md",
      cell: (row) =>
        pcell(row, (p) => {
          const type = str(p.scope_type);
          const id = str(p.scope_id);
          if (!type && !id) return "";
          return (
            <span className="sx-cp-scope">
              {type ? <span>{ctx.labels.option(type, { ctor: "K31", field: "scope_type" })}</span> : null}
              {id ? <ScopeName type={type} id={id} labels={ctx.labels} /> : null}
            </span>
          );
        }),
    },
    {
      key: "effective",
      header: ctx.t("sx.cpage.k31.effective"),
      hideBelow: "lg",
      cell: (row) => pcell(row, (p) => (str(p.effective_at) ? ctx.labels.dateTime(str(p.effective_at)) : "")),
    },
    statusColumn(ctx),
    updatedColumn(ctx),
  ],
  groupBy: (ctx) => (row) => {
    const key = str(row.extra?.groupKey) || k31RuleKey(row);
    const n = numOf(row.extra?.groupSize) ?? 1;
    const title = str(row.extra?.groupTitle) || rowTitle(row.rec);
    return { key: `k31:${key}`, title: title || ctx.t("sx.ui.untitled"), meta: ctx.t("sx.cpage.k31.versions", { n }) };
  },
  sort: (rows) => sortK31(rows),
};

const K33: CtorVariant = {
  kind: "k33",
  needsPayload: true,
  columns: (ctx) => [
    titleColumn(ctx),
    {
      key: "guarantees",
      header: ctx.t("sx.cpage.k33.guarantees"),
      numeric: true,
      cell: (row) => pcell(row, (p) => ctx.labels.num(listOf(p.guarantee_ids).length)),
    },
    {
      key: "placements",
      header: ctx.t("sx.cpage.k33.placements"),
      hideBelow: "md",
      cell: (row) => pcell(row, (p) => ctx.labels.list(listOf(p.placements).map((v) => ctx.labels.option(v, { ctor: "K33", field: "placements" })), 3)),
    },
    {
      key: "order",
      header: ctx.t("sx.cpage.k33.order"),
      numeric: true,
      hideBelow: "md",
      cell: (row) =>
        pcell(row, (p) => {
          const n = numOf(p.sort_order);
          return n === null ? "" : ctx.labels.num(n);
        }),
    },
    statusColumn(ctx),
    updatedColumn(ctx),
  ],
};

const K34: CtorVariant = {
  kind: "k34",
  needsPayload: true,
  columns: (ctx) => [
    titleColumn(ctx),
    {
      key: "type",
      header: ctx.t("sx.cpage.k34.type"),
      cell: (row) => pcell(row, (p) => (str(p.adjustment_type) ? ctx.labels.option(str(p.adjustment_type), { ctor: "K34", field: "adjustment_type" }) : "")),
    },
    {
      key: "value",
      header: ctx.t("sx.cpage.k34.value"),
      numeric: true,
      cell: (row) =>
        pcell(row, (p) => {
          const n = numOf(p.value);
          if (n === null) return "";
          return str(p.adjustment_type) === "percent" ? `${ctx.labels.num(n)}%` : ctx.labels.money(n);
        }),
    },
    statusColumn(ctx),
    updatedColumn(ctx),
  ],
};

function promoOf(row: RecordRow): Partial<PromoInfo> {
  return (row.extra ?? {}) as Partial<PromoInfo>;
}

const K12: CtorVariant = {
  kind: "k12promo",
  needsPayload: false,
  columns: (ctx) => [
    titleColumn(ctx, (row) => [row.rec.source === "studio" && row.rec.status ? ctx.labels.status(row.rec.status) : null]),
    {
      key: "days",
      header: ctx.t("sx.cpage.k12.days"),
      numeric: true,
      cell: (row) => {
        if (row.extra?.promoLoading) return <Skel />;
        const d = promoOf(row).days;
        return typeof d === "number" ? ctx.labels.days(d) : DASH;
      },
    },
    {
      key: "price",
      header: ctx.t("sx.cpage.k12.price"),
      numeric: true,
      cell: (row) => {
        if (row.extra?.promoLoading) return <Skel />;
        const p = promoOf(row);
        return typeof p.price === "number" ? ctx.labels.money(p.price, p.currency) : DASH;
      },
    },
    {
      key: "sale",
      header: ctx.t("sx.cpage.k12.sale"),
      cell: (row) => {
        if (row.extra?.promoLoading) return <Skel />;
        const info = promoOf(row);
        if (!info.id) return DASH;
        const s = str(info.status);
        return s ? <StatusPill status={s} source="runtime" size="sm" /> : DASH;
      },
    },
    updatedColumn(ctx),
  ],
  groupBy: (ctx) => (row) => {
    const key = str(row.extra?.groupKey);
    const n = numOf(row.extra?.groupSize) ?? 1;
    const title = key === K12_DELETED_GROUP ? ctx.labels.status("deleted", "runtime") : key ? ctx.labels.placement(key) : ctx.t("sx.layout.otherGroup");
    return { key: `k12:${key}`, title, meta: ctx.t("sx.cpage.k12.packages", { n }) };
  },
  sort: (rows, ctx) => sortK12(rows, ctx?.placements ?? []),
};

const VARIANTS: Readonly<Record<string, CtorVariant>> = { K31, K33, K34, "K12-PROMO": K12 };

export function variantOf(code: string): CtorVariant {
  return VARIANTS[String(code ?? "").trim().toUpperCase()] ?? GENERIC;
}
