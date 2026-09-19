// Interim client-side fallback for a template the backend imported with no
// `fields` (LEXGO_CIVIL_COURT_DOCS_FIELDS_KERAK_2026-09-19.md) but whose raw
// text still has "_______" blanks to fill by hand. Detects each blank from
// the plain template text and lets the client fill it in locally — nothing
// is sent to the backend's generate pipeline, since it has no placeholder to
// substitute into for these templates (no {{token}}, just underscores).
export type BlankSlot = { label: string };

const RUN = /_{3,}/g;

// Merge a blank that wraps onto the next line(s) (itself only underscores,
// maybe with a trailing comma) into the one field it visually is.
function mergeWrappedBlanks(text: string): string {
  return text.replace(/(_{3,}[ \t]*,?[ \t]*\n[ \t]*)+_{3,}/g, (m) => "_".repeat(Math.min(m.replace(/[^_]/g, "").length, 40)));
}

export function hasBlanks(text: string): boolean {
  return RUN.test(mergeWrappedBlanks(text || ""));
}

function lineAt(text: string, index: number): { start: number; end: number } {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  const nlIdx = text.indexOf("\n", index);
  const end = nlIdx === -1 ? text.length : nlIdx;
  return { start, end };
}

function nextNonEmptyLine(text: string, fromIndex: number): string {
  const rest = text.slice(fromIndex);
  const nl = rest.indexOf("\n");
  const afterThisLine = nl === -1 ? "" : rest.slice(nl + 1);
  for (const line of afterThisLine.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

// A usable label: short, no leftover underscores (means it swallowed part of
// another blank), not just punctuation. Free-form legal prose fails this
// often — that's fine, the active blank is highlighted in the preview too,
// so a generic "N-band" is still easy to locate.
function clean(s: string, maxLen: number): string | undefined {
  const v = s.trim().replace(/^[-–—(),.;:'"«»]+/, "").trim();
  if (!v || v.includes("_") || v.length > maxLen || /^[\d.,;:()"'«»]+$/.test(v)) return undefined;
  return v;
}

// Detect every blank in reading order and guess a short label for it from
// the surrounding text: same-line label before it ("Манзил:"), else a
// "(hint)" on the next line, else the same-line text right after it.
export function detectBlanks(rawText: string): { cleaned: string; slots: BlankSlot[] } {
  const cleaned = mergeWrappedBlanks(rawText || "");
  const slots: BlankSlot[] = [];
  const re = new RegExp(RUN);
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(cleaned))) {
    n += 1;
    const { start, end } = lineAt(cleaned, m.index);
    const before = clean(cleaned.slice(start, m.index).replace(/[:：]\s*$/, ""), 32);
    const hint = clean(nextNonEmptyLine(cleaned, m.index).match(/^\(([^)]{2,50})\)$/)?.[1] ?? "", 40);
    const after = clean(cleaned.slice(m.index + m[0].length, end).replace(/^[,.:;]\s*/, "").split(/[.,;]/)[0] ?? "", 32);
    slots.push({ label: before || hint || after || `${n}-band` });
  }
  return { cleaned, slots };
}

// The cleaned text split around each blank, so a caller can render the
// surrounding text plus either the typed value or a highlighted placeholder
// for each blank — and, separately, rebuild plain text for copy/print.
export type Segment = { text: string } | { blank: true; index: number; label: string };

export function segments(cleaned: string, slots: BlankSlot[]): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  const re = new RegExp(RUN);
  let m: RegExpExecArray | null;
  let i = -1;
  while ((m = re.exec(cleaned))) {
    i += 1;
    if (m.index > last) out.push({ text: cleaned.slice(last, m.index) });
    out.push({ blank: true, index: i, label: slots[i]?.label ?? `${i + 1}-band` });
    last = m.index + m[0].length;
  }
  if (last < cleaned.length) out.push({ text: cleaned.slice(last) });
  return out;
}

export function plainText(segs: Segment[], values: string[]): string {
  return segs.map((s) => ("text" in s ? s.text : values[s.index]?.trim() || "_".repeat(12))).join("");
}
