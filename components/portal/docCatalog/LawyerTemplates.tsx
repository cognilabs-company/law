"use client";

import "./lawyerTemplates.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState, ErrorState } from "@/components/portal/DataState";
import { IconDownload, IconFileText, IconSearch } from "@/components/icons";
import { downloadTemplateFile, getDocumentTemplateCategories, type DocTemplateCategory } from "@/lib/services/backend";
import { CATALOG_PAGE, listTemplateCatalog, type TemplateCard } from "@/lib/services/docTemplates";
import { uzLabel } from "@/lib/uzScript";

// The template library for lawyers: the backend searches and pages the
// catalog (cards only); a template's file is fetched only when downloaded.

type State = { key: string; status: "loading" | "ready" | "error"; items: TemplateCard[]; total: number; hasMore: boolean; more: boolean };

function Download({ card }: { card: TemplateCard }): ReactElement {
  const t = useTranslations("portal.lawyer.documents");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function go() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await downloadTemplateFile(card.id, card.sourceFileName || `${card.title || "template"}.docx`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="btn btn--line btn--sm ltpl__dl" onClick={() => void go()} disabled={busy} aria-busy={busy || undefined} aria-label={t("downloadNamed", { name: card.title })}>
      <IconDownload aria-hidden="true" />
      <span>{busy ? t("downloading") : failed ? t("retry") : t("download")}</span>
    </button>
  );
}

export default function LawyerTemplates(): ReactElement {
  const t = useTranslations("portal.lawyer.documents");
  const tc = useTranslations("portal.client.services.tpl");
  const locale = useLocale();
  const [cats, setCats] = useState<DocTemplateCategory[]>([]);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State | null>(null);
  const moreCtl = useRef<AbortController | null>(null);
  const key = `${cat}|${term}|${attempt}`;

  useEffect(() => {
    const ctl = new AbortController();
    getDocumentTemplateCategories(ctl.signal).then(
      (list) => !ctl.signal.aborted && setCats(list),
      () => undefined,
    );
    return () => ctl.abort();
  }, []);
  useEffect(() => {
    const h = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(h);
  }, [q]);
  useEffect(() => {
    const ctl = new AbortController();
    listTemplateCatalog({ category: cat, q: term }, ctl.signal).then(
      (p) => !ctl.signal.aborted && setState({ key, status: "ready", items: p.items, total: p.total, hasMore: p.hasMore, more: false }),
      () => !ctl.signal.aborted && setState({ key, status: "error", items: [], total: 0, hasMore: false, more: false }),
    );
    return () => {
      ctl.abort();
      moreCtl.current?.abort();
    };
  }, [key, cat, term]);

  const cur = state?.key === key ? state : null;
  function more() {
    if (!cur || cur.more || !cur.hasMore) return;
    const ctl = new AbortController();
    moreCtl.current = ctl;
    setState({ ...cur, more: true });
    listTemplateCatalog({ category: cat, q: term, offset: cur.items.length }, ctl.signal).then(
      (p) => !ctl.signal.aborted && setState((s) => (s && s.key === key ? { ...s, items: [...s.items, ...p.items], hasMore: p.hasMore, more: false } : s)),
      () => !ctl.signal.aborted && setState((s) => (s && s.key === key ? { ...s, more: false } : s)),
    );
  }
  const catLabel = (k: string, fallback = "") => (tc.has(`cat.${k}`) ? tc(`cat.${k}`) : fallback || k);
  const langLabel = (k: string) => (tc.has(`lang.${k}`) ? tc(`lang.${k}`) : k);
  const all = cats.reduce((n, c) => n + c.templatesCount, 0);

  return (
    <section className="ppanel ltpl" aria-labelledby="ltpl-title" data-ai-target="doc-templates:list">
      <div className="ppanel__h">
        <b className="ppanel__t" id="ltpl-title">
          <span className="pico">
            <IconFileText />
          </span>
          {t("libraryTitle")}
        </b>
        {cur?.status === "ready" ? <span className="advmuted">{tc("count", { n: cur.total })}</span> : null}
      </div>
      <p className="ltpl__lead">{t("libraryLead")}</p>

      <label className="ltpl__search">
        <IconSearch aria-hidden="true" />
        <input type="search" value={q} maxLength={120} onChange={(e) => setQ(e.target.value)} placeholder={tc("search")} aria-label={tc("search")} />
      </label>

      <div className="ltpl__cats" role="radiogroup" aria-label={tc("category")}>
        {[{ key: "", title: tc("allCategories"), templatesCount: all }, ...cats].map((c) => (
          <button key={c.key || "all"} type="button" role="radio" aria-checked={cat === c.key} onClick={() => setCat(c.key)}>
            {c.key ? catLabel(c.key, c.title) : tc("allCategories")}
            {c.templatesCount ? <span className="sx-num">{c.templatesCount}</span> : null}
          </button>
        ))}
      </div>

      {!cur ? (
        <ul className="ltpl__list" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="ltpl__row ltpl__row--ghost" />
          ))}
        </ul>
      ) : cur.status === "error" ? (
        <ErrorState title={t("loadFailed")} onRetry={() => setAttempt((n) => n + 1)} compact />
      ) : !cur.items.length ? (
        <EmptyState icon={term ? <IconSearch /> : <IconFileText />} title={term ? tc("noMatch", { q: term }) : t("empty")} text={term ? tc("noMatchText") : t("emptyText")} />
      ) : (
        <>
          <ul className="ltpl__list">
            {cur.items.map((c) => (
              <li key={c.id} className="ltpl__row">
                <span className="ltpl__ic" aria-hidden="true">
                  <IconFileText />
                </span>
                <div className="ltpl__main">
                  <b>{uzLabel(c.title, locale)}</b>
                  <span className="ltpl__chips">
                    {c.category ? <i>{catLabel(c.category)}</i> : null}
                    {c.language ? <i data-k="lang">{langLabel(c.language)}</i> : null}
                    {c.hasSourceFile ? <i data-k="file">DOCX</i> : null}
                  </span>
                </div>
                <Download card={c} />
              </li>
            ))}
          </ul>
          {cur.hasMore ? (
            <div className="ltpl__more">
              <button type="button" className="btn btn--line" onClick={more} disabled={cur.more} aria-busy={cur.more || undefined}>
                {cur.more ? tc("loadingMore") : tc("more", { n: Math.min(CATALOG_PAGE, cur.total - cur.items.length), left: cur.total - cur.items.length })}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
