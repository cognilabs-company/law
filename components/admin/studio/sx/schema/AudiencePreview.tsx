"use client";

import "./sx-audience.css";
import { useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BriefcaseBusiness, Eye, EyeOff, FileText, Image as ImageIcon, List as ListIcon, MessageSquareText, Monitor, UserRound } from "lucide-react";
import type { SchemaFieldModel, SchemaModel, SxValues } from "../contract";
import { SxSegmented } from "../shared/Segmented";
import { useStudioLabels } from "../useStudioLabels";
import { audienceOfField, bucketOf, seenBy } from "./audience";
import { BUCKET_ICON, fieldShown } from "./AudienceGroup";
import { DevicePreview } from "./DevicePreview";
import { CategoryReaderPage, PAGED } from "./ReaderPage";
import { DraftServicePage, PortalFrame, performerRole, type DraftPage } from "./DraftPages";
import { RefNames } from "./fields";
import { effectiveSource, labelTrail, type SchemaTr } from "./model";

// The record as each reader will actually see it. The client tab holds only
// what reaches the client — their checklist wording, the rules and
// guarantees meant for them, the evidence they may see — and the performer
// tab only what reaches the performer; what each side does not see is listed
// under the view so it can be checked as well.

type View = "client" | "performer";
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
const PERFORMER_AUDIENCES = new Set(["executor", "advokat", "yurist", "advokat_yurist", "yurist_advokat", "seller", "performer"]);

function audiencesOf(row: Dict): string[] {
  const list = Array.isArray(row.audiences) ? row.audiences.map(str) : [];
  return list.length ? list : [str(row.audience)].filter(Boolean);
}

function meant(view: View, row: Dict, fallback: View): boolean {
  const list = audiencesOf(row);
  if (!list.length) return view === fallback;
  return view === "client" ? list.includes("client") : list.some((a) => PERFORMER_AUDIENCES.has(a));
}

function Value({ model, fm, value }: { model: SchemaModel; fm: SchemaFieldModel; value: unknown }): ReactNode {
  const labels = useStudioLabels();
  const t = useTranslations("studio");
  const f = fm.field;
  const source = effectiveSource(model.code, fm, {});
  const list = Array.isArray(value) ? value.map(str).filter(Boolean) : [];
  if (source && (list.length || str(value))) return <RefNames source={source} values={list.length ? list : [str(value)]} />;
  if (typeof value === "boolean") return value ? t("sx.ui.yes") : t("sx.ui.no");
  if (typeof value === "number") return f?.type === "money" ? labels.money(value) : labels.num(value);
  if (list.length) return f?.options?.length ? list.map((v) => labels.option(v, { ctor: model.code, field: fm.key })).join(", ") : list.join(" · ");
  if (f?.options?.length && str(value)) return labels.option(str(value), { ctor: model.code, field: fm.key });
  if (isDict(value)) {
    const parts = Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => `${labels.field(k, { ctor: model.code, path: `${fm.key}.${k}` })}: ${v === true ? t("sx.ui.yes") : Array.isArray(v) ? v.map(str).join(", ") : str(v)}`);
    return parts.length ? parts.join(" · ") : "";
  }
  return plain(value);
}

// The service checklist as one side reads it.
function Checklist({ view, value }: { view: View; value: unknown }): ReactElement | null {
  const t = useTranslations("studio");
  const items = rows(value);
  if (!items.length) return null;
  return (
    <ol className="sx-apv__ck">
      {items.map((it, i) => {
        const exec = str(it.executor_title) || str(it.title);
        const title = view === "client" ? str(it.client_title) || exec : exec;
        const desc = view === "client" ? str(it.client_description) : str(it.description);
        const proofs = [
          { k: "comment", on: Array.isArray(it.verification_methods) && it.verification_methods.includes("comment"), show: it.show_comment_to_client === true, icon: MessageSquareText },
          { k: "image", on: Array.isArray(it.verification_methods) && it.verification_methods.includes("image"), show: it.show_images_to_client === true, icon: ImageIcon },
          { k: "file", on: Array.isArray(it.verification_methods) && it.verification_methods.includes("file"), show: it.show_files_to_client === true, icon: FileText },
        ].filter((p) => p.on && (view === "performer" || p.show));
        return (
          <li key={str(it.id) || i}>
            <strong>{title || t("sx.apv.untitled")}</strong>
            {desc ? <span>{desc}</span> : null}
            {proofs.length ? (
              <span className="sx-apv__proofs">
                {proofs.map((p) => (
                  <span key={p.k} className="sx-apv__proof">
                    <p.icon size={12} aria-hidden />
                    {t(`sx.apv.proof.${p.k}`)}
                  </span>
                ))}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// A service's own rules or guarantees, only those meant for this side.
function OwnItems({ view, value, body, fallback }: { view: View; value: unknown; body: string; fallback: View }): ReactElement | null {
  const items = rows(value).filter((r) => meant(view, r, fallback));
  if (!items.length) return null;
  return (
    <ul className="sx-apv__own">
      {items.map((r, i) => (
        <li key={str(r.id) || i}>
          <strong>{plain(r.title)}</strong>
          {plain(r[body]) ? <span>{plain(r[body])}</span> : null}
        </li>
      ))}
    </ul>
  );
}

// Lists rendered per reader; null when nothing in them is meant for that side.
const SPECIAL: Readonly<Partial<Record<string, (view: View, value: unknown) => ReactNode | null>>> = {
  completion_checklist: (view, value) => (rows(value).length ? <Checklist view={view} value={value} /> : null),
  inline_rules: (view, value) => (rows(value).some((r) => meant(view, r, "performer")) ? <OwnItems view={view} value={value} body="body" fallback="performer" /> : null),
  inline_guarantees: (view, value) => (rows(value).some((r) => meant(view, r, "client")) ? <OwnItems view={view} value={value} body="description" fallback="client" /> : null),
};

function blank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "number" || typeof value === "boolean") return false;
  if (isDict(value)) return !Object.values(value).some((v) => v !== null && v !== undefined && v !== "" && v !== false && !(Array.isArray(v) && !v.length));
  return plain(value) === "";
}

// The address bar above the page: where that reader would be.
function addressOf(code: string, view: View, page: DraftPage, payload: SxValues): string {
  if (code === "K01") {
    const slug = str(payload.slug);
    return view === "client" ? `lexgo.uz/portal/client/lawyers${slug ? `?category=${slug}` : ""}` : "lexgo.uz/portal/lawyer";
  }
  if (view === "client") return page === "service" ? "lexgo.uz/portal/client/lawyers/…" : "lexgo.uz/portal/client/marketplace-orders/…";
  return `lexgo.uz/portal/${performerRole(payload)}/marketplace-orders/…`;
}

const READERS: readonly { v: View; icon: typeof UserRound; lead: string }[] = [
  { v: "client", icon: UserRound, lead: "sx.apv.clientLead" },
  { v: "performer", icon: BriefcaseBusiness, lead: "sx.apv.performerLead" },
];

export function AudiencePreview({ model, payload, title }: { model: SchemaModel; payload: SxValues; title?: string }): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const [view, setView] = useState<View>("client");
  // A service or a category opens as its real page first; other records as
  // the field list.
  const code = model.code.toUpperCase();
  const paged = PAGED.has(code);
  const [mode, setMode] = useState<"page" | "fields">(paged ? "page" : "fields");
  const [page, setPage] = useState<DraftPage>("service");
  const fields = model.sections.flatMap((s) => s.fields).filter((fm) => fieldShown(model, fm, payload));
  const sorted = fields.map((fm) => ({ fm, who: audienceOfField(model.code, fm.pattern, payload, payload)?.who }));
  const any = sorted.some((x) => seenBy("client", x.who) || seenBy("performer", x.who));
  if (!any) return null;
  const count = (v: View) => sorted.filter((x) => seenBy(v, x.who)).length;
  const shown = sorted.filter((x) => seenBy(view, x.who));
  const hidden = sorted.filter((x) => x.who && x.who !== "system" && !seenBy(view, x.who));
  const label = (fm: SchemaFieldModel) => labelTrail(model, fm.pattern, labels, t as unknown as SchemaTr);
  const Icon = view === "client" ? UserRound : BriefcaseBusiness;
  const name = str(payload.title) || str(title);
  const onPage = paged && mode === "page";
  return (
    <section className="sx-apv" aria-labelledby="sx-apv-h" data-view={view}>
      <header className="sx-apv__top">
        <span className="sx-apv__eye" aria-hidden="true">
          <Eye size={18} strokeWidth={2} />
        </span>
        <span className="sx-apv__intro">
          <h2 id="sx-apv-h">{t("sx.apv.title")}</h2>
          <span>{t("sx.apv.lead")}</span>
        </span>
      </header>
      <div className="sx-apv__readers" role="radiogroup" aria-label={t("sx.apv.title")}>
        {READERS.map(({ v, icon: RIcon, lead }) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            className="sx-apv__reader"
            data-k={v}
            onClick={() => setView(v)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const next = v === "client" ? "performer" : "client";
                setView(next);
                (e.currentTarget.parentElement?.querySelector(`[data-k="${next}"]`) as HTMLElement | null)?.focus();
              }
            }}
            tabIndex={view === v ? 0 : -1}
            data-ai-id={`admin.studio.editor.audience.${v}`}
          >
            <span className="sx-apv__ava" aria-hidden="true">
              <RIcon size={19} strokeWidth={2} />
            </span>
            <span className="sx-apv__rt">
              <b>{t(`sx.apv.${v}`)}</b>
              <small>{t(lead)}</small>
            </span>
            <span className="sx-apv__n">{t("sx.apv.fieldsN", { n: count(v) })}</span>
          </button>
        ))}
      </div>
      {paged ? (
        <div className="sx-apv__bar">
          <SxSegmented<"page" | "fields">
            items={[
              { value: "page", label: t("sx.apv.modePage"), icon: Monitor, aiId: "admin.studio.editor.audience.page" },
              { value: "fields", label: t("sx.apv.modeFields"), icon: ListIcon, aiId: "admin.studio.editor.audience.fields" },
            ]}
            value={mode}
            onChange={setMode}
            label={t("sx.apv.mode")}
            size="sm"
            aiId="admin.studio.editor.audience.mode"
          />
          {onPage && code === "K02" && view === "client" ? (
            <SxSegmented<DraftPage>
              items={[
                { value: "service", label: t("sx.apv.pageService"), icon: UserRound, aiId: "admin.studio.editor.audience.page.service" },
                { value: "order", label: t("sx.apv.pageOrder"), icon: ListIcon, aiId: "admin.studio.editor.audience.page.order" },
              ]}
              value={page}
              onChange={setPage}
              label={t("sx.apv.page")}
              size="sm"
              aiId="admin.studio.editor.audience.page"
            />
          ) : null}
          {onPage ? <span className="sx-apv__real">{t("sx.apv.real")}</span> : null}
        </div>
      ) : null}
      {onPage ? (
        <div className="sx-apv__stage">
          <DevicePreview address={addressOf(code, view, page, payload)} label={t(view === "client" ? "sx.apv.asClient" : "sx.apv.asPerformer")}>
            {code === "K01" ? (
              view === "client" ? (
                <PortalFrame role="client" active="lawyers" name="Aziz Karimov">
                  <CategoryReaderPage reader="client" payload={payload} title={name} />
                </PortalFrame>
              ) : (
                <CategoryReaderPage reader="performer" payload={payload} title={name} />
              )
            ) : (
              <DraftServicePage page={view === "client" ? page : "order"} reader={view} payload={payload} title={name} />
            )}
          </DevicePreview>
        </div>
      ) : (
      <div className="sx-apv__frame" role="tabpanel" aria-label={t(view === "client" ? "sx.apv.client" : "sx.apv.performer")}>
        <p className="sx-apv__as">
          <Icon size={15} strokeWidth={2.1} aria-hidden />
          {t(view === "client" ? "sx.apv.asClient" : "sx.apv.asPerformer")}
        </p>
        {shown.length ? (
          <dl className="sx-apv__list">
            {shown.map(({ fm, who }) => {
              const value = payload[fm.key];
              const own = SPECIAL[fm.key];
              const special = own ? own(view, value) : undefined;
              const text = own ? special : <Value model={model} fm={fm} value={value} />;
              const empty = own ? special === null : blank(value);
              const B = BUCKET_ICON[bucketOf(who) ?? "shared"];
              return (
                <div key={fm.pattern} className="sx-apv__row" data-empty={empty ? "" : undefined}>
                  <dt>
                    <B size={13} aria-hidden />
                    {label(fm)}
                  </dt>
                  <dd>{empty ? <span className="sx-apv__empty">{t("sx.apv.empty")}</span> : text}</dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p className="sx-apv__none">{t("sx.apv.nothing")}</p>
        )}
      </div>
      )}
      {hidden.length ? (
        <details className="sx-apv__hidden">
          <summary>
            <EyeOff size={14} aria-hidden />
            {t("sx.apv.hidden", { n: hidden.length })}
          </summary>
          <ul>
            {hidden.map(({ fm, who }) => (
              <li key={fm.pattern}>
                <span>{label(fm)}</span>
                <span className="sx-apv__who" data-who={bucketOf(who) ?? undefined}>
                  {t(`sx.aud.who.${who}`)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
