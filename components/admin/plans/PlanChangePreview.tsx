"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";
import { fmtUzs } from "@/lib/money";
import { errDetail, isAborted, logApiError } from "@/lib/http";
import { previewPlanVersion, type PlanFeatureChange, type PlanPreview } from "@/lib/services/tariffs";

// What publishing this version changes, as the backend works it out
// (TSK-490457, TSK-206603): who it reaches and when, the price and feature
// differences, and the plain field changes. Nothing is computed here.

const shortValue = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (Array.isArray(v)) return v.map(shortValue).filter(Boolean).join(", ");
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${shortValue(x)}`).join(" · ");
  return String(v);
};

export default function PlanChangePreview({ versionId }: { versionId: string }): ReactElement {
  const t = useTranslations("admin.tariffs");
  const tp = useTranslations("admin.tariffs.preview");
  const ts = useTranslations("studio");
  const none = useTranslations("common")("none");
  const [state, setState] = useState<{ id: string; data: PlanPreview | null; error: string }>({ id: "", data: null, error: "" });

  useEffect(() => {
    const ctl = new AbortController();
    previewPlanVersion(versionId, ctl.signal).then(
      (data) => setState({ id: versionId, data, error: "" }),
      (e) => {
        if (isAborted(e)) return;
        logApiError("tariffs.preview", e);
        setState({ id: versionId, data: null, error: errDetail(e) || tp("failed") });
      },
    );
    return () => ctl.abort();
  }, [versionId, tp]);

  if (state.id !== versionId) return <Skeleton rows={2} />;
  if (state.error || !state.data) return <Notice ok={false} msg={state.error || tp("failed")} />;
  const p = state.data;
  // A feature or field without a translation never shows its key.
  const feature = (key: string) => (ts.has(`sx.feature.${key}`) ? ts(`sx.feature.${key}`) : t("featureOther"));
  const field = (key: string) => (tp.has(`field.${key}`) ? tp(`field.${key}`) : t("fieldOther"));
  const money = (n: number | null) => (n === null ? none : `${fmtUzs(n)} ${tp("som")}`);
  const ent = (f: PlanFeatureChange) =>
    [t.has(`mode.${f.mode}`) ? t(`mode.${f.mode}`) : f.mode, f.mode === "limited" && f.limit !== null ? String(f.limit) : "", f.resetPeriod && f.mode === "limited" ? (t.has(`reset.${f.resetPeriod}`) ? t(`reset.${f.resetPeriod}`) : f.resetPeriod) : ""].filter(Boolean).join(" · ");
  const nothing = !p.fields.length && !p.prices.length && !p.added.length && !p.removed.length && !p.changed.length;

  return (
    <section className="trf-pv" aria-label={tp("title")}>
      <div className="trf-pv__stats">
        <div>
          <b className="sx-num">{p.activeSubscribers ?? none}</b>
          <small>{tp("subscribers")}</small>
        </div>
        <div>
          <b className="sx-num">{p.prices.length}</b>
          <small>{tp("pricesChanged")}</small>
        </div>
        <div>
          <b className="sx-num">
            +{p.added.length} / −{p.removed.length}
          </b>
          <small>{tp("featuresChanged")}</small>
        </div>
        <div>
          <b className="sx-num">{p.fields.length}</b>
          <small>{tp("fieldsChanged")}</small>
        </div>
      </div>

      <p className="trf-pv__policy" data-material={p.material || undefined}>
        {p.appliesTo === "next_renewal" ? tp("appliesNext") : p.appliesTo === "immediately" ? tp("appliesNow") : tp("appliesNew")}
        {p.consentRequired ? ` ${tp("consent")}` : ""}
        {p.contractImmutable ? ` ${tp("immutable")}` : ""}
      </p>

      {nothing ? <p className="trf-muted">{tp("nothing")}</p> : null}

      {p.prices.length ? (
        <table className="trf-table trf-pv__prices">
          <thead>
            <tr>
              <th>{tp("period")}</th>
              <th>{tp("before")}</th>
              <th>{tp("after")}</th>
              <th>{tp("difference")}</th>
            </tr>
          </thead>
          <tbody>
            {p.prices.map((r) => (
              <tr key={r.period}>
                <td>{t.has(`price.${r.period}`) ? t(`price.${r.period}`) : r.period}</td>
                <td className="sx-num">{money(r.before)}</td>
                <td className="sx-num">{money(r.after)}</td>
                <td className="sx-num" data-dir={r.difference === null ? undefined : r.difference > 0 ? "up" : r.difference < 0 ? "down" : "same"}>
                  {r.difference === null ? none : `${r.difference > 0 ? "+" : ""}${fmtUzs(r.difference)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {p.added.length || p.removed.length || p.changed.length ? (
        <ul className="trf-pv__feats">
          {p.added.map((f) => (
            <li key={`a-${f.featureKey}`} data-kind="added">
              <span>{tp("added")}</span>
              <b>{feature(f.featureKey)}</b>
              <small>{ent(f)}</small>
            </li>
          ))}
          {p.changed.map((f) => (
            <li key={`c-${f.featureKey}`} data-kind="changed">
              <span>{tp("changed")}</span>
              <b>{feature(f.featureKey)}</b>
              <small>{ent(f)}</small>
            </li>
          ))}
          {p.removed.map((f) => (
            <li key={`r-${f.featureKey}`} data-kind="removed">
              <span>{tp("removed")}</span>
              <b>{feature(f.featureKey)}</b>
            </li>
          ))}
        </ul>
      ) : null}

      {p.fields.length ? (
        <details className="trf-pv__fields">
          <summary>{tp("fieldsTitle", { n: p.fields.length })}</summary>
          <dl>
            {p.fields.map((f) => (
              <div key={f.field}>
                <dt>{field(f.field)}</dt>
                <dd>
                  <s>{shortValue(f.before) || none}</s> → <b>{shortValue(f.after) || none}</b>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </section>
  );
}
