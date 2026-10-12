"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MASK, previewStudioDraft, type StudioPreview, type StudioSchemaField } from "@/lib/services/studio";
import { IconAlert, IconCircleCheck, IconEye, IconHistory, IconRefresh, IconShieldCheck } from "@/components/icons";
import { useStudioText } from "../bits";
import { ChecklistList, PreviewView, RiskBadge, SurfaceList } from "../guide";

type Dict = Record<string, unknown>;
const SECRET = /secret|token|password|passwd|credential|api_?key|private_?key|client_?secret/i;

// The live preview (spec §7): the payload goes to /preview 400 ms after the
// last change; a newer change cancels the request still on its way, and an
// answer to an older payload never paints over a newer one. The last good
// preview stays on screen while the next one loads, and after a network
// error, with a retry.
export function useLivePreview(code: string, body: string, runtimeTargetId: string, enabled: boolean) {
  const [state, setState] = useState<{ key: string; data: StudioPreview | null; loading: boolean; failed: boolean }>({ key: "", data: null, loading: false, failed: false });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    if (!enabled || !code || !body) return;
    const my = ++seq.current;
    const c = new AbortController();
    const h = setTimeout(() => {
      setState((s) => ({ ...s, loading: true }));
      previewStudioDraft(code, JSON.parse(body) as Dict, runtimeTargetId, c.signal)
        .then((data) => my === seq.current && setState({ key: body, data, loading: false, failed: false }))
        .catch(() => !c.signal.aborted && my === seq.current && setState((s) => ({ ...s, loading: false, failed: true })));
    }, 400);
    return () => {
      clearTimeout(h);
      c.abort();
    };
  }, [code, body, runtimeTargetId, enabled, nonce]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  const stale = state.key !== body;
  return { data: state.data, loading: state.loading || (stale && enabled && !state.failed), failed: state.failed, fresh: !stale && !!state.data, retry };
}

type Tab = "preview" | "check" | "diff" | "impact";

export default function LivePreview({
  preview,
  fields,
  editing,
  onPickError,
}: {
  preview: ReturnType<typeof useLivePreview>;
  fields: StudioSchemaField[];
  editing: boolean;
  onPickError: (path: string) => void;
}) {
  const { t, field } = useStudioText();
  const [tab, setTab] = useState<Tab>("preview");
  const d = preview.data;
  const errs = d ? Object.entries(d.errors) : [];
  const label = (k: string) => fields.find((f) => f.key === k.split(/[.[]/)[0])?.label || field(k);
  // A secret never shows: what the preview masked, and whatever is named
  // like one, stays the mask in the diff as well.
  const maskedKeys = new Set((d?.visual?.items ?? []).filter((i) => i.masked).map((i) => i.key));
  const shown = (k: string, v: unknown) => {
    if (maskedKeys.has(k) || SECRET.test(k)) return MASK;
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "object") {
      const s = JSON.stringify(v, (key, val) => (key && SECRET.test(key) ? MASK : val));
      return s.length > 120 ? `${s.slice(0, 119)}…` : s;
    }
    return String(v);
  };
  return (
    <section className={`stu-live2${preview.loading ? " is-loading" : ""}`} aria-label={t("ux.previewTitle")} aria-busy={preview.loading}>
      <header className="stu-live2__h">
        <span className="stu-live2__dot" aria-hidden />
        <b>{d?.visual?.title || t("ux.previewTitle")}</b>
        {preview.loading ? <small className="stu-live2__state">{t("ux.updating")}</small> : d?.dryRun ? <small className="stu-live2__state">{t("ux.dryRun")}</small> : null}
      </header>
      <div className="hrm-tabs stu-live2__tabs" role="tablist">
        {(["preview", "check", "diff", "impact"] as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {t(`ux.tab.${k}`)}
            {k === "check" && errs.length ? <span className="hrm-count is-bad">{errs.length}</span> : null}
            {k === "diff" && d?.changedFields.length ? <span className="hrm-count">{d.changedFields.length}</span> : null}
          </button>
        ))}
      </div>
      {preview.failed ? (
        <div className="stu-live2__err" role="alert">
          <IconAlert aria-hidden />
          <span>{d ? t("ux.netErrorKept") : t("ux.netError")}</span>
          <button type="button" className="btn btn--line btn--sm" onClick={preview.retry}>
            <IconRefresh aria-hidden />
            {t("ux.retry")}
          </button>
        </div>
      ) : null}
      <div className="stu-live2__b">
        {!d ? (
          <div className="stu-live2__sk" aria-hidden>
            <span />
            <span />
            <span className="is-short" />
          </div>
        ) : tab === "preview" ? (
          d.visual ? (
            <>
              {d.visual.description ? <p className="stu-live2__desc">{d.visual.description}</p> : null}
              {d.visual.warnings.length ? (
                <ul className="stu-live2__warn">
                  {d.visual.warnings.map((w) => (
                    <li key={w}>
                      <IconAlert aria-hidden />
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
              {d.visual.state === "empty" ? (
                <div className="stu-live2__empty">
                  <IconEye aria-hidden />
                  <p>{d.visual.emptyState || t("ux.emptyPreview")}</p>
                </div>
              ) : (
                <PreviewView visual={d.visual} />
              )}
              {d.visual.surfaces.length ? (
                <div className="stu-live2__where">
                  <small>{t("ux.showsOn")}</small>
                  <SurfaceList surfaces={d.visual.surfaces} compact />
                </div>
              ) : null}
            </>
          ) : (
            <p className="stu-hint">{t("ux.noPreview")}</p>
          )
        ) : tab === "check" ? (
          errs.length ? (
            <ul className="stu-live2__errs">
              {errs.map(([k, v]) => (
                <li key={k}>
                  <button type="button" onClick={() => onPickError(k)}>
                    <IconAlert aria-hidden />
                    <span>
                      <b>{label(k)}</b>
                      <small>{v}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="stu-live2__ok">
              <IconCircleCheck aria-hidden />
              {t("ux.valid")}
            </p>
          )
        ) : tab === "diff" ? (
          d.changedFields.length ? (
            <>
              {!editing ? <p className="stu-hint">{t("ux.diffNew")}</p> : null}
              <table className="stu-diff">
                <thead>
                  <tr>
                    <th>{t("ux.diffField")}</th>
                    {editing ? <th>{t("ux.diffBefore")}</th> : null}
                    <th>{t("ux.diffAfter")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.changedFields.map((k) => (
                    <tr key={k}>
                      <th>{label(k)}</th>
                      {editing ? <td className="is-before">{shown(k, d.before?.[k])}</td> : null}
                      <td className="is-after">{shown(k, d.after?.[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="stu-hint">
              <IconHistory aria-hidden /> {t("ux.noChanges")}
            </p>
          )
        ) : (
          <ImpactBody preview={d} />
        )}
      </div>
    </section>
  );
}

// What the change reaches (spec §10), the backend's checklist as it came.
export function ImpactBody({ preview: d }: { preview: StudioPreview }) {
  const { t, field } = useStudioText();
  return (
    <div className="stu-impact2">
      <dl>
        {d.risk ? (
          <>
            <dt>{t("ux.riskTitle")}</dt>
            <dd><RiskBadge risk={d.risk} /></dd>
          </>
        ) : null}
        {d.requiresApproval !== null ? (
          <>
            <dt>{t("ux.approval")}</dt>
            <dd>{d.requiresApproval ? <span className="stu-guide__appr"><IconShieldCheck aria-hidden />{t("ux.approvalYes")}</span> : t("ux.approvalNo")}</dd>
          </>
        ) : null}
        {d.changedFields.length ? (
          <>
            <dt>{t("impact.changed")}</dt>
            <dd className="stu-guide__chips">{d.changedFields.map((k) => <span key={k}>{field(k)}</span>)}</dd>
          </>
        ) : null}
        {d.affectedCapabilities.length ? (
          <>
            <dt>{t("impact.capabilities")}</dt>
            <dd className="stu-guide__chips">{d.affectedCapabilities.map((k) => <span key={k}>{t.has(`impact.cap.${k}`) ? t(`impact.cap.${k}`) : k}</span>)}</dd>
          </>
        ) : null}
      </dl>
      {d.whereUsed.length ? (
        <div>
          <small className="stu-impact2__h">{t("ux.whereTitle")}</small>
          <SurfaceList surfaces={d.whereUsed} compact />
        </div>
      ) : null}
      {d.warnings.length ? (
        <ul className="stu-live2__warn">
          {d.warnings.map((w) => (
            <li key={w}>
              <IconAlert aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      ) : null}
      {d.checklist.length ? (
        <div>
          <small className="stu-impact2__h">{t("ux.checklist")}</small>
          <ChecklistList items={d.checklist} />
        </div>
      ) : null}
    </div>
  );
}
