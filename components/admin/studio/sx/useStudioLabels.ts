"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dateOnly, dateTimeFull, fmtAge, fmtInt, fmtNum, MINUS } from "@/lib/date";
import { findStudioConstructor, studioReferenceKey, type StudioReferenceItem } from "@/lib/services/studio";
import { ctorMeta } from "@/lib/studio/constructors";
import { HELP_RULES, normText, SECTION_IDS, SURFACE_IDS, SURFACE_TITLE_IDS, WARN_IDS } from "@/lib/studio/humanText";
import {
  BriefcaseBusinessIcon,
  CrownIcon,
  CTOR_ICON,
  ctorIcon,
  FileTextIcon,
  ListChecksIcon,
  MegaphoneIcon,
  PLACEMENT_ICON,
  ScrollTextIcon,
  BadgeCheckIcon,
  sourceIcon,
  SOURCE_ICON,
  NetworkIcon,
  CircleUserIcon,
  UserCogIcon,
} from "./icons";
import { ctorVariant, fieldPath, isEnglishLooking, scopedKeys, splitCodeLabel, splitUserLabel } from "./labels";
import { normStatus, statusKeyOf } from "./status";
import type { SxLocale, SxNameCode, SxOption, SxRecordSource, SxRule, SxScope } from "./types";

export type StudioLabels = {
  locale: SxLocale;
  ctorName(code: string, backendTitle?: string): string;
  ctorWhat(code: string, backend?: { purpose?: string; description?: string }): string;
  groupName(key: string, backendTitle?: string): string;
  groupWhat(key: string, backendDescription?: string): string;
  journeyName(key: string, backendTitle?: string): string;
  journeyWhat(key: string, backendDescription?: string): string;
  section(key: string, backendTitle?: string): string;
  status(raw: string, source?: SxRecordSource): string;
  statusPill(raw: string, source?: SxRecordSource): string;
  statusHint(raw: string, source?: SxRecordSource): string;
  stepDecision(raw: string): string;
  role(code: string, backendLabel?: string): string;
  permission(code: string, backendLabel?: string): string;
  plan(slug: string, backendLabel?: string): string;
  audience(value: string): string;
  tier(code: string): string;
  promoPackage(code: string, backendTitle?: string): string;
  placement(key: string, backendLabel?: string): string;
  placementWhat(key: string): string;
  surface(key: string): string;
  page(s: { title: string; placement: string }): { title: string; what: string };
  warning(text: string): string;
  risk(level: string): string;
  currency(code?: string): string;
  field(key: string, scope?: SxScope): string;
  help(key: string, scope?: SxScope): string;
  placeholder(key: string, scope?: SxScope & { type?: string }): string;
  option(value: string, scope?: SxScope & { field?: string }): string;
  error(token: string, rule?: SxRule): string;
  hint(rule: SxRule): string;
  display(value: unknown, rule?: SxRule): string;
  refOption(source: string, item: StudioReferenceItem): SxOption;
  unknownRef(value: string): string;
  splitCodeLabel(label: string): SxNameCode;
  num(n: number): string;
  money(n: number, currency?: string): string;
  days(n: number): string;
  date(iso: string): string;
  dateTime(iso: string): string;
  ago(iso: string, now: number): string;
  list(items: readonly string[], max?: number): string;
};

export type SxTranslate = {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
  raw(key: string): unknown;
};

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.keys(CTOR_ICON));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HELP_JARGON = /konfiguratsiya|runtime|vaqt zonasi|\breal\b|uzsda|reference|\bapi\b|payload|json|kalit|slug|obyekt|backend|endpoint|\bid\b|identifikator|sxema|parametr|token|webhook|\bkey\b|`/i;
const HELP_TEMPLATES: readonly RegExp[] = [
  /^bu element nima berishini oddiy foydalanuvchi tushunadigan qilib yozing\.?$/,
  /^(.+ )?matnini foydalanuvchiga tayyor ko'rinishda yozing\.?$/,
  /^ushbu qoida amal qiladigan rollarni tanlang\.?$/,
  /^qoida amal qiladigan hududlarni kiriting\.?$/,
  /^ishlash (boshlanadigan|tugaydigan) sana va vaqtni belgilang\.?$/,
  /^foydalanuvchi to'ldiradigan maydonlarni hujjatdagi tartibda qo'shing\.?$/,
  /^maydonlarni foydalanuvchiga ko'rinadigan mantiqiy bosqichlarga ajrating\.?$/,
  /^element ko'rinadigan xizmat kategoriyasini tanlang\.?$/,
  /^kontent ko'rsatiladigan asosiy tilni tanlang\.?$/,
  /^jarayon bosqichlarini bajarilish tartibida qo'shing\.?$/,
  /^qaysi statusdan qaysi statusga o'tish mumkinligini belgilang\.?$/,
];
const WHAT_JARGON = /`|runtime|konfiguratsiya/i;
const TEXT_TYPES: ReadonlySet<string> = new Set(["text", "textarea", "richtext", "url", "email", "code", "string"]);
const PICK_TYPES: ReadonlySet<string> = new Set(["select", "multiselect"]);
const NUM_TYPES: ReadonlySet<string> = new Set(["number", "money", "integer", "decimal"]);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_STAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const VERSION_TAIL = /\s+v\d+(?:\.\d+)*\s*$/i;

const own = Object.prototype.hasOwnProperty;
const lookup = (map: Readonly<Record<string, string>>, key: string): string => (key && own.call(map, key) ? map[key] : "");
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const numOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const joinDot = (parts: readonly string[]): string => parts.filter(Boolean).join(" · ");

export function buildStudioLabels(t: SxTranslate, rawLocale: string): StudioLabels {
  const locale: SxLocale = rawLocale === "ru" || rawLocale === "en" ? rawLocale : "uz";
  const isUz = locale === "uz";

  const ok = (key: string): boolean => {
    if (!key || key.endsWith(".") || key.includes("..")) return false;
    try {
      if (!t.has(key)) return false;
      const raw = t.raw(key);
      return typeof raw === "string" && raw.length > 0;
    } catch {
      return false;
    }
  };
  const firstKey = (keys: readonly (string | false | null | undefined)[]): string => {
    for (const k of keys) if (k && ok(k)) return k;
    return "";
  };
  const tr = (key: string, values?: Record<string, string | number>): string => {
    try {
      return t(key, values);
    } catch {
      return "";
    }
  };
  const pick = (keys: readonly (string | false | null | undefined)[], values?: Record<string, string | number>): string => {
    const k = firstKey(keys);
    return k ? tr(k, values) : "";
  };
  const vocab = (backend: string | undefined, key?: string): string => {
    const b = str(backend);
    return b && !isEnglishLooking(b, key) ? b : "";
  };

  const num = (n: number): string => {
    if (!finite(n)) return "";
    if (Number.isInteger(n)) return fmtInt(n, locale);
    return fmtNum(n, locale, 6).replace(MINUS, "-");
  };
  const currency = (code?: string): string => {
    const c = str(code).toUpperCase() || "UZS";
    if (c === "UZS") return pick(["sx.ui.currencyUZS"]) || "UZS";
    return c;
  };
  const money = (n: number, cur?: string): string => (finite(n) ? `${num(n)} ${currency(cur)}` : "");
  const days = (n: number): string => (finite(n) ? tr("sx.ui.days", { n }) : "");
  const list = (items: readonly string[], max = 3): string => {
    const clean = items.map((s) => str(s)).filter(Boolean);
    const cap = Math.max(1, Math.floor(max) || 1);
    if (clean.length <= cap) return clean.join(", ");
    return `${clean.slice(0, cap).join(", ")} ${tr("sx.ui.andMore", { n: clean.length - cap })}`;
  };
  const unknownRef = (value: string): string => {
    const v = str(value);
    return UUID.test(v) ? pick(["sx.form.unknownRef"]) || v : v;
  };
  const split = (label: string): SxNameCode => splitCodeLabel(label, KNOWN_CODES);
  const variantKeys = (c: string, part: "name" | "what"): string[] => {
    if (!c) return [];
    const v = ctorVariant(c, (findStudioConstructor(c) ?? findStudioConstructor(c.toUpperCase()))?.runtimeTarget ?? "");
    return v ? [`sx.ctor.${c}__${v}.${part}`, `sx.ctor.${c.toUpperCase()}__${v}.${part}`] : [];
  };

  const ctorName = (code: string, backendTitle?: string): string => {
    const c = str(code);
    const hit = pick([...variantKeys(c, "name"), `sx.ctor.${c}.name`, `sx.ctor.${c.toUpperCase()}.name`]);
    if (hit) return hit;
    const name = vocab(split(backendTitle ?? "").name);
    return name || c;
  };
  const ctorWhat = (code: string, backend?: { purpose?: string; description?: string }): string => {
    const c = str(code);
    const hit = pick([...variantKeys(c, "what"), `sx.ctor.${c}.what`, `sx.ctor.${c.toUpperCase()}.what`]);
    if (hit) return hit;
    const ik = c ? ctorMeta(c).i18nKey : "";
    const legacy = ik ? pick([`ctor.${ik}.desc`]) : "";
    if (legacy) return legacy;
    if (isUz && backend) {
      for (const s of [backend.purpose, backend.description]) {
        const v = str(s);
        if (v && !isEnglishLooking(v) && !WHAT_JARGON.test(v)) return v;
      }
    }
    return "";
  };
  const groupName = (key: string, backendTitle?: string): string => {
    const k = str(key);
    return pick([`sx.group.${k}.name`, `human.group.${k}.title`]) || vocab(backendTitle, k) || k;
  };
  const groupWhat = (key: string, backendDescription?: string): string => {
    const k = str(key);
    return pick([`sx.group.${k}.what`, `human.group.${k}.text`]) || vocab(backendDescription, k);
  };
  const journeyName = (key: string, backendTitle?: string): string => {
    const k = str(key);
    return pick([`sx.journey.${k}.name`, `human.journey.${k}.title`]) || vocab(backendTitle, k) || k;
  };
  const journeyWhat = (key: string, backendDescription?: string): string => {
    const k = str(key);
    return pick([`sx.journey.${k}.what`, `human.journey.${k}.text`]) || vocab(backendDescription, k);
  };
  const section = (key: string, backendTitle?: string): string => {
    const k = str(key);
    const title = str(backendTitle);
    const id = lookup(SECTION_IDS, normText(title));
    return pick([`sx.section.${k}`, id && `human.section.${id}`]) || title || k;
  };

  const status = (raw: string, source?: SxRecordSource): string => {
    const key = statusKeyOf(raw, source);
    const n = normStatus(raw);
    return pick([key !== "unknown" && `sx.status.${key}.label`, n && `flow.rstatus.${n}`, n && `status.${n}`, n && `option.${n}`]) || str(raw) || pick(["sx.ui.notSet"]);
  };
  const statusPill = (raw: string, source?: SxRecordSource): string =>
    (statusKeyOf(raw, source) === "published" && pick(["sx.status.published.live"])) || status(raw, source);
  const statusHint = (raw: string, source?: SxRecordSource): string => {
    const key = statusKeyOf(raw, source);
    return key === "unknown" ? "" : pick([`sx.status.${key}.hint`]);
  };
  const stepDecision = (raw: string): string => {
    const n = normStatus(raw);
    return pick([n && `stepStatus.${n}`]) || status(raw);
  };

  const role = (code: string, backendLabel?: string): string => {
    const c = str(code);
    const lc = c.toLowerCase();
    return pick([`sx.role.${c}`, `sx.role.${lc}`, `roles.${c}`, `roles.${lc}`, lc && `roles.studio_${lc}`]) || vocab(backendLabel, c) || c;
  };
  const permission = (code: string, backendLabel?: string): string => {
    const c = str(code);
    return pick([c && `perm.${c.replace(/\./g, "__")}`]) || vocab(backendLabel, c) || c;
  };
  const plan = (slug: string, backendLabel?: string): string => {
    const s = str(slug);
    return pick([`sx.plan.${s}`]) || str(backendLabel) || s;
  };
  const audience = (value: string): string => {
    const v = str(value);
    return pick([`sx.audience.${v}`]) || v;
  };
  const tier = (code: string): string => {
    const c = str(code);
    return pick([`sx.tier.${c.toUpperCase()}`, `sx.tier.${c}`]) || c;
  };
  const promoPackage = (code: string, backendTitle?: string): string => {
    const c = str(code);
    return pick([`sx.promo.${c}`]) || str(backendTitle) || c;
  };
  const placement = (key: string, backendLabel?: string): string => {
    const k = str(key);
    return pick([`sx.placement.${k}.name`]) || str(backendLabel) || k;
  };
  const placementWhat = (key: string): string => pick([`sx.placement.${str(key)}.what`]);
  const surface = (key: string): string => {
    const k = str(key);
    return pick([`sx.surface.${k}`]) || k;
  };
  const page = (s: { title: string; placement: string }): { title: string; what: string } => {
    const title = str(s?.title);
    const where = str(s?.placement);
    const id = lookup(SURFACE_IDS, normText(`${title}|${where}`)) || lookup(SURFACE_TITLE_IDS, normText(title));
    if (id) {
      const own = pick([`human.surface.${id}.title`]);
      if (own) return { title: own, what: pick([`human.surface.${id}.what`]) };
    }
    return { title, what: isUz ? where : "" };
  };
  const warning = (text: string): string => {
    const v = str(text);
    const id = lookup(WARN_IDS, normText(v));
    return pick([id && `human.warn.${id}`]) || (isUz ? v : "");
  };
  const risk = (level: string): string => pick([`sx.risk.${str(level).toLowerCase()}`, "sx.risk.medium"]);

  const fieldKeys = (base: string, k: string, scope?: SxScope): string[] => {
    const keys = scopedKeys(base, k, scope);
    const ctor = str(scope?.ctor);
    const path = str(scope?.path);
    if (!ctor || !k || !/[.[]/.test(path) || fieldPath(path) === k) return keys;
    const flat = `${base}.${ctor}__${k}`;
    return keys.filter((x) => x !== flat);
  };
  const field = (key: string, scope?: SxScope): string => {
    const k = str(key);
    return pick([...fieldKeys("sx.field", k, scope), k && `field.${k}`]) || vocab(scope?.backend, k) || k;
  };
  const help = (key: string, scope?: SxScope): string => {
    const k = str(key);
    const hit = pick([...fieldKeys("sx.help", k, scope), k && `fieldHelp.${k}`]);
    if (hit) return hit;
    const raw = str(scope?.backend);
    if (!isUz || !raw) return "";
    const n = normText(raw);
    if (HELP_RULES.some(([, rx]) => rx.test(n))) return "";
    if (HELP_TEMPLATES.some((rx) => rx.test(n))) return "";
    return HELP_JARGON.test(raw) ? "" : raw;
  };
  const placeholder = (key: string, scope?: SxScope & { type?: string }): string => {
    const k = str(key);
    const hit = pick(fieldKeys("sx.ph", k, scope));
    if (hit) return hit;
    const type = str(scope?.type);
    if (type === "url") return pick(["sx.ph.url"]);
    if (type === "email") return pick(["sx.ph.email"]);
    if (/(^|_)phone$/.test(k)) return pick(["sx.ph.phone"]);
    return "";
  };
  const option = (value: string, scope?: SxScope & { field?: string }): string => {
    const v = str(value);
    const f = str(scope?.field);
    const c = str(scope?.ctor);
    const hit = pick([c && f && `sx.opt.${c}__${f}.${v}`, f && `sx.opt.${f}.${v}`]);
    if (hit) return hit;
    if (f === "tier" || f === "package_tiers") return tier(v);
    if (f === "placement") return placement(v, scope?.backend);
    return pick([v && `option.${v}`]) || vocab(scope?.backend, v) || unknownRef(v);
  };

  const error = (token: string, rule?: SxRule): string => {
    const tok = str(token);
    if (!tok) return "";
    const type = str(rule?.type);
    const text = TEXT_TYPES.has(type);
    switch (tok) {
      case "@required":
        return tr(PICK_TYPES.has(type) || str(rule?.source) ? "sx.err.requiredPick" : "sx.err.required");
      case "@min":
      case "@max": {
        const lim = tok === "@min" ? rule?.min : rule?.max;
        if (!finite(lim)) return tr("sx.err.invalid");
        if (text) return tr(tok === "@min" ? "sx.err.minLen" : "sx.err.maxLen", { n: lim });
        return tr(tok === "@min" ? "sx.err.min" : "sx.err.max", { n: num(lim) });
      }
      case "@option":
        return tr("sx.err.option");
      case "@minItems":
        return tr("sx.err.minItems", { n: finite(rule?.minItems) ? rule.minItems : 1 });
      case "@duplicate":
        return tr("sx.err.duplicate");
      case "@number":
        return tr("sx.err.number");
      case "@object":
      case "@json":
        return tr("sx.err.object");
      case "@list":
        return tr("sx.err.list");
      case "@file":
        return tr("sx.err.file");
      case "@lang":
        return pick(["fieldErr.lang"]) || tr("sx.err.invalid");
      case "@rule":
        return pick(["fieldErr.rule"]) || tr("sx.err.invalid");
    }
    if (tok.startsWith("@code:")) {
      const [code, arg = ""] = tok.slice(6).split(":");
      const n = numOf(arg);
      const shown = n === null ? arg : num(n);
      switch (code) {
        case "required":
          return tr("sx.err.required");
        case "minimum":
          return tr("sx.err.min", { n: shown });
        case "maximum":
          return tr("sx.err.max", { n: shown });
        case "invalid_option":
          return tr("sx.err.option");
        case "duplicate_value":
          return tr("sx.err.duplicate");
        case "reference_not_found":
          return tr("sx.err.reference");
        case "promotion_package_placement_mismatch":
          return tr("sx.err.k12Mismatch");
      }
      return pick([code && `fieldErr.c.${code}`], { n: shown }) || tr("sx.err.invalid");
    }
    if (tok.startsWith("@")) return pick([`fieldErr.${tok.slice(1)}`], { n: "" }) || tr("sx.err.invalid");
    return isUz && !HELP_JARGON.test(tok) ? tok : tr("sx.err.invalid");
  };

  const hint = (rule: SxRule): string => {
    const type = str(rule?.type);
    const min = rule?.min;
    const max = rule?.max;
    if (NUM_TYPES.has(type)) {
      if (finite(min) && finite(max)) return tr("sx.hint.between", { min: num(min), max: num(max) });
      if (finite(min) && min > 0) return tr("sx.hint.min", { min: num(min) });
      if (finite(max)) return tr("sx.hint.max", { max: num(max) });
      return "";
    }
    if ((type === "text" || type === "textarea") && finite(max) && max > 0) return tr("sx.hint.maxLen", { n: max });
    return "";
  };

  const date = (iso: string): string => dateOnly(str(iso), locale);
  const dateTime = (iso: string): string => dateTimeFull(str(iso), locale);
  const ago = (iso: string, now: number): string => fmtAge(str(iso), locale, now);

  const displayOne = (value: unknown, rule?: SxRule): string => {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "boolean") return tr(value ? "sx.ui.yes" : "sx.ui.no");
    if (typeof value === "number") return str(rule?.type) === "money" ? money(value) : num(value);
    if (typeof value !== "string") return "";
    const v = value.trim();
    const type = str(rule?.type);
    if (type === "date" || (!type && ISO_DAY.test(v))) return date(v);
    if (type === "datetime" || (!type && ISO_STAMP.test(v))) return dateTime(v);
    if (PICK_TYPES.has(type) || (rule?.options && own.call(rule.options, v))) {
      return option(v, { field: rule?.key, ctor: rule?.ctor, backend: rule?.options && own.call(rule.options, v) ? rule.options[v] : undefined });
    }
    if (UUID.test(v)) return unknownRef(v);
    return v;
  };
  const display = (value: unknown, rule?: SxRule): string => {
    const notSet = tr("sx.ui.notSet");
    if (value === null || value === undefined || value === "") return notSet;
    if (Array.isArray(value)) {
      if (!value.length) return notSet;
      if (value.some((x) => x !== null && typeof x === "object")) return "";
      const parts = value.map((x) => displayOne(x, rule)).filter(Boolean);
      return parts.length ? list(parts) : notSet;
    }
    if (typeof value === "object") return "";
    return displayOne(value, rule) || notSet;
  };

  const refOption = (source: string, item: StudioReferenceItem): SxOption => {
    const key = studioReferenceKey(str(source)).key;
    const r: Record<string, unknown> = item?.raw && typeof item.raw === "object" ? item.raw : {};
    const value = str(item?.value) || str(item?.id);
    const label = str(item?.label);
    const base = (o: Omit<SxOption, "value">): SxOption => {
      const out: SxOption = { value, label: unknownRef(o.label || value) };
      const shown = out.label.toLowerCase();
      const description = (o.description ?? "")
        .split(" · ")
        .filter((part) => part && !shown.includes(part.toLowerCase()))
        .join(" · ");
      if (description) out.description = description;
      if (o.code) out.code = o.code;
      if (o.icon) out.icon = o.icon;
      return out;
    };
    switch (key) {
      case "service-categories":
        return base({ label, description: str(r.description), code: str(r.slug), icon: SOURCE_ICON["service-categories"] });
      case "services": {
        const price = numOf(r.base_price);
        return base({ label, description: joinDot([str(r.category_title), price === null ? "" : money(price, str(r.currency))]), icon: BriefcaseBusinessIcon });
      }
      case "document-templates": {
        const cat = str(r.category);
        const lang = str(r.language);
        return base({ label, description: joinDot([pick([cat && `sx.doccat.${cat}`]), pick([lang && `sx.lang.${lang}`])]), icon: FileTextIcon });
      }
      case "service-packages":
      case "local:service-packages":
        return base({ label, description: str(r.category_title), code: str(r.code), icon: SOURCE_ICON["service-packages"] });
      case "consent-documents":
      case "local:consent-documents": {
        const [slugPart = "", versionPart = ""] = str(r.code).split(" · ");
        const version = str(r.version) || versionPart.trim();
        return base({ label: label.replace(VERSION_TAIL, "").trim() || label, description: version ? `v${version}` : "", code: str(r.slug) || slugPart.trim(), icon: ScrollTextIcon });
      }
      case "promotion-packages": {
        const d = numOf(r.days);
        const price = numOf(r.price);
        return base({
          label: promoPackage(str(r.code), str(r.title) || label),
          description: joinDot([str(r.placement) ? placement(str(r.placement)) : "", d === null ? "" : days(d), price === null ? "" : money(price, str(r.currency))]),
          code: str(r.code),
          icon: MegaphoneIcon,
        });
      }
      case "promotion-placements":
        return base({ label: placement(value, label), description: placementWhat(value), code: value, icon: own.call(PLACEMENT_ICON, value) ? PLACEMENT_ICON[value] : SOURCE_ICON["promotion-placements"] });
      case "roles":
        return base({ label: role(value, label), description: vocab(str(r.description)), code: value, icon: UserCogIcon });
      case "subscription-plans": {
        const monthly = numOf(r.monthly_price);
        const price = monthly === null ? "" : tr("sx.ui.perMonth", { price: money(monthly) });
        return base({ label: plan(str(r.slug), label), description: joinDot([str(r.audience) ? audience(str(r.audience)) : "", price]), code: str(r.slug), icon: CrownIcon });
      }
      case "studio-constructors": {
        const nav = findStudioConstructor(value)?.navigation ?? null;
        return base({ label: ctorName(value, split(label).name), description: nav ? groupName(nav.groupKey, nav.groupTitle) : "", code: value, icon: ctorIcon(value, nav?.groupKey) });
      }
      case "users": {
        const who = splitUserLabel(label);
        return base({ label: who.name, description: joinDot([str(r.role) ? role(str(r.role)) : "", who.phone]), code: str(r.lexgo_id), icon: CircleUserIcon });
      }
      case "studio-objects":
      case "local:studio-objects": {
        const code = str(r.constructor_code) || str(r.code);
        return base({ label: split(label).name, description: joinDot([code ? ctorName(code) : "", str(r.status) ? status(str(r.status)) : ""]), code, icon: ctorIcon(code) });
      }
      case "organization-units": {
        const unit = str(r.unit_type);
        return base({ label, description: pick([unit && `sx.unit.${unit}`]), code: str(r.code), icon: NetworkIcon });
      }
      case "permissions":
        return base({ label: permission(value, label), code: value, icon: SOURCE_ICON.permissions });
      case "price-factors": {
        const kind = str(r.adjustment_type);
        const amount = numOf(r.value);
        const shown = amount === null ? "" : kind === "percent" ? `${num(amount)}%` : money(amount);
        return base({ label, description: joinDot([kind ? option(kind, { field: "adjustment_type" }) : "", shown]), icon: SOURCE_ICON["price-factors"] });
      }
      case "client-guarantees":
        return base({ label, description: str(r.description), icon: SOURCE_ICON["client-guarantees"] });
      case "checklists":
        return base({ label, description: str(r.description), icon: ListChecksIcon });
      case "package-eligibility-rules":
        return base({ label, description: str(r.description), icon: BadgeCheckIcon });
    }
    return base({ label: label || value, icon: sourceIcon(source) });
  };

  return {
    locale,
    ctorName,
    ctorWhat,
    groupName,
    groupWhat,
    journeyName,
    journeyWhat,
    section,
    status,
    statusPill,
    statusHint,
    stepDecision,
    role,
    permission,
    plan,
    audience,
    tier,
    promoPackage,
    placement,
    placementWhat,
    surface,
    page,
    warning,
    risk,
    currency,
    field,
    help,
    placeholder,
    option,
    error,
    hint,
    display,
    refOption,
    unknownRef,
    splitCodeLabel: split,
    num,
    money,
    days,
    date,
    dateTime,
    ago,
    list,
  };
}

export function useStudioLabels(): StudioLabels {
  const t: SxTranslate = useTranslations("studio");
  const locale = useLocale();
  return useMemo(() => buildStudioLabels(t, locale), [t, locale]);
}
