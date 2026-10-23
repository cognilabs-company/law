"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, ChevronDown, ChevronRight, EyeOff, FolderOpen, LayoutGrid, ListFilter, Search } from "lucide-react";
import { normRuntimeConfig, type RuntimeConfig } from "@/lib/services/marketRuntime";
import type { SxValues } from "../contract";
import { RefNames } from "./fields";

// A draft as its readers meet it. `draftRuntime` turns a service draft into
// the runtime config the marketplace would serve, for the real pages in
// DraftPages. A category is drawn here: the client meets it in the
// catalogue, the lawyer filter and search, and on the direction's own page.

export type Reader = "client" | "performer";
type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const plain = (v: unknown): string =>
  str(v)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const rows = (v: unknown): Dict[] => (Array.isArray(v) ? v.filter(isDict) : []);
const PERFORMER = new Set(["executor", "advokat", "yurist", "advokat_yurist", "yurist_advokat", "seller", "performer"]);

function forReader(reader: Reader, row: Dict, fallback: Reader): boolean {
  const list = Array.isArray(row.audiences) ? row.audiences.map(str).filter(Boolean) : [str(row.audience)].filter(Boolean);
  if (!list.length) return reader === fallback;
  return reader === "client" ? list.includes("client") : list.some((a) => PERFORMER.has(a));
}

// The draft as the runtime configuration the marketplace would serve.
export function draftRuntime(p: SxValues, reader: Reader): RuntimeConfig {
  const calendar = str(p.duration_calendar);
  return normRuntimeConfig({
    service_id: str(p.service_id) || "draft",
    duration: { value: p.duration_value, unit: p.duration_unit, calendar, starts_on: "seller_acceptance", business_weekdays: /business/.test(calendar) ? [1, 2, 3, 4, 5] : [] },
    template: { mode: p.template_mode, source: p.template_source, document_template_id: p.document_template_id },
    pricing: { recommended_price: p.base_price, maximum_price: p.max_price, currency: "UZS" },
    negotiation_available: p.negotiation_allowed === true,
    minimum_requirements: isDict(p.seller_requirements) ? p.seller_requirements : {},
    usage_steps: Array.isArray(p.usage_steps) ? p.usage_steps : [],
    rules: rows(p.inline_rules)
      .filter((r) => forReader(reader, r, "performer"))
      .map((r, i) => ({ id: str(r.id) || `r${i}`, title: r.title, body: r.body, scope_type: "service", audience: str(r.audience) || "executor" })),
    guarantees: rows(p.inline_guarantees)
      .filter((g) => forReader(reader, g, "client"))
      .map((g, i) => ({ id: str(g.id) || `g${i}`, title: g.title, description: g.description, inline: true })),
    checklist_preview: rows(p.completion_checklist).map((c, i) => ({ ...c, id: str(c.id) || `c${i}` })),
  });
}

// Search words as the K01 repeater stores them: plain strings or {value}.
const termsOf = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).map((x) => (isDict(x) ? str(x.value) || str(x.term) : str(x))).filter(Boolean);

// A category as the client meets it: its tile in the catalogue, its path in
// the lawyer filter, the words that find it, and its own page. A brand-new
// draft has no services yet, so the list says where they will appear.
function CategoryPage({ p, title }: { p: SxValues; title: string }): ReactElement {
  const t = useTranslations("studio");
  const parent = str(p.parent_id);
  const name = title || t("sx.dev.page.catUntitled");
  const desc = plain(p.description);
  const terms = termsOf(p.discovery_terms);
  return (
    <div className="rp" data-reader="client">
      <main className="rp-main">
        <p className="rp-crumbs">
          <span>{t("sx.dev.page.services")}</span>
          <ChevronRight size={13} />
          {parent ? (
            <>
              <RefNames source="service-categories" values={[parent]} />
              <ChevronRight size={13} />
            </>
          ) : null}
          <b>{name}</b>
        </p>
        <section className="rp-cat-hero">
          <span className="rp-cat-ic" aria-hidden="true">
            <FolderOpen size={26} />
          </span>
          <div>
            <span className="rp-chip rp-chip--soft">{parent ? t("sx.dev.page.catSub") : t("sx.dev.page.catRoot")}</span>
            <h1 className="rp-h1">{name}</h1>
            {desc ? <p className="rp-lead">{desc}</p> : <p className="rp-missing">{t("sx.dev.page.noDescription")}</p>}
          </div>
        </section>
        <div className="rp-grid">
          <article className="rp-body">
            <section className="rp-card">
              <h2>
                <Briefcase size={16} />
                {t("sx.dev.page.servicesHere")}
              </h2>
              <p className="rp-cat-empty">{t("sx.dev.page.servicesEmpty")}</p>
            </section>
            <section className="rp-card">
              <h2>
                <LayoutGrid size={16} />
                {t("sx.dev.page.catalogue")}
              </h2>
              <div className="rp-tiles">
                <span className="rp-tile" data-own="">
                  <span className="rp-tile__ic" aria-hidden="true">
                    <FolderOpen size={20} />
                  </span>
                  <b>{name}</b>
                  {desc ? <small className="rp-tile__d">{desc}</small> : null}
                  <small>{t("sx.dev.page.servicesN", { n: 0 })}</small>
                  <i className="rp-tile__new">{t("sx.dev.page.catNew")}</i>
                </span>
                <span className="rp-tile rp-tile--ghost" aria-hidden="true">
                  <span className="rp-tile__ic" />
                  <span className="rp-bone" />
                  <span className="rp-bone rp-bone--s" />
                </span>
                <span className="rp-tile rp-tile--ghost" aria-hidden="true">
                  <span className="rp-tile__ic" />
                  <span className="rp-bone" />
                  <span className="rp-bone rp-bone--s" />
                </span>
              </div>
            </section>
          </article>
          <aside className="rp-side">
            <div className="rp-card">
              <h2>
                <ListFilter size={16} />
                {t("sx.dev.page.filter")}
              </h2>
              <span className="rp-from">{t("sx.dev.page.filterLabel")}</span>
              <span className="rp-select">
                <span>
                  {parent ? (
                    <>
                      <RefNames source="service-categories" values={[parent]} /> ›{" "}
                    </>
                  ) : null}
                  {name}
                </span>
                <ChevronDown size={15} aria-hidden />
              </span>
            </div>
            <div className="rp-card">
              <h2>
                <Search size={16} />
                {t("sx.dev.page.searchFinds")}
              </h2>
              {terms.length ? (
                <>
                  <span className="rp-select rp-select--q">
                    <Search size={14} aria-hidden />
                    <span>{terms[0]}</span>
                  </span>
                  <span className="rp-hit">
                    <FolderOpen size={14} aria-hidden />
                    <b>{name}</b>
                  </span>
                  <p className="rp-kinds">
                    {terms.map((w) => (
                      <span key={w} className="rp-chip rp-chip--soft">
                        {w}
                      </span>
                    ))}
                  </p>
                  <small className="rp-note">{t("sx.dev.page.searchHint")}</small>
                </>
              ) : (
                <small className="rp-note">{t("sx.dev.page.searchNone")}</small>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

// A reader the record is not shown to on its own: an honest blank page.
function NotForReader(): ReactElement {
  const t = useTranslations("studio");
  return (
    <div className="rp rp--none" data-reader="performer">
      <div className="rp-none">
        <span className="rp-cat-ic" aria-hidden="true">
          <EyeOff size={24} />
        </span>
        <b>{t("sx.dev.page.notForReader")}</b>
        <small>{t("sx.dev.page.notForReaderText")}</small>
      </div>
    </div>
  );
}

// Constructors with a real reader page.
export const PAGED = new Set(["K01", "K02"]);

// A category on the client's page; the performer is not shown it on its own.
export function CategoryReaderPage({ reader, payload, title }: { reader: Reader; payload: SxValues; title: string }): ReactElement {
  return reader === "client" ? <CategoryPage p={payload} title={title} /> : <NotForReader />;
}
