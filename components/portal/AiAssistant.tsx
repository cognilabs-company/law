"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { askAiAssistant } from "@/lib/services/backend";
import { IconSparkle, IconSend } from "@/components/icons";

// Structured case-assistant suite (module 10): the seller pastes case materials,
// then runs summarize / chronology / compare / contradictions / missing docs /
// deadlines / questions / draft over them via /ai/assistant.
const TOOLS = [
  "summarize", "chronology", "compare", "contradictions",
  "missing", "deadlines", "questions", "draft",
] as const;

export default function AiAssistant() {
  const t = useTranslations("portal.assistant");
  const [ctx, setCtx] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [active, setActive] = useState("");

  const ready = ctx.trim().length >= 8;

  async function run(tool: string) {
    if (busy || !ready) return;
    setBusy(true);
    setActive(tool);
    setAnswer("");
    const isFree = tool === "free";
    const prompt = isFree ? ctx.trim() : t(`inst.${tool}`);
    const context = isFree ? undefined : ctx.trim();
    try {
      setAnswer(await askAiAssistant(prompt, context));
    } catch {
      setAnswer(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="asist">
      <div className="asist__hero">
        <span className="asist__ico"><IconSparkle /></span>
        <div>
          <h1 className="asist__title">{t("title")}</h1>
          <p className="asist__sub">{t("subtitle")}</p>
        </div>
      </div>

      <div className="ppanel">
        <label className="intake__lbl">{t("caseLabel")}</label>
        <textarea
          className="intake__ta"
          rows={5}
          value={ctx}
          onChange={(e) => setCtx(e.target.value)}
          placeholder={t("casePh")}
        />
        <div className="chiprow" style={{ marginTop: 10 }}>
          {TOOLS.map((k) => (
            <button
              key={k}
              type="button"
              className="fchip"
              aria-pressed={active === k}
              disabled={busy || !ready}
              onClick={() => run(k)}
            >
              {t(`tools.${k}`)}
            </button>
          ))}
        </div>
        <button className="btn btn--pri btn--full" type="button" style={{ marginTop: 12 }} disabled={busy || !ready} onClick={() => run("free")}>
          <IconSend />
          {busy ? t("thinking") : t("run")}
        </button>
        <p className="intake__hint" style={{ marginTop: 8 }}>{t("disclaimer")}</p>
        {/* The backend masks these before any external AI call (T0-17). */}
        <p className="intake__hint" style={{ marginTop: 4 }}>{t("piiNote")}</p>
      </div>

      {answer ? (
        <div className="ppanel asist__ans">
          <div className="ppanel__h">
            <b>{active && active !== "free" ? t(`tools.${active}`) : t("answer")}</b>
          </div>
          <p className="asist__text">{answer}</p>
        </div>
      ) : null}
    </div>
  );
}
