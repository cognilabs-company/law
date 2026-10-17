"use client";

import { useSyncExternalStore, type ReactElement } from "react";
import { useTranslations } from "next-intl";

const ALLOWED = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "H3", "H4", "A", "BLOCKQUOTE"]);
const DROPPED = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TITLE", "HEAD", "TEXTAREA", "SELECT"]);
const TAG_RE = /<\/?[a-z][^>]*>/i;

function safeHref(raw: string | null): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "mailto:" ? u.href : "";
  } catch {
    return "";
  }
}

function copyInto(src: Node, dest: Node, doc: Document): void {
  for (const child of Array.from(src.childNodes)) {
    if (child.nodeType === 3) {
      dest.appendChild(doc.createTextNode(child.textContent ?? ""));
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const tag = el.tagName.toUpperCase();
    if (DROPPED.has(tag)) continue;
    if (!ALLOWED.has(tag)) {
      copyInto(el, dest, doc);
      continue;
    }
    if (tag === "A") {
      const href = safeHref(el.getAttribute("href"));
      if (!href) {
        copyInto(el, dest, doc);
        continue;
      }
      const a = doc.createElement("a");
      a.setAttribute("href", href);
      a.setAttribute("rel", "noopener noreferrer");
      a.setAttribute("target", "_blank");
      copyInto(el, a, doc);
      dest.appendChild(a);
      continue;
    }
    const out = doc.createElement(tag.toLowerCase());
    copyInto(el, out, doc);
    dest.appendChild(out);
  }
}

export function sanitizeRuleHtml(html: string): string {
  if (!html || typeof DOMParser === "undefined") return "";
  const parsed = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");
  const clean = document.implementation.createHTMLDocument("");
  const box = clean.createElement("div");
  copyInto(parsed.body, box, clean);
  return box.innerHTML;
}

const cache = new Map<string, string>();

function cleaned(html: string): string {
  const hit = cache.get(html);
  if (hit !== undefined) return hit;
  const out = sanitizeRuleHtml(html);
  if (cache.size > 64) cache.clear();
  cache.set(html, out);
  return out;
}

const noop = () => () => {};

export default function RuleBody({ html }: { html: string }): ReactElement {
  const t = useTranslations("sellerServices.rules");
  const src = html.trim();
  const rich = TAG_RE.test(src);
  const safe = useSyncExternalStore(noop, () => (rich ? cleaned(src) : ""), () => "");
  if (!src) return <p className="svr-body svr-body--none">{t("noBody")}</p>;
  if (!rich) {
    const paras = src.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    return (
      <div className="svr-body svr-body--plain">
        {paras.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    );
  }
  return <div className="svr-body" dangerouslySetInnerHTML={{ __html: safe }} />;
}
