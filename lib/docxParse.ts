"use client";

// Client-side DOCX → DocTree, read straight from the file's own XML rather
// than through a semantic-HTML conversion (mammoth, tried first — dropped
// because it deliberately ignores direct paragraph formatting like alignment
// and indent, which is exactly what makes a Uzbek court filing look like one:
// a justified, first-line-indented body, a centered bold title, and a header/
// signature block pushed right by a fixed left indent). This reads only what
// these templates actually use — paragraphs, runs, bold/italic/underline,
// paragraph alignment/indent, and a simple decimal numbered list — not a
// general OOXML renderer; a template with a table or an image loses that
// content rather than crashing.

import JSZip from "jszip";
import { splitTokens, buildFieldResolver, type DocField, type DocTree, type FieldResolver } from "./docTemplate";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const TWIPS_PER_PT = 20;

function localName(el: Element): string {
  return el.localName || el.tagName.split(":").pop() || "";
}
function childOf(el: Element, name: string): Element | undefined {
  return Array.from(el.children).find((c) => localName(c) === name);
}
function attrOf(el: Element, name: string): string | null {
  return el.getAttributeNS(W_NS, name) ?? el.getAttribute(`w:${name}`) ?? el.getAttribute(name);
}

// Twentieths of a point (OOXML's unit for indents) → a CSS length. Applied
// as-is rather than scaled to the pane's width: on a normal desktop pane this
// already lines up closely with the real page: on a narrow phone screen the
// indented lines wrap tighter, the same way the real page would look cramped
// shrunk that far — not incorrect, just a real document at a small size.
const pt = (twips: string | null): string | undefined => (twips ? `${(Number(twips) / TWIPS_PER_PT).toFixed(1)}pt` : undefined);

function paraStyle(pPr: Element | undefined): Record<string, string | number> | undefined {
  if (!pPr) return undefined;
  const style: Record<string, string | number> = {};
  const jc = childOf(pPr, "jc");
  const jcVal = jc && attrOf(jc, "val");
  if (jcVal === "both" || jcVal === "distribute") style.textAlign = "justify";
  else if (jcVal === "center") style.textAlign = "center";
  else if (jcVal === "right" || jcVal === "end") style.textAlign = "right";
  const ind = childOf(pPr, "ind");
  if (ind) {
    const firstLine = pt(attrOf(ind, "firstLine"));
    const left = pt(attrOf(ind, "left") ?? attrOf(ind, "start"));
    const right = pt(attrOf(ind, "right") ?? attrOf(ind, "end"));
    if (firstLine) style.textIndent = firstLine;
    if (left) style.marginLeft = left;
    if (right) style.marginRight = right;
  }
  return Object.keys(style).length ? style : undefined;
}

// True unless the property is explicitly turned off — OOXML's own default:
// a bare `<w:b/>` (no w:val) means "on", only w:val="0"/"false"/"none" means
// "off" (a paragraph's inherited style being cancelled for one run).
function runFlagOn(rPr: Element | undefined, name: string): boolean {
  const el = rPr && childOf(rPr, name);
  if (!el) return false;
  const v = attrOf(el, "val");
  return v !== "0" && v !== "false" && v !== "none";
}

// A run can hold more than one <w:t>/<w:tab>/<w:br> in sequence; concatenated
// into one string before token-splitting, so a `{{field}}` never straddles a
// run boundary that has nothing to do with where the template's author
// happened to break it.
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

function pushRun(rEl: Element, out: DocTree[], seen: Record<string, number>, resolve: FieldResolver): void {
  const text = runText(rEl);
  if (!text) return;
  const rPr = childOf(rEl, "rPr");
  const bold = runFlagOn(rPr, "b");
  const italic = runFlagOn(rPr, "i");
  const underline = runFlagOn(rPr, "u");
  const nodes = splitTokens(text, seen, resolve);
  if (!bold && !italic && !underline) {
    out.push(...nodes);
    return;
  }
  const style: Record<string, string> = {};
  if (bold) style.fontWeight = "700";
  if (italic) style.fontStyle = "italic";
  if (underline) style.textDecoration = "underline";
  out.push({ k: "el", tag: "span", style, children: nodes });
}

// Runs sit as direct <w:p> children, but a hyperlink/tracked-change/smartTag
// wraps its own runs one level in — flattened by recursing into anything
// that isn't itself a run (paragraph properties and revision-marker elements
// simply have no runs under them, so recursing into those is a no-op).
function walkRunHolder(el: Element, out: DocTree[], seen: Record<string, number>, resolve: FieldResolver): void {
  for (const c of Array.from(el.children)) {
    const ln = localName(c);
    if (ln === "pPr") continue;
    if (ln === "r") pushRun(c, out, seen, resolve);
    else walkRunHolder(c, out, seen, resolve);
  }
}

function walkParagraph(pEl: Element, seen: Record<string, number>, numSeq: Map<string, number>, resolve: FieldResolver): DocTree {
  const pPr = childOf(pEl, "pPr");
  const style = paraStyle(pPr);
  const out: DocTree[] = [];
  const numPr = pPr && childOf(pPr, "numPr");
  if (numPr) {
    // Only the format these templates actually use — a plain decimal list
    // ("1. ", "2. "…); the real list level/format lives in numbering.xml,
    // not read here.
    const numIdEl = childOf(numPr, "numId");
    const ilvlEl = childOf(numPr, "ilvl");
    const key = `${numIdEl ? attrOf(numIdEl, "val") : "0"}:${ilvlEl ? attrOf(ilvlEl, "val") : "0"}`;
    const n = (numSeq.get(key) ?? 0) + 1;
    numSeq.set(key, n);
    out.push({ k: "text", v: `${n}. ` });
  }
  walkRunHolder(pEl, out, seen, resolve);
  return { k: "el", tag: "p", style, children: out };
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
  const xml = await entry.async("text");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) return [];
  const resolve = buildFieldResolver(fields);
  const seen: Record<string, number> = {};
  const numSeq = new Map<string, number>();
  const out: DocTree[] = [];
  for (const c of Array.from(body.children)) {
    if (localName(c) === "p") out.push(walkParagraph(c, seen, numSeq, resolve));
    // w:tbl (tables) aren't handled — not used in these templates today; one
    // that had a table would simply lose its rows rather than throw.
  }
  return out;
}
