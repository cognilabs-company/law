"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { splitFilledText, type DocSeg } from "@/lib/docTemplate";

// The document itself, filled in as the client types.
//
// It renders the template's own text (white-space:pre-wrap keeps the
// authored line breaks) with every `{{field}}` replaced by the answer — the
// same substitution the backend does when it builds the PDF, so this pane is
// the document, not an approximation of it. A field with no answer yet is a
// clickable `[Label]` blank: pressing it jumps to that question, and focusing
// a question highlights and scrolls to its spots here. A field used in more
// than one place (every template repeats claimant_full_name and
// application_date) lights up in all of them at once.
export default function DocPaper({
  segs,
  values,
  labelOf,
  active,
  onPick,
  fallbackText,
}: {
  segs: DocSeg[];
  values: Record<string, string>;
  labelOf: (name: string) => string;
  active: string;
  onPick: (name: string) => void;
  // Used only when the template text isn't available and all we have is text
  // the backend already filled in (POST …/preview).
  fallbackText?: string;
}) {
  const t = useTranslations("portal.client.documents");
  const pane = useRef<HTMLDivElement>(null);
  const spots = useRef(new Map<string, HTMLElement>());

  // Bring the active field's first spot into view inside this pane only —
  // scrollIntoView would also scroll the page and the form column with it.
  useEffect(() => {
    if (!active) return;
    const el = spots.current.get(`${active}#0`);
    const box = pane.current;
    if (!el || !box) return;
    const er = el.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    if (er.top >= br.top + 16 && er.bottom <= br.bottom - 16) return;
    box.scrollTo({ top: box.scrollTop + (er.top - br.top) - br.height / 2 + er.height / 2, behavior: "smooth" });
  }, [active, values]);

  const body = useMemo(() => {
    if (!segs.length && fallbackText) {
      return splitFilledText(fallbackText).map((p, i) =>
        p.blank ? (
          <span key={i} className="docpaper__b docpaper__b--flat">[{p.v}]</span>
        ) : (
          <span key={i}>{p.v}</span>
        ),
      );
    }
    return segs.map((s, i) => {
      if (s.k === "text") return <span key={i}>{s.v}</span>;
      const key = `${s.name}#${s.n}`;
      const v = values[s.name] ?? "";
      const on = active === s.name;
      const ref = (el: HTMLElement | null) => {
        if (el) spots.current.set(key, el);
        else spots.current.delete(key);
      };
      const name = labelOf(s.name);
      return v ? (
        <span key={i} ref={ref} className={`docpaper__v${on ? " on" : ""}`}>
          {v}
        </span>
      ) : (
        // Written the same way as the chip above its question — `[Label]` in
        // both places — so it is obvious which blank a question fills.
        <button
          key={i}
          ref={ref}
          type="button"
          className={`docpaper__b${on ? " on" : ""}`}
          onClick={() => onPick(s.name)}
          title={t("jumpToField", { label: name })}
        >
          [{name}]
        </button>
      );
    });
  }, [segs, values, active, fallbackText, labelOf, onPick, t]);

  return (
    <div className="docpaper">
      <div className="docpaper__top">
        <span className="docpaper__badge">{t("previewTitle")}</span>
        <span className="docpaper__note">{t("previewLive")}</span>
      </div>
      <div className="docpaper__scroll" ref={pane}>
        {/* Neither the template text nor a server-filled preview came back —
            say so, rather than showing a blank sheet that reads as a broken
            or empty document. */}
        {body.length ? (
          <article className="docpaper__sheet">{body}</article>
        ) : (
          <p className="docpaper__none">{t("previewUnavailable")}</p>
        )}
      </div>
    </div>
  );
}
