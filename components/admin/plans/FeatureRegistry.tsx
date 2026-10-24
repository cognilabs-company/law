"use client";

import "./tariffs.css";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";
import { errDetail, logApiError } from "@/lib/http";
import { conflictCode, createSubscriptionFeature, listSubscriptionFeatures, type FeatureRegistry as Registry } from "@/lib/services/tariffs";

// The features a tariff can grant (contract §3). Tariffs pick from this list;
// a key is unique (409 feature_key_exists).

const KEY_RE = /^[a-z][a-z0-9_.]{1,63}$/;

export default function FeatureRegistry(): ReactElement {
  const t = useTranslations("admin.tariffs");
  const ts = useTranslations("studio");
  // The backend names features in Uzbek; known ones read in the viewer's language.
  const featureName = (key: string, title: string) => (ts.has(`sx.feature.${key}`) ? ts(`sx.feature.${key}`) : title || key);
  const ids = useId();
  const [reg, setReg] = useState<Registry | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  const [form, setForm] = useState({ key: "", title: "", description: "", unit: "", resetPeriods: [] as string[] });
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [keyErr, setKeyErr] = useState("");
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    listSubscriptionFeatures().then(
      (r) => {
        if (alive) {
          setReg(r);
          setFailed(false);
        }
      },
      (e: unknown) => {
        logApiError("tariffs.features", e);
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [round]);

  const reset = (p: string) => (t.has(`reset.${p}`) ? t(`reset.${p}`) : p);
  const keyBad = !!form.key && !KEY_RE.test(form.key);
  const ready = KEY_RE.test(form.key) && !!form.title.trim() && form.resetPeriods.length > 0;

  async function add() {
    if (busy || sending.current || !ready) return;
    sending.current = true;
    setBusy(true);
    setKeyErr("");
    setNote(null);
    try {
      await createSubscriptionFeature(form);
      setForm({ key: "", title: "", description: "", unit: "", resetPeriods: [] });
      setNote({ ok: true, msg: t("featureAdded") });
      setRound((n) => n + 1);
    } catch (e) {
      logApiError("tariffs.addFeature", e);
      if (conflictCode(e) === "feature_key_exists") setKeyErr(t("keyTaken"));
      else setNote({ ok: false, msg: errDetail(e) || t("actionFailed") });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (failed) return <Notice ok={false} msg={t("loadFailed")} />;
  if (!reg) return <Skeleton rows={3} />;
  return (
    <div className="trf" data-ai-target="tariffs:features">
      <table className="trf-table">
        <caption className="sr-only">{t("registry")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("featureTitle")}</th>
            <th scope="col">{t("featureKey")}</th>
            <th scope="col">{t("unit")}</th>
            <th scope="col">{t("resets")}</th>
          </tr>
        </thead>
        <tbody>
          {reg.items.map((f) => (
            <tr key={f.key}>
              <th scope="row">{featureName(f.key, f.title)}</th>
              <td>
                <code>{f.key}</code>
              </td>
              <td>{f.unit || "—"}</td>
              <td>{f.resetPeriods.map(reset).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="trf-add"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        noValidate
      >
        <b>{t("addFeature")}</b>
        <label>
          <span>{t("featureKey")}</span>
          <input
            id={`${ids}-key`}
            value={form.key}
            onChange={(e) => {
              setForm({ ...form, key: e.target.value.trim().toLowerCase() });
              setKeyErr("");
            }}
            placeholder="ai.document_generation"
            aria-invalid={keyBad || !!keyErr || undefined}
            aria-describedby={`${ids}-keyh`}
          />
          <small id={`${ids}-keyh`} className={keyBad || keyErr ? "trf-bad" : "trf-muted"}>
            {keyErr || (keyBad ? t("keyFormat") : t("keyHint"))}
          </small>
        </label>
        <label>
          <span>{t("featureTitle")}</span>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          <span>{t("description")}</span>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label>
          <span>{t("unit")}</span>
          <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={t("unitPh")} />
        </label>
        <fieldset>
          <legend>{t("resets")}</legend>
          {reg.resetPeriods.map((p) => (
            <label key={p} className="trf-check">
              <input
                type="checkbox"
                checked={form.resetPeriods.includes(p)}
                onChange={(e) => setForm({ ...form, resetPeriods: e.target.checked ? [...form.resetPeriods, p] : form.resetPeriods.filter((x) => x !== p) })}
              />
              {reset(p)}
            </label>
          ))}
        </fieldset>
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <div className="trf-acts">
          <button type="submit" className="btn btn--pri btn--sm" disabled={busy || !ready}>
            {busy ? t("saving") : t("addFeature")}
          </button>
        </div>
      </form>
    </div>
  );
}
