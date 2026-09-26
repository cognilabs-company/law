"use client";

// Client-side DOCX → DocTree, read straight from the file's own XML rather
// than through a semantic-HTML conversion (mammoth, tried first — dropped
// because it deliberately ignores direct paragraph formatting like alignment
// and indent, which is exactly what makes a Uzbek court filing look like one:
// a justified, first-line-indented body, a centered bold title, and a header/
// signature block pushed right by a fixed left indent).
//
// It reads the three parts that decide how a Word document actually looks:
//
// - word/document.xml — paragraphs, runs, TABLES (w:tbl/w:tr/w:tc, with
//   w:gridSpan, w:vMerge, borders, cell margins, shading and w:tblGrid column
//   proportions), and direct paragraph/run formatting.
// - word/styles.xml — w:docDefaults plus every w:style, resolved through its
//   w:basedOn chain, so a paragraph that only says `<w:pStyle w:val="Heading2"/>`
//   still comes out bold, coloured and sized. Without this, every template
//   whose look lives in named styles rather than in direct formatting rendered
//   as flat body text — the single biggest reason the live pane didn't match
//   the original.
// - word/numbering.xml — w:numId → w:abstractNum → w:lvl, so a bulleted list
//   renders with its real "•" and its real indent instead of the hard-coded
//   "1. " every list used to get, whatever its actual format.
//
// Direct formatting always wins over anything inherited, in OOXML's own order:
// docDefaults → paragraph/character style chain → numbering level → the
// element's own w:pPr/w:rPr.
//
// Still not read (and still degrading to "that content is missing" rather than
// throwing): images/w:drawing, headers and footers, footnotes, text boxes.

import JSZip from "jszip";
import { splitTokens, buildFieldResolver, type DocField, type DocTree, type FieldResolver } from "./docTemplate";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const TWIPS_PER_PT = 20;
// Border widths are in eighths of a point; w:spacing/@w:line in 240ths of a line.
const EIGHTHS_PER_PT = 8;
const LINE_UNITS_PER_LINE = 240;
// docDefaults' own fallback when the file states no default run size (20
// half-points = 10pt, Word's own default).
const DEFAULT_BASE_SZ = 20;
// A table nested deeper than this is flattened to its paragraphs instead of
// being walked as a table. Real templates never go past two or three levels;
// this is what stops a malformed or pathologically nested file from turning
// one paste into an unbounded render.
const MAX_TABLE_DEPTH = 8;
// Word's own default cell margins (0 top/bottom, 108 twips = 5.4pt sides),
// used when a cell declares no w:tcMar of its own.
const DEFAULT_CELL_PAD = { block: "0", inline: "5.4pt" };

function localName(el: Element): string {
  return el.localName || el.tagName.split(":").pop() || "";
}
function childOf(el: Element, name: string): Element | undefined {
  return Array.from(el.children).find((c) => localName(c) === name);
}
function childrenOf(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => localName(c) === name);
}
function attrOf(el: Element, name: string): string | null {
  return el.getAttributeNS(W_NS, name) ?? el.getAttribute(`w:${name}`) ?? el.getAttribute(name);
}

// A plain inline React style object (see DocTree in docTemplate.ts) — the
// values are read straight out of the DOCX, nothing maps them onto classes.
type Props = Record<string, string | number>;
// The "el" branch of DocTree, needed by name because w:vMerge has to reach
// back into a cell node it already emitted and raise its rowSpan.
type DocEl = Extract<DocTree, { k: "el" }>;

function num(v: string | null): number | undefined {
  if (v === null) return undefined;
  const s = v.trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// Twentieths of a point (OOXML's unit for indents, margins and cell widths) →
// a CSS length. Applied as-is rather than scaled to the pane's width: on a
// normal desktop pane this already lines up closely with the real page; on a
// narrow phone screen the indented lines wrap tighter, the same way the real
// page would look cramped shrunk that far — not incorrect, just a real
// document at a small size.
const pt = (twips: string | null): string | undefined => {
  const n = num(twips);
  return n === undefined ? undefined : `${(n / TWIPS_PER_PT).toFixed(1)}pt`;
};

// A six-hex-digit OOXML colour → CSS. "auto" means "let the consumer decide",
// which for us means "don't emit anything".
function hex(v: string | null): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (!s || s.toLowerCase() === "auto") return undefined;
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : undefined;
}

// True unless the property is explicitly turned off — OOXML's own default:
// a bare `<w:b/>` (no w:val) means "on", only w:val="0"/"false"/"none"/"off"
// means "off". `undefined` for an absent element is the load-bearing part
// here: it is what lets a run inherit bold from its paragraph style while a
// sibling run cancels it with `<w:b w:val="0"/>`.
function onOff(el: Element | undefined): boolean | undefined {
  if (!el) return undefined;
  const v = attrOf(el, "val");
  if (v === null) return true;
  const s = v.trim();
  return s !== "0" && s !== "false" && s !== "none" && s !== "off";
}

// ── styles.xml ───────────────────────────────────────────────────────────────

const BORDER_STYLE: Record<string, string> = {
  single: "solid",
  thick: "solid",
  wave: "solid",
  double: "double",
  doubleWave: "double",
  triple: "double",
  dotted: "dotted",
  dashed: "dashed",
  dashSmallGap: "dashed",
  dotDash: "dashed",
  dotDotDash: "dashed",
  inset: "inset",
  outset: "outset",
};

// One side of a w:tblBorders / w:tcBorders / w:pBdr group → a CSS border
// shorthand. "none" is returned as the literal CSS keyword rather than as
// undefined, so a cell that explicitly cancels one side of the table's own
// border grid actually loses it instead of falling back to it.
function borderCss(side: Element | undefined): string | undefined {
  if (!side) return undefined;
  const val = (attrOf(side, "val") || "single").trim();
  if (val === "none" || val === "nil") return "none";
  const style = BORDER_STYLE[val] ?? "solid";
  const eighths = num(attrOf(side, "sz")) ?? 4;
  // Word's thinnest real line is 1/2pt; anything smaller disappears entirely
  // on screen, which reads as "the table has no borders".
  const width = Math.max(eighths / EIGHTHS_PER_PT, 0.5);
  return `${width.toFixed(2)}pt ${style} ${hex(attrOf(side, "color")) ?? "#000"}`;
}

// w:left / w:right are the old names, w:start / w:end the current ones; a
// file can use either (or both, in the same document).
function borderSide(holder: Element | undefined, names: string[]): string | undefined {
  if (!holder) return undefined;
  for (const n of names) {
    const found = childOf(holder, n);
    if (found) return borderCss(found);
  }
  return undefined;
}

// w:shd — a solid fill is the `w:fill` attribute (w:val="clear" only says
// "no pattern on top of it"); w:val="nil" means no shading at all.
function shdFill(shd: Element | undefined): string | undefined {
  if (!shd) return undefined;
  if ((attrOf(shd, "val") || "clear").trim() === "nil") return undefined;
  return hex(attrOf(shd, "fill"));
}

const HIGHLIGHT: Record<string, string> = {
  yellow: "#ffff00",
  green: "#00ff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  blue: "#0000ff",
  red: "#ff0000",
  darkBlue: "#000080",
  darkCyan: "#008080",
  darkGreen: "#008000",
  darkMagenta: "#800080",
  darkRed: "#800000",
  darkYellow: "#808000",
  darkGray: "#808080",
  lightGray: "#c0c0c0",
  black: "#000000",
  white: "#ffffff",
};

// Run formatting as an intermediate, not as CSS: underline and strike-through
// both land on the same `text-decoration` property, and a size only becomes a
// CSS value once the document's own default size is known, so the CSS object
// can only be built after the whole inheritance chain has been applied.
type RunFmt = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  caps?: boolean;
  sz?: number;
  color?: string;
  background?: string;
  superSub?: "super" | "sub";
};

type StyleDef = { basedOn?: string; pPr?: Element; rPr?: Element; numPr?: Element };
type StyleSheet = {
  // Paragraph, table and numbering styles all carry w:pPr/w:rPr and are
  // resolved the same way, so they share one map; character styles are kept
  // apart because w:rStyle must not be able to resolve to a paragraph style.
  para: Map<string, StyleDef>;
  char: Map<string, StyleDef>;
  defPPr?: Element;
  defRPr?: Element;
  // The `w:default="1"` paragraph style ("Normal" in practice) — what a
  // paragraph with no w:pStyle of its own inherits.
  defaultPara?: string;
  // Half-points. Every w:sz is turned into an em ratio against this, so the
  // pane keeps its own responsive base size (see runProps) and still
  // reproduces the document's relative emphasis exactly.
  baseSz: number;
};

function readLvlOrStyleNumPr(pPr: Element | undefined): Element | undefined {
  return pPr ? childOf(pPr, "numPr") : undefined;
}

function readStyles(xml: string | null): StyleSheet {
  const sheet: StyleSheet = { para: new Map(), char: new Map(), baseSz: DEFAULT_BASE_SZ };
  if (!xml) return sheet;
  const root = new DOMParser().parseFromString(xml, "application/xml").documentElement;
  // A corrupt part yields a <parsererror> document rather than throwing —
  // checked by name so a broken styles.xml costs the styles, not the render.
  if (!root || localName(root) !== "styles") return sheet;

  const defaults = childOf(root, "docDefaults");
  if (defaults) {
    const rd = childOf(defaults, "rPrDefault");
    const pd = childOf(defaults, "pPrDefault");
    sheet.defRPr = rd ? childOf(rd, "rPr") : undefined;
    sheet.defPPr = pd ? childOf(pd, "pPr") : undefined;
    const szEl = sheet.defRPr ? childOf(sheet.defRPr, "sz") : undefined;
    const sz = szEl ? num(attrOf(szEl, "val")) : undefined;
    if (sz && sz > 0) sheet.baseSz = sz;
  }

  for (const st of childrenOf(root, "style")) {
    const id = attrOf(st, "styleId");
    if (!id) continue;
    const type = (attrOf(st, "type") || "paragraph").trim();
    const basedOn = childOf(st, "basedOn");
    const pPr = childOf(st, "pPr");
    const def: StyleDef = {
      basedOn: (basedOn && attrOf(basedOn, "val")) || undefined,
      pPr,
      rPr: childOf(st, "rPr"),
      numPr: readLvlOrStyleNumPr(pPr),
    };
    // Real files ship duplicate styleIds (both of these templates define
    // Heading1 twice — a generic set first, the document's own on top); the
    // last definition is the one Word shows, so a later one overwrites.
    if (type === "character") sheet.char.set(id, def);
    else {
      sheet.para.set(id, def);
      if (type === "paragraph" && attrOf(st, "default") === "1") sheet.defaultPara = id;
    }
  }

  // The default paragraph style's own size beats docDefaults as the baseline
  // the rest of the document is sized relative to.
  const defDef = sheet.defaultPara ? sheet.para.get(sheet.defaultPara) : undefined;
  const defSzEl = defDef?.rPr ? childOf(defDef.rPr, "sz") : undefined;
  const defSz = defSzEl ? num(attrOf(defSzEl, "val")) : undefined;
  if (defSz && defSz > 0) sheet.baseSz = defSz;
  return sheet;
}

// A style's w:basedOn chain, outermost ancestor first, so applying it in order
// leaves the most specific value in place. `seen` breaks the cycles real files
// occasionally contain (A basedOn B basedOn A), and a missing link just ends
// the chain — these templates say `w:basedOn="Normal"` while defining no
// Normal style at all, and must still keep their own properties.
function chainOf(map: Map<string, StyleDef>, id: string | undefined): StyleDef[] {
  const out: StyleDef[] = [];
  const seen = new Set<string>();
  let cur = id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const def = map.get(cur);
    if (!def) break;
    out.unshift(def);
    cur = def.basedOn;
  }
  return out;
}

// ── numbering.xml ────────────────────────────────────────────────────────────

type NumLvl = { fmt: string; text: string; start: number; pPr?: Element };
type NumDef = { levels: Map<number, NumLvl>; startOverride: Map<number, number> };

function readLvl(lv: Element): { ilvl: number; lvl: NumLvl } {
  const fmtEl = childOf(lv, "numFmt");
  const textEl = childOf(lv, "lvlText");
  const startEl = childOf(lv, "start");
  return {
    ilvl: num(attrOf(lv, "ilvl")) ?? 0,
    lvl: {
      fmt: ((fmtEl && attrOf(fmtEl, "val")) || "decimal").trim(),
      text: (textEl && attrOf(textEl, "val")) || "",
      start: (startEl && num(attrOf(startEl, "val"))) ?? 1,
      pPr: childOf(lv, "pPr"),
    },
  };
}

// numId → the levels that numId actually renders with. Two numIds pointing at
// the same w:abstractNum share one level map until a w:lvlOverride replaces a
// level, at which point that numId gets its own copy — otherwise one list's
// override would silently change the other's markers.
function readNumbering(xml: string | null): Map<string, NumDef> {
  const out = new Map<string, NumDef>();
  if (!xml) return out;
  const root = new DOMParser().parseFromString(xml, "application/xml").documentElement;
  if (!root || localName(root) !== "numbering") return out;

  const abstracts = new Map<string, Map<number, NumLvl>>();
  for (const an of childrenOf(root, "abstractNum")) {
    const aid = attrOf(an, "abstractNumId");
    if (!aid) continue;
    const levels = new Map<number, NumLvl>();
    for (const lv of childrenOf(an, "lvl")) {
      const { ilvl, lvl } = readLvl(lv);
      levels.set(ilvl, lvl);
    }
    abstracts.set(aid, levels);
  }

  for (const nEl of childrenOf(root, "num")) {
    const numId = attrOf(nEl, "numId");
    if (!numId) continue;
    const aidEl = childOf(nEl, "abstractNumId");
    const aid = aidEl ? attrOf(aidEl, "val") : null;
    const shared = (aid && abstracts.get(aid)) || new Map<number, NumLvl>();
    let levels = shared;
    const startOverride = new Map<number, number>();
    for (const ov of childrenOf(nEl, "lvlOverride")) {
      const at = num(attrOf(ov, "ilvl")) ?? 0;
      const so = childOf(ov, "startOverride");
      const sv = so ? num(attrOf(so, "val")) : undefined;
      if (sv !== undefined) startOverride.set(at, sv);
      const lv = childOf(ov, "lvl");
      if (lv) {
        if (levels === shared) levels = new Map(shared);
        const { ilvl, lvl } = readLvl(lv);
        levels.set(ilvl, lvl);
      }
    }
    out.set(numId, { levels, startOverride });
  }
  return out;
}

const ROMAN: readonly (readonly [number, string])[] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

function roman(n: number): string {
  let out = "";
  let left = n;
  for (const [v, s] of ROMAN) {
    while (left >= v) {
      out += s;
      left -= v;
    }
  }
  return out;
}

// 1→a, 26→z, 27→aa (Word's own lowerLetter wrap-around).
function letters(n: number): string {
  let out = "";
  let left = n;
  while (left > 0) {
    out = String.fromCharCode(97 + ((left - 1) % 26)) + out;
    left = Math.floor((left - 1) / 26);
  }
  return out;
}

function formatNum(n: number, fmt: string): string {
  switch (fmt) {
    case "lowerLetter":
      return letters(n);
    case "upperLetter":
      return letters(n).toUpperCase();
    case "lowerRoman":
      return roman(n);
    case "upperRoman":
      return roman(n).toUpperCase();
    case "decimalZero":
      return n < 10 ? `0${n}` : String(n);
    case "none":
      return "";
    default:
      return String(n);
  }
}

// ── formatting → CSS ─────────────────────────────────────────────────────────

function applyPPr(pPr: Element | undefined, into: Props): void {
  if (!pPr) return;
  const jc = childOf(pPr, "jc");
  const jcVal = jc && attrOf(jc, "val");
  if (jcVal === "both" || jcVal === "distribute") into.textAlign = "justify";
  else if (jcVal === "center") into.textAlign = "center";
  else if (jcVal === "right" || jcVal === "end") into.textAlign = "right";
  else if (jcVal === "left" || jcVal === "start") into.textAlign = "left";

  const ind = childOf(pPr, "ind");
  if (ind) {
    const firstLine = pt(attrOf(ind, "firstLine"));
    const left = pt(attrOf(ind, "left") ?? attrOf(ind, "start"));
    const right = pt(attrOf(ind, "right") ?? attrOf(ind, "end"));
    const hanging = num(attrOf(ind, "hanging"));
    if (left) into.marginLeft = left;
    if (right) into.marginRight = right;
    // A hanging indent is a negative first-line indent measured back from the
    // left indent — this is what puts a list marker out in the margin with the
    // wrapped lines aligned under the text, instead of under the marker.
    if (hanging !== undefined) into.textIndent = `${(-hanging / TWIPS_PER_PT).toFixed(1)}pt`;
    else if (firstLine) into.textIndent = firstLine;
  }

  const spacing = childOf(pPr, "spacing");
  if (spacing) {
    const before = pt(attrOf(spacing, "before"));
    const after = pt(attrOf(spacing, "after"));
    if (before) into.marginTop = before;
    if (after) into.marginBottom = after;
    const line = num(attrOf(spacing, "line"));
    const rule = (attrOf(spacing, "lineRule") || "auto").trim();
    if (line !== undefined && line > 0) {
      // "auto" is a multiple of a line in 240ths; "exact"/"atLeast" are twips.
      into.lineHeight = rule === "auto" ? Number((line / LINE_UNITS_PER_LINE).toFixed(3)) : `${(line / TWIPS_PER_PT).toFixed(1)}pt`;
    }
  }

  const fill = shdFill(childOf(pPr, "shd"));
  if (fill) into.background = fill;

  const bdr = childOf(pPr, "pBdr");
  if (bdr) {
    const top = borderSide(bdr, ["top"]);
    const bottom = borderSide(bdr, ["bottom"]);
    const left = borderSide(bdr, ["left", "start"]);
    const right = borderSide(bdr, ["right", "end"]);
    if (top) into.borderTop = top;
    if (bottom) into.borderBottom = bottom;
    if (left) into.borderLeft = left;
    if (right) into.borderRight = right;
  }
}

function applyRPr(rPr: Element | undefined, into: RunFmt): void {
  if (!rPr) return;
  const b = onOff(childOf(rPr, "b"));
  if (b !== undefined) into.bold = b;
  const i = onOff(childOf(rPr, "i"));
  if (i !== undefined) into.italic = i;
  const u = onOff(childOf(rPr, "u"));
  if (u !== undefined) into.underline = u;
  const strike = onOff(childOf(rPr, "strike"));
  if (strike !== undefined) into.strike = strike;
  const dstrike = onOff(childOf(rPr, "dstrike"));
  if (dstrike !== undefined) into.strike = dstrike;
  const caps = onOff(childOf(rPr, "caps"));
  if (caps !== undefined) into.caps = caps;

  const szEl = childOf(rPr, "sz");
  if (szEl) {
    const sz = num(attrOf(szEl, "val"));
    if (sz !== undefined && sz > 0) into.sz = sz;
  }
  // Assigned even when it resolves to undefined ("auto"), so a run can clear
  // a colour its style put on it.
  const colorEl = childOf(rPr, "color");
  if (colorEl) into.color = hex(attrOf(colorEl, "val"));

  const hl = childOf(rPr, "highlight");
  const hlVal = hl ? (attrOf(hl, "val") || "").trim() : "";
  const bg = (hlVal && hlVal !== "none" ? HIGHLIGHT[hlVal] : undefined) ?? shdFill(childOf(rPr, "shd"));
  if (bg) into.background = bg;

  const va = childOf(rPr, "vertAlign");
  if (va) {
    const v = attrOf(va, "val");
    into.superSub = v === "superscript" ? "super" : v === "subscript" ? "sub" : undefined;
  }
}

// The fully-inherited run formatting → the inline style object. Sizes come out
// as an em ratio against the document's own default size rather than as an
// absolute pt: the pane's base font (.92rem) is not the document's 10pt, so
// absolute sizes would shrink the whole sheet by a fifth and break the mobile
// layout, while the ratio reproduces exactly the emphasis the author wrote.
function runProps(fmt: RunFmt, baseSz: number): Props {
  const style: Props = {};
  if (fmt.bold !== undefined) style.fontWeight = fmt.bold ? "700" : "400";
  if (fmt.italic !== undefined) style.fontStyle = fmt.italic ? "italic" : "normal";
  const lines: string[] = [];
  if (fmt.underline) lines.push("underline");
  if (fmt.strike) lines.push("line-through");
  if (lines.length) style.textDecoration = lines.join(" ");
  else if (fmt.underline === false || fmt.strike === false) style.textDecoration = "none";
  // A size equal to the document default is left off entirely, so an ordinary
  // body run stays a bare text node instead of gaining a pointless <span>.
  const ratio = fmt.sz !== undefined && fmt.sz !== baseSz ? fmt.sz / baseSz : undefined;
  if (fmt.superSub) {
    style.verticalAlign = fmt.superSub;
    style.fontSize = `${((ratio ?? 1) * 0.75).toFixed(3)}em`;
  } else if (ratio !== undefined) {
    style.fontSize = `${ratio.toFixed(3)}em`;
  }
  if (fmt.color) style.color = fmt.color;
  if (fmt.background) style.background = fmt.background;
  if (fmt.caps) style.textTransform = "uppercase";
  return style;
}

// ── document.xml ─────────────────────────────────────────────────────────────

type Resolved = { para: Props; run: RunFmt; numPr?: Element };

type Ctx = {
  resolve: FieldResolver;
  // One running counter per field name across the whole document, so a field
  // used twice is numbered in document order rather than per run.
  seen: Record<string, number>;
  styles: StyleSheet;
  numbering: Map<string, NumDef>;
  // numId → the current number at each level. `undefined` at a level means
  // "not started yet", so it takes the level's w:start (or w:startOverride).
  counters: Map<string, (number | undefined)[]>;
  // Resolved w:pStyle chains, keyed by styleId — these templates repeat the
  // same handful of styles hundreds of times and the chain never changes.
  styleCache: Map<string, Resolved>;
};

function resolveParaStyle(ctx: Ctx, styleId: string | undefined): Resolved {
  // Prefixed so the "no w:pStyle at all" entry can never collide with a
  // styleId that happens to be spelled the same.
  const key = styleId === undefined ? "?" : `s:${styleId}`;
  const hit = ctx.styleCache.get(key);
  if (hit) return hit;
  const para: Props = {};
  const run: RunFmt = {};
  let numPr: Element | undefined;
  applyPPr(ctx.styles.defPPr, para);
  applyRPr(ctx.styles.defRPr, run);
  for (const def of chainOf(ctx.styles.para, styleId ?? ctx.styles.defaultPara)) {
    applyPPr(def.pPr, para);
    applyRPr(def.rPr, run);
    if (def.numPr) numPr = def.numPr;
  }
  const res: Resolved = { para, run, numPr };
  ctx.styleCache.set(key, res);
  return res;
}

// A run can hold more than one <w:t>/<w:tab>/<w:br> in sequence; concatenated
// into one string before token-splitting, so a `{{field}}` never straddles a
// run boundary that has nothing to do with where the template's author
// happened to break it. w:instrText is deliberately not read — a complex
// field's instruction must never leak into the document, only its cached
// <w:t> result.
function runText(rEl: Element): string {
  let text = "";
  for (const c of Array.from(rEl.children)) {
    const ln = localName(c);
    if (ln === "t") text += c.textContent || "";
    else if (ln === "tab") text += "\t";
    else if (ln === "br" || ln === "cr") text += "\n";
  }
  return text;
}

// A run can also carry a drawing or a VML shape, and either can hold a text
// box whose w:txbxContent is ordinary block content — paragraphs and tables,
// one level down. Rendered where the run sits, as its own block, which is
// where the reader sees it on the page: these hold the addressee block of a
// court filing, not decoration.
function txbxOf(rEl: Element): Element[] {
  const found: Element[] = [];
  const dig = (el: Element, depth: number): void => {
    if (depth > 8) return;
    for (const c of Array.from(el.children)) {
      if (localName(c) === "txbxContent") found.push(c);
      else dig(c, depth + 1);
    }
  };
  for (const c of Array.from(rEl.children)) {
    const ln = localName(c);
    if (ln === "pict" || ln === "drawing" || ln === "object" || ln === "AlternateContent") dig(c, 0);
  }
  return found;
}

function pushRun(rEl: Element, out: DocTree[], ctx: Ctx, base: RunFmt): void {
  // Before the run's own text: anything the run is carrying in a shape. A
  // text box is block content, so it cannot be folded into the run's inline
  // nodes — it becomes its own box in document order.
  for (const box of txbxOf(rEl)) {
    const blocks: DocTree[] = [];
    walkBlocks(box, blocks, ctx, MAX_TABLE_DEPTH - 1);
    if (blocks.length) out.push({ k: "el", tag: "div", attrs: { className: "doctxbx" }, children: blocks });
  }
  const text = runText(rEl);
  if (!text) return;
  const rPr = childOf(rEl, "rPr");
  // The paragraph's inherited run formatting first, then this run's own
  // character style chain, then its direct w:rPr — most specific last.
  const fmt: RunFmt = { ...base };
  const rStyleEl = rPr ? childOf(rPr, "rStyle") : undefined;
  const rStyle = rStyleEl ? attrOf(rStyleEl, "val") : null;
  if (rStyle) for (const def of chainOf(ctx.styles.char, rStyle)) applyRPr(def.rPr, fmt);
  applyRPr(rPr, fmt);
  const nodes = splitTokens(text, ctx.seen, ctx.resolve);
  const style = runProps(fmt, ctx.styles.baseSz);
  if (!Object.keys(style).length) {
    out.push(...nodes);
    return;
  }
  out.push({ k: "el", tag: "span", style, children: nodes });
}

// Runs sit as direct <w:p> children, but a hyperlink/tracked-change/smartTag
// wraps its own runs one level in — flattened by recursing into anything
// that isn't itself a run (paragraph properties and revision-marker elements
// simply have no runs under them, so recursing into those is a no-op).
// w:del is the exception: its runs are text a reviewer deleted, which the
// document no longer contains and the preview must not show.
function walkRunHolder(el: Element, out: DocTree[], ctx: Ctx, base: RunFmt): void {
  for (const c of Array.from(el.children)) {
    const ln = localName(c);
    if (ln === "pPr" || ln === "del") continue;
    if (ln === "r") pushRun(c, out, ctx, base);
    else walkRunHolder(c, out, ctx, base);
  }
}

// The list marker for a numbered/bulleted paragraph, advancing that numId's
// counters — and folding the level's own w:ind into `into` so the paragraph
// lands at the indent the list defines rather than at the left margin.
// Returns undefined when the paragraph turns out not to be numbered at all
// (w:numId 0, or a level whose format is "none").
function listMarker(ctx: Ctx, numPr: Element, into: Props): string | undefined {
  const numIdEl = childOf(numPr, "numId");
  const ilvlEl = childOf(numPr, "ilvl");
  const numId = numIdEl ? attrOf(numIdEl, "val") : null;
  const ilvl = Math.max(0, (ilvlEl ? num(attrOf(ilvlEl, "val")) : 0) ?? 0);
  if (!numId || numId.trim() === "0") return undefined;

  const def = ctx.numbering.get(numId.trim());
  const lvl = def?.levels.get(ilvl);
  if (lvl?.pPr) applyPPr(lvl.pPr, into);

  let counters = ctx.counters.get(numId);
  if (!counters) {
    counters = [];
    ctx.counters.set(numId, counters);
  }
  const prev = counters[ilvl];
  // Moving to a level restarts every level below it, exactly as Word does.
  counters.length = ilvl + 1;
  counters[ilvl] = prev === undefined ? def?.startOverride.get(ilvl) ?? lvl?.start ?? 1 : prev + 1;

  // numbering.xml missing, or a numId it doesn't define: the old hard-coded
  // decimal marker, which is still better than dropping the list entirely.
  if (!lvl) return `${counters[ilvl]}. `;
  if (lvl.fmt === "none") return undefined;
  // A bullet's w:lvlText IS the glyph ("●", "•", "–", "○"…) — never a number.
  if (lvl.fmt === "bullet") return `${lvl.text || "\u2022"} `;
  const pattern = lvl.text || `%${ilvl + 1}.`;
  const rendered = pattern.replace(/%(\d)/g, (_m, d: string) => {
    const at = Number(d) - 1;
    const n = counters[at];
    if (n === undefined) return "";
    const fmt = at === ilvl ? lvl.fmt : def?.levels.get(at)?.fmt ?? "decimal";
    return formatNum(n, fmt);
  });
  return `${rendered} `;
}

function walkParagraph(pEl: Element, ctx: Ctx): DocTree {
  const pPr = childOf(pEl, "pPr");
  const pStyleEl = pPr ? childOf(pPr, "pStyle") : undefined;
  const styleId = (pStyleEl && attrOf(pStyleEl, "val")) || undefined;
  const inherited = resolveParaStyle(ctx, styleId);
  // Copied, never mutated in place: the resolved chain is cached and shared by
  // every paragraph using that style.
  const style: Props = { ...inherited.para };
  const baseRun: RunFmt = { ...inherited.run };

  const out: DocTree[] = [];
  // OOXML's cascade: style → numbering level → direct w:pPr. The marker has to
  // be produced before the direct properties are applied (it contributes the
  // level's indent), and pushed before the runs.
  const numPr = readLvlOrStyleNumPr(pPr) ?? inherited.numPr;
  const marker = numPr ? listMarker(ctx, numPr, style) : undefined;
  applyPPr(pPr, style);
  if (marker) out.push({ k: "text", v: marker });
  walkRunHolder(pEl, out, ctx, baseRun);
  // An empty paragraph is a full blank line in Word, but an empty <p> with
  // white-space:pre-wrap has no line box at all — these templates use blank
  // paragraphs as deliberate spacing (before a signature block, between
  // sections), so it gets a non-breaking space to stand on.
  if (!out.length) out.push({ k: "text", v: "\u00A0" });
  return { k: "el", tag: "p", style: Object.keys(style).length ? style : undefined, children: out };
}

// ── tables ───────────────────────────────────────────────────────────────────

type CellPos = { tblBorders?: Element; firstRow: boolean; lastRow: boolean; firstCol: boolean; lastCol: boolean };

function buildCell(tcEl: Element, ctx: Ctx, depth: number, pos: CellPos): DocEl {
  const tcPr = childOf(tcEl, "tcPr");
  const own = tcPr ? childOf(tcPr, "tcBorders") : undefined;
  const tbl = pos.tblBorders;
  const style: Props = {};

  // A cell's own w:tcBorders wins; otherwise the table's w:tblBorders decide,
  // and which of its sides applies depends on where the cell sits — the outer
  // top/bottom/left/right for an edge cell, insideH/insideV for an inner one.
  const side = (names: string[], outer: boolean, inside: string): string | undefined =>
    borderSide(own, names) ?? borderSide(tbl, outer ? names : [inside]);
  const top = side(["top"], pos.firstRow, "insideH");
  const bottom = side(["bottom"], pos.lastRow, "insideH");
  const left = side(["left", "start"], pos.firstCol, "insideV");
  const right = side(["right", "end"], pos.lastCol, "insideV");
  if (top) style.borderTop = top;
  if (bottom) style.borderBottom = bottom;
  if (left) style.borderLeft = left;
  if (right) style.borderRight = right;

  const fill = shdFill(tcPr ? childOf(tcPr, "shd") : undefined);
  if (fill) style.background = fill;

  // w:tcMar sides carry their length in w:w, not w:val.
  const mar = tcPr ? childOf(tcPr, "tcMar") : undefined;
  const marPt = (...names: string[]): string | undefined => {
    if (!mar) return undefined;
    for (const n of names) {
      const el = childOf(mar, n);
      if (el) return pt(attrOf(el, "w"));
    }
    return undefined;
  };
  style.padding = [
    marPt("top") ?? DEFAULT_CELL_PAD.block,
    marPt("right", "end") ?? DEFAULT_CELL_PAD.inline,
    marPt("bottom") ?? DEFAULT_CELL_PAD.block,
    marPt("left", "start") ?? DEFAULT_CELL_PAD.inline,
  ].join(" ");

  // Word's default cell alignment is top, the browser's is middle — so this is
  // written out every time, not only when the file says so.
  const vaVal = ((): string | null => {
    const va = tcPr ? childOf(tcPr, "vAlign") : undefined;
    return va ? attrOf(va, "val") : null;
  })();
  style.verticalAlign = vaVal === "center" ? "middle" : vaVal === "bottom" ? "bottom" : "top";

  const children: DocTree[] = [];
  walkBlocks(tcEl, children, ctx, depth);
  if (!children.length) children.push({ k: "el", tag: "p", children: [{ k: "text", v: "\u00A0" }] });
  return { k: "el", tag: "td", style, children };
}

function walkTable(tblEl: Element, ctx: Ctx, depth: number): DocTree {
  const tblPr = childOf(tblEl, "tblPr");
  const tblBorders = tblPr ? childOf(tblPr, "tblBorders") : undefined;
  const style: Props = { borderCollapse: "collapse", width: "100%" };

  // A dxa table width is an absolute page measurement (these templates use
  // 9638 twips ≈ 482pt) and would overflow the pane on anything narrower than
  // a real A4 text column. The column *proportions* from w:tblGrid are what
  // carry the table's shape, so the table itself fills the sheet and w:tblW is
  // only honoured when it is already relative (type="pct", in fiftieths of a
  // percent).
  const tblW = tblPr ? childOf(tblPr, "tblW") : undefined;
  if (tblW && (attrOf(tblW, "type") || "").trim() === "pct") {
    const w = num(attrOf(tblW, "w"));
    if (w !== undefined && w > 0) style.width = `${Math.min(w / 50, 100).toFixed(2)}%`;
  }
  const jc = tblPr ? childOf(tblPr, "jc") : undefined;
  const jcVal = jc ? attrOf(jc, "val") : null;
  if (jcVal === "center") {
    style.marginLeft = "auto";
    style.marginRight = "auto";
  } else if (jcVal === "right" || jcVal === "end") {
    style.marginLeft = "auto";
    style.marginRight = "0";
  }

  const children: DocTree[] = [];
  const grid = childOf(tblEl, "tblGrid");
  const widths = grid ? childrenOf(grid, "gridCol").map((c) => num(attrOf(c, "w")) ?? 0) : [];
  const total = widths.reduce((a, b) => a + b, 0);
  if (widths.length && total > 0) {
    // Percentages on a <colgroup> plus table-layout:fixed is the only way the
    // browser reproduces Word's column widths rather than re-measuring them
    // from the content.
    style.tableLayout = "fixed";
    children.push({
      k: "el",
      tag: "colgroup",
      children: widths.map((w): DocTree => ({ k: "el", tag: "col", children: [], style: { width: `${((w / total) * 100).toFixed(3)}%` } })),
    });
  }

  const rows = childrenOf(tblEl, "tr");
  // Vertically merged cells: the grid column a merge started in → the <td>
  // that owns it, whose rowSpan grows for every continuation row. The
  // continuation cells themselves emit nothing, so the row keeps the right
  // number of columns instead of the content appearing twice.
  const open = new Map<number, DocEl>();
  const body: DocTree[] = [];
  rows.forEach((trEl, ri) => {
    const tcs = childrenOf(trEl, "tc");
    const cells: DocTree[] = [];
    let col = 0;
    tcs.forEach((tcEl, ci) => {
      const tcPr = childOf(tcEl, "tcPr");
      const spanEl = tcPr ? childOf(tcPr, "gridSpan") : undefined;
      const span = Math.max(1, (spanEl ? num(attrOf(spanEl, "val")) : undefined) ?? 1);
      const vm = tcPr ? childOf(tcPr, "vMerge") : undefined;
      // A bare <w:vMerge/> means "continue" — only an explicit "restart"
      // begins a new merge.
      const vmVal = vm ? (attrOf(vm, "val") ?? "continue").trim() : null;
      if (vmVal !== null && vmVal !== "restart") {
        const owner = open.get(col);
        if (owner) {
          const attrs = owner.attrs ?? (owner.attrs = {});
          attrs.rowSpan = Number(attrs.rowSpan ?? 1) + 1;
          col += span;
          return;
        }
      }
      const cell = buildCell(tcEl, ctx, depth, {
        tblBorders,
        firstRow: ri === 0,
        lastRow: ri === rows.length - 1,
        firstCol: ci === 0,
        lastCol: ci === tcs.length - 1,
      });
      if (span > 1) cell.attrs = { ...(cell.attrs ?? {}), colSpan: span };
      if (vmVal === "restart") open.set(col, cell);
      else open.delete(col);
      cells.push(cell);
      col += span;
    });
    if (cells.length) body.push({ k: "el", tag: "tr", children: cells });
  });
  children.push({ k: "el", tag: "tbody", children: body });
  return { k: "el", tag: "table", style, children };
}

// Every w:p found anywhere under `el`, as flat paragraphs — the fallback for a
// table nested past MAX_TABLE_DEPTH: its text is kept, its grid is not.
function flattenBlocks(el: Element, out: DocTree[], ctx: Ctx): void {
  for (const c of Array.from(el.children)) {
    if (localName(c) === "p") out.push(walkParagraph(c, ctx));
    else flattenBlocks(c, out, ctx);
  }
}

// Block-level content of a w:body or a w:tc: paragraphs, tables, and the
// content of a structured-document tag (a content control, which wraps its
// real blocks one level down).
function walkBlocks(container: Element, out: DocTree[], ctx: Ctx, depth: number): void {
  for (const c of Array.from(container.children)) {
    const ln = localName(c);
    if (ln === "p") out.push(walkParagraph(c, ctx));
    else if (ln === "tbl") {
      if (depth >= MAX_TABLE_DEPTH) flattenBlocks(c, out, ctx);
      else out.push(walkTable(c, ctx, depth + 1));
    } else if (ln === "sdt") {
      const content = childOf(c, "sdtContent");
      if (content) walkBlocks(content, out, ctx, depth);
    }
  }
}

// The template's source DOCX (its raw bytes) → the same DocTree shape
// DocPaper already knows how to render (see docTemplate.ts). Browser-only
// (JSZip + DOMParser); only ever called from a "use client" component.
// `fields` resolves the 2026-09-23-import marker style (`{Human label}`,
// no machine name inside the braces — see docTemplate.ts's file header) to
// the field it belongs to; omit it only for a template still using the
// original `{{field_name}}` style, where no lookup is needed.
export async function docxToTree(buf: ArrayBuffer, fields: DocField[] = []): Promise<DocTree[]> {
  if (typeof window === "undefined") return [];
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file("word/document.xml");
  if (!entry) return [];
  // styles.xml and numbering.xml are optional parts — a file without them
  // renders exactly as it did before they were read.
  const optional = (name: string): Promise<string | null> => {
    const f = zip.file(name);
    return f ? f.async("text") : Promise.resolve(null);
  };
  const [xml, stylesXml, numberingXml] = await Promise.all([entry.async("text"), optional("word/styles.xml"), optional("word/numbering.xml")]);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) return [];
  const ctx: Ctx = {
    resolve: buildFieldResolver(fields),
    seen: {},
    styles: readStyles(stylesXml),
    numbering: readNumbering(numberingXml),
    counters: new Map(),
    styleCache: new Map(),
  };
  const out: DocTree[] = [];
  walkBlocks(body, out, ctx, 0);
  return out;
}
