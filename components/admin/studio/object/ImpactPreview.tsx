"use client";

import { useEffect, useState } from "react";
import { previewStudioDraft, type StudioPreview } from "@/lib/services/studio";
import { useStudioText } from "../bits";
import { ImpactBody } from "./LivePreview";

// Read before review or publish (spec §10): what the change touches — the
// fields that differ, where it shows, the capabilities, the risk, the
// warnings and the backend's own publish checklist, as it gave them.
export default function ImpactPreview({ code, payload, runtimeTargetId }: { code: string; payload: Record<string, unknown>; runtimeTargetId: string }) {
  const { t } = useStudioText();
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
  return (
    <div className={`stu-impact${!cur ? " is-busy" : cur.failed ? " is-off" : ""}`} data-ai-id="admin.studio.editor.impact" data-ai-type="region" data-ai-label={t("impact.title")}>
      <b>{t("impact.title")}</b>
      {!cur ? <small>{t("impact.loading")}</small> : cur.failed || !cur.data ? <small>{t("impact.failed")}</small> : <ImpactBody preview={cur.data} />}
    </div>
  );
}
