"use client";

import "./docSettings.css";
import { useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import IconButton from "@/components/ui/IconButton";
import { IconCheck, IconClipboardCheck, IconClose, IconCoins, IconCrown, IconDownload, IconFileText, IconFolder, IconHistory, IconLayers, IconLock, IconPlus, IconRefresh, IconShieldCheck } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { errDetail, isAborted, isForbidden, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { Switch } from "@/components/admin/studio/sx/form/Switch";
import { getSubscriptionPlans, type BackendPlan } from "@/lib/services/backend";
import {
  DOC_FORMATS,
  DOC_MODES,
  REVIEWER_TYPES,
  createDocSettingsDraft,
  docSettingsIssues,
  downloadRuleBody,
  downloadRuleOf,
  getDocSettingsAdmin,
  getDocSettingsRuntime,
  planRuleBody,
  planRuleOf,
  publishDocSettings,
  reviewRuleBody,
  reviewRuleOf,
  rollbackDocSettings,
  settingsBody,
  type DocSettings,
  type DocSettingsVersion,
} from "@/lib/services/documentSettings";

// Document services' global settings (TSK-136097): what the services use
// now, the version history, and a draft editor. Publishing makes a draft
// the active version; rollback brings a published one back. Both ask first.

type Loaded = { runtime: Awaited<ReturnType<typeof getDocSettingsRuntime>>; admin: Awaited<ReturnType<typeof getDocSettingsAdmin>> };
type Confirm = { kind: "publish" | "rollback"; v: DocSettingsVersion } | null;

// One rules card: an icon, a title, an on/off state when the rule can be
// switched, and its body.
function Card({ icon, title, on, children }: { icon: ReactNode; title: string; on?: boolean; children: ReactNode }): ReactElement {
  const t = useTranslations("admin.docSettings");
  return (
    <article className="dss-card">
      <header className="dss-card__h">
        <span className="dss-card__ico" aria-hidden="true">
          {icon}
        </span>
        <b>{title}</b>
        {on === undefined ? null : (
          <span className="dss-state" data-on={on || undefined}>
            {on ? t("on") : t("off")}
          </span>
        )}
      </header>
      <div className="dss-card__b">{children}</div>
    </article>
  );
}

// Every option, picked or not, so the whole set is visible at a glance.
function OptionSet({ all, picked, label }: { all: readonly string[]; picked: readonly string[]; label: (v: string) => string }): ReactElement {
  return (
    <ul className="dss-opts">
      {all.map((v) => {
        const has = picked.includes(v);
        return (
          <li key={v} data-on={has || undefined}>
            {has ? <IconCheck aria-hidden="true" /> : <IconClose aria-hidden="true" />}
            <span>{label(v)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Summary({ s, compact = false }: { s: DocSettings; compact?: boolean }): ReactElement {
  const t = useTranslations("admin.docSettings");
  const som = (n: number) => `${fmtUzs(n)} ${t("som")}`;
  const plan = planRuleOf(s.planRequirements);
  const review = reviewRuleOf(s.reviewPolicy);
  const dl = downloadRuleOf(s.downloadPolicy);
  const modeLabel = (m: string) => (t.has(`mode.${m}`) ? t(`mode.${m}`) : m);
  const extraModes = s.modes.filter((m) => !(DOC_MODES as readonly string[]).includes(m));
  return (
    <div className={`dss-grid${compact ? " dss-grid--compact" : ""}`}>
      <Card icon={<IconFolder />} title={t("files")}>
        <OptionSet all={DOC_FORMATS} picked={s.allowedFormats} label={(f) => f.toUpperCase()} />
        <dl className="dss-stats">
          <div>
            <dt>{t("maxFile")}</dt>
            <dd className="sx-num">{t("mb", { n: s.maxFileMb })}</dd>
          </div>
          <div>
            <dt>{t("includedPages")}</dt>
            <dd className="sx-num">{t("pages", { n: s.includedPages })}</dd>
          </div>
        </dl>
      </Card>
      <Card icon={<IconCoins />} title={t("pricing")}>
        <div className="dss-big">
          <small>{t("extraPage")}</small>
          <b className="sx-num">{som(s.extraPagePrice)}</b>
        </div>
        <div className="dss-ladder">
          <small>{t("tiers")}</small>
          {s.pagePricing.length ? (
            <ol className="dss-tiers">
              {s.pagePricing.map((r, i) => (
                <li key={i}>
                  <span>{r.maxPages === null ? t("tierFrom", { from: r.minPages }) : t("tierRange", { from: r.minPages, to: r.maxPages })}</span>
                  <b className="sx-num">{som(r.amount)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="dss-muted">{t("noTiers")}</p>
          )}
        </div>
      </Card>
      <Card icon={<IconLayers />} title={t("modes")}>
        <OptionSet all={[...DOC_MODES, ...extraModes]} picked={s.modes} label={modeLabel} />
      </Card>
      <Card icon={<IconCrown />} title={t("plan.title")} on={plan.required}>
        <p className="dss-lead">{plan.required ? t("plan.needed", { n: plan.planIds.length }) : t("plan.free")}</p>
        {plan.required && plan.entitlement ? <p className="dss-muted">{t("plan.entitlementIs", { key: plan.entitlement })}</p> : !plan.required ? <p className="dss-muted">{t("plan.freeHint")}</p> : null}
        {Object.keys(plan.perMode).length ? <p className="dss-muted">{t("plan.perModeN", { n: Object.keys(plan.perMode).length })}</p> : null}
      </Card>
      <Card icon={<IconClipboardCheck />} title={t("review.title")} on={review.enabled}>
        <p className="dss-lead">{review.enabled ? t(`review.by.${review.reviewerType || "any"}`) : t("review.off")}</p>
        <p className="dss-muted">{review.enabled && review.slaMinutes ? t("review.slaIs", { n: review.slaMinutes }) : t("review.offHint")}</p>
      </Card>
      <Card icon={<IconDownload />} title={t("download.title")} on={dl.planRequired || dl.watermark || dl.formats.length > 0}>
        <p className="dss-lead">{dl.planRequired ? t("download.plan") : t("download.anyone")}</p>
        <p className="dss-muted">{[dl.formats.length ? dl.formats.map((f) => f.toUpperCase()).join(", ") : t("download.allFormats"), dl.watermark ? t("download.watermarkOn") : ""].filter(Boolean).join(" · ")}</p>
      </Card>
    </div>
  );
}

// Which plans (or which entitlement) a rule asks for.
function PlanPick({ plans, ids, entitlement, onIds, onEntitlement, label }: { plans: BackendPlan[] | null; ids: string[]; entitlement: string; onIds: (v: string[]) => void; onEntitlement: (v: string) => void; label: string }): ReactElement {
  const t = useTranslations("admin.docSettings");
  const flip = (id: string) => onIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  return (
    <>
      <div className="dss-toggles" role="group" aria-label={label}>
        {plans === null ? (
          <span className="dss-muted">{t("plan.loading")}</span>
        ) : plans.length ? (
          plans.map((p) => (
            <button key={p.id} type="button" aria-pressed={ids.includes(p.id)} onClick={() => flip(p.id)}>
              {p.name}
            </button>
          ))
        ) : (
          <span className="dss-muted">{t("plan.none")}</span>
        )}
      </div>
      <label className="dss-line">
        <span>{t("plan.entitlement")}</span>
        <input value={entitlement} placeholder="documents.unlimited" onChange={(e) => onEntitlement(e.target.value)} />
        <small>{t("plan.entitlementHint")}</small>
      </label>
    </>
  );
}

// A numbered part of the draft editor.
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }): ReactElement {
  return (
    <fieldset className="dss-step">
      <legend className="dss-step__h">
        <span className="dss-step__n" aria-hidden="true">
          {n}
        </span>
        <span className="dss-step__t">
          <b>{title}</b>
          {hint ? <small>{hint}</small> : null}
        </span>
      </legend>
      <div className="dss-step__b">{children}</div>
    </fieldset>
  );
}

const changedParts = (a: DocSettings, b: DocSettings): number => {
  const x = settingsBody(a);
  const y = settingsBody(b);
  return Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k])).length;
};

function Editor({ start, onSaved, onCancel }: { start: DocSettings; onSaved: (v: DocSettingsVersion) => void; onCancel: () => void }): ReactElement {
  const t = useTranslations("admin.docSettings");
  const [s, setS] = useState<DocSettings>(start);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const sending = useRef(false);
  const issues = docSettingsIssues(s);
  const shown = tried ? issues : {};
  const num = (v: string) => (v === "" ? 0 : Number(v.replace(/[^\d]/g, "")));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const uid = useId();
  const locale = useLocale();
  const [plans, setPlans] = useState<BackendPlan[] | null>(null);
  useEffect(() => {
    let alive = true;
    getSubscriptionPlans(locale).then(
      (list) => alive && setPlans(list),
      (e) => {
        logApiError("docSettings.plans", e);
        if (alive) setPlans([]);
      },
    );
    return () => {
      alive = false;
    };
  }, [locale]);
  const plan = planRuleOf(s.planRequirements);
  const review = reviewRuleOf(s.reviewPolicy);
  const dl = downloadRuleOf(s.downloadPolicy);
  const setPlan = (patch: Partial<typeof plan>) => setS((x) => ({ ...x, planRequirements: planRuleBody(x.planRequirements, { ...planRuleOf(x.planRequirements), ...patch }) }));
  const setReview = (patch: Partial<typeof review>) => setS((x) => ({ ...x, reviewPolicy: reviewRuleBody(x.reviewPolicy, { ...reviewRuleOf(x.reviewPolicy), ...patch }) }));
  const setDl = (patch: Partial<typeof dl>) => setS((x) => ({ ...x, downloadPolicy: downloadRuleBody(x.downloadPolicy, { ...downloadRuleOf(x.downloadPolicy), ...patch }) }));
  const setTier = (i: number, patch: Partial<DocSettings["pagePricing"][number]>) => setS((x) => ({ ...x, pagePricing: x.pagePricing.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const changes = changedParts(s, start);
  const problems = Object.keys(issues).length;

  async function save() {
    setTried(true);
    if (Object.keys(issues).length || busy || sending.current) return;
    sending.current = true;
    setBusy(true);
    setErr("");
    try {
      onSaved(await createDocSettingsDraft(s));
    } catch (e) {
      sending.current = false;
      logApiError("docSettings.draft", e);
      setErr(errDetail(e) || t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dss-sec dss-edit" aria-labelledby={`${uid}-edit`}>
      <header className="dss-sec__h">
        <span className="dss-sec__ico dss-sec__ico--edit" aria-hidden="true">
          <IconPlus />
        </span>
        <div>
          <h3 id={`${uid}-edit`}>{t("editTitle")}</h3>
          <p>{t("editLead")}</p>
        </div>
      </header>

      <div className="dss-steps">
        <Step n={1} title={t("files")} hint={t("filesHint")}>
          <div className="dss-toggles" role="group" aria-label={t("formats")}>
            {DOC_FORMATS.map((f) => (
              <button key={f} type="button" aria-pressed={s.allowedFormats.includes(f)} onClick={() => setS((x) => ({ ...x, allowedFormats: toggle(x.allowedFormats, f) }))}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          {shown.formats ? <small className="dss-bad">{t("issue.pickFormat")}</small> : null}
          <div className="dss-nums">
            <label data-bad={shown.maxFileMb ? "" : undefined}>
              <span>{t("maxFile")}</span>
              <span className="dss-unit">
                <input inputMode="numeric" value={s.maxFileMb || ""} onChange={(e) => setS((x) => ({ ...x, maxFileMb: num(e.target.value) }))} />
                <i>MB</i>
              </span>
              <small>{t("maxFileHint")}</small>
            </label>
            <label data-bad={shown.includedPages ? "" : undefined}>
              <span>{t("includedPages")}</span>
              <input inputMode="numeric" value={s.includedPages || ""} onChange={(e) => setS((x) => ({ ...x, includedPages: num(e.target.value) }))} />
              <small>{t("includedHint")}</small>
            </label>
          </div>
        </Step>

        <Step n={2} title={t("modes")} hint={t("modesHint")}>
          <div className="dss-toggles" role="group" aria-label={t("modes")}>
            {DOC_MODES.map((m) => (
              <button key={m} type="button" aria-pressed={s.modes.includes(m)} onClick={() => setS((x) => ({ ...x, modes: toggle(x.modes, m) }))}>
                {t(`mode.${m}`)}
              </button>
            ))}
          </div>
          {shown.modes ? <small className="dss-bad">{t("issue.pickMode")}</small> : null}
        </Step>

        <Step n={3} title={t("pricing")} hint={t("pricingHint")}>
          <div className="dss-nums">
            <label data-bad={shown.extraPagePrice ? "" : undefined}>
              <span>{t("extraPage")}</span>
              <span className="dss-unit">
                <input inputMode="numeric" value={String(s.extraPagePrice)} onChange={(e) => setS((x) => ({ ...x, extraPagePrice: num(e.target.value) }))} />
                <i>{t("som")}</i>
              </span>
            </label>
          </div>
          <div className="dss-tiered">
            <b className="dss-sub">{t("tiers")}</b>
            {s.pagePricing.length ? null : <p className="dss-muted">{t("noTiers")}</p>}
            {s.pagePricing.map((r, i) => (
              <div key={i} className="dss-tier" data-bad={shown[`tier${i}`] ? "" : undefined}>
                <span className="dss-tier__n" aria-hidden="true">
                  {i + 1}
                </span>
                <label>
                  <span>{t("tierMin")}</span>
                  <input inputMode="numeric" value={r.minPages || ""} onChange={(e) => setTier(i, { minPages: num(e.target.value) })} />
                </label>
                <label>
                  <span>{t("tierMax")}</span>
                  <input inputMode="numeric" placeholder={t("tierOpen")} value={r.maxPages ?? ""} onChange={(e) => setTier(i, { maxPages: e.target.value === "" ? null : num(e.target.value) })} />
                </label>
                <label>
                  <span>{t("tierAmount")}</span>
                  <input inputMode="numeric" value={String(r.amount)} onChange={(e) => setTier(i, { amount: num(e.target.value) })} />
                </label>
                <IconButton label={t("removeTier")} icon={<IconClose />} onClick={() => setS((x) => ({ ...x, pagePricing: x.pagePricing.filter((_, k) => k !== i) }))} />
                {shown[`tier${i}`] ? <small className="dss-bad">{t("issue.tier")}</small> : null}
              </div>
            ))}
            <button type="button" className="btn btn--line btn--sm dss-add" onClick={() => setS((x) => ({ ...x, pagePricing: [...x.pagePricing, { minPages: (x.pagePricing.at(-1)?.maxPages ?? 0) + 1, maxPages: null, amount: 0 }] }))}>
              <IconPlus aria-hidden="true" />
              {t("addTier")}
            </button>
          </div>
        </Step>

        <Step n={4} title={t("plan.title")} hint={t("plan.hint")}>
          <div className="dss-sw">
            <Switch id={`${uid}-plan`} checked={plan.required} onChange={(v) => setPlan({ required: v })} aria-labelledby={`${uid}-plan-t`} aiId="admin.docSettings.plan-required" />
            <span id={`${uid}-plan-t`}>{t("plan.required")}</span>
          </div>
          {plan.required ? (
            <>
              <PlanPick plans={plans} ids={plan.planIds} entitlement={plan.entitlement} onIds={(v) => setPlan({ planIds: v })} onEntitlement={(v) => setPlan({ entitlement: v })} label={t("plan.plans")} />
              {shown.plan ? <small className="dss-bad">{t("issue.pickPlan")}</small> : null}
            </>
          ) : (
            <small className="dss-muted">{t("plan.freeHint")}</small>
          )}
          <div className="dss-permode">
            <b className="dss-sub">{t("plan.perMode")}</b>
            <small className="dss-muted">{t("plan.perModeHint")}</small>
            {s.modes.map((m) => {
              const own = plan.perMode[m];
              const setOwn = (next: (typeof plan.perMode)[string] | null) =>
                setPlan({ perMode: next ? { ...plan.perMode, [m]: next } : Object.fromEntries(Object.entries(plan.perMode).filter(([k]) => k !== m)) });
              return (
                <div key={m} className="dss-mode" data-on={own ? "" : undefined}>
                  <div className="dss-sw">
                    <Switch id={`${uid}-pm-${m}`} checked={!!own} onChange={(v) => setOwn(v ? { required: true, planIds: [], entitlement: "" } : null)} aria-labelledby={`${uid}-pm-${m}-t`} aiId={`admin.docSettings.plan-mode.${m}`} />
                    <span id={`${uid}-pm-${m}-t`}>
                      <b>{t(`mode.${m}`)}</b>
                      <small>{own ? (own.required ? t("plan.modeOwn") : t("plan.modeFree")) : t("plan.modeInherits")}</small>
                    </span>
                  </div>
                  {own ? (
                    <div className="dss-mode__b">
                      <div className="dss-sw">
                        <Switch id={`${uid}-pmr-${m}`} checked={own.required} onChange={(v) => setOwn({ ...own, required: v })} aria-labelledby={`${uid}-pmr-${m}-t`} />
                        <span id={`${uid}-pmr-${m}-t`}>{t("plan.required")}</span>
                      </div>
                      {own.required ? <PlanPick plans={plans} ids={own.planIds} entitlement={own.entitlement} onIds={(v) => setOwn({ ...own, planIds: v })} onEntitlement={(v) => setOwn({ ...own, entitlement: v })} label={t("plan.plans")} /> : null}
                      {shown[`plan_${m}`] ? <small className="dss-bad">{t("issue.pickPlan")}</small> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Step>

        <Step n={5} title={t("review.title")} hint={t("review.hint")}>
          <div className="dss-sw">
            <Switch id={`${uid}-rev`} checked={review.enabled} onChange={(v) => setReview({ enabled: v, reviewerType: review.reviewerType || "any", slaMinutes: review.slaMinutes ?? 1440 })} aria-labelledby={`${uid}-rev-t`} aiId="admin.docSettings.review" />
            <span id={`${uid}-rev-t`}>{t("review.enabled")}</span>
          </div>
          {review.enabled ? (
            <>
              <div className="dss-toggles" role="group" aria-label={t("review.who")}>
                {REVIEWER_TYPES.map((r) => (
                  <button key={r} type="button" aria-pressed={(review.reviewerType || "any") === r} onClick={() => setReview({ reviewerType: r })}>
                    {t(`review.by.${r}`)}
                  </button>
                ))}
              </div>
              <label className="dss-line" data-bad={shown.sla ? "" : undefined}>
                <span>{t("review.sla")}</span>
                <input inputMode="numeric" value={review.slaMinutes ?? ""} onChange={(e) => setReview({ slaMinutes: num(e.target.value) || null })} />
                <small>{review.slaMinutes ? t("review.slaHuman", { h: Math.round((review.slaMinutes / 60) * 10) / 10 }) : t("review.slaHint")}</small>
              </label>
            </>
          ) : null}
        </Step>

        <Step n={6} title={t("download.title")} hint={t("download.hint")}>
          <div className="dss-sw">
            <Switch id={`${uid}-dlp`} checked={dl.planRequired} onChange={(v) => setDl({ planRequired: v })} aria-labelledby={`${uid}-dlp-t`} aiId="admin.docSettings.download-plan" />
            <span id={`${uid}-dlp-t`}>{t("download.planRequired")}</span>
          </div>
          {dl.planRequired ? <PlanPick plans={plans} ids={dl.planIds} entitlement={dl.entitlement} onIds={(v) => setDl({ planIds: v })} onEntitlement={(v) => setDl({ entitlement: v })} label={t("download.plans")} /> : null}
          <div className="dss-sw">
            <Switch id={`${uid}-wm`} checked={dl.watermark} onChange={(v) => setDl({ watermark: v })} aria-labelledby={`${uid}-wm-t`} aiId="admin.docSettings.watermark" />
            <span id={`${uid}-wm-t`}>{t("download.watermark")}</span>
          </div>
          <div className="dss-toggles" role="group" aria-label={t("download.formats")}>
            {DOC_FORMATS.map((f) => (
              <button key={f} type="button" aria-pressed={dl.formats.includes(f)} onClick={() => setDl({ formats: toggle(dl.formats, f) })}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <small className="dss-muted">{t("download.formatsHint")}</small>
        </Step>
      </div>

      {err ? <Notice ok={false} msg={err} /> : null}
      <div className="dss-bar">
        <span className="dss-bar__info" data-bad={tried && problems ? "" : undefined} role="status">
          {tried && problems ? t("problems", { n: problems }) : changes ? t("changes", { n: changes }) : t("noChanges")}
        </span>
        <button type="button" className="btn btn--line btn--sm" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </button>
        <button type="button" className="btn btn--pri btn--sm" onClick={() => void save()} disabled={busy}>
          {busy ? t("saving") : t("saveDraft")}
        </button>
      </div>
    </section>
  );
}

export default function DocumentSettingsPage(): ReactElement {
  const t = useTranslations("admin.docSettings");
  const locale = useLocale();
  const [data, setData] = useState<Loaded | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [failure, setFailure] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [acting, setActing] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [runtime, admin] = await Promise.all([getDocSettingsRuntime(signal), getDocSettingsAdmin(signal)]);
      setData({ runtime, admin });
      setState("ready");
    } catch (e) {
      if (isAborted(e)) return;
      if (isForbidden(e)) return setState("forbidden");
      logApiError("docSettings.load", e);
      setFailure(e);
      setState((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    return () => ctl.abort();
  }, [load]);

  async function act() {
    if (!confirm || acting) return;
    setActing(true);
    try {
      if (confirm.kind === "publish") await publishDocSettings(confirm.v.id);
      else await rollbackDocSettings(confirm.v.id);
      setNote({ ok: true, msg: t(confirm.kind === "publish" ? "published" : "rolledBack", { n: confirm.v.version ?? "" }) });
      setConfirm(null);
      await load();
    } catch (e) {
      logApiError(`docSettings.${confirm.kind}`, e);
      setNote({ ok: false, msg: errDetail(e) || t("actionFailed") });
      setConfirm(null);
    } finally {
      setActing(false);
    }
  }

  const activeId = data?.admin.active?.id ?? data?.runtime.settingsId ?? "";
  const versions = data ? [...data.admin.versions].sort((a, b) => (b.version ?? 0) - (a.version ?? 0)) : [];
  const status = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);
  const active = data?.admin.active ?? null;
  const drafts = versions.filter((v) => v.status === "draft").length;

  return (
    <section className="ppanel dss" data-ai-target="admin:document-settings">
      <header className="dss-hero">
        <span className="dss-hero__ico" aria-hidden="true">
          <IconFileText />
        </span>
        <div className="dss-hero__txt">
          <h2>{t("title")}</h2>
          <p>{t("lead")}</p>
        </div>
        <div className="dss-hero__acts">
          <IconButton
            label={t("refresh")}
            icon={<IconRefresh />}
            busy={refreshing}
            tipAlign="end"
            onClick={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
          {state === "ready" && !editing ? (
            <button type="button" className="btn btn--pri btn--sm" onClick={() => setEditing(true)}>
              <IconPlus aria-hidden="true" />
              {t("newVersion")}
            </button>
          ) : null}
        </div>
        {data ? (
          <dl className="dss-meta">
            <div>
              <dt>{t("meta.inEffect")}</dt>
              <dd>
                <span className="dss-ver" data-defaults={active ? undefined : ""}>
                  {active ? t("activeN", { n: active.version ?? data.runtime.version ?? "" }) : t("defaults")}
                </span>
              </dd>
            </div>
            <div>
              <dt>{t("meta.published")}</dt>
              <dd>{active?.publishedAt ? shortDateTime(active.publishedAt, locale) : t("meta.never")}</dd>
            </div>
            <div>
              <dt>{t("meta.versions")}</dt>
              <dd className="sx-num">{versions.length}</dd>
            </div>
            <div>
              <dt>{t("meta.drafts")}</dt>
              <dd className="sx-num">{drafts}</dd>
            </div>
          </dl>
        ) : null}
      </header>
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}

      {state === "loading" ? (
        <div className="dss-loading">
          <Skeleton rows={2} />
          <Skeleton rows={4} />
        </div>
      ) : state === "forbidden" ? (
        <EmptyState icon={<IconLock />} title={t("noAccess")} />
      ) : state === "error" || !data ? (
        <ErrorState error={failure} onRetry={() => void load()} title={t("loadFailed")} compact />
      ) : (
        <>
          <section className="dss-sec" aria-labelledby="dss-now">
            <header className="dss-sec__h">
              <span className="dss-sec__ico" aria-hidden="true">
                <IconShieldCheck />
              </span>
              <div>
                <h3 id="dss-now">{t("now")}</h3>
                <p>{active ? t("nowLead") : t("defaultsHint")}</p>
              </div>
            </header>
            <Summary s={data.runtime.settings} />
            {data.runtime.settings && data.runtime.version !== null ? (
              <p className="dss-callout">
                <IconShieldCheck aria-hidden="true" />
                <span>{t("snapshotNote")}</span>
              </p>
            ) : null}
          </section>

          {editing ? (
            <Editor
              start={data.admin.active?.settings ?? data.runtime.settings}
              onCancel={() => setEditing(false)}
              onSaved={(v) => {
                setEditing(false);
                setNote({ ok: true, msg: t("draftSaved", { n: v.version ?? "" }) });
                void load();
              }}
            />
          ) : null}

          <section className="dss-sec" aria-labelledby="dss-hist">
            <header className="dss-sec__h">
              <span className="dss-sec__ico" aria-hidden="true">
                <IconHistory />
              </span>
              <div>
                <h3 id="dss-hist">{t("history")}</h3>
                <p>{t("historyLead")}</p>
              </div>
            </header>
            {versions.length ? (
              <ol className="dss-tl">
                {versions.map((v) => {
                  const isActive = v.id === activeId;
                  return (
                    <li key={v.id} className="dss-v" data-status={v.status} data-active={isActive || undefined}>
                      <span className="dss-v__dot" aria-hidden="true" />
                      <div className="dss-v__card">
                        <div className="dss-v__h">
                          <b>{t("versionN", { n: v.version ?? "?" })}</b>
                          <span className="dss-chip" data-status={isActive ? "active" : v.status}>
                            {isActive ? t("status.active") : status(v.status)}
                          </span>
                          <small>
                            {[v.publishedAt ? t("publishedAt", { date: shortDateTime(v.publishedAt, locale) }) : v.createdAt ? t("createdAt", { date: shortDateTime(v.createdAt, locale) }) : "", v.createdBy].filter(Boolean).join(" · ")}
                          </small>
                        </div>
                        <details>
                          <summary>{t("show")}</summary>
                          <Summary s={v.settings} compact />
                        </details>
                        {!isActive ? (
                          <div className="dss-acts">
                            {v.status === "draft" ? (
                              <button type="button" className="btn btn--pri btn--sm" onClick={() => setConfirm({ kind: "publish", v })}>
                                {t("publish")}
                              </button>
                            ) : v.status === "published" || v.status === "superseded" || v.status === "archived" ? (
                              <button type="button" className="btn btn--line btn--sm" onClick={() => setConfirm({ kind: "rollback", v })}>
                                {t("rollback")}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState size="sm" icon={<IconHistory />} title={t("noVersions")} text={t("noVersionsText")} />
            )}
          </section>
        </>
      )}

      <Modal
        open={!!confirm}
        onClose={() => (acting ? undefined : setConfirm(null))}
        title={confirm ? t(confirm.kind === "publish" ? "confirmPublish" : "confirmRollback", { n: confirm.v.version ?? "" }) : ""}
        busy={acting}
        footer={
          <>
            <button type="button" className="btn btn--line" onClick={() => setConfirm(null)} disabled={acting}>
              {t("cancel")}
            </button>
            <button type="button" className="btn btn--pri" onClick={() => void act()} disabled={acting}>
              {acting ? t("working") : confirm?.kind === "rollback" ? t("rollback") : t("publish")}
            </button>
          </>
        }
      >
        <p className="dss-confirm">{confirm?.kind === "rollback" ? t("rollbackText") : t("publishText")}</p>
      </Modal>
    </section>
  );
}
