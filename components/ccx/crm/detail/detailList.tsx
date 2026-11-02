"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtNum, shortDateTime } from "@/lib/date";
import type { DetailItem, DetailSection } from "@/lib/services/crm";
import { useRegionName, useStatusName } from "../leads/util";

const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const HIDDEN_KEY = /(^|_)(id|ids|uuid|user_id|token|idempotency_key|lock_version)$|^(kanban|raw|debug|meta|internal)$/;
const KEEP_ID = new Set(["crm_id", "work_id", "public_id", "lexgo_id"]);
const CODE = /^[a-z0-9]+(_[a-z0-9]+)+$/;
const hiddenKey = (k: string) => !KEEP_ID.has(k) && HIDDEN_KEY.test(k);

function useValue() {
  const t = useTranslations("crm.detail");
  const tc = useTranslations("crm.customer");
  const ts = useTranslations("crm.side");
  const stl = useStatusName();
  const regionName = useRegionName();
  const tsc = useTranslations("crm.score");
  const tl = useTranslations("admin.ccx.crm.lang");
  const tu = useTranslations("crm.newLead.urg");
  const tsrc = useTranslations("crm.source");
  const locale = useLocale();
  const coded: Record<string, (v: string) => string> = {
    status: (v) => (t.has(`status.${v}`) ? t(`status.${v}`) : stl(v)),
    score: (v) => (tsc.has(v) ? tsc(v) : ""),
    preferred_language: (v) => (tl.has(v) ? tl(v) : ""),
    language: (v) => (tl.has(v) ? tl(v) : ""),
    urgency: (v) => (tu.has(v) ? tu(v) : ""),
    source: (v) => (tsrc.has(v) ? tsrc(v) : tsrc("other")),
    region: (v) => regionName(v),
    lifecycle: (v) => (tc.has(`life.${v}`) ? tc(`life.${v}`) : ""),
    lexgo_user: (v) => (/lexgo/i.test(v) ? tc("linked") : tc("notLinked")),
    assigned_operator: (v) => (/^biriktirilmagan$/i.test(v) ? ts("unassigned") : v),
  };
  const renderValue = (key: string, type: DetailItem["type"], value: unknown): ReactNode => {
    if (value === null || value === undefined || value === "") return null;
    if (type === "boolean" || typeof value === "boolean")
      return (
        <span className="opx-cd-yn" data-yes={value === true || undefined}>
          {value === true ? t("yes") : t("no")}
        </span>
      );
    if (type === "number" || typeof value === "number") return <span className="opx-num">{fmtNum(Number(value), locale)}</span>;
    const s = String(value).trim();
    if (!s || UUIDISH.test(s)) return null;
    if (type === "datetime" || ISO.test(s)) return shortDateTime(s, locale);
    const map = coded[key];
    if (map) return map(s) || null;
    if (CODE.test(s)) return null;
    return s;
  };
  const shown = (it: DetailItem): ReactNode => {
    const own = it.type === "datetime" || it.type === "boolean" || it.type === "number" || !!coded[it.key];
    if (own) return renderValue(it.key, it.type, it.value) ?? (it.type === "datetime" || it.type === "boolean" ? null : it.display || null);
    return it.display ? it.display : renderValue(it.key, it.type, it.value);
  };
  return { value: renderValue, shown };
}

function useLabel() {
  const t = useTranslations("crm.detail.f");
  const tx = useTranslations("admin.ccx.crmDetail.f");
  return (key: string, given: string) => (t.has(key) ? t(key) : tx.has(key) ? tx(key) : given || "");
}

type Row = { it: DetailItem; node: ReactNode; group: boolean };

function Items({ items, depth }: { items: DetailItem[]; depth: number }) {
  const { value, shown } = useValue();
  const label = useLabel();
  const rows: Row[] = items
    .filter((it) => !hiddenKey(it.key))
    .map((it): Row => {
      if (it.type === "group") return { it, group: true, node: <Items items={it.items} depth={depth + 1} /> };
      if (it.type === "list") {
        const chips = it.items.length
          ? it.items.map((x) => (x.items.length ? null : shown(x))).filter(Boolean)
          : Array.isArray(it.value)
            ? (it.value as unknown[]).map((x) => value(it.key, "text", x)).filter(Boolean)
            : [];
        const nested = it.items.filter((x) => x.items.length);
        return {
          it,
          group: false,
          node:
            chips.length || nested.length ? (
              <span className="opx-cd-dl__chips">
                {chips.map((c, i) => (
                  <i key={i}>{c}</i>
                ))}
                {nested.map((x, i) => (
                  <span key={`n${i}`} className="opx-cd-dl__nested">
                    <Items items={x.items} depth={depth + 1} />
                  </span>
                ))}
              </span>
            ) : null,
        };
      }
      return { it, group: false, node: shown(it) };
    })
    .filter((r) => r.node !== null && r.node !== undefined && (r.it.label || label(r.it.key, "")));
  if (!rows.length) return null;
  return (
    <dl className="opx-cd-dl" data-depth={depth}>
      {rows.map(({ it, node, group }) => (
        <div key={it.key} data-group={group || undefined}>
          <dt>{label(it.key, it.label)}</dt>
          <dd>{node}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailBlocks({ sections, only, bare }: { sections: DetailSection[]; only?: readonly string[]; bare?: boolean }) {
  const t = useTranslations("crm.detail");
  const shown = sections.filter((s) => !only || only.includes(s.key));
  if (!shown.length) return null;
  return (
    <div className="opx-cd-dsec">
      {shown.map((s) => {
        const title = t.has(`sec.${s.key}`) ? t(`sec.${s.key}`) : s.title;
        return (
          <section key={s.key} className="opx-cd-dsec__blk" aria-label={title}>
            {bare ? null : <h4>{title}</h4>}
            <Items items={s.items} depth={0} />
          </section>
        );
      })}
    </div>
  );
}

function treeOf(v: unknown, key = ""): DetailItem {
  if (Array.isArray(v)) return { key, label: "", type: "list", value: null, display: "", items: v.map((x, i) => treeOf(x, `${key}_${i}`)) };
  if (v && typeof v === "object") return { key, label: "", type: "group", value: null, display: "", items: Object.entries(v as Record<string, unknown>).map(([k, x]) => treeOf(x, k)) };
  const type: DetailItem["type"] = typeof v === "boolean" ? "boolean" : typeof v === "number" ? "number" : "text";
  return { key, label: "", type, value: v, display: "", items: [] };
}

const humanKey = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function labelTree(it: DetailItem): DetailItem {
  return { ...it, label: it.label || humanKey(it.key), items: it.items.map(labelTree) };
}

export function PayloadList({ payload }: { payload: Record<string, unknown> }) {
  const root = labelTree(treeOf(payload));
  if (!root.items.length) return null;
  return <Items items={root.items} depth={0} />;
}

export function hasReadable(v: unknown, key = ""): boolean {
  if (key && hiddenKey(key)) return false;
  if (Array.isArray(v)) return v.some((x) => hasReadable(x));
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>).some(([k, x]) => hasReadable(x, k));
  if (typeof v === "number" || typeof v === "boolean") return true;
  const s = String(v ?? "").trim();
  return !!s && !UUIDISH.test(s) && !CODE.test(s);
}
