"use client";

import "./docCatalog.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import { EmptyState, ErrorState } from "@/components/portal/DataState";
import { IconArrowRight, IconDocLines, IconEye, IconFileText, IconGlobe, IconGrid, IconSearch } from "@/components/icons";
import { getDocumentTemplateCategories, type DocTemplateCategory } from "@/lib/services/backend";
import { CATALOG_PAGE, listTemplateCatalog, type TemplateCard, type TemplatePage } from "@/lib/services/docTemplates";
import { searchTerms } from "@/lib/searchText";
import { fmtUzs } from "@/lib/money";
import { aiId } from "@/lib/ai/ids";
import { useAiField, useAiSelection } from "@/lib/ai/registry";
import { useAiReveal } from "@/lib/guide/targets";
import { generalCategoryImage, subcategoryImage } from "./images";

// The ready-document catalog, built on the templates themselves
// (FRONTEND_MOBILE_LEGAL_DOCUMENT_TEMPLATES_FULL_FLOW_2026_10_22.md §1, §3.1):
// categories from GET /document-template-categories, templates from
// GET /document-templates. One category is loaded at a time; the whole
// catalog only when a search runs across all of them.

const TTL_MS = 5 * 60_000;
type Sort = "title" | "new";
type Loaded = { key: string; status: "ready" | "error"; list: TemplateCard[]; total: number; hasMore: boolean; more: "" | "loading" | "error"; error?: unknown };

// The category keys as the AI guide already knows them on this page.
const CATEGORY_AI_SLUG: Record<string, string> = {
  "legal-doc-civil": "fuqarolik",
  "legal-doc-criminal": "jinoiy",
  "legal-doc-administrative": "mamuriy",
  "legal-doc-economic": "iqtisodiy",
};
const CATEGORY_IMAGE_NAME: Record<string, string> = {
  "legal-doc-civil": "fuqarolik",
  "legal-doc-criminal": "jinoiy",
  "legal-doc-administrative": "mamuriy",
  "legal-doc-economic": "iqtisodiy",
};

// First pages, kept a few minutes so going back to the catalog is instant;
// never longer, so a stale empty answer cannot stick (§23.10).
const cache = new Map<string, { at: number; page: TemplatePage }>();

// One page of cards at a time from the backend (search included); "show
// more" asks for the next page and appends it.
function useTemplates(category: string, language: string, q: string, enabled: boolean, attempt: number) {
  const base = `${category}|${language}|${q}`;
  const key = `${base}|${attempt}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const moreCtl = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const hit = cache.get(base);
    const ctl = new AbortController();
    const done = (page: TemplatePage | null, error?: unknown) =>
      !ctl.signal.aborted && setLoaded(page ? { key, status: "ready", list: page.items, total: page.total, hasMore: page.hasMore, more: "" } : { key, status: "error", list: [], total: 0, hasMore: false, more: "", error });
    if (hit && Date.now() - hit.at < TTL_MS) {
      Promise.resolve().then(() => done(hit.page));
    } else {
      listTemplateCatalog({ category, language, q }, ctl.signal).then(
        (page) => {
          cache.set(base, { at: Date.now(), page });
          done(page);
        },
        (error) => done(null, error),
      );
    }
    return () => {
      ctl.abort();
      moreCtl.current?.abort();
    };
  }, [key, base, category, language, q, enabled]);
  const current = enabled && loaded?.key === key ? loaded : null;
  const more = () => {
    if (!current || current.more === "loading" || !current.hasMore) return;
    const ctl = new AbortController();
    moreCtl.current = ctl;
    setLoaded({ ...current, more: "loading" });
    listTemplateCatalog({ category, language, q, offset: current.list.length }, ctl.signal).then(
      (page) => {
        if (ctl.signal.aborted) return;
        setLoaded((l) => (l && l.key === key ? { ...l, list: [...l.list, ...page.items.filter((c) => !l.list.some((x) => x.id === c.id))], hasMore: page.hasMore, total: page.total || l.total, more: "" } : l));
      },
      () => !ctl.signal.aborted && setLoaded((l) => (l && l.key === key ? { ...l, more: "error" } : l)),
    );
  };
  return { loaded: current, more };
}

export default function TemplateCatalog({ actions, initialCategory = "", initialQuery = "" }: { actions?: ReactNode; initialCategory?: string; initialQuery?: string }) {
  const t = useTranslations("portal.client.services.tpl");
  const locale = useLocale();
  const [cats, setCats] = useState<{ status: "loading" | "ready" | "error"; list: DocTemplateCategory[]; error?: unknown }>({ status: "loading", list: [] });
  const [catTry, setCatTry] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    getDocumentTemplateCategories(ctl.signal).then(
      (list) => !ctl.signal.aborted && setCats({ status: "ready", list }),
      (error) => !ctl.signal.aborted && setCats({ status: "error", list: [], error }),
    );
    return () => ctl.abort();
  }, [catTry]);

  const [cat, setCat] = useState(initialCategory);
  const [lang, setLang] = useState("");
  const [sort, setSort] = useState<Sort>("title");
  const [q, setQ] = useState(initialQuery);
  const [term, setTerm] = useState(initialQuery.trim());
  const [attempt, setAttempt] = useState(0);
  // §5.2: debounced, never on every keystroke.
  useEffect(() => {
    const h = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(h);
  }, [q]);
  // Keeps the address in step so a reload or a shared link lands here.
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [k, v] of [["cat", cat], ["q", term]] as const) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    window.history.replaceState(window.history.state, "", url.toString());
  }, [cat, term]);

  const known = cats.status === "ready" && cats.list.some((c) => c.key === cat) ? cat : cats.status === "ready" ? "" : cat;
  const searching = searchTerms(term).length > 0;
  // "All directions" is the whole catalog: the first screen is a list to
  // pick from (§2), loaded once and kept for a few minutes.
  const { loaded, more } = useTemplates(known, lang, term, cats.status !== "loading", attempt);
  const status = loaded ? loaded.status : "loading";

  const catLabel = (key: string, fallback = "") => (t.has(`cat.${key}`) ? t(`cat.${key}`) : fallback || key);
  const langLabel = (key: string) => (t.has(`lang.${key}`) ? t(`lang.${key}`) : key);
  const languages = useMemo(() => [...new Set(cats.list.flatMap((c) => c.languages))].sort(), [cats.list]);
  const total = useMemo(() => cats.list.reduce((n, c) => n + c.templatesCount, 0), [cats.list]);

  // The backend searches and pages; sorting applies to the cards loaded.
  const rows = useMemo(() => {
    const list = loaded?.list ?? [];
    return sort === "new" ? [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [...list].sort((a, b) => a.title.localeCompare(b.title, locale));
  }, [loaded, sort, locale]);
  const shown = rows;
  const found = loaded?.total ?? rows.length;

  const fields: FilterField[] = [
    {
      key: "category",
      label: t("category"),
      icon: IconGrid,
      value: known,
      empty: "",
      onChange: setCat,
      options: [{ value: "", label: t("allCategories") }, ...cats.list.map((c) => ({ value: c.key, label: `${catLabel(c.key, c.title)} (${c.templatesCount})` }))],
      aiId: "documents.filters.category",
    },
    {
      key: "language",
      label: t("language"),
      icon: IconGlobe,
      value: lang,
      empty: "",
      onChange: setLang,
      options: [{ value: "", label: t("allLanguages") }, ...languages.map((l) => ({ value: l, label: langLabel(l) }))],
      aiId: "documents.filters.language",
    },
    {
      key: "sort",
      label: t("sort"),
      icon: IconDocLines,
      value: sort,
      empty: "title",
      onChange: (v) => setSort(v === "new" ? "new" : "title"),
      options: [
        { value: "title", label: t("sortTitle") },
        { value: "new", label: t("sortNew") },
      ],
      aiId: "documents.filters.sort",
    },
  ];

  // The AI guide drives the same controls a person does.
  const slugToKey = (slug: string) => Object.entries(CATEGORY_AI_SLUG).find(([, v]) => v === slug)?.[0] ?? slug;
  useAiField("documents.search.input", { get: () => q, set: setQ });
  useAiField("documents.catalog.search", { get: () => q, set: setQ });
  useAiField("documents.filters.category", { get: () => known, set: (v) => setCat(cats.list.some((c) => c.key === v) ? v : slugToKey(v)) });
  useAiField("documents.filters.language", { get: () => lang, set: setLang });
  useAiField("documents.filters.sort", { get: () => sort, set: (v) => setSort(v === "new" ? "new" : "title") });
  useAiSelection("documents_category", known);
  useAiReveal("documents:category-list", () => {
    setQ("");
    setCat("");
  });
  useAiReveal("documents.categories", () => setQ(""));
  useAiReveal(/^documents\.(?:catalog\.)?category\./, () => setQ(""));
  const showTemplates = () => {
    if (!known && !searching && cats.list[0]) setCat(cats.list[0].key);
  };
  useAiReveal("documents:template-list", showTemplates);
  useAiReveal("documents.templates", showTemplates);

  const heading = known ? catLabel(known) : searching ? t("searchAll") : t("allTemplates");
  const count = status === "ready" ? found : undefined;

  return (
    <div className="ppanel svhub tcat">
      <div className="ppanel__h">
        <b>{heading}</b>
        <span className="ppanel__hact">
          {count !== undefined ? <span className="advmuted">{t("count", { n: count })}</span> : null}
          {actions}
        </span>
      </div>

      {cats.status === "error" ? (
        <ErrorState error={cats.error} onRetry={() => setCatTry((n) => n + 1)} />
      ) : (
        <div className="tcat__cats" role="radiogroup" aria-label={t("category")} data-ai-id="documents.categories" data-ai-type="list">
          {cats.status === "loading"
            ? Array.from({ length: 4 }, (_, i) => <span key={i} className="tcat__cat tcat__cat--ghost" aria-hidden="true" />)
            : [{ key: "", title: t("allCategories"), templatesCount: total }, ...cats.list].map((c) => {
                const img = c.key ? generalCategoryImage(CATEGORY_IMAGE_NAME[c.key] ?? c.title) : null;
                const on = known === c.key;
                return (
                  <button
                    key={c.key || "all"}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className="tcat__cat"
                    onClick={() => setCat(c.key)}
                    data-ai-id={c.key ? (CATEGORY_AI_SLUG[c.key] ? `documents.catalog.category.${CATEGORY_AI_SLUG[c.key]}` : aiId("documents.category", c.key)) : "documents.catalog.category.all"}
                  >
                    <span className="tcat__cat-i" aria-hidden="true">
                      {img ? <Image src={img} alt="" fill sizes="56px" style={{ objectFit: "contain" }} /> : <IconGrid />}
                    </span>
                    <span className="tcat__cat-t">
                      <b>{c.key ? catLabel(c.key, c.title) : t("allCategories")}</b>
                      <small>{t("count", { n: c.templatesCount })}</small>
                    </span>
                  </button>
                );
              })}
        </div>
      )}

      <FilterBar
        fields={fields}
        search={{ value: q, onChange: setQ, placeholder: t("search"), maxLength: 120, aiId: "documents.search.input", aiTarget: "documents:catalog-search", aiLabel: t("search") }}
        count={status === "ready" ? found : undefined}
        onReset={() => {
          setCat("");
          setLang("");
          setSort("title");
          setQ("");
        }}
        extra={
          <span className="svfilt__free" role="status">
            <IconEye aria-hidden="true" />
            {t("freeToView")}
          </span>
        }
        aiId="documents.filters"
        aiTarget="documents:catalog-filters"
      />

      {status === "loading" ? (
        <div aria-busy="true">
          {!known ? <p className="tcat__hint">{t("loadingAll")}</p> : null}
          <p className="sr-only" role="status">
            {t("loading")}
          </p>
          <ul className="tcat__grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="tcard tcard--ghost" />
            ))}
          </ul>
        </div>
      ) : status === "error" ? (
        <ErrorState error={loaded?.error} title={t("error")} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !rows.length ? (
        searching ? (
          <EmptyState
            icon={<IconSearch />}
            title={t("noMatch", { q: term })}
            text={t("noMatchText")}
            action={
              <button type="button" className="btn btn--line btn--sm" onClick={() => setQ("")}>
                {t("clearSearch")}
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={<IconFileText />}
            title={t("emptyCat")}
            text={t("emptyCatText")}
            action={
              <button type="button" className="btn btn--line btn--sm" onClick={() => setCat("")}>
                {t("allCategories")}
              </button>
            }
          />
        )
      ) : (
        <>
          <ul className="tcat__grid" data-ai-id="documents.templates" data-ai-type="list" data-ai-target="documents:template-list">
            {shown.map((c) => {
              const img = subcategoryImage(c.title) ?? generalCategoryImage(CATEGORY_IMAGE_NAME[c.category] ?? "");
              return (
                <li key={c.id}>
                  <Link
                    href={`/portal/client/services/template/${encodeURIComponent(c.id)}`}
                    className="tcard"
                    data-ai-id={aiId("documents.template", c.id)}
                    data-ai-entity-type="document_template"
                    data-ai-entity-id={c.id}
                  >
                    <span className="tcard__img" aria-hidden="true">
                      {img ? <Image src={img} alt="" fill sizes="64px" style={{ objectFit: "contain" }} /> : <IconFileText />}
                    </span>
                    <span className="tcard__body">
                      <span className="tcard__meta">
                        <span className="tchip">{catLabel(c.category)}</span>
                        {c.language ? <span className="tchip tchip--soft">{langLabel(c.language)}</span> : null}
                        {c.hasSourceFile ? <span className="tchip tchip--ok">DOCX</span> : null}
                      </span>
                      <b className="tcard__t">{c.title}</b>
                      {c.description ? <small className="tcard__d">{c.description}</small> : null}
                      <span className="tcard__foot">
                        <span className="tcard__price">{c.price > 0 ? fmtUzs(c.price) : t("freeView")}</span>
                        <span className="tcard__go">
                          {t("open")}
                          <IconArrowRight aria-hidden="true" />
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {loaded?.hasMore || loaded?.more === "error" ? (
            <div className="tcat__more">
              <button type="button" className="btn btn--line" onClick={more} disabled={loaded.more === "loading"} aria-busy={loaded.more === "loading" || undefined}>
                {loaded.more === "loading" ? t("loadingMore") : loaded.more === "error" ? t("moreFailed") : t("more", { n: Math.min(CATALOG_PAGE, found - rows.length), left: found - rows.length })}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
