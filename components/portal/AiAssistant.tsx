"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import AiLabel from "@/components/ui/AiLabel";
import { askAiAssistant } from "@/lib/services/backend";
import "@/components/portal/dash/seller1920.css";
import "@/components/portal/pdf1920.css";
import { notify } from "@/lib/toast";
import { timeOnly } from "@/lib/date";
import { IconSparkle, IconSend, IconCopy, IconDownload, IconFileText, IconClose, IconClock, IconList, IconCalendar, IconSearch, IconAlert, IconClipboardList, IconHelpCircle, IconEdit } from "@/components/icons";

// Structured case-assistant suite (module 10): the seller pastes case materials,
// then runs summarize / chronology / compare / contradictions / missing docs /
// deadlines / questions / draft over them via /ai/assistant.
//
// Redesigned after the owner's PDF (2026-11-27, K4): a workspace with the
// materials and the tools as described cards, the answer with copy/download,
// and the runs of this session beside it. The shell's h1 names the page.
const TOOLS = [
  "summarize", "chronology", "compare", "contradictions",
  "missing", "deadlines", "questions", "draft",
] as const;
type Tool = (typeof TOOLS)[number] | "free";

const TOOL_ICON: Record<(typeof TOOLS)[number], (p: { "aria-hidden"?: boolean }) => React.ReactNode> = {
  summarize: (p) => <IconFileText {...p} />,
  chronology: (p) => <IconClock {...p} />,
  compare: (p) => <IconList {...p} />,
  contradictions: (p) => <IconAlert {...p} />,
  missing: (p) => <IconSearch {...p} />,
  deadlines: (p) => <IconCalendar {...p} />,
  questions: (p) => <IconHelpCircle {...p} />,
  draft: (p) => <IconEdit {...p} />,
};

type Run = { id: string; tool: Tool; at: string; answer: string; failed: boolean };

// The runs live only in this tab (sessionStorage): case material is private
// and a shared computer must not keep it after the tab closes.
const KEY = "lexgo_ai_assist_runs";
const MAX_RUNS = 12;
const TEXT_FILES = ".txt,.md,.csv,.json,.html,.htm,.rtf";
const MAX_FILE = 400_000;

function readRuns(): Run[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? (v as Run[]).slice(0, MAX_RUNS) : [];
  } catch {
    return [];
  }
}
function writeRuns(runs: Run[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch {
    /* storage may be unavailable; the runs simply are not remembered */
  }
}

export default function AiAssistant() {
  const t = useTranslations("portal.assistant");
  const locale = useLocale();
  const [ctx, setCtx] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Tool | "">("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [shown, setShown] = useState<string>("");
  const file = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Read after mount: the server render has no sessionStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRuns(readRuns());
  }, []);

  const ready = ctx.trim().length >= 8;
  const current = runs.find((r) => r.id === shown) ?? null;
  const toolName = (k: Tool) => (k === "free" ? t("answer") : t(`tools.${k}`));

  async function run(tool: Tool) {
    if (busy || !ready) return;
    setBusy(true);
    setActive(tool);
    const isFree = tool === "free";
    const prompt = isFree ? ctx.trim() : t(`inst.${tool}`);
    const context = isFree ? undefined : ctx.trim();
    let answer = "";
    let failed = false;
    try {
      answer = await askAiAssistant(prompt, context);
    } catch {
      failed = true;
      answer = t("failed");
    }
    const at = new Date().toISOString();
    const r: Run = { id: `${at}-${tool}`, tool, at, answer, failed };
    setRuns((cur) => {
      const next = [r, ...cur].slice(0, MAX_RUNS);
      writeRuns(next);
      return next;
    });
    setShown(r.id);
    setBusy(false);
    requestAnimationFrame(() => answerRef.current?.focus());
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify.success(t("copied"), { id: "assist-copy" });
    } catch {
      notify.error(t("copyFailed"), { id: "assist-copy" });
    }
  }

  function download(r: Run) {
    const blob = new Blob([`${toolName(r.tool)}\n\n${r.answer}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tezkor-himoya-ai-${r.tool}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_FILE) {
      notify.error(t("fileTooBig"), { id: "assist-file" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "").replace(/<[^>]+>/g, " ").trim();
      if (!text) {
        notify.error(t("fileEmpty"), { id: "assist-file" });
        return;
      }
      setCtx((cur) => (cur.trim() ? `${cur.trim()}\n\n${text}` : text));
      notify.success(t("fileAdded"), { id: "assist-file", body: f.name });
    };
    reader.onerror = () => notify.error(t("fileEmpty"), { id: "assist-file" });
    reader.readAsText(f);
  }

  function clearRuns() {
    setRuns([]);
    setShown("");
    writeRuns([]);
  }

  return (
    <div className="aiw asist lxp-aiw">
      <div className="aiw__main">
        <section className="lx-card lxp-main aiw__ws" data-ai-target="ai-chat:input" data-ai-label={t("caseLabel")}>
          <header className="lxs-h">
            <span className="lxs-h__ic aiw__ico" aria-hidden="true"><IconSparkle /></span>
            <div className="lxs-h__t">
              <h2>{t("title")}</h2>
              <small>{t("subtitle")}</small>
            </div>
          </header>

          <div className="aiw__field">
            <div className="aiw__lblrow">
              <label className="intake__lbl" htmlFor="aiw-ctx">{t("caseLabel")}</label>
              <span className="aiw__tools">
                <button type="button" className="btn btn--line btn--sm" onClick={() => file.current?.click()}>
                  <IconFileText />
                  {t("fromFile")}
                </button>
                {ctx ? (
                  <button type="button" className="btn btn--line btn--sm" onClick={() => setCtx("")}>
                    <IconClose />
                    {t("clear")}
                  </button>
                ) : null}
              </span>
              <input ref={file} type="file" accept={TEXT_FILES} hidden onChange={onFile} />
            </div>
            <textarea
              id="aiw-ctx"
              className="intake__ta aiw__ta"
              rows={7}
              value={ctx}
              onChange={(e) => setCtx(e.target.value)}
              placeholder={t("casePh")}
              data-ai-target="assistant:case-input"
              data-ai-label={t("caseLabel")}
            />
            <p className="aiw__count sx-num" aria-live="polite">
              {ready ? t("chars", { n: ctx.trim().length }) : t("needMore")}
            </p>
          </div>

          <h3 className="aiw__h3">{t("pickTool")}</h3>
          <div className="aiw__grid" data-ai-target="assistant:tools">
            {TOOLS.map((k) => (
              <button
                key={k}
                type="button"
                className="aiw__tool"
                aria-pressed={active === k && busy}
                disabled={busy || !ready}
                onClick={() => run(k)}
              >
                <span className="aiw__tico">{TOOL_ICON[k]({ "aria-hidden": true })}</span>
                <b>{t(`tools.${k}`)}</b>
                <small>{t(`inst.${k}`)}</small>
              </button>
            ))}
          </div>

          <div className="aiw__ask">
            <button className="btn btn--pri" type="button" disabled={busy || !ready} onClick={() => run("free")} data-ai-target="button:assistant-run">
              <IconSend />
              {busy ? t("thinking") : t("run")}
            </button>
            <p className="intake__hint">{t("askHint")}</p>
          </div>

          <div className="aiw__notes">
            <p className="intake__hint">{t("disclaimer")}</p>
            {/* The backend masks these before any external AI call (T0-17). */}
            <p className="intake__hint">{t("piiNote")}</p>
          </div>
        </section>

        {busy ? (
          <section className="lx-card lxp-main aiw__ans" aria-busy="true">
            <div className="aiw__ansh"><b>{toolName(active || "free")}</b></div>
            <div className="aiw__skel" aria-hidden="true"><i /><i /><i /></div>
            <p className="intake__hint" role="status">{t("thinking")}</p>
          </section>
        ) : current ? (
          <section className="lx-card lxp-main aiw__ans asist__ans" data-ai-target="assistant:answer" tabIndex={-1} ref={answerRef} aria-label={toolName(current.tool)}>
            <div className="aiw__ansh">
              <b>{toolName(current.tool)}</b>
              <small className="sx-num">{timeOnly(current.at, locale)}</small>
              {current.failed ? null : (
                <span className="aiw__ansact">
                  <button type="button" className="btn btn--line btn--sm" onClick={() => void copy(current.answer)}>
                    <IconCopy />
                    {t("copy")}
                  </button>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => download(current)}>
                    <IconDownload />
                    {t("download")}
                  </button>
                </span>
              )}
            </div>
            <p className={`asist__text${current.failed ? " aiw__fail" : ""}`}>{current.answer}</p>
            {current.failed ? null : <AiLabel />}
          </section>
        ) : null}
      </div>

      <aside className="lx-card lxp-rail aiw__side" aria-label={t("history")}>
        <div className="aiw__sideh">
          <b>{t("history")}</b>
          {runs.length ? (
            <button type="button" className="btn btn--line btn--sm" onClick={clearRuns}>
              {t("clear")}
            </button>
          ) : null}
        </div>
        {runs.length ? (
          <ul className="aiw__runs">
            {runs.map((r) => (
              <li key={r.id}>
                <button type="button" className="aiw__run" aria-current={r.id === shown ? "true" : undefined} onClick={() => setShown(r.id)}>
                  <span className="aiw__runh">
                    <b>{toolName(r.tool)}</b>
                    <small className="sx-num">{timeOnly(r.at, locale)}</small>
                  </span>
                  <span className="aiw__runp">{r.answer.slice(0, 120)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="aiw__empty">
            <IconClipboardList aria-hidden="true" />
            <p>{t("historyEmpty")}</p>
          </div>
        )}
        <p className="intake__hint">{t("historyNote")}</p>
      </aside>
    </div>
  );
}
