"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Bell, Briefcase, ChevronDown, ChevronRight, ClipboardList, EyeOff, FolderOpen, LayoutGrid, ListFilter, Lock, Scale, Search, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { normRuntimeConfig, type RuntimeConfig } from "@/lib/services/marketRuntime";
import { ChecklistPreview } from "@/components/marketplace/runtime/ChecklistPreview";
import { DurationChip } from "@/components/marketplace/runtime/DurationChip";
import { GuaranteeList } from "@/components/marketplace/runtime/Guarantees";
import { RequirementsNote } from "@/components/marketplace/runtime/RequirementsNote";
import { RuleList } from "@/components/marketplace/runtime/RuleList";
import { TemplateNote } from "@/components/marketplace/runtime/TemplateNote";
import { UsageSteps } from "@/components/marketplace/runtime/UsageSteps";
import type { SxValues } from "../contract";
import { useStudioLabels } from "../useStudioLabels";
import { RefNames } from "./fields";

// A draft as each reader meets it. A service: the client on the service
// page, the lawyer on their work screen. A category: the client in the
// catalogue, the lawyer filter and search, and on the direction's own page. Built from the form's own values and the
// marketplace's own blocks, so the preview shows the real pieces in the real
// order — only what that reader is meant to see.

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
      .map((r, i) => ({ id: str(r.id) || `r${i}`, title: r.title, body: r.body, scope_type: "service" })),
    guarantees: rows(p.inline_guarantees)
      .filter((g) => forReader(reader, g, "client"))
      .map((g, i) => ({ id: str(g.id) || `g${i}`, title: g.title, description: g.description, inline: true })),
    checklist_preview: rows(p.completion_checklist).map((c, i) => ({ ...c, id: str(c.id) || `c${i}` })),
  });
}

const som = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n)).replace(/,/g, " ");

function SharedNames({ source, values, label }: { source: string; values: unknown; label: string }): ReactElement | null {
  const list = Array.isArray(values) ? values.map(str).filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <p className="rp-shared">
      <b>{label}:</b> <RefNames source={source} values={list} />
    </p>
  );
}

function ClientPage({ p, title }: { p: SxValues; title: string }): ReactElement {
  const t = useTranslations("studio");
  const cfg = draftRuntime(p, "client");
  const price = cfg.pricing.recommendedPrice;
  const category = str(p.category_id);
  return (
    <div className="rp" data-reader="client">
      <SiteTop />
      <main className="rp-main">
        <p className="rp-crumbs">
          <span>{t("sx.dev.page.services")}</span>
          <ChevronRight size={13} />
          {category ? <RefNames source="service-categories" values={[category]} /> : <span>—</span>}
        </p>
        <div className="rp-grid">
          <article className="rp-body">
            <h1 className="rp-h1">{title || t("sx.dev.page.untitled")}</h1>
            {plain(p.description) ? <p className="rp-lead">{plain(p.description)}</p> : <p className="rp-missing">{t("sx.dev.page.noDescription")}</p>}
            {plain(p.client_value) ? (
              <section className="rp-card rp-value">
                <h2>
                  <Sparkles size={16} />
                  {t("sx.dev.page.youGet")}
                </h2>
                <p>{plain(p.client_value)}</p>
              </section>
            ) : null}
            {cfg.usageSteps.length ? (
              <section className="rp-card">
                <UsageSteps steps={cfg.usageSteps} idBase="rp-steps" level={3} />
              </section>
            ) : null}
            {cfg.checklistPreview.length ? (
              <section className="rp-card">
                <ChecklistPreview items={cfg.checklistPreview} idBase="rp-ck" level={3} limit={6} />
              </section>
            ) : null}
            {cfg.rules.length ? (
              <section className="rp-card">
                <RuleList rules={cfg.rules} idBase="rp-rules" level={3} limit={6} />
              </section>
            ) : null}
            {plain(p.service_terms_text) ? (
              <section className="rp-card">
                <h2>
                  <Scale size={16} />
                  {t("sx.dev.page.terms")}
                </h2>
                <p>{plain(p.service_terms_text)}</p>
              </section>
            ) : null}
          </article>
          <aside className="rp-side">
            <div className="rp-card rp-buy">
              <span className="rp-from">{t("sx.dev.page.from")}</span>
              <b className="rp-price">{price > 0 ? `${som(price)} so'm` : "—"}</b>
              {cfg.duration.value > 0 ? <DurationChip duration={cfg.duration} tone="side" start /> : null}
              <span className="rp-cta">{t("sx.dev.page.order")}</span>
              {cfg.negotiationAvailable ? <small className="rp-note">{t("sx.dev.page.negotiation")}</small> : null}
              {plain(p.review_client_note) ? <small className="rp-note">{plain(p.review_client_note)}</small> : null}
            </div>
            {cfg.guarantees.length ? (
              <div className="rp-card">
                <GuaranteeList items={cfg.guarantees} tone="side" />
              </div>
            ) : null}
            <SharedNames source="client-guarantees" values={p.guarantee_ids} label={t("sx.dev.page.sharedGuarantees")} />
          </aside>
        </div>
      </main>
      <div className="rp-sticky">
        <b>{price > 0 ? `${som(price)} so'm` : "—"}</b>
        <span className="rp-cta">{t("sx.dev.page.order")}</span>
      </div>
    </div>
  );
}

function PerformerPage({ p, title }: { p: SxValues; title: string }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const cfg = draftRuntime(p, "performer");
  const kinds = Array.isArray(p.executor_types) ? p.executor_types.map(str).filter(Boolean) : [];
  const items = rows(p.completion_checklist);
  return (
    <div className="rp" data-reader="performer">
      <header className="rp-top rp-top--work">
        <span className="rp-logo">
          LexGo <i>{t("sx.dev.page.workspace")}</i>
        </span>
        <span className="rp-me" aria-hidden="true">
          <Bell size={16} />
        </span>
        <span className="rp-me" aria-hidden="true">
          <Briefcase size={16} />
        </span>
      </header>
      <main className="rp-main">
        <div className="rp-order">
          <span className="rp-chip">{t("sx.dev.page.newOrder")}</span>
          <h1 className="rp-h1">{title || t("sx.dev.page.untitled")}</h1>
          {kinds.length ? (
            <p className="rp-kinds">
              {kinds.map((k) => (
                <span key={k} className="rp-chip rp-chip--soft">
                  {labels.option(k, { ctor: "K02", field: "executor_types" })}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <div className="rp-grid">
          <article className="rp-body">
            {plain(p.review_seller_note) ? (
              <section className="rp-card rp-brief">
                <h2>
                  <Lock size={15} />
                  {t("sx.dev.page.briefing")}
                </h2>
                <p>{plain(p.review_seller_note)}</p>
              </section>
            ) : null}
            {items.length ? (
              <section className="rp-card">
                <h2>
                  <ClipboardList size={16} />
                  {t("sx.dev.page.todo")}
                </h2>
                <ol className="rp-todo">
                  {items.map((it, i) => {
                    const methods = Array.isArray(it.verification_methods) ? it.verification_methods.map(str).filter((m) => m !== "checkbox") : [];
                    return (
                      <li key={str(it.id) || i}>
                        <span className="rp-box" aria-hidden="true" />
                        <span>
                          <b>{str(it.executor_title) || str(it.title) || t("sx.apv.untitled")}</b>
                          {plain(it.description) ? <small>{plain(it.description)}</small> : null}
                          {methods.length ? (
                            <span className="rp-proofs">
                              {methods.map((m) => (
                                <i key={m}>{t(`sx.apv.proof.${m}`)}</i>
                              ))}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}
            {cfg.rules.length ? (
              <section className="rp-card">
                <RuleList rules={cfg.rules} idBase="rp-prules" level={3} limit={6} />
              </section>
            ) : null}
            <SharedNames source="service-rules" values={p.rule_ids} label={t("sx.dev.page.sharedRules")} />
          </article>
          <aside className="rp-side">
            <div className="rp-card rp-limits">
              <h2>
                <ShieldCheck size={16} />
                {t("sx.dev.page.limits")}
              </h2>
              <dl>
                <div>
                  <dt>{t("sx.dev.page.recommended")}</dt>
                  <dd>{cfg.pricing.recommendedPrice > 0 ? `${som(cfg.pricing.recommendedPrice)} so'm` : "—"}</dd>
                </div>
                <div>
                  <dt>{t("sx.dev.page.max")}</dt>
                  <dd>{cfg.pricing.maximumPrice > 0 ? `${som(cfg.pricing.maximumPrice)} so'm` : "—"}</dd>
                </div>
              </dl>
              {cfg.duration.value > 0 ? <DurationChip duration={cfg.duration} tone="side" start /> : null}
            </div>
            {!cfg.minimumRequirements.empty ? (
              <div className="rp-card">
                <RequirementsNote requirements={cfg.minimumRequirements} level={3} />
              </div>
            ) : null}
            {cfg.template.mode ? (
              <div className="rp-card">
                <TemplateNote template={cfg.template} />
              </div>
            ) : null}
            {cfg.guarantees.length ? (
              <div className="rp-card">
                <GuaranteeList items={cfg.guarantees} tone="side" />
              </div>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}

function SiteTop(): ReactElement {
  const t = useTranslations("studio");
  return (
    <header className="rp-top">
      <span className="rp-logo">LexGo</span>
      <nav className="rp-nav" aria-hidden="true">
        <span>{t("sx.dev.page.services")}</span>
        <span>{t("sx.dev.page.lawyers")}</span>
      </nav>
      <span className="rp-search" aria-hidden="true">
        <Search size={15} />
        <i>{t("sx.dev.page.search")}</i>
      </span>
      <span className="rp-me" aria-hidden="true">
        <UserRound size={16} />
      </span>
    </header>
  );
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
      <SiteTop />
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

export function ReaderPage({ code, reader, payload, title }: { code: string; reader: Reader; payload: SxValues; title: string }): ReactElement {
  if (code === "K01") return reader === "client" ? <CategoryPage p={payload} title={title} /> : <NotForReader />;
  return reader === "client" ? <ClientPage p={payload} title={title} /> : <PerformerPage p={payload} title={title} />;
}
