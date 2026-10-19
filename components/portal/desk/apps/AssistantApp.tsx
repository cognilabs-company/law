"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { askAiAssistant } from "@/lib/services/backend";
import { IconCopy, IconSend, IconSparkle, IconTrash } from "@/components/icons";
import { App, Btn, Empty, Sidebar, Spinner, Tool, Toolbar, useOs, useToast, type NavSection } from "../kit/kit";
import type { NativeProps } from "../native";
import "./assistant.css";

// The AI assistant as a desktop program, a case workbench: the case
// material on the left, the tools on the side (summary, chronology,
// contradictions, missing documents…), each run's answer kept on the right
// to copy or clear. The backend masks personal data before any outside AI
// sees the text.

const TOOLS = ["summarize", "chronology", "compare", "contradictions", "missing", "deadlines", "questions", "draft"] as const;
type Run = { id: number; tool: string; text: string; busy: boolean };

export default function AssistantApp(_props: NativeProps) {
  void _props;
  const t = useTranslations("portal.assistant");
  const d = useTranslations("portal.desk.assistant");
  const os = useOs();
  const [ctx, setCtx] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [tool, setTool] = useState<string>("summarize");
  const [toast, say] = useToast();
  const ready = ctx.trim().length >= 8;
  const busy = runs.some((r) => r.busy);

  async function run(k: string) {
    if (busy || !ready) return;
    const id = runs.length ? runs[0].id + 1 : 1;
    setRuns((l) => [{ id, tool: k, text: "", busy: true }, ...l]);
    const free = k === "free";
    try {
      const answer = await askAiAssistant(free ? ctx.trim() : t(`inst.${k}`), free ? undefined : ctx.trim());
      setRuns((l) => l.map((r) => (r.id === id ? { ...r, text: answer || t("failed"), busy: false } : r)));
    } catch {
      setRuns((l) => l.map((r) => (r.id === id ? { ...r, text: t("failed"), busy: false } : r)));
    }
  }
  const sections: NavSection[] = [{ id: "t", title: os === "mac" ? d("tools") : undefined, items: TOOLS.map((k) => ({ id: k, label: t(`tools.${k}`), icon: <IconSparkle /> })) }];

  return (
    <App name="assistant" sidebar={<Sidebar label={d("tools")} sections={sections} value={tool} onChange={(k) => (setTool(k), void run(k))} footer={<p className="dxa-pii">{t("piiNote")}</p>} />}>
      <Toolbar title={t("title")} subtitle={t("subtitle")}>
        <Tool icon={<IconSend />} label={t("run")} primary disabled={!ready || busy} onClick={() => void run("free")} />
        <Tool icon={<IconTrash />} label={d("clear")} disabled={!runs.length} onClick={() => setRuns([])} />
      </Toolbar>
      <div className="dxa">
        <section className="dxa-case">
          <label htmlFor="dxa-ctx">{t("caseLabel")}</label>
          <textarea id="dxa-ctx" value={ctx} onChange={(e) => setCtx(e.target.value)} placeholder={t("casePh")} />
          <footer>
            <small>{ready ? d("chars", { n: ctx.trim().length }) : d("needText")}</small>
            <Btn kind="primary" icon={<IconSend />} disabled={!ready || busy} onClick={() => void run(tool)}>
              {t(`tools.${tool}`)}
            </Btn>
          </footer>
          <p className="dxa-disc">{t("disclaimer")}</p>
        </section>
        <section className="dxa-out" aria-label={t("answer")}>
          {!runs.length ? (
            <Empty icon={<IconSparkle />} title={d("empty")} text={d("emptyText")} />
          ) : (
            runs.map((r) => (
              <article key={r.id} className="dxa-run">
                <header>
                  <span>
                    <IconSparkle aria-hidden />
                    {r.tool === "free" ? t("answer") : t(`tools.${r.tool}`)}
                  </span>
                  {r.busy ? <Spinner small label={t("thinking")} /> : <Btn kind="plain" small icon={<IconCopy />} title={d("copy")} onClick={() => void navigator.clipboard?.writeText(r.text).then(() => say(d("copied")))} />}
                </header>
                {r.busy ? <p className="dxa-wait">{t("thinking")}</p> : <p className="dxa-text">{r.text}</p>}
              </article>
            ))
          )}
        </section>
      </div>
      {toast}
    </App>
  );
}
