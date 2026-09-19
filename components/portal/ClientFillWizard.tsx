"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { detectBlanks, segments as buildSegments, plainText, type BlankSlot } from "@/lib/blankFill";
import { IconChevronLeft, IconChevronRight, IconClipboardCheck, IconDownload } from "@/components/icons";

// Interim fallback for a fieldless template whose raw text still has
// "_______" blanks (LEXGO_CIVIL_COURT_DOCS_FIELDS_KERAK_2026-09-19.md): the
// same one-blank-per-step + live preview mechanic as DocWizard, but driven
// entirely client-side from the blanks detected in the template text — the
// backend has no placeholder to substitute these into yet, so this never
// calls generate/file; it only fills the text for copy/print locally.
export default function ClientFillWizard({ title, templateText }: { title: string; templateText: string }) {
  const t = useTranslations("portal.client.documents");
  const { cleaned, slots } = useMemo(() => detectBlanks(templateText), [templateText]);
  const segs = useMemo(() => buildSegments(cleaned, slots), [cleaned, slots]);
  const [values, setValues] = useState<string[]>(() => slots.map(() => ""));
  const [idx, setIdx] = useState(0);
  const [touched, setTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [idx]);

  const total = slots.length;
  const filled = values.filter((v) => v.trim()).length;
  const pct = total ? Math.round((filled / total) * 100) : 0;
  const last = idx === total - 1;
  const slot: BlankSlot | undefined = slots[idx];

  function setVal(v: string) {
    setValues((prev) => { const next = [...prev]; next[idx] = v; return next; });
  }
  function next() {
    setTouched(true);
    if (!values[idx]?.trim()) return;
    setTouched(false);
    if (!last) setIdx((i) => i + 1);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(plainText(segs, values));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  }

  function printView() {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    const body = plainText(segs, values).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:"Courier New",monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;max-width:800px;margin:32px auto;padding:0 16px}</style></head><body>${body}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  if (!total) return null;

  return (
    <div className="dwiz2col">
      <div className="dwiz">
        <p className="advmuted">{t("clientFillNote")}</p>
        <div className="dwiz__top">
          <span className="dwiz__step">{t("wizStep", { n: idx + 1, total })}</span>
          <span className="dwiz__pct">{t("wizFilled", { pct })}</span>
        </div>
        <div className="dwiz__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
        {slot ? (
          <div className={`dwiz__f${touched && !values[idx]?.trim() ? " err" : ""}`}>
            <label htmlFor="cfw-input">{slot.label}</label>
            <input
              id="cfw-input"
              value={values[idx] || ""}
              onChange={(e) => setVal(e.target.value)}
              aria-invalid={(touched && !values[idx]?.trim()) || undefined}
            />
            {touched && !values[idx]?.trim() ? <small className="dwiz__err">{t("wizRequired")}</small> : null}
          </div>
        ) : null}
        <div className="dwiz__nav">
          <button type="button" className="btn btn--ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}><IconChevronLeft />{t("wizBack")}</button>
          {!last ? (
            <button type="button" className="btn btn--pri" onClick={next}>{t("wizNext")}<IconChevronRight /></button>
          ) : null}
        </div>
        {last ? (
          <div className="dwiz__nav" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn--line" onClick={copy}><IconClipboardCheck />{copied ? t("copied") : t("copyText")}</button>
            <button type="button" className="btn btn--pri" onClick={printView}><IconDownload />{t("printOrSave")}</button>
          </div>
        ) : null}
      </div>
      <aside className="dwprevpane">
        <div className="dwprev">
          <b>{t("previewTitle")}</b>
          <p>
            {segs.map((s, i) => {
              if ("text" in s) return s.text;
              const v = values[s.index]?.trim();
              if (v) return <span key={i}>{v}</span>;
              const active = s.index === idx;
              return (
                <span key={i} ref={active ? activeRef : undefined} className={`dwprev__blank${active ? " dwprev__blank--active" : ""}`}>
                  {s.label}
                </span>
              );
            })}
          </p>
        </div>
      </aside>
    </div>
  );
}
