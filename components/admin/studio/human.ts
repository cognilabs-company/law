"use client";

import { humanize } from "@/lib/labels";
import { CHECK_IDS, HELP_RULES, NOTE_IDS, SECTION_IDS, SURFACE_IDS, SURFACE_TITLE_IDS, WARN_IDS, normText } from "@/lib/studio/humanText";
import { MASK, type StudioConstructor, type StudioSchemaField, type StudioSurface } from "@/lib/services/studio";
import { useStudioText } from "./bits";

// What a person reads in Studio. The backend names things for the system —
// a field's key made into a label ("Frequency Cap"), sentences about
// "runtime layers" and "reference APIs", values as JSON. Here each of those
// becomes plain words in the reader's language: names from the dictionary,
// the guide rebuilt from what the constructor actually has, and values said
// the way a person would say them. Nothing code-like is passed through.

// A name the backend only made out of the key, or one that still carries a
// developer's word.
const JARGON = /\b(slug|payload|endpoint|reference|scope|fallback|timeout|heartbeat|backoff|burst|canonical|placeholder|watermark|header|field|widget|permission|id|url|mb|review|staging|offline|online|reply|operator)\b/i;
// A help sentence that still talks to a developer.
const HELP_JARGON = /konfiguratsiya|runtime|vaqt zonasi|\breal\b|uzsda|reference|\bapi\b|payload|json|kalit|slug|obyekt|backend|endpoint|\bid\b|identifikator|sxema|parametr|token|webhook|\bkey\b|`/i;
const isAuto = (label: string, key: string) => !label || label === key || label.toLowerCase() === humanize(key).toLowerCase();
// A string that is a code, not words: snake_case, dotted, a path, a token.
const codeLike = (s: string) => /^[a-z0-9]+([_.:/-][a-z0-9]+)+$/i.test(s) || /^[a-z]+_?misol$/i.test(s) || /^\{|\[|^<.+>$/.test(s);

export function useStudioHuman() {
  const st = useStudioText();
  const { t, locale } = st;
  const h = (key: string, values?: Record<string, string | number>) => t(`human.${key}`, values);
  const has = (key: string) => t.has(`human.${key}`);

  // A field's name comes from the dictionary in every language; the backend's
  // own label is the fallback for a field the dictionary has not met yet.
  const fieldLabel = (key: string, backend = ""): string => {
    if (key && t.has(`field.${key}`)) return t(`field.${key}`);
    return isAuto(backend, key) || JARGON.test(backend) || locale !== "uz" ? humanize(key) : backend;
  };
  const label = (f: Pick<StudioSchemaField, "key" | "label">) => fieldLabel(f.key, f.label);

  // The help under a field. The backend's generic sentences ("enter the
  // value that fits this configuration") say nothing: they are dropped or
  // replaced by a short instruction; a sentence written for one field stays
  // (in Uzbek), and elsewhere the dictionary's.
  const help = (f: Pick<StudioSchemaField, "key" | "help">): string => {
    const own = f.key && t.has(`fieldHelp.${f.key}`) ? t(`fieldHelp.${f.key}`) : "";
    const raw = f.help ?? "";
    if (!raw) return own;
    const n = normText(raw);
    for (const [id, rx, text] of HELP_RULES) if (rx.test(n)) return own || (text ? h(`help.${id}`) : "");
    return locale === "uz" && !HELP_JARGON.test(raw) ? raw : own;
  };

  // An example worth showing inside an empty field: a number anywhere, a
  // phrase in Uzbek only; never a code or a made-up "value_misol".
  const example = (f: Pick<StudioSchemaField, "example" | "type">): string => {
    const v = f.example;
    if (typeof v === "number") return String(v);
    if (typeof v !== "string" || !v.trim() || codeLike(v.trim())) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return "";
    return locale === "uz" && /\s/.test(v.trim()) ? v : "";
  };

  const section = (title: string): string => {
    const id = SECTION_IDS[normText(title)];
    return id ? h(`section.${id}`) : title;
  };

  // A page the result shows on, in the reader's words.
  const surface = (s: Pick<StudioSurface, "title" | "placement">): { title: string; what: string } => {
    const id = SURFACE_IDS[`${normText(s.title)}|${normText(s.placement)}`] ?? SURFACE_TITLE_IDS[normText(s.title)];
    if (id) return { title: h(`surface.${id}.title`), what: h(`surface.${id}.what`) };
    return { title: s.title, what: locale === "uz" ? s.placement : "" };
  };

  const known = (ids: Record<string, string>, ns: string) => (text: string): string => {
    const id = ids[normText(text)] ?? ids[normText(text).replace(/\.$/, "")] ?? ids[`${normText(text)}.`];
    return id ? h(`${ns}.${id}`) : text;
  };
  const note = known(NOTE_IDS, "note");
  const check = known(CHECK_IDS, "check");
  const warn = known(WARN_IDS, "warn");

  const groupTitle = (key: string, backend = "") => (has(`group.${key}.title`) ? h(`group.${key}.title`) : backend || st.group(key));
  const groupText = (key: string, backend = "") => (has(`group.${key}.text`) ? h(`group.${key}.text`) : locale === "uz" ? backend : "");
  const journeyTitle = (key: string, backend = "") => (has(`journey.${key}.title`) ? h(`journey.${key}.title`) : backend);
  const journeyText = (key: string, backend = "") => (has(`journey.${key}.text`) ? h(`journey.${key}.text`) : locale === "uz" ? backend : "");

  // What a constructor is for, when to reach for it and what comes of it —
  // from our own description and the pages it touches, never the sentence
  // about "runtime layers".
  const what = (c: Pick<StudioConstructor, "code" | "experience">) => st.ctorDesc(c.code) || (locale === "uz" ? c.experience.plainLanguage : "");
  const where = (c: Pick<StudioConstructor, "experience">) => [...new Set(c.experience.whereUsed.map((s) => surface(s).title).filter(Boolean))];
  const whenToUse = (c: Pick<StudioConstructor, "experience">) => {
    const w = where(c);
    return w.length ? h("when", { where: w.join(", ") }) : h("whenPlain");
  };
  const result = (c: Pick<StudioConstructor, "experience">) => {
    const w = where(c);
    return w.length ? h("result", { where: w.join(", ") }) : h("resultPlain");
  };
  const reason = (group: string, n: number) => h("reason", { group, n });

  // The steps of working with a constructor, from its own form: what is
  // picked from lists, what must be filled in, then checking and sending.
  const steps = (c: Pick<StudioConstructor, "typed" | "schema" | "approvalRequired">): { title: string; text: string }[] => {
    const shown = c.typed.filter((f) => !f.hidden);
    const need = new Set(c.schema.required);
    const names = (list: StudioSchemaField[]) => list.slice(0, 5).map(label).join(", ") + (list.length > 5 ? ` ${h("count.more", { n: list.length - 5 })}` : "");
    const refs = shown.filter((f) => f.source || f.item?.source);
    const req = shown.filter((f) => f.required || need.has(f.key));
    const out: { title: string; text: string }[] = [];
    if (refs.length) out.push({ title: h("step.pick.title"), text: h("step.pick.text", { list: names(refs) }) });
    out.push({ title: h("step.fill.title"), text: req.length ? h("step.fill.text", { list: names(req) }) : h("step.fill.textNone") });
    out.push({ title: h("step.check.title"), text: h("step.check.text") });
    const last = c.approvalRequired ? "send" : "publish";
    out.push({ title: h(`step.${last}.title`), text: h(`step.${last}.text`) });
    return out;
  };

  // A value as a person says it: yes/no, a named option, "3 items" — never
  // braces, quotes or a key.
  const value = (v: unknown, key = ""): string => {
    if (v === MASK) return MASK;
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? h("yes") : h("no");
    if (typeof v === "number") return st.num(v);
    if (typeof v === "string") {
      if (t.has(`option.${v}`)) return t(`option.${v}`);
      if (/^[a-z_]+(\.[a-z_]+)+$/.test(v) && t.has(`perm.${v.replace(/\./g, "__")}`)) return st.perm(v);
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return st.when(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return st.day(v);
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v)) return "—";
      if (/^[A-Z][A-Za-z]+\/[A-Za-z_]+$/.test(v)) return zone(v);
      if (/^[A-Z]+\d*(-[A-Z]+)?$/.test(v) && st.ctorName(v) !== v) return st.ctorName(v);
      return codeLike(v) ? humanize(v.replace(/[.:/-]+/g, "_")) : v;
    }
    if (Array.isArray(v)) {
      if (!v.length) return h("empty");
      const simple = v.filter((x) => typeof x === "string" || typeof x === "number");
      if (simple.length === v.length && v.length <= 4) return v.map((x) => value(x, key)).join(", ");
      const named = v.map((x) => (x && typeof x === "object" ? titleOf(x as Record<string, unknown>) : "")).filter(Boolean);
      if (named.length === v.length && v.length <= 4) return named.join(", ");
      return h("count.items", { n: v.length });
    }
    if (typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      if (!entries.length) return h("empty");
      const flat = entries.filter(([, x]) => x === null || ["string", "number", "boolean"].includes(typeof x));
      if (flat.length === entries.length && entries.length <= 3) return entries.map(([k, x]) => `${fieldLabel(k)}: ${value(x, k)}`).join(" · ");
      return h("count.settings", { n: entries.length });
    }
    return "—";
  };
  // A time zone by its everyday name ("Uzbekistan Time"), not "Asia/Tashkent".
  const zone = (tz: string): string => {
    if (tz === "Asia/Tashkent") return h("zoneTashkent");
    try {
      const name = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "longGeneric" }).formatToParts(new Date(0)).find((p) => p.type === "timeZoneName")?.value;
      return name || tz.split("/").pop()!.replace(/_/g, " ");
    } catch {
      return tz.split("/").pop()!.replace(/_/g, " ");
    }
  };
  const titleOf = (d: Record<string, unknown>): string => {
    for (const k of ["title", "name", "label"]) if (typeof d[k] === "string" && d[k]) return codeLike(d[k] as string) ? humanize((d[k] as string).replace(/[.:/-]+/g, "_")) : (d[k] as string);
    for (const k of ["status", "type", "code", "key"]) if (typeof d[k] === "string" && d[k]) return value(d[k], k);
    return "";
  };

  // A status of anything listed in Studio, a Studio one or the site's own.
  const anyStatus = (s: string): string => {
    const k = s.trim().toLowerCase();
    if (!k) return "—";
    if (t.has(`status.${k}`)) return t(`status.${k}`);
    if (t.has(`flow.rstatus.${k}`)) return t(`flow.rstatus.${k}`);
    if (t.has(`option.${k}`)) return t(`option.${k}`);
    return humanize(k);
  };

  return { ...st, h, fieldLabel, label, help, example, section, surface, note, check, warn, groupTitle, groupText, journeyTitle, journeyText, what, where, whenToUse, result, reason, steps, value, titleOf, anyStatus };
}
