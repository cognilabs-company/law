"use client";

import type { ReactElement, ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtNum, shortDateTime } from "@/lib/date";
import type { DetailItem, DetailSection } from "@/lib/services/crm";

// The backend's readable view of a record (CRM contract 2026-10-27 §10):
// sections of labelled values — never raw JSON. The backend's display_value
// is shown as given (gaps closed 2026-10-28 §18) and datetimes are formatted
// in the user's locale; an item without one is still translated, formatted
// or left out here, and ids or internal bookkeeping never show.

const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
// Keys that are internal ids or bookkeeping, never a person's business.
const HIDDEN_KEY = /(^|_)(id|ids|uuid|user_id|token|idempotency_key|lock_version)$|^(kanban|raw|debug|meta|internal)$/;
const KEEP_ID = new Set(["crm_id", "work_id", "public_id", "lexgo_id"]);
const hiddenKey = (k: string) => !KEEP_ID.has(k) && HIDDEN_KEY.test(k);

function useValue() {
  const t = useTranslations("crm.detail");
  const ts = useTranslations("crm.status");
  const tsc = useTranslations("crm.score");
  const tl = useTranslations("crm.lang");
  const tu = useTranslations("crm.newLead.urg");
  const tsrc = useTranslations("crm.source");
  const locale = useLocale();
  // A coded value under a known key reads as words; an unknown code is left out.
  const coded: Record<string, (v: string) => string> = {
    status: (v) => (ts.has(v) ? ts(v) : t.has(`status.${v}`) ? t(`status.${v}`) : ""),
    score: (v) => (tsc.has(v) ? tsc(v) : ""),
    preferred_language: (v) => (tl.has(v) ? tl(v) : ""),
    language: (v) => (tl.has(v) ? tl(v) : ""),
    urgency: (v) => (tu.has(v) ? tu(v) : ""),
    source: (v) => (tsrc.has(v) ? tsrc(v) : tsrc("other")),
  };
  const format = (key: string, type: DetailItem["type"], value: unknown): ReactNode => {
    if (value === null || value === undefined || value === "") return null;
    if (type === "boolean" || typeof value === "boolean") return <span className="crm-yn" data-yes={value === true || undefined}>{value === true ? t("yes") : t("no")}</span>;
    if (type === "number" || typeof value === "number") return <span className="sx-num">{fmtNum(Number(value), locale)}</span>;
    const s = String(value).trim();
    if (!s || UUIDISH.test(s)) return null;
    if (type === "datetime" || ISO.test(s)) return shortDateTime(s, locale);
    const map = coded[key];
    if (map) return map(s) || null;
    // A bare code under an unknown key ("ai_classify") is not for people.
    if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(s)) return null;
    return s;
  };
  return format;
}

function useLabel() {
  const t = useTranslations("crm.detail.f");
  return (key: string, given: string) => (t.has(key) ? t(key) : given || "");
}

function Items({ items, depth }: { items: DetailItem[]; depth: number }): ReactElement | null {
  const value = useValue();
  const label = useLabel();
  const rows = items
    .filter((it) => !hiddenKey(it.key))
    .map((it) => {
      if (it.type === "group") {
        const inner = <Items items={it.items} depth={depth + 1} />;
        return { it, node: inner, group: true };
      }
      if (it.type === "list") {
        const chips = it.items.length
          ? it.items.map((x) => (x.items.length ? null : x.type !== "datetime" && x.display ? x.display : value(x.key, x.type, x.value))).filter(Boolean)
          : Array.isArray(it.value)
            ? (it.value as unknown[]).map((x) => value(it.key, "text", x)).filter(Boolean)
            : [];
        const nested = it.items.filter((x) => x.items.length);
        return {
          it,
          group: false,
          node:
            chips.length || nested.length ? (
              <span className="crm-dl__chips">
                {chips.map((c, i) => (
                  <i key={i}>{c}</i>
                ))}
                {nested.map((x, i) => (
                  <span key={`n${i}`} className="crm-dl__nested">
                    <Items items={x.items} depth={depth + 1} />
                  </span>
                ))}
              </span>
            ) : null,
        };
      }
      return { it, group: false, node: it.type !== "datetime" && it.display ? it.display : value(it.key, it.type, it.value) };
    })
    .filter((r) => r.node !== null && r.node !== undefined && (r.it.label || label(r.it.key, "")));
  if (!rows.length) return null;
  return (
    <dl className="crm-dl" data-depth={depth}>
      {rows.map(({ it, node, group }) => (
        <div key={it.key} data-group={group || undefined}>
          <dt>{label(it.key, it.label)}</dt>
          <dd>{node}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailSections({ sections, only, compact }: { sections: DetailSection[]; only?: readonly string[]; compact?: boolean }): ReactElement | null {
  const t = useTranslations("crm.detail");
  const shown = sections.filter((s) => !only || only.includes(s.key));
  if (!shown.length) return null;
  return (
    <div className="crm-dsec" data-compact={compact || undefined}>
      {shown.map((s) => {
        const body = <Items items={s.items} depth={0} />;
        return (
          <section key={s.key} className="crm-dsec__card" aria-label={t.has(`sec.${s.key}`) ? t(`sec.${s.key}`) : s.title}>
            <h4>{t.has(`sec.${s.key}`) ? t(`sec.${s.key}`) : s.title}</h4>
            {body}
          </section>
        );
      })}
    </div>
  );
}

// Any loose object (an activity's payload) as the same readable list: keys
// become labels, values are formatted, ids and internals are left out.
export function treeOf(v: unknown, key = ""): DetailItem {
  if (Array.isArray(v)) return { key, label: "", type: "list", value: null, display: "", items: v.map((x, i) => treeOf(x, `${key}_${i}`)) };
  if (v && typeof v === "object") return { key, label: "", type: "group", value: null, display: "", items: Object.entries(v as Record<string, unknown>).map(([k, x]) => treeOf(x, k)) };
  const type: DetailItem["type"] = typeof v === "boolean" ? "boolean" : typeof v === "number" ? "number" : "text";
  return { key, label: "", type, value: v, display: "", items: [] };
}
const humanKey = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
function labelTree(it: DetailItem): DetailItem {
  return { ...it, label: it.label || humanKey(it.key), items: it.items.map(labelTree) };
}
export function PayloadDetails({ payload }: { payload: Record<string, unknown> }): ReactElement | null {
  const root = labelTree(treeOf(payload));
  if (!root.items.length) return null;
  return <Items items={root.items} depth={0} />;
}

// Whether a payload has anything a person would read once ids, internals
// and bare codes are left out — so an empty "Details" never shows.
export function hasReadable(v: unknown, key = ""): boolean {
  if (key && hiddenKey(key)) return false;
  if (Array.isArray(v)) return v.some((x) => hasReadable(x));
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>).some(([k, x]) => hasReadable(x, k));
  if (typeof v === "number" || typeof v === "boolean") return true;
  const s = String(v ?? "").trim();
  return !!s && !UUIDISH.test(s) && !/^[a-z0-9]+(_[a-z0-9]+)+$/.test(s);
}
