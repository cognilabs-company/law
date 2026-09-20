"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";
import { getServicePassport, type BackendCategory, type ServicePassport } from "@/lib/services/backend";
import { updateService, uploadServiceDocumentTemplate, type AdminService, type ServiceMetadataInput, type ServiceUpdateInput } from "@/lib/services/admin";
import { ApiError, errDetail } from "@/lib/http";
import { firstFieldError } from "@/lib/formErrors";
import { IconUpload, IconCheck } from "@/components/icons";

// Edit one service (PATCH /admin/services/{id}). The form is prefilled from
// the list row (which already carries every LegalServiceOut field) and, when
// the passport answers, from GET /services/{id}/passport for the catalog
// metadata (fresher than the list). Only changed fields are sent; the
// metadata block goes only when the service has a metadata row, because the
// backend silently ignores it otherwise.

type FormVals = {
  title: string;
  category_id: string;
  description: string;
  base_price: string;
  currency: string;
  delivery_minutes: string;
  is_active: boolean;
  title_uz_latn: string;
  title_uz_cyrl: string;
  title_ru: string;
  executor_type: string;
  advokat_required: boolean;
  pricing_tier: string;
  standard_price: string;
  sla_code: string;
  refund_code: string;
  ai_category: string;
};

const CURRENCIES = ["UZS", "USD", "EUR"].map((c) => ({ value: c, label: c }));

const intText = (n?: number) => (n == null || !Number.isFinite(n) ? "" : String(Math.round(n)));

function seedFrom(s: AdminService, p: ServicePassport | null): FormVals {
  const meta = s.hasMetadata ? p : null;
  return {
    title: s.title || s.name,
    category_id: s.categoryId ?? "",
    description: s.description ?? "",
    base_price: intText(s.basePrice),
    currency: s.currency || "UZS",
    delivery_minutes: intText(s.deliveryMinutes),
    is_active: s.isActive,
    title_uz_latn: s.titleUzLatn,
    title_uz_cyrl: s.titleUzCyrl,
    title_ru: s.titleRu,
    executor_type: meta?.executorType || s.executorType || "",
    advokat_required: meta ? meta.advokatRequired : s.advokatRequired,
    pricing_tier: meta?.pricingTier || s.pricingTier || "",
    // The passport falls back to base_price when there is no metadata row, so
    // it is only trusted as a metadata price when the row exists.
    standard_price: intText(meta?.standardPrice ?? s.standardPrice),
    sla_code: meta?.slaCode || s.slaCode,
    refund_code: meta?.refundCode || s.refundCode,
    ai_category: meta?.aiCategory || s.aiCategory,
  };
}

// "" (cleared) counts as 0; anything that is not a non-negative integer is invalid.
function parseWhole(v: string): number | null {
  const s = v.trim();
  if (s === "") return 0;
  return /^\d+$/.test(s) ? parseInt(s, 10) : null;
}

const META_TEXT = ["title_uz_latn", "title_uz_cyrl", "title_ru", "executor_type", "pricing_tier", "sla_code", "refund_code", "ai_category"] as const;

function diff(init: FormVals, v: FormVals, hasMetadata: boolean): ServiceUpdateInput | "bad-number" {
  const out: ServiceUpdateInput = {};
  const title = v.title.trim();
  if (title !== init.title) out.title = title;
  if (v.category_id && v.category_id !== init.category_id) out.category_id = v.category_id;
  if (v.description !== init.description) out.description = v.description;
  if (v.currency !== init.currency) out.currency = v.currency;
  if (v.is_active !== init.is_active) out.is_active = v.is_active;
  if (v.base_price.trim() !== init.base_price) {
    const n = parseWhole(v.base_price);
    if (n == null) return "bad-number";
    out.base_price = n;
  }
  if (v.delivery_minutes.trim() !== init.delivery_minutes) {
    const n = parseWhole(v.delivery_minutes);
    if (n == null) return "bad-number";
    out.delivery_minutes = n;
  }
  if (hasMetadata) {
    const meta: ServiceMetadataInput = {};
    for (const k of META_TEXT) if (v[k].trim() !== init[k]) meta[k] = v[k].trim();
    if (v.advokat_required !== init.advokat_required) meta.advokat_required = v.advokat_required;
    if (v.standard_price.trim() !== init.standard_price) {
      const n = parseWhole(v.standard_price);
      if (n == null) return "bad-number";
      meta.standard_price = n;
    }
    if (Object.keys(meta).length) out.metadata = meta;
  }
  return out;
}

// POST /admin/services/{service_id}/document-template (2026-09-20 backend):
// upload a DOCX with {{field}} placeholders and it auto-attaches to this
// service — the client's "Xizmatlar" card then gets a document builder
// (form left, live preview right) for free, no separate linking step.
function DocTemplateSection({ service }: { service: AdminService }) {
  const t = useTranslations("admin.services.docTemplate");
  const [file, setFile] = useState<File | null>(null);
  const [slug, setSlug] = useState(service.slug);
  const [title, setTitle] = useState(service.title || service.name);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [fieldCount, setFieldCount] = useState<number | null>(null);
  const [attached, setAttached] = useState(!!service.documentTemplateId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await uploadServiceDocumentTemplate(service.id, {
        file,
        slug: slug.trim() || service.slug,
        title: title.trim() || service.title || service.name,
        price: service.basePrice,
      });
      setFieldCount(r.fieldCount);
      setAttached(true);
      setFile(null);
      setNote({ ok: true, msg: t("done", { n: r.fieldCount }) });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setNote({ ok: false, msg: status === 415 ? t("onlyDocx") : status === 413 ? t("tooBig") : status === 403 ? t("forbidden") : errDetail(err) || t("error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="svced__sec2">
      <div className="svced__sec">{t("title")}</div>
      <p className="svced__hint">{t("lead")}</p>
      {attached ? <p className="svced__hint" style={{ color: "var(--ok)" }}><IconCheck style={{ width: 13, height: 13 }} /> {t("attached")}</p> : null}
      <form onSubmit={submit} className="cform" style={{ maxWidth: "none" }}>
        <div>
          <label>{t("file")}</label>
          <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="rf__hint">{t("fileHint")}</p>
        </div>
        <div className="svced__row">
          <div><label>{t("slug")}</label><input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} /></div>
          <div><label>{t("titleLabel")}</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        </div>
        {fieldCount != null ? <p className="svced__hint">{t("fieldsFound", { n: fieldCount })}</p> : null}
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <button className="btn btn--soft btn--full" type="submit" disabled={busy || !file}>
          <IconUpload />
          {busy ? t("uploading") : attached ? t("replace") : t("upload")}
        </button>
      </form>
    </div>
  );
}

function PassportContext({ p }: { p: ServicePassport }) {
  const t = useTranslations("admin.services.edit");
  const days = (text: string, n: number) => {
    const v = text || (n > 0 ? String(n) : "");
    if (!v || v === "0") return "";
    return /[^\d\s.,–-]/.test(v) ? v : t("days", { value: v });
  };
  const family = p.group && p.group !== p.family ? `${p.family} · ${p.group}` : p.family;
  const rows: [string, string][] = [
    [t("code"), p.catalogCode],
    [t("family"), family],
    [t("subcategory"), p.subcategory && p.subcategory !== p.family ? p.subcategory : ""],
    [t("duration"), days(p.standardDuration, p.standardDays)],
    [t("urgent"), days(p.urgentDuration, p.urgentDays)],
    [t("version"), p.version],
  ];
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <div className="svced__ctx" aria-label={t("passport")}>
      {shown.map(([k, v]) => (
        <span className="svced__kv" key={k}>
          <label>{k}</label>
          <b>{v}</b>
        </span>
      ))}
    </div>
  );
}

function EditForm({
  service,
  initial,
  passport,
  passportOff,
  categories,
  onClose,
  onSaved,
}: {
  service: AdminService;
  initial: FormVals;
  passport: ServicePassport | null;
  passportOff: boolean;
  categories: BackendCategory[];
  onClose: () => void;
  onSaved: (updated: AdminService) => void;
}) {
  const t = useTranslations("admin.services");
  const tf = useTranslations("admin.form");
  const locale = useLocale();
  const [v, setV] = useState<FormVals>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const set = <K extends keyof FormVals>(k: K, val: FormVals[K]) => setV((s) => ({ ...s, [k]: val }));

  function errMsg(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.status === 422) {
        const f = firstFieldError(e);
        return `${t("edit.errValidation")}${f ? ` ${f}` : ""}`;
      }
      if (e.status >= 500) return t("edit.errServer");
      if (e.status === 404) return t("edit.errNotFound");
      if (e.status === 403) return t("edit.errForbidden");
    }
    return errDetail(e) || tf("updateError");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!v.title.trim()) {
      setNote({ ok: false, msg: t("edit.titleRequired") });
      return;
    }
    const payload = diff(initial, v, service.hasMetadata);
    if (payload === "bad-number") {
      setNote({ ok: false, msg: t("edit.badNumber") });
      return;
    }
    if (!Object.keys(payload).length) {
      setNote({ ok: false, msg: t("edit.noChanges") });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const updated = await updateService(service.id, payload, locale);
      setNote({ ok: true, msg: t("edit.saved") });
      onSaved(updated);
    } catch (err) {
      setNote({ ok: false, msg: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  const catOpts = categories.map((c) => ({ value: c.id, label: c.name }));
  const text = (k: keyof FormVals, label: string, hint?: string, ph?: string) => (
    <div>
      <label>{label}</label>
      <input type="text" value={v[k] as string} onChange={(e) => set(k, e.target.value)} placeholder={ph} />
      {hint ? <span className="svced__fh">{hint}</span> : null}
    </div>
  );
  const number = (k: keyof FormVals, label: string, ph?: string) => (
    <div>
      <label>{label}</label>
      <input type="number" min={0} step={1} inputMode="numeric" value={v[k] as string} onChange={(e) => set(k, e.target.value)} placeholder={ph} />
    </div>
  );

  return (
    <form className="cform svced" onSubmit={submit}>
      <div className="svced__head">
        <span className="svced__slug">{service.slug}</span>
        {service.catalogCode ? <span className="svced__slug">{service.catalogCode}</span> : null}
        <em className={`atag${service.hasMetadata ? "" : " atag--muted"}`}>{service.hasMetadata ? t("tagCatalog") : t("tagCustom")}</em>
      </div>
      {passport ? <PassportContext p={passport} /> : passportOff ? <p className="svced__hint">{t("edit.passportOff")}</p> : null}

      <div className="svced__sec">{t("edit.base")}</div>
      {text("title", tf("title"))}
      <div>
        <label>{tf("category")}</label>
        <Select value={v.category_id} onChange={(val) => set("category_id", val)} options={catOpts} ariaLabel={tf("category")} placeholder={tf("selectCategory")} />
      </div>
      <div>
        <label>{tf("description")}</label>
        <textarea rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="svced__row">
        {number("base_price", tf("basePrice"), "150000")}
        <div>
          <label>{t("edit.currency")}</label>
          <Select value={v.currency} onChange={(val) => set("currency", val)} options={CURRENCIES} ariaLabel={t("edit.currency")} />
        </div>
        {number("delivery_minutes", tf("deliveryMinutes"), "60")}
      </div>
      <label className="wh__check">
        <input type="checkbox" checked={v.is_active} onChange={(e) => set("is_active", e.target.checked)} />
        {tf("active")}
      </label>

      <div className="svced__sec">{t("edit.meta")}</div>
      {!service.hasMetadata ? <p className="svced__hint svced__hint--warn">{t("edit.noMeta")}</p> : null}
      <fieldset className="svced__meta" disabled={!service.hasMetadata}>
        {text("title_uz_latn", t("edit.titleUzLatn"))}
        {text("title_uz_cyrl", t("edit.titleUzCyrl"))}
        {text("title_ru", t("edit.titleRu"))}
        <div className="svced__row">
          {text("executor_type", t("edit.executorType"), t("edit.executorHint"))}
          {text("pricing_tier", t("edit.pricingTier"), t("edit.pricingHint"))}
          {number("standard_price", t("edit.standardPrice"))}
        </div>
        <div className="svced__row">
          {text("sla_code", t("edit.slaCode"))}
          {text("refund_code", t("edit.refundCode"))}
          {text("ai_category", t("edit.aiCategory"))}
        </div>
        <label className="wh__check">
          <input type="checkbox" checked={v.advokat_required} onChange={(e) => set("advokat_required", e.target.checked)} />
          {t("edit.advokatRequired")}
        </label>
      </fieldset>

      <DocTemplateSection service={service} />

      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      <div className="svced__acts">
        <button className="btn btn--ghost" type="button" onClick={onClose} disabled={busy}>
          {tf("cancel")}
        </button>
        <button className="btn btn--pri" type="submit" disabled={busy}>
          {busy ? tf("saving") : tf("update")}
        </button>
      </div>
    </form>
  );
}

// Loads the passport for the opened service, then mounts the form once.
function EditLoader(props: {
  service: AdminService;
  categories: BackendCategory[];
  onClose: () => void;
  onSaved: (updated: AdminService) => void;
}) {
  const locale = useLocale();
  const { service } = props;
  const [seed, setSeed] = useState<{ initial: FormVals; passport: ServicePassport | null; passportOff: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    getServicePassport(service.id, locale)
      .then((r) => {
        if (alive) setSeed({ initial: seedFrom(service, r.passport), passport: r.passport, passportOff: false });
      })
      .catch(() => {
        // Inactive rows answer 404 (the passport hides them); the list row is enough.
        if (alive) setSeed({ initial: seedFrom(service, null), passport: null, passportOff: true });
      });
    return () => {
      alive = false;
    };
  }, [service, locale]);
  if (!seed) return <Skeleton rows={5} />;
  return <EditForm {...props} initial={seed.initial} passport={seed.passport} passportOff={seed.passportOff} />;
}

export default function ServiceEditModal({
  service,
  categories,
  onClose,
  onSaved,
}: {
  service: AdminService | null;
  categories: BackendCategory[];
  onClose: () => void;
  onSaved: (updated: AdminService) => void;
}) {
  const t = useTranslations("admin.services");
  return (
    <Modal open={service !== null} onClose={onClose} title={t("edit.title")}>
      {service ? <EditLoader key={service.id} service={service} categories={categories} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}
