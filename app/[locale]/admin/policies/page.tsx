"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  getAdminPolicies,
  putAdminPolicy,
  getPolicyHistory,
  getComplianceReadiness,
  POLICY_SECTIONS,
  type PolicySection,
  type PolicyHistoryEntry,
  getUnverifiedSellersMode,
  setUnverifiedSellersMode,
  type UnverifiedSellersMode,
} from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { ApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { useReload } from "@/components/admin/AdminBits";
import FieldError from "@/components/ui/FieldError";
import Modal from "@/components/admin/Modal";
import PersonName from "@/components/ui/PersonName";
import BusinessCalendarCard from "@/components/admin/BusinessCalendarCard";
import MarketplacePricingCard from "@/components/admin/policies/MarketplacePricingCard";
import { IconShieldCheck, IconCheck, IconAlert, IconClock, IconEdit } from "@/components/icons";
import { dateTimeFull } from "@/lib/date";
import { humanize } from "@/lib/labels";
import "./policies.css";

type Val = unknown;
const isPlain = (v: Val) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStrList = (v: Val) => Array.isArray(v) && v.every((x) => typeof x === "string");
const transient = (e: unknown) => !(e instanceof ApiError) || e.status === 0 || (e.status >= 500 && e.status !== 501);

function fmt(s: string, locale: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateTimeFull(s, locale);
}

// Platform policies (order / payment / document analysis / workspace /
// security / notifications) from the backend policy store: every section is
// editable in place, versioned, with a history view. Plus the production
// readiness checklist (GET /admin/compliance/readiness).
export default function AdminPolicies() {
  const t = useTranslations("admin.policies");
  const tn = useTranslations("common.notify");
  const [key, setKey] = useState(0);
  const [readyKey, reloadReady] = useReload();
  const res = useResourceOne(getAdminPolicies, [key]);
  const ready = useResourceOne(getComplianceReadiness, [key, readyKey]);
  const [edit, setEdit] = useState<PolicySection | null>(null);
  const [history, setHistory] = useState<PolicySection | null>(null);
  // T0-10 §5: unverified sellers in the catalogue — badge or hidden.
  const [unvMode, setUnvMode] = useState<UnverifiedSellersMode | null>(null);
  const [unvBusy, setUnvBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    getUnverifiedSellersMode().then((m) => { if (alive) setUnvMode(m); });
    return () => { alive = false; };
  }, [key]);
  async function saveUnv(mode: UnverifiedSellersMode) {
    if (unvBusy || mode === unvMode) return;
    setUnvBusy(true);
    try {
      await setUnverifiedSellersMode(mode);
      setUnvMode(mode);
      notify.success(t("unverified.saved"), { id: "policy-unverified", body: t(`unverified.${mode}`) });
    } catch (e) {
      notify.error(t("unverified.saveFailed"), {
        id: "policy-unverified",
        error: e,
        action: transient(e) ? { label: tn("retry"), onClick: () => void saveUnv(mode) } : undefined,
      });
    } finally {
      setUnvBusy(false);
    }
  }
  const forbidden = res.status === "error";

  return (
    <>
      <div className="ppanel" data-ai-target="policies:readiness">
        <div className="ppanel__h">
          <b>{t("readyTitle")}</b>
          {ready.data?.status ? <em className={`atag${ready.data.status === "production_ready" ? " atag--ok" : ""}`}>{t.has(`readyStatus.${ready.data.status}`) ? t(`readyStatus.${ready.data.status}`) : humanize(ready.data.status)}</em> : null}
        </div>
        <p className="ppanel__note">{t("readyLead")}</p>
        {ready.status === "loading" ? <Skeleton rows={3} /> : ready.status === "error" || !ready.data ? (
          <ErrorState compact title={t("loadError")} onRetry={reloadReady} />
        ) : !ready.data.items.length ? (
          <ReadableData data={ready.data.raw} />
        ) : (
          <div className="alist">
            {ready.data.items.map((it) => {
              const ok = ["ok", "ready", "done", "pass", "passed", "true", "configured", "production_ready"].includes(it.status);
              const warn = ["needs_review", "warning", "partial", "pending"].includes(it.status);
              return (
                <div className="aitem" key={it.key}>
                  <span className={`aitem__n`} style={{ color: ok ? "var(--ok)" : warn ? "var(--dk-txt-warn, #b45309)" : "#e5484d" }}>{ok ? <IconCheck /> : warn ? <IconClock /> : <IconAlert />}</span>
                  <div className="aitem__m">
                    <b>{it.title || humanize(it.key)}</b>
                    {it.note ? <span className="aitem__meta">{it.note}</span> : null}
                  </div>
                  <div className="aitem__r"><em className={`atag${ok ? " atag--ok" : " atag--muted"}`}>{t.has(`readyStatus.${it.status}`) ? t(`readyStatus.${it.status}`) : it.status ? humanize(it.status) : "—"}</em></div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ppanel" data-ai-target="policies:sections">
        <div className="ppanel__h"><b>{t("title")}</b><span className="advmuted">{t("versioned")}</span></div>
        <p className="ppanel__note">{t("lead")}</p>
        {res.status === "loading" ? <Skeleton rows={4} /> : forbidden || !res.data ? (
          <EmptyState icon={<IconShieldCheck />} title={t("forbidden")} text={t("forbiddenText")} />
        ) : (
          <div className="polgrid">
            {POLICY_SECTIONS.map((sec) => {
              const data = res.data?.[sec] ?? {};
              const entries = Object.entries(data);
              return (
                <div className="polcard" key={sec}>
                  <div className="polcard__h">
                    <b>{t(`sections.${sec}`)}</b>
                    <span>
                      <button type="button" className="btn btn--line btn--sm" onClick={() => setHistory(sec)}><IconClock />{t("history")}</button>
                      <button type="button" className="btn btn--soft btn--sm" onClick={() => setEdit(sec)}><IconEdit />{t("edit")}</button>
                    </span>
                  </div>
                  {!entries.length ? <p className="advmuted">{t("emptySection")}</p> : (
                    <dl className="polcard__kv">
                      {entries.map(([k, v]) => (
                        <div key={k}>
                          <dt>{t.has(`keys.${k}`) ? t(`keys.${k}`) : humanize(k)}</dt>
                          <dd>{isPlain(v) ? t("objectValue", { n: Object.keys(v as object).length }) : Array.isArray(v) ? (isStrList(v) ? (v as string[]).join(", ") : t("listValue", { n: v.length })) : typeof v === "boolean" ? t(v ? "boolYes" : "boolNo") : String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MarketplacePricingCard />

      <div className="ppanel">
        <div className="ppanel__h" data-ai-target="policies:unverified"><b className="ppanel__t"><span className="pico"><IconShieldCheck /></span>{t("unverified.title")}</b></div>
        <p className="ppanel__note">{t("unverified.lead")}</p>
        {unvMode === null ? <Skeleton rows={2} /> : (
          <div className="unvmode" role="radiogroup" aria-label={t("unverified.title")}>
            {(["badge", "hidden"] as UnverifiedSellersMode[]).map((m) => (
              <label key={m} className={`unvmode__opt${unvMode === m ? " on" : ""}`}>
                <input type="radio" name="unvmode" value={m} checked={unvMode === m} disabled={unvBusy} onChange={() => void saveUnv(m)} />
                <span className="unvmode__dot" />
                <span className="unvmode__m"><b>{t(`unverified.${m}`)}</b><small>{t(`unverified.${m}Text`)}</small></span>
              </label>
            ))}
          </div>
        )}
      </div>

      <BusinessCalendarCard />

      <EditModal section={edit} data={edit ? res.data?.[edit] ?? {} : {}} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setKey((k) => k + 1); }} />
      <HistoryModal section={history} onClose={() => setHistory(null)} />
    </>
  );
}

// Every top-level key gets a control by type: number, boolean, string, string
// list (comma-separated) or JSON (nested objects / object lists).
function EditModal({ section, data, onClose, onSaved }: { section: PolicySection | null; data: Record<string, unknown>; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("admin.policies");
  const uid = useId();
  const [form, setForm] = useState<{ sec: string; values: Record<string, string> }>({ sec: "", values: {} });
  const [badJson, setBadJson] = useState<string[]>([]);
  const toText = (v: unknown) => (isPlain(v) || (Array.isArray(v) && !isStrList(v)) ? JSON.stringify(v, null, 2) : isStrList(v) ? (v as string[]).join(", ") : String(v ?? ""));
  if (section && form.sec !== section) {
    setForm({ sec: section, values: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toText(v)])) });
    setBadJson([]);
  }
  const [busy, setBusy] = useState(false);
  const fid = (k: string) => `${uid}-${k.replace(/[^\w-]/g, "_")}`;

  async function save() {
    if (!section || busy) return;
    const out: Record<string, unknown> = {};
    const broken: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      const raw = form.values[k] ?? "";
      if (typeof v === "number") out[k] = Number(raw.replace(/\s/g, "")) || 0;
      else if (typeof v === "boolean") out[k] = raw === "true";
      else if (isStrList(v)) out[k] = raw.split(",").map((x) => x.trim()).filter(Boolean);
      else if (isPlain(v) || Array.isArray(v)) {
        try {
          out[k] = JSON.parse(raw);
        } catch {
          broken.push(k);
        }
      } else out[k] = raw;
    }
    setBadJson(broken);
    if (broken.length) {
      document.getElementById(fid(broken[0]))?.focus();
      return;
    }
    setBusy(true);
    try {
      await putAdminPolicy(section, out);
      notify.success(t("saved"), { id: "policy-save", body: t(`sections.${section}`) });
      onSaved();
    } catch (e) {
      notify.error(t("saveFailed"), { id: "policy-save", error: e });
    } finally {
      setBusy(false);
    }
  }
  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, values: { ...f.values, [k]: v } }));
    setBadJson((b) => (b.includes(k) ? b.filter((x) => x !== k) : b));
  };

  return (
    <Modal open={!!section} onClose={onClose} title={section ? t("editTitle", { section: t(`sections.${section}`) }) : ""}>
      <div className="cform" style={{ maxWidth: "none" }}>
        <p className="advmuted">{t("editLead")}</p>
        {Object.entries(data).map(([k, v]) => {
          const label = t.has(`keys.${k}`) ? t(`keys.${k}`) : humanize(k);
          const val = form.values[k] ?? "";
          if (typeof v === "boolean") return (
            <label className={`vac${val === "true" ? " on" : ""}`} key={k} style={{ justifySelf: "start" }}>
              <input type="checkbox" checked={val === "true"} onChange={(e) => set(k, e.target.checked ? "true" : "false")} />{label}
            </label>
          );
          if (typeof v === "number") return <div key={k}><label>{label}</label><input inputMode="decimal" value={val} onChange={(e) => set(k, e.target.value)} /></div>;
          if (isPlain(v) || (Array.isArray(v) && !isStrList(v))) {
            const bad = badJson.includes(k);
            return (
              <div key={k}>
                <label htmlFor={fid(k)}>{label} <span className="rf__opt">JSON</span></label>
                <textarea id={fid(k)} rows={Math.min(14, val.split("\n").length + 1)} value={val} onChange={(e) => set(k, e.target.value)} style={{ fontFamily: "monospace", fontSize: ".8rem" }} aria-invalid={bad || undefined} aria-describedby={bad ? `${fid(k)}-err` : undefined} />
                <FieldError id={`${fid(k)}-err`} msg={bad ? t("badJson") : null} />
              </div>
            );
          }
          if (isStrList(v)) return <div key={k}><label>{label} <span className="rf__opt">{t("listHint")}</span></label><input value={val} onChange={(e) => set(k, e.target.value)} /></div>;
          return <div key={k}><label>{label}</label><input value={val} onChange={(e) => set(k, e.target.value)} /></div>;
        })}
        <button type="button" className="btn btn--pri btn--full" onClick={save} disabled={busy}>{busy ? t("saving") : t("save")}</button>
        <p className="rf__hint">{t("saveHint")}</p>
      </div>
    </Modal>
  );
}

function HistoryModal({ section, onClose }: { section: PolicySection | null; onClose: () => void }) {
  const locale = useLocale();
  const t = useTranslations("admin.policies");
  const [tick, retry] = useReload();
  const res = useResourceOne(() => (section ? getPolicyHistory(section) : Promise.resolve([] as PolicyHistoryEntry[])), [section, tick]);
  return (
    <Modal open={!!section} onClose={onClose} title={section ? t("historyTitle", { section: t(`sections.${section}`) }) : ""}>
      {res.status === "loading" ? <Skeleton rows={3} /> : res.status === "error" ? <ErrorState compact onRetry={retry} /> : !res.data?.length ? <p className="advmuted">{t("historyEmpty")}</p> : (
        <div className="alist">
          {res.data.map((h, i) => (
            <details className="consent__body" key={`${h.version}-${i}`}>
              <summary>
                {[h.version ? `v${h.version}` : "", h.at ? fmt(h.at, locale) : ""].filter(Boolean).join(" · ")}
                {h.changedBy ? <> · <PersonName id={h.changedBy} /></> : null}
              </summary>
              <div className="poltree__box"><ReadableData data={h.data} /></div>
            </details>
          ))}
        </div>
      )}
    </Modal>
  );
}

// A policy or readiness payload as people read it: labelled rows (the known
// key's name, else the key in words), nested sections indented under their
// heading, lists as lists, yes/no for booleans — never the raw JSON.
function ReadableData({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const t = useTranslations("admin.policies");
  const label = (k: string) => (t.has(`keys.${k}`) ? t(`keys.${k}`) : humanize(k));
  if (isPlain(data)) {
    const rows = Object.entries(data as Record<string, unknown>);
    if (!rows.length) return <span className="advmuted">{t("emptySection")}</span>;
    return (
      <dl className={`polcard__kv poltree${depth ? " poltree--in" : ""}`}>
        {rows.map(([k, v]) => {
          const nest = isPlain(v) || (Array.isArray(v) && !isStrList(v) && v.some((x) => x !== null && typeof x === "object"));
          return (
            <div key={k} className={nest ? "poltree__nest" : undefined}>
              <dt>{label(k)}</dt>
              <dd><ReadableData data={v} depth={depth + 1} /></dd>
            </div>
          );
        })}
      </dl>
    );
  }
  if (Array.isArray(data)) {
    if (!data.length) return <>—</>;
    if (data.every((x) => x === null || typeof x !== "object")) return <>{data.map((x) => (typeof x === "boolean" ? t(x ? "boolYes" : "boolNo") : String(x ?? "—"))).join(", ")}</>;
    return (
      <ol className="poltree__list">
        {data.map((x, i) => (
          <li key={i}><ReadableData data={x} depth={depth + 1} /></li>
        ))}
      </ol>
    );
  }
  if (typeof data === "boolean") return <>{t(data ? "boolYes" : "boolNo")}</>;
  if (data === null || data === undefined || data === "") return <>—</>;
  return <>{String(data)}</>;
}
