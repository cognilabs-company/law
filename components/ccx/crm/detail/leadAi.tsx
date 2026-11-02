"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shortDateTime, timeOnly } from "@/lib/date";
import { asArr, asDict, asStr, isAborted, logApiError } from "@/lib/http";
import { humanize } from "@/lib/labels";
import { toast } from "@/lib/toast";
import { AI_LANGUAGES, AI_RUN_TYPES, aiCardsOf, aiRunDone, applyAiRun, crmCode, getAiRun, listAiRuns, startAiRun, type AiCard, type CrmAiRun, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import Sheet from "../../panel/Sheet";
import { Note, PanelFoot } from "../../panel/bits";
import { CopyButton } from "../../now/NowFocus";
import { IcArrowRight, IcShield } from "../../icons";
import { isoToLocal, pathKey, pct, textOf } from "./aiText";
import { IcAlert, IcSend, IcSpark } from "./glyphs";
import { Check, DateTimeInput, SelectInput, SheetHead, Shim, TextArea, TextInput } from "./kit";
import type { LeadWrite } from "./types";
import { useCategoryName, useCrmErr, useStatusName } from "../leads/util";

const POLL = [1200, 2000, 3000, 4000, 6000];
const URGENCIES = ["low", "normal", "high", "urgent"];

export function AiSheet({ meta, lead, write, refreshKey, onSmsDraft, onClose }: { meta: CrmMeta; lead: CrmLead; write: LeadWrite; refreshKey: number; onSmsDraft: (text: string) => void; onClose: () => void }) {
  const t = useTranslations("crm.ai");
  const tu = useTranslations("crm.newLead");
  const tlang = useTranslations("admin.ccx.crm.lang");
  const tp = useTranslations("admin.ccx.panel");
  const locale = useLocale();
  const crmErr = useCrmErr();
  const tx = useTranslations("admin.ccx.crmDetail");
  const categoryName = useCategoryName();
  const statusName = useStatusName();
  const flagName = (v: string) => (/^[a-z0-9]+(_[a-z0-9]+)*$/.test(v) ? (tx.has(`flag.${v}`) ? tx(`flag.${v}`) : humanize(v)) : v);
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
  const leadId = lead.id;

  const loadRuns = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const list = await listAiRuns(leadId, signal);
        setRuns(list);
        setCurrent((cur) => (cur ? (list.find((r) => r.id === cur.id) ?? cur) : (list[0] ?? null)));
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.ai.runs", e);
        setRuns((cur) => cur ?? []);
      }
    },
    [leadId],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void loadRuns(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [loadRuns, refreshKey]);

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
      const r = await startAiRun(leadId, runType, language, instruction);
      setCurrent(r);
      setRuns((cur) => [r, ...(cur ?? []).filter((x) => x.id !== r.id)]);
      setSelected([]);
      setEdits({});
    } catch (e) {
      if (crmCode(e) === "crm_ai_run_active") {
        toast(t("active"), { tone: "info" });
        const activeId = asStr(asDict((e as { data?: Record<string, unknown> }).data?.detail).run_id);
        if (activeId) {
          try {
            const r = await getAiRun(activeId);
            setCurrent(r);
            setRuns((cur) => [r, ...(cur ?? []).filter((x) => x.id !== r.id)]);
          } catch (err) {
            logApiError("crm.ai.active", err);
            void loadRuns();
          }
        } else void loadRuns();
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
  const setEdit = (path: string, v: string) => setEdits((cur) => ({ ...cur, [path]: v }));
  const pathLabel = (p: string) => (t.has(pathKey(p)) ? t(pathKey(p)) : t("path.other"));

  const apply = async () => {
    if (!current || applying || !selected.length) return;
    setApplying(true);
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
  const dirty = selected.length > 0 || Object.keys(edits).length > 0;

  return (
    <Sheet label={t("title")} head={<SheetHead icon={<IcSpark size={20} />} title={t("title")} sub={lead.workId} />} onClose={onClose} dirty={dirty && !applying} wide>
      {preview && current ? (
        <>
          <div className="opx-pscroll">
            <b className="opx-cd-cap">{t("previewTitle")}</b>
            <Note tone="info">{t("previewLead")}</Note>
            <ul className="opx-cd-diff">
              {selected.map((p) => {
                const c = cards.find((x) => x.path === p);
                const after = c ? (c.kind === "next" ? (edits[p] ?? isoToLocal(String(c.value))) : valueOf(c)) : "";
                return (
                  <li key={p}>
                    <small>{t.has(pathKey(p)) ? t(pathKey(p)) : p}</small>
                    <del>{before(p) || "—"}</del>
                    <IcArrowRight size={16} />
                    <ins>{after || "—"}</ins>
                  </li>
                );
              })}
            </ul>
            <p className="opx-cd-sub">{t("previewNote", { meta: meta.scope })}</p>
          </div>
          <PanelFoot onCancel={() => setPreview(false)} cancelLabel={t("back")} primary={() => void apply()} primaryLabel={t("apply", { n: selected.length })} busy={applying} />
        </>
      ) : (
        <>
          <div className="opx-pscroll">
            <div className="opx-cd-ai__ask">
              <div className="opx-cd-chips" role="group" aria-label={t("runType")}>
                {AI_RUN_TYPES.map((k) => (
                  <button key={k} type="button" className="opx-cd-chip" aria-pressed={runType === k} onClick={() => setRunType(k)}>
                    {t(`type.${k}`)}
                  </button>
                ))}
              </div>
              <div className="opx-cd-ai__row">
                <SelectInput label={t("language")} value={language} onChange={setLanguage} options={AI_LANGUAGES.map((l) => ({ value: l, label: tlang(l) }))} />
                <TextInput label={t("instruction")} value={instruction} onChange={setInstruction} max={1000} />
                <button type="button" className="opx-pbtn opx-pbtn--main" onClick={() => void run()} disabled={starting || thinking} aria-busy={starting || undefined}>
                  <IcSpark size={16} />
                  {thinking ? t("running") : t("run")}
                </button>
              </div>
            </div>
            <p className="opx-cd-trust">
              <IcShield size={16} />
              <span>{t("trust")}</span>
            </p>
            <div className="opx-cd-ai__body" aria-live="polite">
              {runs === null ? (
                <Shim h={120} />
              ) : !current ? (
                <p className="opx-cd-sub">{t("emptyText")}</p>
              ) : thinking ? (
                <div className="opx-cd-ai__wait" role="status">
                  <p className="opx-cd-think">
                    <i aria-hidden="true" />
                    {current.status === "queued" ? t("queued") : t("thinking")}
                  </p>
                  <Shim h={70} />
                  <Shim h={110} />
                </div>
              ) : current.status === "failed" ? (
                <Note tone="bad">{current.error || t("failed")}</Note>
              ) : (
                <>
                  {warnings.length || confirmRequired ? (
                    <div className="opx-cd-warnbox" role="alert">
                      <b>
                        <IcAlert size={16} />
                        {confirmRequired ? t("confirmRequired") : t("warnings")}
                      </b>
                      {warnings.map((w, i) => (
                        <span key={i}>{w}</span>
                      ))}
                    </div>
                  ) : null}
                  {conf !== null || dupP !== null ? (
                    <div className="opx-cd-meters">
                      {conf !== null ? (
                        <div className="opx-cd-meter">
                          <span>{t("confidence")}</span>
                          <span className="opx-cd-meter__bar">
                            <i style={{ width: `${conf}%` }} />
                          </span>
                          <b className="opx-num">{Math.round(conf)}%</b>
                        </div>
                      ) : null}
                      {dupP !== null ? (
                        <div className="opx-cd-meter" data-hot={dupP > 60 || undefined}>
                          <span>{t("dupProb")}</span>
                          <span className="opx-cd-meter__bar">
                            <i style={{ width: `${dupP}%` }} />
                          </span>
                          <b className="opx-num">{Math.round(dupP)}%</b>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {cards.length ? (
                    <div className="opx-cd-sugs">
                      {cards.map((c) => {
                        const on = selected.includes(c.path);
                        return (
                          <div key={c.path} className="opx-cd-sug" data-on={on || undefined}>
                            <div className="opx-cd-sug__h">
                              <Check checked={on} onChange={() => toggle(c.path)} disabled={!c.applicable}>
                                {pathLabel(c.path)}
                              </Check>
                              {!c.applicable ? <small>{t("copyOnly")}</small> : null}
                            </div>
                            {c.kind === "chips" ? (
                              <div className="opx-cd-sug__chips">
                                {asArr(c.value).map((x, i) => (
                                  <span key={i}>{flagName(textOf(x))}</span>
                                ))}
                              </div>
                            ) : c.kind === "list" ? (
                              <ul className="opx-cd-sug__list">
                                {asArr(c.value).map((x, i) => (
                                  <li key={i}>{textOf(x)}</li>
                                ))}
                              </ul>
                            ) : c.kind === "candidates" ? (
                              <div className="opx-cd-cands">
                                {asArr(c.value).map((x, i) => {
                                  const d = asDict(x);
                                  const score = pct(d.score ?? d.confidence ?? d.match);
                                  return (
                                    <div key={i} className="opx-cd-cand">
                                      <b>{asStr(d.title ?? d.name ?? d.service_title) || textOf(x)}</b>
                                      {asStr(d.reason) ? <small>{asStr(d.reason)}</small> : null}
                                      {score !== null ? <small className="opx-num">{Math.round(score)}%</small> : null}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : c.path === "detected_language" || c.path === "suggested_status" ? (
                              <p className="opx-cd-sug__val">{c.path === "suggested_status" ? statusName(String(c.value)) : tlang.has(String(c.value)) ? tlang(String(c.value)) : String(c.value)}</p>
                            ) : c.path === "urgency" ? (
                              <SelectInput label={pathLabel("urgency")} value={valueOf(c)} onChange={(v) => setEdit(c.path, v)} options={(URGENCIES.includes(valueOf(c)) ? URGENCIES : [valueOf(c), ...URGENCIES]).map((u) => ({ value: u, label: tu.has(`urg.${u}`) ? tu(`urg.${u}`) : u }))} />
                            ) : c.path === "category" || c.path === "subcategory" ? (
                              <TextInput label={pathLabel(c.path)} value={valueOf(c)} onChange={(v) => setEdit(c.path, v)} max={120} hint={c.path === "category" && categoryName(valueOf(c)) !== valueOf(c) ? categoryName(valueOf(c)) : undefined} />
                            ) : c.kind === "next" ? (
                              <DateTimeInput label={pathLabel("next_action.at")} value={edits[c.path] ?? isoToLocal(String(c.value))} onChange={(v) => setEdit(c.path, v)} />
                            ) : (
                              <>
                                <TextArea label={pathLabel(c.path)} value={valueOf(c)} onChange={(v) => setEdit(c.path, v)} rows={c.kind === "draft" ? 5 : 3} />
                                {c.kind === "draft" ? (
                                  <span className="opx-cd-sug__acts">
                                    <CopyButton value={valueOf(c)} label={pathLabel(c.path)} />
                                    {c.path === "sms_draft" ? (
                                      <button type="button" className="opx-pbtn opx-cd-btn-sm" onClick={() => onSmsDraft(valueOf(c))}>
                                        <IcSend size={15} />
                                        {t("toSms")}
                                      </button>
                                    ) : null}
                                  </span>
                                ) : null}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="opx-cd-sub">{t("noCards")}</p>
                  )}
                </>
              )}
            </div>
            {runs && runs.length ? (
              <div className="opx-cd-runs">
                <b className="opx-cd-cap">{t("history")}</b>
                <ul>
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
                        {t.has(`type.${r.runType}`) ? t(`type.${r.runType}`) : t("type.other")}
                        <time className="opx-num">{r.createdAt ? timeOnly(r.createdAt, locale) : ""}</time>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <PanelFoot onCancel={onClose} cancelLabel={tp("close")} primary={selected.length ? () => setPreview(true) : undefined} primaryLabel={t("apply", { n: selected.length })} kbd={selected.length > 0} extra={selected.length ? <span className="opx-cd-sub">{t("selectedN", { n: selected.length })}</span> : null} />
        </>
      )}
    </Sheet>
  );
}
