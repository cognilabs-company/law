"use client";

import "./tariffs.css";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import CheckBox from "@/components/CheckBox";
import { Skeleton } from "@/components/portal/DataState";
import { errDetail, logApiError } from "@/lib/http";
import { conflictCode, createSubscriptionFeature, listSubscriptionFeatures, type FeatureRegistry as Registry } from "@/lib/services/tariffs";

// The features a tariff can grant (contract §3). Tariffs pick from this list;
// a key is unique (409 feature_key_exists). Each tariff version then makes
// a feature unavailable, limited or unlimited, and a limited one resets
// every 30 days on the backend, also on 6- and 12-month subscriptions
// (answers 2026-10-31 §2.1). The backend has no edit or delete for a
// feature, so the list only grows.

const KEY_RE = /^[a-z][a-z0-9_.]{1,63}$/;

export default function FeatureRegistry(): ReactElement {
  const t = useTranslations("admin.tariffs");
  const ts = useTranslations("studio");
  // The backend names features in Uzbek; known ones read in the viewer's language.
  const featureName = (key: string, title: string) => (ts.has(`sx.feature.${key}`) ? ts(`sx.feature.${key}`) : title || t("featureUnnamed"));
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

  const reset = (p: string) => (t.has(`reset.${p}`) ? t(`reset.${p}`) : t("other"));
  const modes = reg?.modes.length ? reg.modes : ["unavailable", "limited", "unlimited"];
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
      <ul className="trf-modes" aria-label={t("modesTitle")}>
        {modes.map((m) => (
          <li key={m} data-mode={m}>
            <b>{t.has(`mode.${m}`) ? t(`mode.${m}`) : t("other")}</b>
            <span>{t.has(`modeHint.${m}`) ? t(`modeHint.${m}`) : ""}</span>
          </li>
        ))}
      </ul>
      <p className="trf-reset" role="note">
        {t("resetEvery30")}
      </p>
      <table className="trf-table">
        <caption className="sr-only">{t("registry")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("featureTitle")}</th>
            <th scope="col">{t("unit")}</th>
            <th scope="col">{t("resets")}</th>
          </tr>
        </thead>
        <tbody>
          {reg.items.length ? null : (
            <tr>
              <td colSpan={3} className="trf-muted">
                {t("noFeatures")}
              </td>
            </tr>
          )}
          {reg.items.map((f) => (
            <tr key={f.key}>
              <th scope="row">{featureName(f.key, f.title)}</th>
              <td>{f.unit ? (t.has(`unitName.${f.unit}`) ? t(`unitName.${f.unit}`) : f.unit) : "—"}</td>
              <td>{f.resetPeriods.map(reset).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="trf-muted">{t("noEdit")}</p>
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
            <CheckBox key={p} className="trf-check" checked={form.resetPeriods.includes(p)} onChange={(on) => setForm({ ...form, resetPeriods: on ? [...form.resetPeriods, p] : form.resetPeriods.filter((x) => x !== p) })}>
              {reset(p)}
            </CheckBox>
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
