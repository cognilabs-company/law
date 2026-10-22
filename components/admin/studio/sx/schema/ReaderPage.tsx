"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Bell, Briefcase, ChevronRight, ClipboardList, Lock, Scale, Search, ShieldCheck, Sparkles, UserRound } from "lucide-react";
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

// A service draft as each reader meets it: the client on the service page,
// the lawyer on their work screen. Built from the form's own values and the
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

export function ReaderPage({ reader, payload, title }: { reader: Reader; payload: SxValues; title: string }): ReactElement {
  return reader === "client" ? <ClientPage p={payload} title={title} /> : <PerformerPage p={payload} title={title} />;
}
