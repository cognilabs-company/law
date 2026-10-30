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
import { IconShieldCheck, IconCheck, IconAlert, IconClock, IconEdit, IconPlus, IconTrash } from "@/components/icons";
import CheckBox from "@/components/CheckBox";
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

// Every setting gets its own control by type, at any depth: a number, a
// yes/no (handmade CheckBox), text, a comma-separated list, a group of
// settings under its heading, or a list of rows that can be added and
// removed — never a raw JSON box.
type Path = (string | number)[];
const pathKey = (p: Path) => p.join(".");
function setIn(v: unknown, path: Path, next: unknown): unknown {
  if (!path.length) return next;
  const [h, ...rest] = path;
  if (Array.isArray(v)) {
    const copy = [...v];
    copy[h as number] = setIn(copy[h as number], rest, next);
    return copy;
  }
  const o = { ...((isPlain(v) ? v : {}) as Record<string, unknown>) };
  o[h as string] = setIn(o[h as string], rest, next);
  return o;
}
// A new row shaped like the first one, with every value emptied.
function blankLike(v: unknown): unknown {
  if (typeof v === "number") return 0;
  if (typeof v === "boolean") return false;
  if (typeof v === "string") return "";
  if (Array.isArray(v)) return [];
  if (isPlain(v)) return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, blankLike(x)]));
  return null;
}
const isScalarList = (v: unknown) => Array.isArray(v) && v.every((x) => x === null || typeof x !== "object");

function EditModal({ section, data, onClose, onSaved }: { section: PolicySection | null; data: Record<string, unknown>; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("admin.policies");
  const [form, setForm] = useState<{ sec: string; value: Record<string, unknown> }>({ sec: "", value: {} });
  const [bad, setBad] = useState<Set<string>>(new Set());
  if (section && form.sec !== section) {
    setForm({ sec: section, value: data });
    setBad(new Set());
  }
  const [busy, setBusy] = useState(false);
  const change = (path: Path, next: unknown) => setForm((f) => ({ ...f, value: setIn(f.value, path, next) as Record<string, unknown> }));
  const validity = (path: Path, ok: boolean) =>
    setBad((b) => {
      const k = pathKey(path);
      if (ok === !b.has(k)) return b;
      const n = new Set(b);
      if (ok) n.delete(k);
      else n.add(k);
      return n;
    });

  async function save() {
    if (!section || busy) return;
    if (bad.size) {
      document.querySelector<HTMLElement>(".polform [aria-invalid='true']")?.focus();
      return;
    }
    setBusy(true);
    try {
      await putAdminPolicy(section, form.value);
      notify.success(t("saved"), { id: "policy-save", body: t(`sections.${section}`) });
      onSaved();
    } catch (e) {
      notify.error(t("saveFailed"), { id: "policy-save", error: e });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!section} onClose={onClose} title={section ? t("editTitle", { section: t(`sections.${section}`) }) : ""}>
      <div className="cform polform" style={{ maxWidth: "none" }}>
        <p className="advmuted">{t("editLead")}</p>
        {Object.entries(form.value).map(([k, v]) => (
          <PolicyField key={k} path={[k]} name={k} value={v} onChange={change} onValidity={validity} />
        ))}
        <button type="button" className="btn btn--pri btn--full" onClick={save} disabled={busy}>{busy ? t("saving") : t("save")}</button>
        <p className="rf__hint">{t("saveHint")}</p>
      </div>
    </Modal>
  );
}

function PolicyField({ path, name, value, onChange, onValidity }: { path: Path; name: string; value: unknown; onChange: (path: Path, next: unknown) => void; onValidity: (path: Path, ok: boolean) => void }) {
  const t = useTranslations("admin.policies");
  const uid = useId();
  const label = typeof path[path.length - 1] === "number" ? t("row", { n: (path[path.length - 1] as number) + 1 }) : t.has(`keys.${name}`) ? t(`keys.${name}`) : humanize(name);
  if (typeof value === "boolean") {
    return <CheckBox checked={value} onChange={(on) => onChange(path, on)}>{label}</CheckBox>;
  }
  if (typeof value === "number") return <NumberField id={uid} label={label} value={value} onChange={(n) => onChange(path, n)} onValidity={(ok) => onValidity(path, ok)} />;
  if (isPlain(value)) {
    const rows = Object.entries(value as Record<string, unknown>);
    return (
      <fieldset className="polform__grp">
        <legend>{label}</legend>
        {rows.length ? rows.map(([k, v]) => <PolicyField key={k} path={[...path, k]} name={k} value={v} onChange={onChange} onValidity={onValidity} />) : <span className="advmuted">{t("emptySection")}</span>}
      </fieldset>
    );
  }
  if (Array.isArray(value) && !isScalarList(value)) {
    const template = value.find((x) => x !== null && typeof x === "object");
    return (
      <fieldset className="polform__grp">
        <legend>{label}</legend>
        {value.map((row, i) => (
          <div key={i} className="polform__row">
            <PolicyField path={[...path, i]} name={name} value={row} onChange={onChange} onValidity={onValidity} />
            <button type="button" className="btn btn--soft btn--sm polform__del" onClick={() => onChange(path, value.filter((_, j) => j !== i))} aria-label={t("removeRow", { n: i + 1 })}>
              <IconTrash aria-hidden="true" />
            </button>
          </div>
        ))}
        {template !== undefined ? (
          <button type="button" className="btn btn--soft btn--sm polform__add" onClick={() => onChange(path, [...value, blankLike(template)])}>
            <IconPlus aria-hidden="true" />
            {t("addRow")}
          </button>
        ) : null}
      </fieldset>
    );
  }
  if (Array.isArray(value)) return <ListField id={uid} label={label} value={value} onChange={(next) => onChange(path, next)} onValidity={(ok) => onValidity(path, ok)} />;
  return (
    <div>
      <label htmlFor={uid}>{label}</label>
      <input id={uid} value={value == null ? "" : String(value)} onChange={(e) => onChange(path, e.target.value)} />
    </div>
  );
}

// Typed as text so a half-typed number ("1.") stays on screen; the value
// changes only when the text is a number.
function NumberField({ id, label, value, onChange, onValidity }: { id: string; label: string; value: number; onChange: (n: number) => void; onValidity: (ok: boolean) => void }) {
  const t = useTranslations("admin.policies");
  const [text, setText] = useState(String(value));
  const ok = text.trim() !== "" && Number.isFinite(Number(text.replace(/\s/g, "").replace(",", ".")));
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={text}
        aria-invalid={!ok || undefined}
        aria-describedby={ok ? undefined : `${id}-err`}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const n = Number(v.replace(/\s/g, "").replace(",", "."));
          const good = v.trim() !== "" && Number.isFinite(n);
          onValidity(good);
          if (good) onChange(n);
        }}
      />
      <FieldError id={`${id}-err`} msg={ok ? null : t("badNumber")} />
    </div>
  );
}

// A list of plain values, comma-separated; a list of numbers stays numbers.
function ListField({ id, label, value, onChange, onValidity }: { id: string; label: string; value: unknown[]; onChange: (next: unknown[]) => void; onValidity: (ok: boolean) => void }) {
  const t = useTranslations("admin.policies");
  const numeric = value.length > 0 && value.every((x) => typeof x === "number");
  const [text, setText] = useState(value.map((x) => (x == null ? "" : String(x))).join(", "));
  const parts = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  const ok = !numeric || parts(text).every((x) => Number.isFinite(Number(x)));
  return (
    <div>
      <label htmlFor={id}>
        {label} <span className="rf__opt">{t("listHint")}</span>
      </label>
      <input
        id={id}
        value={text}
        aria-invalid={!ok || undefined}
        aria-describedby={ok ? undefined : `${id}-err`}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const items = parts(v);
          const good = !numeric || items.every((x) => Number.isFinite(Number(x)));
          onValidity(good);
          if (good) onChange(numeric ? items.map(Number) : items);
        }}
      />
      <FieldError id={`${id}-err`} msg={ok ? null : t("badNumber")} />
    </div>
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
