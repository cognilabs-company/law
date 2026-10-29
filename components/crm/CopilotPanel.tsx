"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import CheckBox from "@/components/CheckBox";
import { IconAlert, IconArrowRight, IconCopy, IconShieldCheck, IconSparkle } from "@/components/icons";
import { shortDateTime, timeOnly } from "@/lib/date";
import { asArr, asDict, asStr, isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { AI_LANGUAGES, AI_RUN_TYPES, aiCardsOf, aiRunDone, applyAiRun, crmCode, getAiRun, listAiRuns, startAiRun, type AiCard, type CrmAiRun, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { useCrmError } from "./bits";
import { CrmDateTime, CrmSelect } from "./fields";
import { copyText } from "./LeadSide";
import type { LeadWrite } from "./CrmLeadPage";

const POLL = [1200, 2000, 3000, 4000, 6000];
export const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join("\n\n");
  const d = asDict(v);
  // Never raw JSON: an unknown object reads as its own text values.
  return asStr(d.text ?? d.body ?? d.content ?? d.message ?? d.title ?? d.name) || Object.values(d).map(textOf).filter(Boolean).join("\n");
};
// "next_action.at" → "path.next_action_at": a dot would nest the message key.
export const pathKey = (p: string) => `path.${p.replace(/\./g, "_")}`;
const pct = (v: unknown): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
};

const URGENCIES = ["low", "normal", "high", "urgent"];

// Advisory only: a run reads, suggests and waits. Nothing is sent, changed
// or created until the operator ticks cards and applies them (§5).
export function CopilotPanel({ meta, lead, write, refreshKey }: { meta: CrmMeta; lead: CrmLead; write: LeadWrite; refreshKey: number }): ReactElement {
  const t = useTranslations("crm.ai");
  const tu = useTranslations("crm.newLead");
  const locale = useLocale();
  const crmErr = useCrmError();
  const [runType, setRunType] = useState<string>("full_analysis");
  const [language, setLanguage] = useState<string>(AI_LANGUAGES.includes(lead.language as (typeof AI_LANGUAGES)[number]) ? lead.language : "auto");
  const [instruction, setInstruction] = useState("");
  const [runs, setRuns] = useState<CrmAiRun[] | null>(null);
  const [current, setCurrent] = useState<CrmAiRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const pollRef = useRef(0);
  const attempt = useRef(0);

  const loadRuns = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const list = await listAiRuns(lead.id, signal);
        setRuns(list);
        setCurrent((cur) => (cur ? (list.find((r) => r.id === cur.id) ?? cur) : (list[0] ?? null)));
      } catch (e) {
        if (!isAborted(e)) logApiError("crm.ai.runs", e);
        setRuns((cur) => cur ?? []);
      }
    },
    [lead.id],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void loadRuns(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [loadRuns, refreshKey]);

  // While queued/running: poll the run, slower each time; the
  // crm.ai.completed/failed events (refreshKey) cut it short.
  const currentId = current?.id ?? "";
  const currentDone = aiRunDone(current);
  useEffect(() => {
    if (!currentId || currentDone) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await getAiRun(currentId);
        if (!alive) return;
        setCurrent(r);
        setRuns((cur) => (cur ? cur.map((x) => (x.id === r.id ? r : x)) : cur));
        if (!aiRunDone(r)) pollRef.current = window.setTimeout(() => void tick(), POLL[Math.min(attempt.current++, POLL.length - 1)]);
      } catch (e) {
        if (!isAborted(e)) logApiError("crm.ai.poll", e);
      }
    };
    attempt.current = 0;
    pollRef.current = window.setTimeout(() => void tick(), POLL[0]);
    return () => {
      alive = false;
      window.clearTimeout(pollRef.current);
    };
  }, [currentId, currentDone, refreshKey]);

  const run = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const r = await startAiRun(lead.id, runType, language, instruction);
      setCurrent(r);
      setRuns((cur) => [r, ...(cur ?? []).filter((x) => x.id !== r.id)]);
      setSelected([]);
      setEdits({});
    } catch (e) {
      if (crmCode(e) === "crm_ai_run_active") {
        toast(t("active"), { tone: "info" });
        void loadRuns();
      } else toast(crmErr(e), { tone: "err" });
    } finally {
      setStarting(false);
    }
  };

  const out = current?.status === "completed" ? current.output : {};
  const cards = current?.status === "completed" ? aiCardsOf(out) : [];
  const warnings = asArr(out.operator_warnings).map(textOf).filter(Boolean);
  const confirmRequired = out.operator_confirmation_required === true;
  const conf = pct(out.confidence);
  const dupP = pct(out.duplicate_probability);
  const toggle = (path: string) => setSelected((cur) => (cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path]));
  const valueOf = (c: AiCard): string => edits[c.path] ?? textOf(c.value);

  const apply = async () => {
    if (!current || applying || !selected.length) return;
    setApplying(true);
    // Only ticked paths travel; only their edits ride along as overrides.
    const overrides: Record<string, unknown> = {};
    for (const p of selected) if (edits[p] !== undefined) overrides[p] = edits[p];
    const ok = await write(async (l) => {
      await applyAiRun(current.id, selected, overrides, l.lockVersion);
      return null;
    }, t("applied", { n: selected.length }));
    setApplying(false);
    if (ok) {
      setPreview(false);
      setSelected([]);
    }
  };
  const before = (path: string): string => {
    if (path === "category") return lead.category;
    if (path === "subcategory") return asStr(lead.details.subcategory);
    if (path === "urgency") return lead.urgency;
    if (path === "summary") return asStr(lead.details.summary ?? lead.details.ai_summary);
    if (path === "next_action.at") return lead.nextActionAt ? shortDateTime(lead.nextActionAt, locale) : "";
    if (path === "next_action.note" || path === "next_action") return asStr(asDict(lead.details.next_action).note);
    return "";
  };
  const thinking = !!current && !aiRunDone(current);

  return (
    <aside className="crm-ai" aria-labelledby="crm-ai-t">
      <div className="crm-ai__head">
        <h2 className="crm-ai__title" id="crm-ai-t">
          <i aria-hidden="true">
            <IconSparkle />
          </i>
          {t("title")}
        </h2>
        <div className="crm-ai__types" role="group" aria-label={t("runType")}>
          {AI_RUN_TYPES.map((k) => (
            <button key={k} type="button" className="crm-chip" aria-pressed={runType === k} onClick={() => setRunType(k)}>
              {t(`type.${k}`)}
            </button>
          ))}
        </div>
        <div className="crm-ai__ask">
          <CrmSelect value={language} onChange={setLanguage} label={t("language")} options={AI_LANGUAGES.map((l) => ({ value: l, label: t(`lang.${l}`) }))} />
          <input className="crm-input" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={t("instruction")} aria-label={t("instruction")} maxLength={1000} />
        </div>
        <button type="button" className="crm-btn crm-btn--pri" onClick={() => void run()} disabled={starting || thinking} aria-busy={starting || undefined}>
          <IconSparkle aria-hidden="true" />
          {thinking ? t("running") : t("run")}
        </button>
      </div>

      <p className="crm-trust">
        <IconShieldCheck aria-hidden="true" />
        <span>{t("trust")}</span>
      </p>

      <div className="crm-ai__body" aria-live="polite">
        {runs === null ? (
          <span className="crm-sk crm-sk--block" />
        ) : !current ? (
          <p className="crm-sub">{t("emptyText")}</p>
        ) : thinking ? (
          <div className="crm-think" role="status">
            <p className="crm-think__line">
              <i aria-hidden="true">
                <b />
                <b />
                <b />
              </i>
              {current.status === "queued" ? t("queued") : t("thinking")}
            </p>
            <span className="crm-sk crm-sk--block" style={{ height: 70 }} />
            <span className="crm-sk crm-sk--block" style={{ height: 110 }} />
            <span className="crm-sk crm-sk--block" style={{ height: 60 }} />
          </div>
        ) : current.status === "failed" ? (
          <div className="crm-err" role="alert">
            <IconAlert aria-hidden="true" />
            <span>{current.error || t("failed")}</span>
          </div>
        ) : (
          <>
            {warnings.length || confirmRequired ? (
              <div className="crm-warnbox" role="alert">
                <b>
                  <IconAlert aria-hidden="true" />
                  {confirmRequired ? t("confirmRequired") : t("warnings")}
                </b>
                {warnings.map((w, i) => (
                  <span key={i}>{w}</span>
                ))}
              </div>
            ) : null}
            {conf !== null ? (
              <div className="crm-meter" title={t("confidence")}>
                {t("confidence")}
                <span>
                  <i style={{ width: `${conf}%` }} />
                </span>
                {Math.round(conf)}%
              </div>
            ) : null}
            {dupP !== null ? (
              <div className="crm-meter" title={t("dupProb")}>
                {t("dupProb")}
                <span>
                  <i style={{ width: `${dupP}%`, background: dupP > 60 ? "var(--crm-warn)" : undefined }} />
                </span>
                {Math.round(dupP)}%
              </div>
            ) : null}
            {cards.length ? (
              cards.map((c) => {
                const on = selected.includes(c.path);
                const id = `crm-ai-${c.path}`;
                return (
                  <div key={c.path} className="crm-sugg" data-on={on || undefined}>
                    <div className="crm-sugg__h">
                      <CheckBox id={id} checked={on} onChange={() => toggle(c.path)} disabled={!c.applicable}>
                        {t.has(pathKey(c.path)) ? t(pathKey(c.path)) : c.path}
                      </CheckBox>
                      {!c.applicable ? <small>{t("copyOnly")}</small> : null}
                    </div>
                    {c.kind === "chips" ? (
                      <div>
                        {asArr(c.value).map((x, i) => (
                          <span key={i} className="crm-flag">
                            {textOf(x)}
                          </span>
                        ))}
                      </div>
                    ) : c.kind === "list" ? (
                      <ul>
                        {asArr(c.value).map((x, i) => (
                          <li key={i}>{textOf(x)}</li>
                        ))}
                      </ul>
                    ) : c.kind === "candidates" ? (
                      <div className="crm-cands">
                        {asArr(c.value).map((x, i) => {
                          const d = asDict(x);
                          const score = pct(d.score ?? d.confidence ?? d.match);
                          return (
                            <div key={i} className="crm-cand">
                              <b>{asStr(d.title ?? d.name ?? d.service_title) || textOf(x)}</b>
                              {asStr(d.reason) ? <small>{asStr(d.reason)}</small> : null}
                              {score !== null ? <small>{Math.round(score)}%</small> : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : c.path === "urgency" ? (
                      <CrmSelect value={valueOf(c)} onChange={(v) => setEdits((cur) => ({ ...cur, [c.path]: v }))} label={t(pathKey("urgency"))} options={URGENCIES.map((u) => ({ value: u, label: tu(`urg.${u}`) }))} />
                    ) : c.path === "category" || c.path === "subcategory" ? (
                      <input className="crm-input" value={valueOf(c)} onChange={(e) => setEdits((cur) => ({ ...cur, [c.path]: e.target.value }))} aria-label={t.has(pathKey(c.path)) ? t(pathKey(c.path)) : c.path} maxLength={120} />
                    ) : c.kind === "next" ? (
                      <CrmDateTime value={edits[c.path] ?? toLocal(String(c.value))} onChange={(v) => setEdits((cur) => ({ ...cur, [c.path]: v }))} label={t(pathKey("next_action.at"))} />
                    ) : (
                      <>
                        <textarea className="crm-textarea" value={valueOf(c)} onChange={(e) => setEdits((cur) => ({ ...cur, [c.path]: e.target.value }))} aria-label={t.has(pathKey(c.path)) ? t(pathKey(c.path)) : c.path} style={{ minHeight: c.kind === "draft" ? 110 : 60 }} />
                        {c.kind === "draft" ? (
                          <button type="button" className="crm-btn crm-btn--sm" style={{ justifySelf: "start" }} onClick={() => copyText(valueOf(c), t("copied"))}>
                            <IconCopy aria-hidden="true" />
                            {t("copy")}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="crm-sub">{t("noCards")}</p>
            )}
          </>
        )}
      </div>

      {selected.length ? (
        <div className="crm-applybar">
          <span className="crm-muted" style={{ fontSize: ".78rem" }}>
            {t("selectedN", { n: selected.length })}
          </span>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => setPreview(true)}>
            {t("apply", { n: selected.length })}
          </button>
        </div>
      ) : null}

      {runs && runs.length ? (
        <>
          <p className="crm-sub" style={{ padding: "0 14px" }}>
            {t("history")}
          </p>
          <ul className="crm-runs">
            {runs.slice(0, 8).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  data-s={r.status}
                  aria-current={r.id === current?.id || undefined}
                  onClick={() => {
                    setCurrent(r);
                    setSelected([]);
                    setEdits({});
                  }}
                >
                  <i aria-hidden="true" />
                  {t.has(`type.${r.runType}`) ? t(`type.${r.runType}`) : r.runType}
                  <time>{r.createdAt ? timeOnly(r.createdAt, locale) : ""}</time>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {preview && current ? (
        <Modal
          open
          onClose={() => !applying && setPreview(false)}
          title={t("previewTitle")}
          description={t("previewLead")}
          busy={applying}
          footer={
            <>
              <button type="button" className="crm-btn" onClick={() => setPreview(false)} disabled={applying}>
                {t("back")}
              </button>
              <button type="button" className="crm-btn crm-btn--pri" onClick={() => void apply()} disabled={applying} aria-busy={applying || undefined}>
                {t("apply", { n: selected.length })}
              </button>
            </>
          }
        >
          <div className="crm-pop crm-diff">
            {selected.map((p) => {
              const c = cards.find((x) => x.path === p);
              const after = c ? (c.kind === "next" ? edits[p] ?? toLocal(String(c.value)) : valueOf(c)) : "";
              return (
                <div key={p} className="crm-diff__row">
                  <b>{t.has(pathKey(p)) ? t(pathKey(p)) : p}</b>
                  <div className="crm-diff__pair">
                    <span>{before(p) || "—"}</span>
                    <IconArrowRight aria-hidden="true" />
                    <span>{after || "—"}</span>
                  </div>
                </div>
              );
            })}
            <p className="crm-sub">{t("previewNote", { meta: meta.scope })}</p>
          </div>
        </Modal>
      ) : null}
    </aside>
  );
}

function toLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
