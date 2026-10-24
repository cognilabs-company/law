"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { runCaseAiTool, type CaseAiTool } from "@/lib/services/backend";
import { notify } from "@/lib/toast";
import { IconSparkle, IconCheck } from "@/components/icons";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

const TOOLS: CaseAiTool[] = ["summary", "chronology", "missing_docs", "questions", "compare_versions"];
const DRAFT_KEY = (caseId: string, tool: string) => `lexgo_case_ai_${caseId}_${tool}`;

// T1B-06: AI helpers over one case (summary, chronology, missing documents,
// client questions, version comparison). The result is editable and kept
// per case/tool in the browser after the seller approves it.
export default function CaseAiTools({ caseId }: { caseId: string }) {
  const t = useTranslations("portal.caseAi");
  const tn = useTranslations("common.notify");
  const [tool, setTool] = useState<CaseAiTool | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<CaseAiTool | null>(null);
  const once = useSameTickGuard();
  const nid = `case-ai-${caseId}`;

  async function run(k: CaseAiTool) {
    if (busy || !once()) return;
    setBusy(k);
    try {
      const r = await runCaseAiTool(caseId, k);
      notify.dismiss(nid);
      setTool(k);
      setText(r.result);
    } catch (e) {
      notify.error(t("error"), { id: nid, error: e, action: { label: tn("retry"), onClick: () => void run(k) } });
    } finally {
      setBusy(null);
    }
  }
  function approve() {
    if (!tool) return;
    try { localStorage.setItem(DRAFT_KEY(caseId, tool), text); } catch { /* ignore */ }
    notify.success(t("saved"), { id: nid, body: t(`tools.${tool}`) });
  }

  return (
    <div className="ohist" style={{ marginTop: 14 }} data-ai-target="case:ai-tools">
      <div className="ohist__h"><b><IconSparkle style={{ width: 15, height: 15 }} /> {t("title")}</b></div>
      <p className="advmuted" style={{ margin: 0, fontSize: ".8rem" }}>{t("lead")}</p>
      <div className="ohist__btns">
        {TOOLS.map((k) => (
          <button key={k} type="button" className={`btn btn--sm ${tool === k ? "btn--pri" : "btn--line"}`} disabled={!!busy} onClick={() => run(k)}>
            {busy === k ? t("running") : t(`tools.${k}`)}
          </button>
        ))}
      </div>
      {tool ? (
        <div className="cform" style={{ maxWidth: "none" }}>
          <label>{t(`tools.${tool}`)}</label>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="rf__hint">{t("editHint")}</p>
          <button type="button" className="btn btn--soft btn--sm" onClick={approve} style={{ justifySelf: "start" }}><IconCheck />{t("approve")}</button>
        </div>
      ) : null}
    </div>
  );
}
