"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  listSubscriptionPlansAdmin,
  planAudience,
  PLAN_AUDIENCES,
  type BackendPlan,
  type PlanAudience,
} from "@/lib/services/backend";
import {
  BILLING_PERIODS,
  createPlanAdmin,
  planPrice,
  pricesFor,
  primaryPeriod,
  type BillingPeriod,
} from "@/lib/services/plans";
import { savePlan, removePlan, restorePlan, resetPlan, type OverlaidPlan } from "@/lib/services/catalogOverrides";
import { ApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { useReload } from "@/components/admin/AdminBits";
import FieldError from "@/components/ui/FieldError";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import FilterBar from "@/components/filters/FilterBar";
import { IconStar, IconPlus, IconSearch, IconEdit, IconTrash, IconEyeOff, IconEye, IconRefresh, IconUsers, IconClock, IconSliders } from "@/components/icons";
import PlanVersions from "@/components/admin/plans/PlanVersions";
import FeatureRegistry from "@/components/admin/plans/FeatureRegistry";
import { aiId } from "@/lib/ai/ids";
import { useAiField, useAiModal } from "@/lib/ai/registry";

const som = (n?: number) => (n ? fmtUzs(n) : "—");
const toList = (v: string) =>
  v
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
const num = (v: string) => parseInt(String(v || "0"), 10) || 0;
const transient = (e: unknown) => !(e instanceof ApiError) || e.status === 0 || (e.status >= 500 && e.status !== 501);

// The admin form's audience choices (GM: Mijoz / Yurist / Advokat); the
// backend keeps whatever string we send, but may normalize it by slug — see
// planAudience() and the hint under the field.
// "seller" = both yurist and advokat (what the backend stores for the LexGo.AI plans).
type FormAudience = PlanAudience | "seller";
const FORM_AUDIENCES: FormAudience[] = ["client", "yurist", "advokat", "seller"];
type AudienceFilter = "all" | PlanAudience;

const aiNorm = (v: string) =>
  v
    .toLowerCase()
    .replace(/[ʻʼ'‘’`]/g, "")
    .replace(/\(\d+\)/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const aiStem = (v: string) => v.replace(/(lari|lar)\b/g, "");

function pickOption(opts: { value: string; label: string }[], raw: string): string | null {
  const w = aiNorm(raw);
  if (!w) return opts[0]?.value ?? null;
  const exact = opts.find((o) => aiNorm(o.value) === w || aiNorm(o.label) === w);
  if (exact) return exact.value;
  const s = aiStem(w);
  const near = opts
    .filter((o) => {
      const l = aiNorm(o.label);
      return l.includes(s) || (s.length >= 4 && s.includes(aiStem(l)));
    })
    .sort((a, b) => aiNorm(b.label).length - aiNorm(a.label).length);
  return near.length ? near[0].value : null;
}

// target_roles is the precise 2026-09-19 list (client/yurist/advokat only —
// no "business"), distinct from the older free-text `audience` field above.
const TARGET_ROLES: PlanAudience[] = ["client", "yurist", "advokat"];
// The roles `audience` implies, so a fresh form (or one for a plan with no
// target_roles yet) starts with a sensible default instead of empty.
function defaultTargetRoles(a: FormAudience): PlanAudience[] {
  return a === "seller" ? ["yurist", "advokat"] : [a];
}

type FormVals = {
  title: string;
  slug: string;
  audience: FormAudience;
  targetRoles: PlanAudience[];
  autoChargeProvider: string;
  billingType: string;
  sortOrder: string;
  giftDurations: string;
  period: BillingPeriod;
  price: string;
  description: string;
  benefits: string;
  is_giftable: boolean;
  is_active: boolean;
};

function seedVals(p?: BackendPlan): FormVals {
  if (!p) {
    return {
      title: "", slug: "", audience: "client", targetRoles: ["client"], autoChargeProvider: "atmos",
      billingType: "subscription", sortOrder: "", giftDurations: "",
      period: "monthly", price: "", description: "", benefits: "", is_giftable: false, is_active: true,
    };
  }
  const period = primaryPeriod(p);
  const price = planPrice(p, period);
  const audience: FormAudience = (() => { const a = planAudience(p); return a.includes("yurist") && a.includes("advokat") ? "seller" : a[0] ?? "client"; })();
  return {
    title: p.title || p.name,
    slug: p.slug,
    audience,
    targetRoles: p.targetRoles.length ? (p.targetRoles.filter((r) => TARGET_ROLES.includes(r as PlanAudience)) as PlanAudience[]) : defaultTargetRoles(audience),
    autoChargeProvider: p.autoChargeProvider || "atmos",
    billingType: p.billingType || "subscription",
    sortOrder: p.sortOrder ? String(p.sortOrder) : "",
    giftDurations: p.allowedGiftDurations.join(", "),
    period,
    price: price ? String(Math.round(price)) : "",
    description: p.description,
    benefits: (p.benefits.length ? p.benefits : p.features).join("\n"),
    is_giftable: p.isGiftable,
    is_active: p.isActive,
  };
}

// Create / edit form. Own component (not AdminForm) for the plan-specific
// field set (audience, billing period, gift durations, benefits list…).
function PlanForm({
  plan,
  onDone,
  aiId: formAiId,
}: {
  plan?: BackendPlan;
  onDone: () => void;
  aiId?: string;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const uid = useId();
  const [v, setV] = useState<FormVals>(() => seedVals(plan));
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<{ title?: boolean; slug?: boolean }>({});
  const set = <K extends keyof FormVals>(k: K, val: FormVals[K]) => {
    setV((s) => ({ ...s, [k]: val }));
    if (k === "title" || k === "slug") setBad((b) => (b[k as "title" | "slug"] ? { ...b, [k]: false } : b));
  };

  const audienceOpts = FORM_AUDIENCES.map((a) => ({ value: a, label: a === "seller" ? t("plans.audienceSeller") : t(`plans.audiences.${a}`) }));
  const periodOpts = BILLING_PERIODS.map((p) => ({ value: p, label: t(`plans.periods.${p}`) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const miss = { title: !v.title.trim(), slug: !v.slug.trim() };
    if (miss.title || miss.slug) {
      setBad(miss);
      document.getElementById(`${uid}-${miss.title ? "title" : "slug"}`)?.focus();
      return;
    }
    setBusy(true);
    const body = {
      slug: v.slug.trim(),
      title: v.title.trim(),
      description: v.description.trim(),
      audience: v.audience,
      target_roles: v.targetRoles,
      auto_charge_provider: v.autoChargeProvider.trim() || undefined,
      billing_type: v.billingType.trim() || undefined,
      sort_order: num(v.sortOrder),
      allowed_gift_durations: toList(v.giftDurations).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n)),
      ...pricesFor(v.period, num(v.price), plan),
      benefits: toList(v.benefits),
      is_giftable: v.is_giftable,
      is_active: v.is_active,
    };
    try {
      if (!plan) {
        await createPlanAdmin(body);
        notify.success(t("plans.notify.created"), { id: "plan-save", body: body.title });
        onDone();
        return;
      }
      await savePlan(plan, body);
      notify.success(t("plans.notify.saved"), { id: "plan-save", body: body.title });
      onDone();
    } catch (e) {
      notify.error(plan ? t("plans.notify.saveFailed") : t("plans.notify.createFailed"), { id: "plan-save", error: e });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit} data-ai-id={formAiId} data-ai-type={formAiId ? "modal" : undefined} data-ai-label={formAiId ? t(plan ? "plans.editTitle" : "plans.create") : undefined}>
      <div>
        <label htmlFor={`${uid}-title`}>{t("form.title")}</label>
        <input id={`${uid}-title`} value={v.title} onChange={(e) => set("title", e.target.value)} required aria-invalid={bad.title || undefined} aria-describedby={bad.title ? `${uid}-title-err` : undefined} />
        <FieldError id={`${uid}-title-err`} msg={bad.title ? tc("required") : null} />
      </div>
      <div>
        <label htmlFor={`${uid}-slug`}>{t("form.slug")}</label>
        <input id={`${uid}-slug`} value={v.slug} onChange={(e) => set("slug", e.target.value)} placeholder="premium" required aria-invalid={bad.slug || undefined} aria-describedby={bad.slug ? `${uid}-slug-err` : undefined} />
        <FieldError id={`${uid}-slug-err`} msg={bad.slug ? tc("required") : null} />
      </div>
      <div>
        <label>{t("plans.audience")}</label>
        <Select value={v.audience} onChange={(x) => set("audience", x as FormAudience)} options={audienceOpts} ariaLabel={t("plans.audience")} />
        <small className="aplan__hint">{t("plans.audienceHint")}</small>
      </div>
      <div>
        <label>{t("plans.targetRoles")}</label>
        <div className="afield--check" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {TARGET_ROLES.map((r) => (
            <label className="wh__check" key={r}>
              <input
                type="checkbox"
                checked={v.targetRoles.includes(r)}
                onChange={(e) =>
                  set(
                    "targetRoles",
                    e.target.checked ? [...v.targetRoles, r] : v.targetRoles.filter((x) => x !== r),
                  )
                }
              />
              {t(`plans.audiences.${r}`)}
            </label>
          ))}
        </div>
        <small className="aplan__hint">{t("plans.targetRolesHint")}</small>
      </div>
      <div>
        <label>{t("plans.autoChargeProvider")}</label>
        <Select
          value={v.autoChargeProvider}
          onChange={(x) => set("autoChargeProvider", x)}
          options={[
            { value: "", label: t("plans.autoChargeNone") },
            { value: "atmos", label: "ATMOS" },
          ]}
          ariaLabel={t("plans.autoChargeProvider")}
        />
      </div>
      <div className="cform__row2">
        <div>
          <label>{t("plans.billingPeriod")}</label>
          <Select value={v.period} onChange={(x) => set("period", x as BillingPeriod)} options={periodOpts} ariaLabel={t("plans.billingPeriod")} />
        </div>
        <div>
          <label>{t("plans.price")}</label>
          <input type="number" min={0} inputMode="numeric" value={v.price} onChange={(e) => set("price", e.target.value)} placeholder="149000" />
        </div>
      </div>
      <div className="cform__row2">
        <div>
          <label>{t("plans.billingType")}</label>
          <input value={v.billingType} onChange={(e) => set("billingType", e.target.value)} placeholder="subscription" />
        </div>
        <div>
          <label>{t("plans.sortOrder")}</label>
          <input type="number" inputMode="numeric" value={v.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} placeholder="0" />
        </div>
      </div>
      <div>
        <label>{t("plans.giftDurations")}</label>
        <input value={v.giftDurations} onChange={(e) => set("giftDurations", e.target.value)} placeholder={t("plans.giftDurationsPh")} />
        <small className="aplan__hint">{t("plans.giftDurationsHint")}</small>
      </div>
      <div>
        <label>{t("form.description")}</label>
        <textarea rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div>
        <label>{t("plans.benefits")}</label>
        <textarea rows={4} value={v.benefits} onChange={(e) => set("benefits", e.target.value)} placeholder={t("plans.benefitsPh")} />
      </div>
      <div className="afield--check">
        <label className="wh__check">
          <input type="checkbox" checked={v.is_giftable} onChange={(e) => set("is_giftable", e.target.checked)} />
          {t("plans.giftable")}
        </label>
      </div>
      <div className="afield--check">
        <label className="wh__check">
          <input type="checkbox" checked={v.is_active} onChange={(e) => set("is_active", e.target.checked)} />
          {t("form.active")}
        </label>
      </div>
      <button className="btn btn--pri" type="submit" disabled={busy}>
        {busy ? t("form.saving") : plan ? t("form.update") : t("form.save")}
      </button>
    </form>
  );
}

export default function AdminPlans() {
  const t = useTranslations("admin");
  const tn = useTranslations("common.notify");
  const locale = useLocale();
  const [key, reload] = useReload();
  const res = useResourceOne(() => listSubscriptionPlansAdmin(locale), [key, locale]);
  const plans = useMemo(() => res.data?.plans ?? [], [res.data]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<OverlaidPlan | null>(null);
  const [del, setDel] = useState<OverlaidPlan | null>(null);
  // Versions (published read-only, edits as drafts) and the feature registry.
  const [versionsOf, setVersionsOf] = useState<OverlaidPlan | null>(null);
  const [registry, setRegistry] = useState(false);
  const [q, setQ] = useState("");
  const [aud, setAud] = useState<AudienceFilter>("all");
  const [showHidden, setShowHidden] = useState(false);
  const hiddenCount = plans.filter((p) => p.hidden).length;
  const viewHidden = showHidden && hiddenCount > 0;
  const [delBusy, setDelBusy] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const inView = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return plans.filter((p) => {
      if (p.hidden !== viewHidden) return false;
      if (!terms.length) return true;
      const hay = [p.name, p.title, p.slug].join(" ").toLowerCase();
      return terms.every((w) => hay.includes(w));
    });
  }, [plans, q, viewHidden]);
  const list = useMemo(() => (aud === "all" ? inView : inView.filter((p) => planAudience(p).includes(aud))), [inView, aud]);

  // Audience chips: the three GM roles always, business only when a plan has it.
  const audiences: AudienceFilter[] = ["all", ...PLAN_AUDIENCES.filter((a) => a !== "business" || plans.some((p) => planAudience(p).includes("business")))];
  const audOpts = audiences.map((a) => ({
    value: a,
    label: `${t(`plans.audiences.${a}`)} (${a === "all" ? inView.length : inView.filter((p) => planAudience(p).includes(a)).length})`,
  }));
  const visOpts = [
    { value: "visible", label: t("plans.visibleChip", { n: plans.length - hiddenCount }) },
    { value: "hidden", label: t("plans.hiddenChip", { n: hiddenCount }) },
  ];
  useAiField("admin.plans.search.input", { get: () => q, set: setQ });
  useAiField("admin.plans.filters.audience", {
    get: () => aud,
    set: (v) => {
      const hit = pickOption(audOpts, v);
      if (hit) setAud(hit as AudienceFilter);
    },
  });
  useAiField("admin.plans.filters.visibility", {
    get: () => (viewHidden ? "hidden" : "visible"),
    set: (v) => {
      const hit = pickOption(visOpts, v);
      if (hit) setShowHidden(hit === "hidden");
    },
  });
  useAiModal("admin.plans.create-modal", () => {
    setOpen(true);
  });

  // Plan edits write straight to the backend now; a write that genuinely
  // can't reach it falls back to a local overlay (see lib/services/
  // catalogOverrides.ts) as a resilience net, but that's not something the
  // admin needs to be told about — it reads the same as a normal save.
  function saved(msg: string, p: OverlaidPlan) {
    notify.success(msg, { id: `plan-op-${p.id}`, body: p.name });
    reload();
  }

  async function run(p: OverlaidPlan, op: () => Promise<{ via: "backend" | "overlay" } | void>, msg: string, failMsg: string) {
    if (toggling) return;
    setToggling(p.id);
    try {
      await op();
      saved(msg, p);
    } catch (e) {
      notify.error(failMsg, {
        id: `plan-op-${p.id}`,
        error: e,
        action: transient(e) ? { label: tn("retry"), onClick: () => void run(p, op, msg, failMsg) } : undefined,
      });
    } finally {
      setToggling(null);
    }
  }
  const toggleActive = (p: OverlaidPlan) =>
    run(p, () => savePlan(p, { is_active: !p.isActive }), p.isActive ? t("plans.notify.deactivated") : t("plans.notify.activated"), t("plans.notify.toggleFailed"));
  const restore = (p: OverlaidPlan) => run(p, () => restorePlan(p.slug), t("plans.restored"), t("plans.notify.restoreFailed"));
  const reset = (p: OverlaidPlan) => run(p, () => resetPlan(p.slug), t("plans.notify.reset"), t("plans.notify.resetFailed"));

  async function confirmDelete() {
    if (!del || delBusy) return;
    setDelBusy(true);
    try {
      await removePlan(del);
      setDel(null);
      saved(t("plans.notify.deleted"), del);
    } catch (e) {
      notify.error(t("plans.notify.deleteFailed"), { id: `plan-op-${del.id}`, error: e });
    } finally {
      setDelBusy(false);
    }
  }

  const priceLabel = (p: BackendPlan) => {
    const period = primaryPeriod(p);
    const price = planPrice(p, period);
    return price ? `${som(price)}${period === "monthly" ? "" : ` · ${t(`plans.periods.${period}`)}`}` : "—";
  };

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("plans.listTitle")}</b>
        <span className="ahdr">
          <span className="advmuted">{plans.length - hiddenCount}</span>
          <button className="btn btn--line btn--sm" type="button" onClick={() => setRegistry(true)} data-ai-id="admin.plans.features">
            <IconSliders />
            {t("tariffs.registry")}
          </button>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setOpen(true)} data-ai-target="button:new-plan" data-ai-id="admin.plans.create">
            <IconPlus />
            {t("form.add")}
          </button>
        </span>
      </div>

      <FilterBar
        className="uf--tray"
        fields={[
          { key: "audience", label: t("plans.audience"), icon: IconUsers, value: aud, empty: "all", onChange: (v) => setAud(v as AudienceFilter), options: audOpts, aiId: "admin.plans.filters.audience" },
          {
            key: "visibility",
            label: t("plans.visibility"),
            icon: IconEye,
            hidden: !hiddenCount,
            value: viewHidden ? "hidden" : "visible",
            empty: "visible",
            onChange: (v) => setShowHidden(v === "hidden"),
            options: visOpts,
            aiId: "admin.plans.filters.visibility",
          },
        ]}
        search={{ value: q, onChange: setQ, placeholder: t("plans.searchPh"), aiId: "admin.plans.search.input" }}
        count={res.status === "ready" ? list.length : undefined}
        aiId="admin.plans.filters"
        aiTarget="plans:filters"
        aiLabel={t("plans.audience")}
      />

      {res.data?.activeOnly ? <p className="advmuted aplan__only">{t("plans.activeOnly")}</p> : null}
      {viewHidden ? <p className="advmuted aplan__only">{t("plans.hiddenNote")}</p> : null}

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState onRetry={reload} />
      ) : !plans.length ? (
        <EmptyState icon={<IconStar />} title={t("plans.empty")} />
      ) : !list.length ? (
        <EmptyState icon={<IconSearch />} title={t("plans.noResults")} />
      ) : (
        <div className="alist" data-ai-target="plans:list" data-ai-id="admin.plans.list" data-ai-type="list" data-ai-label={t("plans.listTitle")}>
          {list.map((p, i) => (
            <div
              className="aitem"
              key={p.id}
              data-ai-id={p.slug || p.id ? aiId("admin.plans.item", p.slug || p.id) : undefined}
              data-ai-type="list_item"
              data-ai-entity-type="subscription_plan"
              data-ai-entity-id={p.id || undefined}
              data-ai-entity-slug={p.slug || undefined}
            >
              <span className="aitem__n">{i + 1}</span>
              <div className="aitem__m">
                <b>{p.name}</b>
                <span className="aitem__meta">{p.slug}</span>
                <div className="aitem__tags">
                  {planAudience(p).map((a) => (
                    <em key={a} className="atag">{t(`plans.audiences.${a}`)}</em>
                  ))}
                  {p.isGiftable ? <em className="atag">{t("plans.giftable")}</em> : null}
                  <em className={`atag atag--${p.isActive ? "ok" : "muted"}`}>{p.isActive ? t("form.active") : t("form.inactive")}</em>
                  {p.overridden ? <em className="atag atag--warn" title={t("plans.overriddenHint")}>{t("plans.overridden")}</em> : null}
                  {p.hidden ? <em className="atag atag--muted">{t("plans.hiddenTag")}</em> : null}
                </div>
              </div>
              <div className="aitem__r">{priceLabel(p)}</div>
              <div className="aitem__acts" data-ai-target="plans:item-actions">
                {p.hidden ? (
                  <button className="aitem__act" type="button" aria-label={t("plans.restore")} title={t("plans.restore")} disabled={toggling === p.id} onClick={() => restore(p)}>
                    <IconEye />
                  </button>
                ) : null}
                {p.overridden ? (
                  <button className="aitem__act" type="button" aria-label={t("plans.reset")} title={t("plans.reset")} disabled={toggling === p.id} onClick={() => reset(p)}>
                    <IconRefresh />
                  </button>
                ) : null}
                <button className="aitem__act" type="button" aria-label={t("tariffs.versions")} title={t("tariffs.versions")} onClick={() => setVersionsOf(p)} data-ai-id={p.slug || p.id ? aiId("admin.plans.item", p.slug || p.id, "versions") : undefined}>
                  <IconClock />
                </button>
                <button className="aitem__act" type="button" aria-label={t("form.edit")} title={t("form.edit")} onClick={() => setEdit(p)} data-ai-id={p.slug || p.id ? aiId("admin.plans.item", p.slug || p.id, "edit") : undefined}>
                  <IconEdit />
                </button>
                <button
                  className="aitem__act"
                  type="button"
                  aria-label={p.isActive ? t("plans.deactivate") : t("plans.activate")}
                  title={p.isActive ? t("plans.deactivate") : t("plans.activate")}
                  disabled={toggling === p.id}
                  onClick={() => toggleActive(p)}
                >
                  {p.isActive ? <IconEyeOff /> : <IconEye />}
                </button>
                {!p.hidden ? (
                  <button className="aitem__act aitem__act--danger" type="button" aria-label={t("form.delete")} title={t("form.delete")} onClick={() => setDel(p)}>
                    <IconTrash />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create */}
      <Modal open={versionsOf !== null} onClose={() => setVersionsOf(null)} title={versionsOf ? t("tariffs.versionsOf", { name: versionsOf.title || versionsOf.name || versionsOf.slug }) : ""} wide>
        {versionsOf ? <PlanVersions key={versionsOf.id} planId={versionsOf.id} /> : null}
      </Modal>
      <Modal open={registry} onClose={() => setRegistry(false)} title={t("tariffs.registry")} wide>
        {registry ? <FeatureRegistry /> : null}
      </Modal>
      <Modal open={open} onClose={() => setOpen(false)} title={t("plans.create")}>
        <PlanForm
          aiId="admin.plans.create-modal"
          key={open ? "new" : "closed"}
          onDone={() => {
            reload();
            setOpen(false);
          }}
        />
      </Modal>

      {/* Edit */}
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={t("plans.editTitle")}>
        {edit ? (
          <PlanForm
            aiId="admin.plans.edit-modal"
            key={edit.id}
            plan={edit}
            onDone={() => {
              setEdit(null);
              reload();
            }}
          />
        ) : null}
      </Modal>

      {/* Delete confirm */}
      <Modal open={del !== null} onClose={() => setDel(null)} title={t("form.deleteConfirm")}>
        {del ? (
          <div className="cform" style={{ maxWidth: "none" }} data-ai-id="admin.plans.delete-modal" data-ai-type="modal" data-ai-label={t("form.deleteConfirm")}>
            <p style={{ margin: 0 }}>
              <b>{del.name}</b> <span className="advmuted">{del.slug}</span>
            </p>
            <p className="advmuted" style={{ margin: 0 }}>{t("plans.deleteText")}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn--ghost" type="button" onClick={() => setDel(null)}>
                {t("form.cancel")}
              </button>
              <button className="btn btn--danger" type="button" onClick={confirmDelete} disabled={delBusy}>
                {delBusy ? t("form.saving") : t("form.delete")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
