"use client";

import { useEffect, useState } from "react";
import { previewStudioDraft, type StudioPreview } from "@/lib/services/studio";
import { useStudioText } from "../bits";
import { IconAlert, IconCircleCheck } from "@/components/icons";

// What the change will touch, from POST /studio/constructors/{code}/preview
// (spec §9): the fields that differ from what runs now, the capabilities the
// change reaches and the backend's warnings — read before the user confirms.
export default function ImpactPreview({ code, payload, runtimeTargetId }: { code: string; payload: Record<string, unknown>; runtimeTargetId: string }) {
  const { t, field, fieldErr } = useStudioText();
  const body = JSON.stringify(payload);
  const [state, setState] = useState<{ key: string; data: StudioPreview | null; failed: boolean } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    previewStudioDraft(code, JSON.parse(body) as Record<string, unknown>, runtimeTargetId, c.signal)
      .then((data) => !c.signal.aborted && setState({ key: body, data, failed: false }))
      .catch(() => !c.signal.aborted && setState({ key: body, data: null, failed: true }));
    return () => c.abort();
  }, [code, body, runtimeTargetId]);
  const cur = state?.key === body ? state : null;
  if (!cur) {
    return (
      <div className="stu-impact is-busy" aria-busy="true">
        <b>{t("impact.title")}</b>
        <small>{t("impact.loading")}</small>
      </div>
    );
  }
  if (cur.failed || !cur.data) {
    return (
      <div className="stu-impact is-off">
        <b>{t("impact.title")}</b>
        <small>{t("impact.failed")}</small>
      </div>
    );
  }
  const d = cur.data;
  const problems = d.check && !d.check.ok ? Object.entries(d.check.errors) : [];
  return (
    <div className="stu-impact" data-ai-id="admin.studio.editor.impact" data-ai-type="region" data-ai-label={t("impact.title")}>
      <b>{t("impact.title")}</b>
      <dl>
        <dt>{t("impact.changed")}</dt>
        <dd>{d.changedFields.length ? d.changedFields.map((k) => <span key={k} className="stu-impact__chip">{field(k)}</span>) : <small>{t("impact.none")}</small>}</dd>
        <dt>{t("impact.capabilities")}</dt>
        <dd>{d.affectedCapabilities.length ? d.affectedCapabilities.map((k) => <span key={k} className="stu-impact__chip stu-impact__chip--cap">{t.has(`impact.cap.${k}`) ? t(`impact.cap.${k}`) : k}</span>) : <small>{t("impact.none")}</small>}</dd>
      </dl>
      {d.warnings.length ? (
        <ul className="stu-impact__warn">
          {d.warnings.map((w, i) => (
            <li key={i}>
              <IconAlert aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      ) : null}
      {problems.length ? (
        <ul className="stu-impact__warn stu-impact__warn--bad">
          {problems.map(([k, v]) => (
            <li key={k}>
              <IconAlert aria-hidden />
              <span>
                <code>{k}</code> {fieldErr(v)}
              </span>
            </li>
          ))}
        </ul>
      ) : !d.warnings.length ? (
        <p className="stu-impact__ok">
          <IconCircleCheck aria-hidden />
          {t("impact.clean")}
        </p>
      ) : null}
    </div>
  );
}
