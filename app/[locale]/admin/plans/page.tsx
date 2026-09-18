"use client";

import { useMemo, useState, type FormEvent } from "react";
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
  deletePlanAdmin,
  planPrice,
  pricesFor,
  primaryPeriod,
  updatePlanAdmin,
  type BillingPeriod,
  type WriteResult,
} from "@/lib/services/plans";
import { useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { Notice, useReload } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { IconStar, IconPlus, IconSearch, IconEdit, IconTrash, IconEyeOff, IconEye } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "—");
const toList = (v: string) =>
  v
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
const num = (v: string) => parseInt(String(v || "0"), 10) || 0;

// The admin form's audience choices (GM: Mijoz / Yurist / Advokat); the
// backend keeps whatever string we send, but may normalize it by slug — see
// planAudience() and the hint under the field.
const FORM_AUDIENCES: PlanAudience[] = ["client", "yurist", "advokat"];
type AudienceFilter = "all" | PlanAudience;

type Note = { ok: boolean; msg: string; tone?: "warn" };

type FormVals = {
  title: string;
  slug: string;
  audience: PlanAudience;
  period: BillingPeriod;
  price: string;
  description: string;
  benefits: string;
  is_giftable: boolean;
  is_active: boolean;
};

function seedVals(p?: BackendPlan): FormVals {
  if (!p) return { title: "", slug: "", audience: "client", period: "monthly", price: "", description: "", benefits: "", is_giftable: false, is_active: true };
  const period = primaryPeriod(p);
  const price = planPrice(p, period);
  return {
    title: p.title || p.name,
    slug: p.slug,
    audience: planAudience(p)[0] ?? "client",
    period,
    price: price ? String(Math.round(price)) : "",
    description: p.description,
    benefits: (p.benefits.length ? p.benefits : p.features).join("\n"),
    is_giftable: p.isGiftable,
    is_active: p.isActive,
  };
}

// Create / edit form. Own component (not AdminForm) so the "backend does not
// have this route yet" outcome can show as a warning, not a failure.
function PlanForm({
  plan,
  onDone,
  onPending,
}: {
  plan?: BackendPlan;
  onDone: () => void;
  onPending: (msg: string) => void;
}) {
  const t = useTranslations("admin");
  const [v, setV] = useState<FormVals>(() => seedVals(plan));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const set = <K extends keyof FormVals>(k: K, val: FormVals[K]) => setV((s) => ({ ...s, [k]: val }));

  const audienceOpts = FORM_AUDIENCES.map((a) => ({ value: a, label: t(`plans.audiences.${a}`) }));
  const periodOpts = BILLING_PERIODS.map((p) => ({ value: p, label: t(`plans.periods.${p}`) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!v.title.trim() || !v.slug.trim()) {
      setNote({ ok: false, msg: t("form.error") });
      return;
    }
    setBusy(true);
    setNote(null);
    const body = {
      slug: v.slug.trim(),
      title: v.title.trim(),
      description: v.description.trim(),
      audience: v.audience,
      ...pricesFor(v.period, num(v.price), plan),
      benefits: toList(v.benefits),
      is_giftable: v.is_giftable,
      is_active: v.is_active,
    };
    try {
      if (!plan) {
        await createPlanAdmin(body);
        setNote({ ok: true, msg: t("form.created") });
        onDone();
        return;
      }
      const r: WriteResult = await updatePlanAdmin(plan.id, body);
      if (r.ok) {
        setNote({ ok: true, msg: t("form.updated") });
        onDone();
      } else if (r.pending) {
        onPending(t("plans.writePending"));
      } else {
        setNote({ ok: false, msg: r.detail || t("form.updateError") });
      }
    } catch (e) {
      const detail = e && typeof e === "object" && "detail" in e ? String((e as { detail?: string }).detail || "") : "";
      setNote({ ok: false, msg: detail || t("form.error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
      <div>
        <label>{t("form.title")}</label>
        <input value={v.title} onChange={(e) => set("title", e.target.value)} required />
      </div>
      <div>
        <label>{t("form.slug")}</label>
        <input value={v.slug} onChange={(e) => set("slug", e.target.value)} placeholder="premium" required />
      </div>
      <div>
        <label>{t("plans.audience")}</label>
        <Select value={v.audience} onChange={(x) => set("audience", x as PlanAudience)} options={audienceOpts} ariaLabel={t("plans.audience")} />
        <small className="aplan__hint">{t("plans.audienceHint")}</small>
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
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      <button className="btn btn--pri" type="submit" disabled={busy}>
        {busy ? t("form.saving") : plan ? t("form.update") : t("form.save")}
      </button>
    </form>
  );
}

export default function AdminPlans() {
  const t = useTranslations("admin");
  const tp = useTranslations("portal.common");
  const locale = useLocale();
  const [key, reload] = useReload();
  const res = useResourceOne(() => listSubscriptionPlansAdmin(locale), [key, locale]);
  const plans = useMemo(() => res.data?.plans ?? [], [res.data]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<BackendPlan | null>(null);
  const [del, setDel] = useState<BackendPlan | null>(null);
  const [q, setQ] = useState("");
  const [aud, setAud] = useState<AudienceFilter>("all");
  const [pageNote, setPageNote] = useState<Note | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delNote, setDelNote] = useState<Note | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const list = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return plans.filter((p) => {
      if (aud !== "all" && !planAudience(p).includes(aud)) return false;
      if (!terms.length) return true;
      const hay = [p.name, p.title, p.slug].join(" ").toLowerCase();
      return terms.every((w) => hay.includes(w));
    });
  }, [plans, q, aud]);

  // Audience chips: the three GM roles always, business only when a plan has it.
  const chips: AudienceFilter[] = ["all", ...PLAN_AUDIENCES.filter((a) => a !== "business" || plans.some((p) => planAudience(p).includes("business")))];

  function pending(msg: string) {
    setPageNote({ ok: false, msg, tone: "warn" });
    setEdit(null);
    setDel(null);
  }

  async function toggleActive(p: BackendPlan) {
    if (toggling) return;
    setToggling(p.id);
    setPageNote(null);
    const r = await updatePlanAdmin(p.id, { is_active: !p.isActive });
    setToggling(null);
    if (r.ok) {
      setPageNote({ ok: true, msg: t("form.updated") });
      reload();
    } else if (r.pending) pending(t("plans.writePending"));
    else setPageNote({ ok: false, msg: r.detail || t("form.updateError") });
  }

  async function confirmDelete() {
    if (!del || delBusy) return;
    setDelBusy(true);
    setDelNote(null);
    const r = await deletePlanAdmin(del.id);
    setDelBusy(false);
    if (r.ok) {
      setDel(null);
      setPageNote({ ok: true, msg: t("form.deleted") });
      reload();
    } else if (r.pending) pending(t("plans.deletePending"));
    else setDelNote({ ok: false, msg: r.detail || t("form.deleteError") });
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
          <span className="advmuted">{plans.length}</span>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => { setPageNote(null); setOpen(true); }}>
            <IconPlus />
            {t("form.add")}
          </button>
        </span>
      </div>

      <div className="lfilters">
        <div className="lsearch">
          <IconSearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("plans.searchPh")} aria-label={t("plans.searchPh")} />
        </div>
        <div className="chipm" role="group" aria-label={t("plans.audience")}>
          {chips.map((a) => (
            <button key={a} type="button" className={`chip${aud === a ? " on" : ""}`} aria-pressed={aud === a} onClick={() => setAud(a)}>
              {t(`plans.audiences.${a}`)}
            </button>
          ))}
        </div>
      </div>

      {pageNote ? <div className={`anote anote--${pageNote.tone === "warn" ? "warn" : pageNote.ok ? "ok" : "err"}`} style={{ marginBottom: 12 }}>{pageNote.msg}</div> : null}
      {res.data?.activeOnly ? <p className="advmuted aplan__only">{t("plans.activeOnly")}</p> : null}

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : res.status === "error" ? (
        <EmptyState icon={<IconStar />} title={tp("loadError")} text={tp("loadErrorText")} />
      ) : !plans.length ? (
        <EmptyState icon={<IconStar />} title={t("plans.empty")} />
      ) : !list.length ? (
        <EmptyState icon={<IconSearch />} title={t("plans.noResults")} />
      ) : (
        <div className="alist">
          {list.map((p, i) => (
            <div className="aitem" key={p.id}>
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
                </div>
              </div>
              <div className="aitem__r">{priceLabel(p)}</div>
              <div className="aitem__acts">
                <button className="aitem__act" type="button" aria-label={t("form.edit")} title={t("form.edit")} onClick={() => { setPageNote(null); setEdit(p); }}>
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
                <button className="aitem__act aitem__act--danger" type="button" aria-label={t("form.delete")} title={t("form.delete")} onClick={() => { setPageNote(null); setDelNote(null); setDel(p); }}>
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create */}
      <Modal open={open} onClose={() => setOpen(false)} title={t("plans.create")}>
        <PlanForm
          key={open ? "new" : "closed"}
          onDone={() => {
            reload();
            setOpen(false);
          }}
          onPending={pending}
        />
      </Modal>

      {/* Edit */}
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={t("plans.editTitle")}>
        {edit ? (
          <PlanForm
            key={edit.id}
            plan={edit}
            onDone={() => {
              reload();
              setEdit(null);
            }}
            onPending={pending}
          />
        ) : null}
      </Modal>

      {/* Delete confirm */}
      <Modal open={del !== null} onClose={() => setDel(null)} title={t("form.deleteConfirm")}>
        {del ? (
          <div className="cform" style={{ maxWidth: "none" }}>
            <p style={{ margin: 0 }}>
              <b>{del.name}</b> <span className="advmuted">{del.slug}</span>
            </p>
            <p className="advmuted" style={{ margin: 0 }}>{t("form.deleteConfirmText")}</p>
            {delNote ? <Notice ok={delNote.ok} msg={delNote.msg} /> : null}
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
