"use client";

import { useCallback, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, errDetail, parseServerTime } from "@/lib/http";
import { shortDateTime } from "@/lib/date";
import { humanize, regionLabel } from "@/lib/labels";
import { minutesUntil, useCrmMeta } from "@/lib/crm/useCrm";
import { crmCode, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import type { BoardColumn } from "@/components/crm/leadQuery";

export const stageVars = (meta: CrmMeta): CSSProperties => Object.fromEntries(meta.statusInfo.filter((x) => x.color).map((x) => [`--s-${x.key}`, x.color])) as CSSProperties;

export const stageStyle = (key: string): CSSProperties => ({ ["--sc" as string]: `var(--s-${key}, var(--opx-ink-3))` }) as CSSProperties;

const SEED_TITLES: Record<string, string> = {
  new: "yangi",
  qualified: "ehtiyoj aniqlandi",
  proposal: "taklif yuborildi",
  decision_pending: "qaror kutilmoqda",
  won: "muvaffaqiyatli",
  rejected: "rad etildi",
};

const plain = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[‘’ʻʼ`]/g, "'");

const seedTitle = (key: string, title: string) => !title || plain(title) === key.replace(/[_-]+/g, " ").toLowerCase() || plain(title) === SEED_TITLES[key];

export function useStageLabel(meta: CrmMeta | null): (key: string) => string {
  const t = useTranslations("crm.status");
  return useCallback(
    (key: string) => {
      const info = meta?.statusInfo.find((x) => x.key === key);
      if (info && !seedTitle(key, info.title)) return info.title;
      if (t.has(key)) return t(key);
      return info?.title || t("other");
    },
    [t, meta],
  );
}

export function useStatusName(): (key: string) => string {
  const { meta } = useCrmMeta();
  return useStageLabel(meta);
}

const SLUG = /^[a-z0-9]+([_-][a-z0-9]+)*$/;
const keyOf = (s: string) =>
  plain(s)
    .replace(/'/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

const REGION_ALIAS: Record<string, string> = {
  tashkent: "tashkent_city",
  toshkent: "tashkent_city",
  toshkent_shahri: "tashkent_city",
  toshkent_sh: "tashkent_city",
  tashkent_region: "tashkent_region",
  toshkent_viloyati: "tashkent_region",
  samarqand: "samarkand",
  fargona: "fergana",
  buxoro: "bukhara",
  andijon: "andijan",
  qashqadaryo: "kashkadarya",
  surxondaryo: "surkhandarya",
  xorazm: "khorezm",
  jizzax: "jizzakh",
  navoiy: "navoi",
  sirdaryo: "syrdarya",
  qoraqalpogiston: "karakalpakstan",
};
const REGION_TAIL = /_(viloyati|vil|region|oblast|shahri|city|respublikasi)$/;

export function useRegionName(): (value: string) => string {
  const te = useTranslations("enums");
  const tx = useTranslations("admin.ccx.crm");
  return useCallback(
    (value: string) => {
      const s = (value || "").trim();
      if (!s) return "";
      const k = keyOf(s);
      for (const c of [k, REGION_ALIAS[k], k.replace(REGION_TAIL, ""), REGION_ALIAS[k.replace(REGION_TAIL, "")]]) {
        if (c && tx.has(`region.${c}`)) return tx(`region.${c}`);
      }
      const got = regionLabel(te, s);
      return got === s && SLUG.test(s) ? humanize(s) : got;
    },
    [te, tx],
  );
}

export function useCategoryName(): (value: string) => string {
  const tp = useTranslations("admin.pipeline");
  const tx = useTranslations("admin.ccx.crmLeads");
  return useCallback(
    (value: string) => {
      const s = (value || "").trim();
      if (!s) return "";
      const k = keyOf(s);
      if (tx.has(`cat.${k}`)) return tx(`cat.${k}`);
      if (tp.has(`categories.${k}`)) return tp(`categories.${k}`);
      return SLUG.test(s) ? humanize(s) : s;
    },
    [tp, tx],
  );
}

export function useCrmErr(): (e: unknown) => string {
  const t = useTranslations("crm.err");
  return useCallback(
    (e: unknown) => {
      const code = crmCode(e);
      if (code && t.has(code)) return t(code);
      if (e instanceof ApiError && e.status >= 500) return t("generic");
      return errDetail(e) || t("generic");
    },
    [t],
  );
}

export type WhenTone = "bad" | "soon" | "";
export type When = { text: string; tone: WhenTone };

export function useWhen(): (at: string, now: number) => When | null {
  const t = useTranslations("crm.when");
  return useCallback(
    (at: string, now: number) => {
      const m = minutesUntil(at, now);
      if (m === null) return null;
      const abs = Math.abs(m);
      const span = abs < 60 ? t("min", { n: abs }) : abs < 60 * 48 ? t("h", { n: Math.round(abs / 60) }) : t("d", { n: Math.round(abs / 1440) });
      const tone: WhenTone = m < 0 ? "bad" : m <= 60 ? "soon" : "";
      return { text: m < 0 ? t("overdue", { span }) : abs < 1 ? t("now") : t("in", { span }), tone };
    },
    [t],
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function useDayTime(): (at: string, now: number, compact?: boolean) => string {
  const t = useTranslations("admin.ccx.crmLeads");
  const locale = useLocale();
  return useCallback(
    (at: string, now: number, compact = false) => {
      const ms = parseServerTime(at);
      if (!Number.isFinite(ms)) return "";
      const d = new Date(ms);
      const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (!now) return shortDateTime(d.toISOString(), locale);
      const diff = Math.round((dayStart(d) - dayStart(new Date(now))) / 86_400_000);
      if (diff === 0) return compact ? time : t("today", { time });
      if (diff === -1) return t("yesterday", { time });
      if (diff === 1) return t("tomorrow", { time });
      return shortDateTime(d.toISOString(), locale);
    },
    [t, locale],
  );
}

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

export const shortName = (name: string): string => {
  const [a = "", b = ""] = name.trim().split(/\s+/);
  return b ? `${a} ${b[0].toUpperCase()}.` : a;
};

export const fromLocalInput = (v: string): string => (v ? new Date(v).toISOString() : "");

export const localInputOf = (ms: number): string => {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const dialOf = (phone: string): string => phone.replace(/[^\d+]/g, "");

export function moveLocal(cols: BoardColumn[], leadId: string, col: string, position: number, saved?: CrmLead): BoardColumn[] {
  const lead = saved ?? cols.flatMap((c) => c.items).find((x) => x.id === leadId);
  if (!lead || !cols.some((c) => c.status === col)) return cols;
  const moved = { ...lead, status: col };
  return cols.map((c) => {
    const had = c.items.some((x) => x.id === leadId);
    const items = c.items.filter((x) => x.id !== leadId);
    if (c.status !== col) return had ? { ...c, items, total: Math.max(0, c.total - 1) } : c;
    items.splice(Math.max(0, Math.min(items.length, position)), 0, moved);
    return { ...c, items, total: c.total + (had ? 0 : 1) };
  });
}

export function idleOf(c: BoardColumn, now: number): number | null {
  let worst: number | null = null;
  for (const l of c.items) {
    const m = minutesUntil(l.updatedAt || l.createdAt, now);
    if (m === null) continue;
    const idle = -m;
    if (idle > 0 && (worst === null || idle > worst)) worst = idle;
  }
  return worst;
}

export function cardBelow(col: HTMLElement, y: number, dragId: string): string | null {
  for (const el of col.querySelectorAll<HTMLElement>("[data-card-id]")) {
    if (el.dataset.cardId === dragId) continue;
    const r = el.getBoundingClientRect();
    if (y < r.top + r.height / 2) return el.dataset.cardId ?? null;
  }
  return null;
}
