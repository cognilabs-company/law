"use client";

import "./tariffs.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";
import { Link } from "@/i18n/navigation";
import PlanChangePreview from "./PlanChangePreview";
import { shortDateTime } from "@/lib/date";
import { errDetail, isAborted, logApiError, type Dict } from "@/lib/http";
import {
  archivePlanVersion,
  conflictCode,
  createPlanDraft,
  entitlementIssues,
  entitlementsBody,
  entitlementsOf,
  listPlanVersions,
  listSubscriptionFeatures,
  publishPlanVersion,
  updatePlanDraft,
  validatePlanVersion,
  type Entitlement,
  type FeatureRegistry,
  type PlanVersion,
  type PlanVersions as Versions,
} from "@/lib/services/tariffs";

// A tariff's versions (contract §5): published ones are read-only, a change
// is a new draft, the backend validates it, and Publish stays off until the
// last check passed. The current published version cannot be archived.

const PRICE_KEYS = ["monthly", "six_month", "yearly", "prepaid_yearly"] as const;
const SALES = ["active", "hidden", "archived"] as const;

type Busy = "" | "load" | "draft" | "save" | "validate" | "publish" | "archive";

function useVersionLabels() {
  const t = useTranslations("admin.tariffs");
  return {
    status: (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s || "—"),
    mode: (m: string) => (t.has(`mode.${m}`) ? t(`mode.${m}`) : m),
    reset: (r: string) => (t.has(`reset.${r}`) ? t(`reset.${r}`) : r),
  };
}

function DraftEditor({ version, registry, onSaved, onCancel }: { version: PlanVersion; registry: FeatureRegistry | null; onSaved: (v: PlanVersion) => void; onCancel: () => void }): ReactElement {
  const t = useTranslations("admin.tariffs");
  const ts = useTranslations("studio");
  const featureName = (key: string, title: string) => (ts.has(`sx.feature.${key}`) ? ts(`sx.feature.${key}`) : title || key);
  const lab = useVersionLabels();
  const base = version.payload;
  const prices0 = (base.prices && typeof base.prices === "object" ? base.prices : {}) as Dict;
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(PRICE_KEYS.map((k) => [k, prices0[k] === null || prices0[k] === undefined ? "" : String(prices0[k])])));
  const [sales, setSales] = useState(typeof base.sales_status === "string" ? base.sales_status : "");
  const [rows, setRows] = useState<Entitlement[]>(() => entitlementsOf(base));
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [err, setErr] = useState("");
  const issues = entitlementIssues(rows, registry);
  const blocked = Object.keys(issues).length > 0;
  const setRow = (i: number, patch: Partial<Entitlement>) => setRows((list) => list.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const resetsFor = (key: string) => {
    const f = registry?.items.find((x) => x.key === key);
    return f && f.resetPeriods.length ? f.resetPeriods : (registry?.resetPeriods ?? []);
  };

  async function save() {
    if (busy || sending.current || blocked) return;
    sending.current = true;
    setBusy(true);
    setErr("");
    const priceBody: Dict = { ...prices0 };
    for (const k of PRICE_KEYS) priceBody[k] = prices[k].trim() === "" ? null : Number(prices[k]);
    const payload: Dict = { ...base, prices: priceBody, entitlements: entitlementsBody(rows) };
    if (sales) payload.sales_status = sales;
    try {
      onSaved(await updatePlanDraft(version.id, payload));
    } catch (e) {
      sending.current = false;
      logApiError("tariffs.saveDraft", e);
      setErr(conflictCode(e) === "immutable_plan_version" ? t("immutable") : errDetail(e) || t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="trf-edit" aria-label={t("editTitle", { n: version.version ?? "" })}>
      <b className="trf-edit__h">{t("editTitle", { n: version.version ?? "" })}</b>
      <fieldset className="trf-prices">
        <legend>{t("prices")}</legend>
        {PRICE_KEYS.map((k) => (
          <label key={k}>
            <span>{t(`price.${k}`)}</span>
            <input inputMode="numeric" value={prices[k]} onChange={(e) => setPrices((p) => ({ ...p, [k]: e.target.value.replace(/[^\d]/g, "") }))} />
          </label>
        ))}
      </fieldset>
      <label className="trf-field">
        <span>{t("sales")}</span>
        <select value={sales} onChange={(e) => setSales(e.target.value)}>
          <option value="">—</option>
          {SALES.map((s) => (
            <option key={s} value={s}>
              {t(`salesStatus.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="trf-ent">
        <legend>{t("entitlements")}</legend>
        {rows.length ? null : <p className="trf-muted">{t("noEntitlements")}</p>}
        {rows.map((r, i) => (
          <div key={i} className="trf-ent__row" data-bad={issues[i] ? "" : undefined}>
            <label>
              <span className="sr-only">{t("feature")}</span>
              <select aria-label={t("feature")} value={r.featureKey} onChange={(e) => setRow(i, { featureKey: e.target.value, resetPeriod: "" })}>
                <option value="">{t("pickFeature")}</option>
                {(registry?.items ?? []).map((f) => (
                  <option key={f.key} value={f.key}>
                    {featureName(f.key, f.title)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t("modeLabel")}</span>
              <select aria-label={t("modeLabel")} value={r.mode} onChange={(e) => setRow(i, { mode: e.target.value, limit: e.target.value === "limited" ? r.limit : null })}>
                {(registry?.modes.length ? registry.modes : ["unavailable", "limited", "unlimited"]).map((m) => (
                  <option key={m} value={m}>
                    {lab.mode(m)}
                  </option>
                ))}
              </select>
            </label>
            {r.mode === "limited" ? (
              <>
                <label>
                  <span className="sr-only">{t("limit")}</span>
                  <input aria-label={t("limit")} inputMode="numeric" placeholder={t("limit")} value={r.limit ?? ""} onChange={(e) => setRow(i, { limit: e.target.value === "" ? null : Number(e.target.value.replace(/[^\d]/g, "")) })} />
                </label>
                <label>
                  <span className="sr-only">{t("resetLabel")}</span>
                  <select aria-label={t("resetLabel")} value={r.resetPeriod} onChange={(e) => setRow(i, { resetPeriod: e.target.value })}>
                    <option value="">{t("pickReset")}</option>
                    {resetsFor(r.featureKey).map((p) => (
                      <option key={p} value={p}>
                        {lab.reset(p)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRows((list) => list.filter((_, k) => k !== i))} aria-label={t("removeRow")}>
              ×
            </button>
            {issues[i] ? <small className="trf-bad">{t(`issue.${issues[i]}`)}</small> : null}
          </div>
        ))}
        <button type="button" className="btn btn--line btn--sm" onClick={() => setRows((list) => [...list, { featureKey: "", mode: "limited", limit: null, resetPeriod: "" }])}>
          {t("addRow")}
        </button>
      </fieldset>
      {err ? <Notice ok={false} msg={err} /> : null}
      <div className="trf-acts">
        <button type="button" className="btn btn--soft btn--sm" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </button>
        <button type="button" className="btn btn--pri btn--sm" onClick={() => void save()} disabled={busy || blocked}>
          {busy ? t("saving") : t("saveDraft")}
        </button>
      </div>
    </section>
  );
}

export default function PlanVersions({ planId }: { planId: string }): ReactElement {
  const t = useTranslations("admin.tariffs");
  const locale = useLocale();
  const lab = useVersionLabels();
  const [data, setData] = useState<Versions | null>(null);
  const [failed, setFailed] = useState(false);
  const [registry, setRegistry] = useState<FeatureRegistry | null>(null);
  const [busy, setBusy] = useState<{ id: string; what: Busy }>({ id: "", what: "" });
  const inFlight = useRef(false);
  const [editing, setEditing] = useState("");
  const [previewing, setPreviewing] = useState("");
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [checks, setChecks] = useState<Record<string, PlanVersion["validation"]>>({});

  const load = useCallback(async () => {
    try {
      const v = await listPlanVersions(planId);
      setData(v);
      setFailed(false);
    } catch (e) {
      if (isAborted(e)) return;
      logApiError("tariffs.versions", e);
      setFailed(true);
    }
  }, [planId]);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) void load();
    });
    listSubscriptionFeatures().then(
      (r) => alive && setRegistry(r),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [load]);

  async function act(id: string, what: Busy, run: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy({ id, what });
    setNote(null);
    try {
      await run();
    } catch (e) {
      logApiError(`tariffs.${what}`, e);
      const code = conflictCode(e);
      setNote({ ok: false, msg: code === "published_version_cannot_be_archived" ? t("cantArchiveCurrent") : code === "immutable_plan_version" ? t("immutable") : errDetail(e) || t("actionFailed") });
    } finally {
      inFlight.current = false;
      setBusy({ id: "", what: "" });
    }
  }

  if (failed) return <Notice ok={false} msg={t("loadFailed")} />;
  if (!data) return <Skeleton rows={3} />;
  const current = data.items.find((v) => v.id === data.currentVersionId) ?? null;
  const hasDraft = data.items.some((v) => v.status === "draft");

  return (
    <div className="trf" data-ai-target="tariffs:versions">
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {!data.items.length ? (
        <div className="trf-empty">
          <p>{t("noVersions")}</p>
          <Link className="btn btn--line btn--sm" href="/admin/studio/c/K17">
            {t("openStudio")}
          </Link>
        </div>
      ) : (
        <ol className="trf-list">
          {data.items.map((v) => {
            const isCurrent = v.id === data.currentVersionId;
            const check = checks[v.id] ?? v.validation;
            const draft = v.status === "draft";
            const working = busy.id === v.id ? busy.what : "";
            return (
              <li key={v.id} className="trf-v" data-status={v.status}>
                <div className="trf-v__h">
                  <b>{t("versionN", { n: v.version ?? "?" })}</b>
                  <span className="trf-chip" data-status={v.status}>
                    {lab.status(v.status)}
                  </span>
                  {isCurrent ? <span className="trf-chip" data-status="current">{t("current")}</span> : null}
                  <small>{v.publishedAt ? t("publishedAt", { date: shortDateTime(v.publishedAt, locale) }) : v.createdAt ? t("createdAt", { date: shortDateTime(v.createdAt, locale) }) : ""}</small>
                </div>
                {draft ? (
                  <>
                    {check.ok === true ? <p className="trf-ok">{t("checkOk")}</p> : null}
                    {check.ok === false ? (
                      <ul className="trf-errs" role="alert">
                        {(check.errors.length ? check.errors : [{ field: "", code: "", message: t("checkFailed") }]).map((e, k) => (
                          <li key={k}>
                            {e.field ? <code>{e.field}</code> : null} {e.message || e.code}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="trf-acts">
                      <button type="button" className="btn btn--line btn--sm" onClick={() => setPreviewing(previewing === v.id ? "" : v.id)} aria-expanded={previewing === v.id}>
                        {previewing === v.id ? t("preview.hide") : t("preview.show")}
                      </button>
                      <button type="button" className="btn btn--line btn--sm" onClick={() => setEditing(editing === v.id ? "" : v.id)} disabled={!!working}>
                        {t("edit")}
                      </button>
                      <button
                        type="button"
                        className="btn btn--line btn--sm"
                        disabled={!!working}
                        onClick={() =>
                          void act(v.id, "validate", async () => {
                            const r = await validatePlanVersion(v.id);
                            setChecks((c) => ({ ...c, [v.id]: r }));
                          })
                        }
                      >
                        {working === "validate" ? t("checking") : t("validate")}
                      </button>
                      <button
                        type="button"
                        className="btn btn--pri btn--sm"
                        // Publish only after the backend's own check passed.
                        disabled={!!working || check.ok !== true}
                        title={check.ok !== true ? t("publishNeedsCheck") : undefined}
                        onClick={() =>
                          void act(v.id, "publish", async () => {
                            await publishPlanVersion(v.id);
                            setNote({ ok: true, msg: t("published") });
                            await load();
                          })
                        }
                      >
                        {working === "publish" ? t("publishing") : t("publish")}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={!!working}
                        onClick={() =>
                          void act(v.id, "archive", async () => {
                            await archivePlanVersion(v.id);
                            await load();
                          })
                        }
                      >
                        {t("archive")}
                      </button>
                    </div>
                    {previewing === v.id && editing !== v.id ? <PlanChangePreview versionId={v.id} /> : null}
                    {editing === v.id ? (
                      <DraftEditor
                        version={v}
                        registry={registry}
                        onCancel={() => setEditing("")}
                        onSaved={(saved) => {
                          setEditing("");
                          setChecks((c) => ({ ...c, [v.id]: saved.validation }));
                          void load();
                        }}
                      />
                    ) : null}
                  </>
                ) : (
                  <div className="trf-acts trf-acts--ro">
                    <p className="trf-muted">{isCurrent ? t("readOnlyCurrent") : t("readOnly")}</p>
                    {!isCurrent && v.status !== "archived" ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={!!working}
                        onClick={() =>
                          void act(v.id, "archive", async () => {
                            await archivePlanVersion(v.id);
                            await load();
                          })
                        }
                      >
                        {t("archive")}
                      </button>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {current && !hasDraft ? (
        <button
          type="button"
          className="btn btn--pri btn--sm"
          disabled={!!busy.what}
          onClick={() =>
            void act("", "draft", async () => {
              const d = await createPlanDraft(planId, current.payload);
              setChecks((c) => ({ ...c, [d.id]: d.validation }));
              await load();
              setEditing(d.id);
            })
          }
        >
          {busy.what === "draft" ? t("creating") : t("newDraft")}
        </button>
      ) : null}
    </div>
  );
}
