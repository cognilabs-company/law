// Client-side rendering of a backend document template.
//
// Two marker styles have shipped, and a template can be either:
// - `{{field_name}}` — the original 36 civil-court templates: braces hold
//   the machine field name directly, so the token maps to a field with no
//   lookup needed.
// - `{Human readable label}` — the 987-template general-category import
//   (2026-09-23): braces hold the field's own `label`/`placeholder` text
//   (Cyrillic, spaces and all), NOT a machine name — verified against a real
//   production template (a Word "complex field", `<w:fldChar>`, whose cached
//   result text is exactly `{<label>}`). A single-brace-only tokenizer with
//   no field list to resolve against would treat every one of these as
//   plain literal text — which is exactly what silently broke live-typing
//   for every service from that import: the pane had no recognised token to
//   substitute into at all, so nothing the client typed could ever show up.
// Both are resolved against `fields` here (by `placeholder` with its braces
// stripped, or by `label`) so either style ends up as the same `DocSeg`
// `tok` node either way.
//
// This is enough to fill the document in the browser as the client types,
// with no round-trip: the same substitution the backend does when it renders
// the PDF, done locally for the live pane (LegalZoom's builder behaves the
// same way). `POST …/preview` is still called, but only to cross-check
// completeness — never as the thing the document pane waits for.
//
// Everything here is pure so the form, the live document and the answers that
// go to the backend all agree: whatever the pane shows is literally what gets
// interpolated into the generated file.

export type DocField = {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  step?: number;
  placeholder?: string;
  hint?: string;
  options?: string[];
};

// One piece of the document: literal text, or the n-th occurrence of a field.
export type DocSeg =
  | { k: "text"; v: string }
  | { k: "tok"; name: string; n: number };

// Token syntax the backend authors templates in — three styles at once (see
// the file header): group 1 is a `{{field_name}}` machine name, group 2 is
// a `{Human label}` needing a resolver lookup below, group 3 is the one
// unbracketed style — a phone field's marker is the literal digits
// `+998900000000` sitting in the document with no braces around it at all
// (confirmed against a real production template: the field's own
// `placeholder` is exactly `"+998900000000"`, no braces to strip).
const TOKEN = /\{\{\s*([\w.-]+)\s*\}\}|\{([^{}\n]+)\}|(\+998\d{9})/g;

// Resolves a raw match to a field's `name`. The {{...}} form's capture
// already IS the name; the {...} and +998… forms' captures are a label or
// literal placeholder that has to be looked up — built once (not per match)
// from `fields`' `placeholder` (braces stripped, so this covers the
// unbracketed phone form too) and `label`, so a match that isn't a
// recognised field resolves to undefined and is left as plain text rather
// than silently swallowed as a token with no answer behind it.
export type FieldResolver = (raw: string, isDoubleBrace: boolean) => string | undefined;
export function buildFieldResolver(fields: DocField[]): FieldResolver {
  const byLabel = new Map<string, string>();
  for (const f of fields) {
    const ph = (f.placeholder || "").trim().replace(/^\{+/, "").replace(/\}+$/, "").trim();
    if (ph) byLabel.set(ph, f.name);
    if (f.label) byLabel.set(f.label.trim(), f.name);
  }
  return (raw, isDoubleBrace) => (isDoubleBrace ? raw : byLabel.get(raw.trim()));
}

// Split `template_text` into literal runs and field tokens, numbering each
// field's occurrences so a field used twice (every template does this with
// claimant_full_name and application_date) can be highlighted independently.
export function parseTemplate(text: string, fields: DocField[] = []): DocSeg[] {
  const resolve = buildFieldResolver(fields);
  const out: DocSeg[] = [];
  const seen: Record<string, number> = {};
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    const name = m[1] ?? resolve(m[2] ?? m[3] ?? "", false);
    if (!name) continue;
    if (at > last) out.push({ k: "text", v: text.slice(last, at) });
    const n = seen[name] ?? 0;
    seen[name] = n + 1;
    out.push({ k: "tok", name, n });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ k: "text", v: text.slice(last) });
  return out;
}

// How many times each field appears in the document — the "×2" badge next to
// a question, so the client knows one answer fills several places.
export function tokenCounts(segs: DocSeg[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const s of segs) if (s.k === "tok") c[s.name] = (c[s.name] ?? 0) + 1;
  return c;
}

// The same document, but as the template's own real DOCX renders it (headers
// centered, labels bold, signature block right-aligned…) instead of a flat
// run of plain text — built by lib/docxParse.ts, which reads the template's
// source DOCX XML directly (paragraph alignment/indent and run bold/italic/
// underline — properties a semantic-HTML conversion like mammoth deliberately
// drops, but that these Uzbek court templates rely on for their actual look).
// `style` on an "el" node is a plain inline React style object, not a class:
// the values come straight from the DOCX (e.g. an exact point-based indent),
// nothing here maps them onto a fixed set of classes.
export type DocTree =
  | { k: "text"; v: string }
  | { k: "tok"; name: string; n: number }
  | { k: "el"; tag: string; children: DocTree[]; style?: Record<string, string | number> };

// Same numbering as parseTemplate, but the "text" being split arrives as
// however many text runs the source happens to have — one running counter
// shared across all of them keeps a field's occurrences numbered in document
// order, not per run. Exported for lib/docxParse.ts, which builds a DocTree
// straight from the DOCX's own XML rather than from a flat string — `resolve`
// is built once per document (buildFieldResolver) and threaded down through
// every run, not rebuilt per call.
export function splitTokens(text: string, seen: Record<string, number>, resolve: FieldResolver): DocTree[] {
  const out: DocTree[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    const name = m[1] ?? resolve(m[2] ?? m[3] ?? "", false);
    if (!name) continue;
    if (at > last) out.push({ k: "text", v: text.slice(last, at) });
    const n = seen[name] ?? 0;
    seen[name] = n + 1;
    out.push({ k: "tok", name, n });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ k: "text", v: text.slice(last) });
  return out;
}

export function tokenCountsTree(nodes: DocTree[]): Record<string, number> {
  const c: Record<string, number> = {};
  const walk = (list: DocTree[]) => {
    for (const n of list) {
      if (n.k === "tok") c[n.name] = (c[n.name] ?? 0) + 1;
      else if (n.k === "el") walk(n.children);
    }
  };
  walk(nodes);
  return c;
}

export type DocKind =
  | "text"
  | "multiline"
  | "number"
  | "money"
  | "date"
  | "phone"
  | "email"
  | "pinfl"
  | "inn"
  | "select";

// Whole-word test: `claimant_full_name` must not match "claim", and
// `debtor_name` must not match "debt" — a substring test classified both as
// money/multiline and then stripped every letter the client typed.
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const hasWord = (name: string, set: string[]) => words(name).some((w) => set.includes(w));

const MONEY_WORDS = ["amount", "sum", "summa", "price", "narx", "salary", "debt", "haq", "miqdor", "miqdori"];
const LONG_WORDS = ["description", "details", "reason", "facts", "demand", "note", "content", "body", "text", "evidence", "request", "requests", "tavsif", "holatlari", "asos", "talab", "talablar"];

// Field kind: an explicit backend `type` always wins (production sends text /
// textarea / date / phone / email / number on every field). The name-based
// guesses below only run for a template that declares none.
export function fieldKind(f: DocField): DocKind {
  const t = (f.type || "").toLowerCase();
  const money = hasWord(f.name, MONEY_WORDS);
  if (["multiline", "textarea", "long"].includes(t)) return "multiline";
  if (["number", "int", "integer"].includes(t)) return money ? "money" : "number";
  if (["money", "amount", "sum", "currency"].includes(t)) return "money";
  if (t === "date") return "date";
  if (["phone", "tel"].includes(t)) return "phone";
  if (t === "email") return "email";
  if (["pinfl", "jshshir"].includes(t)) return "pinfl";
  if (["inn", "stir"].includes(t)) return "inn";
  if (t === "select") return f.options?.length ? "select" : "text";
  if (t === "text" || t === "string" || t === "checkbox") return "text";
  const n = f.name.toLowerCase();
  if (hasWord(n, ["date", "sana", "dob", "birth"]) || /_at$/.test(n)) return "date";
  if (hasWord(n, ["phone", "tel", "telefon"])) return "phone";
  if (hasWord(n, ["email", "mail"])) return "email";
  if (hasWord(n, ["pinfl", "jshshir"])) return "pinfl";
  if (hasWord(n, ["inn", "stir"])) return "inn";
  if (money) return "money";
  if (hasWord(n, LONG_WORDS)) return "multiline";
  return "text";
}

export const MAX_DIGITS: Partial<Record<DocKind, number>> = { pinfl: 14, inn: 9 };

// Per-keystroke filter. It must never remove a character the client is still
// in the middle of typing — a decimal point deleted on keystroke turns
// "1500.50" into "150050" in a court claim — so separators stay and the
// canonical form is produced later, by normalizeAnswer, at the boundary.
export function sanitizeInput(kind: DocKind, raw: string): string {
  if (kind === "pinfl" || kind === "inn") return raw.replace(/\D/g, "").slice(0, MAX_DIGITS[kind]);
  if (kind === "money" || kind === "number") return raw.replace(/[^\d.,\s-]/g, "");
  // A court filing reads as a typo with a lower-case first letter ("bekov
  // sardor" instead of "Bekov Sardor") — capitalize only the very first
  // character, live as it's typed, never mid-sentence.
  if ((kind === "text" || kind === "multiline") && raw) return raw.charAt(0).toUpperCase() + raw.slice(1);
  return raw;
}

type Num = { neg: boolean; int: string; frac: string } | null;

// "1 500,50" / "1500.50" / "1,500" → parts. A single comma followed by one or
// two digits at the end is a decimal separator; any other comma is grouping.
function parseNum(raw: string): Num {
  let s = raw.replace(/[\s ]/g, "");
  if (!s) return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (!m[1] && !m[2])) return null;
  // An all-zero fraction is noise ("1500.00" → "1 500"); a real one is kept
  // exactly as typed, because 1 500.50 must not be written as 1 500.5 in a
  // claim for a sum of money.
  const frac = m[2] || "";
  return { neg, int: m[1] || "0", frac: /^0*$/.test(frac) ? "" : frac };
}

const group = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// Court filings write dates as 21.09.2026, not as an ISO string.
export function docDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso.trim();
}

// The inverse, for reading an answer back into the date picker. What is saved
// is the document's own 21.09.2026 form, but DatePicker only understands
// "YYYY-MM-DD" — without this every date field reads as empty when a
// half-finished request is reopened.
export function isoDate(v: string): string {
  const s = (v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

// The canonical value: what the live document pane shows AND what is PUT to
// `…/answers`, so the pane is a true preview of the generated file rather than
// a prettier version of it.
export function normalizeAnswer(kind: DocKind, raw: string | undefined | null): string {
  const v = (raw ?? "").toString();
  if (kind === "money" || kind === "number") {
    const n = parseNum(v);
    if (!n) return v.trim();
    const int = kind === "money" ? group(n.int) : n.int;
    return `${n.neg ? "-" : ""}${int}${n.frac ? `.${n.frac}` : ""}`;
  }
  if (kind === "date") return docDate(v);
  if (kind === "multiline") return v.replace(/[ \t]+$/gm, "").trim();
  return v.trim();
}

// Answers as the backend should store them, keyed by field name. Fields the
// template doesn't declare are passed through untouched so a value saved by an
// older version of the form is never dropped on the next save.
export function normalizeAnswers(fields: DocField[], answers: Record<string, string>): Record<string, string> {
  const kinds = new Map(fields.map((f) => [f.name, fieldKind(f)]));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers)) {
    const kind = kinds.get(k);
    out[k] = kind ? normalizeAnswer(kind, v) : (v ?? "").toString().trim();
  }
  return out;
}

export const isFilled = (kind: DocKind, raw: string | undefined) => normalizeAnswer(kind, raw) !== "";

// Required fields still empty — the local gate on "Generate document". The
// backend's `can_generate` is only a cross-check: a stale or failed preview
// must never be the reason a completed form can't be submitted.
export function missingRequired(fields: DocField[], answers: Record<string, string>): DocField[] {
  return fields.filter((f) => f.required && !isFilled(fieldKind(f), answers[f.name]));
}

export const filledCount = (fields: DocField[], answers: Record<string, string>) =>
  fields.filter((f) => isFilled(fieldKind(f), answers[f.name])).length;

// Fallback path only: when the document pane has to render text the backend
// already filled (no template_text in hand), an unfilled spot comes back as a
// bracketed label — and a token the renderer didn't recognise as a leftover
// `{{mustache}}` or `{label}` (both marker styles — see the file header).
// All three are shown as blanks rather than as literal punctuation. The
// double-brace alternative is tried first so `{{name}}` matches whole rather
// than as a `{` + a single-brace span + a stray `}`.
export function splitFilledText(text: string): { blank: boolean; v: string }[] {
  return text
    .split(/(\[[^\]\n]+\]|\{\{[^}\n]+\}\}|\{[^{}\n]+\}|\+998\d{9})/g)
    .filter((p) => p !== "")
    .map((p) =>
      p.startsWith("[") && p.endsWith("]")
        ? { blank: true, v: p.slice(1, -1) }
        : p.startsWith("{{") && p.endsWith("}}")
          ? { blank: true, v: p.slice(2, -2).trim() }
          : p.startsWith("{") && p.endsWith("}")
            ? { blank: true, v: p.slice(1, -1).trim() }
            : /^\+998\d{9}$/.test(p)
              ? { blank: true, v: p }
              : { blank: false, v: p },
    );
}
