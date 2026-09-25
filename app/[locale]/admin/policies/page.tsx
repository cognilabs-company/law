"use client";

import { useEffect, useState } from "react";
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
import { ApiError, errDetail } from "@/lib/http";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import BusinessCalendarCard from "@/components/admin/BusinessCalendarCard";
import { IconShieldCheck, IconCheck, IconAlert, IconClock, IconEdit } from "@/components/icons";
import { dateTimeFull } from "@/lib/date";
import { humanize } from "@/lib/labels";

type Val = unknown;
const isPlain = (v: Val) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStrList = (v: Val) => Array.isArray(v) && v.every((x) => typeof x === "string");

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
  const [key, setKey] = useState(0);
  const res = useResourceOne(getAdminPolicies, [key]);
  const ready = useResourceOne(getComplianceReadiness, [key]);
  const [edit, setEdit] = useState<PolicySection | null>(null);
  const [history, setHistory] = useState<PolicySection | null>(null);
  // T0-10 §5: unverified sellers in the catalogue — badge or hidden.
  const [unvMode, setUnvMode] = useState<UnverifiedSellersMode | null>(null);
  const [unvBusy, setUnvBusy] = useState(false);
  const [unvNote, setUnvNote] = useState<{ ok: boolean; msg: string } | null>(null);
  useEffect(() => {
    let alive = true;
    getUnverifiedSellersMode().then((m) => { if (alive) setUnvMode(m); });
    return () => { alive = false; };
  }, [key]);
  async function saveUnv(mode: UnverifiedSellersMode) {
    if (unvBusy || mode === unvMode) return;
    setUnvBusy(true);
    setUnvNote(null);
    try {
      await setUnverifiedSellersMode(mode);
      setUnvMode(mode);
      setUnvNote({ ok: true, msg: t("saved") });
    } catch {
      setUnvNote({ ok: false, msg: t("saveError") });
    } finally {
      setUnvBusy(false);
    }
  }
  const forbidden = res.status === "error";

  return (
    <>
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("readyTitle")}</b>
          {ready.data?.status ? <em className={`atag${ready.data.status === "production_ready" ? " atag--ok" : ""}`}>{t.has(`readyStatus.${ready.data.status}`) ? t(`readyStatus.${ready.data.status}`) : ready.data.status}</em> : null}
        </div>
        <p className="ppanel__note">{t("readyLead")}</p>
        {ready.status === "loading" ? <Skeleton rows={3} /> : ready.status === "error" || !ready.data ? (
          <Notice ok={false} msg={t("loadError")} />
        ) : !ready.data.items.length ? (
          <pre className="legaldoc__body">{JSON.stringify(ready.data.raw, null, 2)}</pre>
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
                  <div className="aitem__r"><em className={`atag${ok ? " atag--ok" : " atag--muted"}`}>{t.has(`readyStatus.${it.status}`) ? t(`readyStatus.${it.status}`) : it.status || "—"}</em></div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ppanel">
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

      <div className="ppanel">
        <div className="ppanel__h"><b className="ppanel__t"><span className="pico"><IconShieldCheck /></span>{t("unverified.title")}</b></div>
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
        {unvNote ? <Notice ok={unvNote.ok} msg={unvNote.msg} /> : null}
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
  const [form, setForm] = useState<{ sec: string; values: Record<string, string> }>({ sec: "", values: {} });
  const toText = (v: unknown) => (isPlain(v) || (Array.isArray(v) && !isStrList(v)) ? JSON.stringify(v, null, 2) : isStrList(v) ? (v as string[]).join(", ") : String(v ?? ""));
  if (section && form.sec !== section) setForm({ sec: section, values: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toText(v)])) });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  async function save() {
    if (!section || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        const raw = form.values[k] ?? "";
        if (typeof v === "number") out[k] = Number(raw.replace(/\s/g, "")) || 0;
        else if (typeof v === "boolean") out[k] = raw === "true";
        else if (isStrList(v)) out[k] = raw.split(",").map((x) => x.trim()).filter(Boolean);
        else if (isPlain(v) || Array.isArray(v)) out[k] = JSON.parse(raw);
        else out[k] = raw;
      }
      await putAdminPolicy(section, out);
      setNote({ ok: true, msg: t("saved") });
      onSaved();
    } catch (e) {
      setNote({ ok: false, msg: e instanceof SyntaxError ? t("badJson") : e instanceof ApiError && e.status === 403 ? t("forbidden") : errDetail(e) || t("saveError") });
    } finally {
      setBusy(false);
    }
  }
  const set = (k: string, v: string) => setForm((f) => ({ ...f, values: { ...f.values, [k]: v } }));

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
          if (isPlain(v) || (Array.isArray(v) && !isStrList(v))) return <div key={k}><label>{label} <span className="rf__opt">JSON</span></label><textarea rows={Math.min(14, val.split("\n").length + 1)} value={val} onChange={(e) => set(k, e.target.value)} style={{ fontFamily: "monospace", fontSize: ".8rem" }} /></div>;
          if (isStrList(v)) return <div key={k}><label>{label} <span className="rf__opt">{t("listHint")}</span></label><input value={val} onChange={(e) => set(k, e.target.value)} /></div>;
          return <div key={k}><label>{label}</label><input value={val} onChange={(e) => set(k, e.target.value)} /></div>;
        })}
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <button type="button" className="btn btn--pri btn--full" onClick={save} disabled={busy}>{busy ? t("saving") : t("save")}</button>
        <p className="rf__hint">{t("saveHint")}</p>
      </div>
    </Modal>
  );
}

function HistoryModal({ section, onClose }: { section: PolicySection | null; onClose: () => void }) {
  const locale = useLocale();
  const t = useTranslations("admin.policies");
  const res = useResourceOne(() => (section ? getPolicyHistory(section) : Promise.resolve([] as PolicyHistoryEntry[])), [section]);
  return (
    <Modal open={!!section} onClose={onClose} title={section ? t("historyTitle", { section: t(`sections.${section}`) }) : ""}>
      {res.status === "loading" ? <Skeleton rows={3} /> : !res.data?.length ? <p className="advmuted">{t("historyEmpty")}</p> : (
        <div className="alist">
          {res.data.map((h, i) => (
            <details className="consent__body" key={`${h.version}-${i}`}>
              <summary>{[h.version ? `v${h.version}` : "", fmt(h.at, locale), h.changedBy ? `${h.changedBy.slice(0, 8)}…` : ""].filter(Boolean).join(" · ")}</summary>
              <pre className="legaldoc__body" style={{ maxHeight: 260 }}>{JSON.stringify(h.data, null, 2)}</pre>
            </details>
          ))}
        </div>
      )}
    </Modal>
  );
}
