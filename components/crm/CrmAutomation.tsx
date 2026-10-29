"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import CheckBox from "@/components/CheckBox";
import { IconAlert, IconCheck, IconClose, IconEdit, IconPlay, IconPause, IconPlus, IconRefresh, IconSearch, IconSliders, IconSparkle } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError, type Dict } from "@/lib/http";
import { toast } from "@/lib/toast";
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_TRIGGERS,
  CONDITION_FIELDS,
  CONDITION_OPS,
  RULE_STATUSES,
  createAutomationRule,
  dryRunRule,
  listAutomationRules,
  listAutomationRuns,
  listCrmLeads,
  listCrmOperators,
  updateAutomationRule,
  type AutomationRule,
  type AutomationRun,
  type CrmLead,
  type CrmMeta,
  type CrmOperator,
  type DryRun,
  type RuleAction,
  type RuleCondition,
  type RuleInput,
} from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { Empty, StatusPill, useCrmError, useStatusLabel } from "./bits";
import { CrmSelect } from "./fields";
import { PayloadDetails, hasReadable } from "./DetailSections";

// Automation robots (contract 13cb257 §16, crm.automation.manage): a rule
// is a trigger, conditions built with our pickers ({field, operator,
// value} — never a JSON box) and actions; it starts as a draft. It can be
// activated only after a successful dry run on a real lead since its last
// change: the dry run shows, in plain words, what the rule saw and what it
// would do, and writes nothing. The run history shows status, attempts and
// times.
export default function CrmAutomation(): ReactElement {
  const t = useTranslations("crm");
  return (
    <CrmFrame section="automation" title={t("auto.title")}>
      {(api) => <Robots meta={api.meta} />}
    </CrmFrame>
  );
}

const URGENCIES = ["low", "normal", "high", "urgent"];
type Kind = "status" | "source" | "urgency" | "score" | "lifecycle" | "language" | "operator" | "number" | "text";
const KIND: Record<string, Kind> = {
  "lead.status": "status",
  "lead.source": "source",
  "lead.urgency": "urgency",
  "lead.score": "score",
  "lead.region": "text",
  "lead.assigned_operator_user_id": "operator",
  "lead.cycle_number": "number",
  "customer.lifecycle": "lifecycle",
  "customer.language": "language",
  "customer.region": "text",
};
const multi = (op: string) => op === "in" || op === "not_in";

// Words for a value of a field: status, source… by their names, an
// operator by name — never a key or an id.
function useValueWords(meta: CrmMeta, ops: CrmOperator[]) {
  const ts = useStatusLabel();
  const tsrc = useTranslations("crm.source");
  const tsc = useTranslations("crm.score");
  const tu = useTranslations("crm.lead.urg");
  const tl = useTranslations("crm.lang");
  const tlife = useTranslations("crm.customer.life");
  const options = (k: Kind): { value: string; label: string }[] => {
    if (k === "status") return meta.statuses.map((s) => ({ value: s, label: ts(s) }));
    if (k === "source") return meta.sources.map((s) => ({ value: s, label: tsrc.has(s) ? tsrc(s) : tsrc("other") }));
    if (k === "urgency") return URGENCIES.map((u) => ({ value: u, label: tu(u) }));
    if (k === "score") return meta.scores.map((s) => ({ value: s, label: tsc.has(s) ? tsc(s) : s }));
    if (k === "lifecycle") return (meta.lifecycles.length ? meta.lifecycles : ["prospect", "customer"]).map((l) => ({ value: l, label: tlife.has(l) ? tlife(l) : l }));
    if (k === "language") return meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }));
    if (k === "operator") return ops.map((o) => ({ value: o.id, label: o.name }));
    return [];
  };
  const word = (k: Kind, v: unknown): string => {
    const one = (x: unknown) => options(k).find((o) => o.value === String(x))?.label ?? (k === "operator" ? "" : String(x ?? ""));
    return Array.isArray(v) ? v.map(one).filter(Boolean).join(", ") : one(v);
  };
  return { options, word };
}

function Robots({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("crm.auto");
  const locale = useLocale();
  const crmErr = useCrmError();
  const [tab, setTab] = useState<"rules" | "runs">("rules");
  const [status, setStatus] = useState("");
  const [rules, setRules] = useState<AutomationRule[] | null>(null);
  const [err, setErr] = useState("");
  const [ops, setOps] = useState<CrmOperator[]>([]);
  const [edit, setEdit] = useState<AutomationRule | "new" | null>(null);
  const [dry, setDry] = useState<AutomationRule | null>(null);
  // A successful dry run per rule, for the version it ran on.
  const [tested, setTested] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const words = useValueWords(meta, ops);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setRules((await listAutomationRules(status, signal)).items);
        setErr("");
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.auto.rules", e);
        setErr(crmErr(e));
      }
    },
    [status, crmErr],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load]);
  useEffect(() => {
    const ctl = new AbortController();
    listCrmOperators("", ctl.signal).then(setOps, (e) => !isAborted(e) && logApiError("crm.operators", e));
    return () => ctl.abort();
  }, []);
  useCrmEvents((ev) => {
    if (ev.invalidate.includes("all") || ev.invalidate.includes("automation")) void load();
  });

  const setRuleStatus = async (r: AutomationRule, next: string) => {
    if (busy) return;
    if (next === "active" && tested[r.id] !== r.updatedAt) return;
    setBusy(r.id);
    try {
      const saved = await updateAutomationRule(r.id, { status: next });
      setRules((cur) => (cur ?? []).map((x) => (x.id === r.id ? { ...x, ...saved, id: r.id } : x)));
      toast(t(`now.${next}`), { tone: "ok" });
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <div className="crm-tabs" role="tablist" aria-label={t("tabs")}>
        {(["rules", "runs"] as const).map((k) => (
          <button key={k} type="button" role="tab" className="crm-tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`tab.${k}`)}
          </button>
        ))}
        {tab === "rules" ? (
          <button type="button" className="crm-btn crm-btn--pri" style={{ marginLeft: "auto" }} onClick={() => setEdit("new")}>
            <IconPlus aria-hidden="true" />
            {t("new")}
          </button>
        ) : null}
      </div>
      {tab === "runs" ? (
        <Runs rules={rules ?? []} />
      ) : (
        <>
          <div className="crm-filters">
            <span className="crm-seg" role="group" aria-label={t("filter")}>
              {["", ...RULE_STATUSES].map((s) => (
                <button key={s || "all"} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
                  {s ? t(`st.${s}`) : t("all")}
                </button>
              ))}
            </span>
            <span className="crm-hint">{t("lead")}</span>
          </div>
          {err && !rules ? (
            <div className="crm-card">
              <Empty
                icon={<IconAlert />}
                title={t("failed")}
                text={err}
                action={
                  <button type="button" className="crm-btn" onClick={() => void load()}>
                    <IconRefresh aria-hidden="true" />
                    {t("retry")}
                  </button>
                }
              />
            </div>
          ) : !rules ? (
            <>
              <span className="crm-sk crm-sk--block" style={{ height: 140 }} />
              <span className="crm-sk crm-sk--block" style={{ height: 140 }} />
            </>
          ) : !rules.length ? (
            <div className="crm-card">
              <Empty
                icon={<IconSliders />}
                title={status ? t("noneStatus") : t("none")}
                text={t("noneText")}
                action={
                  <button type="button" className="crm-btn crm-btn--pri" onClick={() => setEdit("new")}>
                    <IconPlus aria-hidden="true" />
                    {t("new")}
                  </button>
                }
              />
            </div>
          ) : (
            <ul className="crm-rules">
              {rules.map((r) => {
                const ok = tested[r.id] === r.updatedAt;
                return (
                  <li key={r.id} className="crm-rule" data-s={r.status}>
                    <div className="crm-rule__h">
                      <i aria-hidden="true">
                        <IconSliders />
                      </i>
                      <span>
                        <b>{r.name}</b>
                        <small>{[t(`trig.${AUTOMATION_TRIGGERS.includes(r.trigger as never) ? r.trigger : "other"}`), r.delaySec ? t("after", { n: Math.round(r.delaySec / 60) }) : "", r.updatedAt ? shortDateTime(r.updatedAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                      </span>
                      <em className="crm-rule__st" data-s={r.status}>
                        {t(`st.${RULE_STATUSES.includes(r.status as never) ? r.status : "draft"}`)}
                      </em>
                    </div>
                    <div className="crm-rule__body">
                      <p>
                        <b>{t("if")}</b> {r.conditions.length ? r.conditions.map((c) => condText(c)).join(t("and")) : t("always")}
                      </p>
                      <p>
                        <b>{t("then")}</b> {r.actions.map((a) => actionText(a)).join("; ") || t("noActions")}
                      </p>
                    </div>
                    <div className="crm-rule__acts">
                      <button type="button" className="crm-btn crm-btn--sm" onClick={() => setEdit(r)} disabled={busy === r.id}>
                        <IconEdit aria-hidden="true" />
                        {t("edit")}
                      </button>
                      <button type="button" className="crm-btn crm-btn--sm" onClick={() => setDry(r)} disabled={busy === r.id}>
                        <IconSparkle aria-hidden="true" />
                        {ok ? t("dryAgain") : t("dry")}
                      </button>
                      {r.status !== "active" ? (
                        <button type="button" className="crm-btn crm-btn--pri crm-btn--sm" onClick={() => void setRuleStatus(r, "active")} disabled={!ok || busy === r.id} aria-busy={busy === r.id || undefined} title={ok ? undefined : t("needDry")}>
                          <IconPlay aria-hidden="true" />
                          {t("activate")}
                        </button>
                      ) : (
                        <button type="button" className="crm-btn crm-btn--sm" onClick={() => void setRuleStatus(r, "paused")} disabled={busy === r.id} aria-busy={busy === r.id || undefined}>
                          <IconPause aria-hidden="true" />
                          {t("pause")}
                        </button>
                      )}
                      {r.status !== "active" && !ok ? <small className="crm-muted">{t("needDry")}</small> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {edit ? (
        <RuleEditor
          meta={meta}
          ops={ops}
          rule={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={(r) => {
            setRules((cur) => (edit === "new" ? [r, ...(cur ?? [])] : (cur ?? []).map((x) => (x.id === r.id ? r : x))));
            setEdit(null);
          }}
        />
      ) : null}
      {dry ? <DryRunDialog meta={meta} rule={dry} actionText={actionText} onClose={() => setDry(null)} onOk={() => setTested((cur) => ({ ...cur, [dry.id]: dry.updatedAt }))} /> : null}
    </>
  );

  function condText(c: RuleCondition): string {
    const field = t.has(`field.${c.field.replace(/\./g, "_")}`) ? t(`field.${c.field.replace(/\./g, "_")}`) : t("field.other");
    const op = t(`op.${CONDITION_OPS.includes(c.operator as never) ? c.operator : "eq"}`);
    if (c.operator === "exists") return `${field} ${c.value === false ? t("op.missing") : op}`;
    return `${field} ${op} ${words.word(KIND[c.field] ?? "text", c.value) || "—"}`;
  }
  function actionText(a: RuleAction): string {
    const name = t(`act.${AUTOMATION_ACTIONS.includes(a.type as never) ? a.type : "other"}`);
    const p = a.params;
    const extra =
      a.type === "change_status"
        ? words.word("status", p.status)
        : a.type === "assign_owner"
          ? words.word("operator", p.operator_user_id)
          : a.type === "add_tags"
            ? (Array.isArray(p.tags) ? p.tags : []).join(", ")
            : a.type === "create_task"
              ? String(p.title ?? "")
              : a.type === "send_sms"
                ? String(p.body ?? "")
                : a.type === "send_notification"
                  ? String(p.message ?? "")
                  : String(p.reason ?? "");
    return extra ? `${name}: «${extra}»` : name;
  }
}

// ── Rule editor ──
const blankAction = (type: string): RuleAction => ({
  type,
  params: type === "send_sms" ? { body: "", language: "uz_latn" } : type === "send_notification" ? { message: "", recipient: "assigned_operator" } : type === "create_task" ? { title: "", due_in_minutes: 60 } : type === "change_status" ? { status: "" } : type === "assign_owner" ? { operator_user_id: "" } : type === "add_tags" ? { tags: [] } : { reason: "" },
});
function RuleEditor({ meta, ops, rule, onClose, onSaved }: { meta: CrmMeta; ops: CrmOperator[]; rule: AutomationRule | null; onClose: () => void; onSaved: (r: AutomationRule) => void }): ReactElement {
  const t = useTranslations("crm.auto");
  const crmErr = useCrmError();
  const words = useValueWords(meta, ops);
  const actionTypes = meta.automationActions.length ? AUTOMATION_ACTIONS.filter((a) => meta.automationActions.includes(a)) : [...AUTOMATION_ACTIONS];
  const [name, setName] = useState(rule?.name ?? "");
  const [trigger, setTrigger] = useState(rule?.trigger ?? "lead_created");
  const [delayMin, setDelayMin] = useState(String(Math.round((rule?.delaySec ?? 0) / 60)));
  const [priority, setPriority] = useState(String(rule?.priority ?? 100));
  const [conds, setConds] = useState<RuleCondition[]>(rule?.conditions ?? []);
  const [acts, setActs] = useState<RuleAction[]>(rule?.actions.length ? rule.actions : [blankAction(actionTypes[0] ?? "send_notification")]);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [fieldErr, setFieldErr] = useState("");
  const actIssue = (a: RuleAction): boolean => {
    const p = a.params;
    if (a.type === "send_sms") return !String(p.body ?? "").trim();
    if (a.type === "send_notification") return !String(p.message ?? "").trim();
    if (a.type === "create_task") return !String(p.title ?? "").trim();
    if (a.type === "change_status") return !p.status;
    if (a.type === "assign_owner") return !p.operator_user_id;
    if (a.type === "add_tags") return !(Array.isArray(p.tags) && p.tags.length);
    return false;
  };
  const condIssue = (c: RuleCondition): boolean => c.operator !== "exists" && (multi(c.operator) ? !(Array.isArray(c.value) && c.value.length) : c.value === "" || c.value === null || c.value === undefined);
  const bad = name.trim().length < 2 || !acts.length || acts.some(actIssue) || conds.some(condIssue);
  const save = async () => {
    setTried(true);
    setFieldErr("");
    if (busy || bad) return;
    setBusy(true);
    const input: RuleInput = { name, trigger, delaySec: (Number(delayMin) || 0) * 60, priority: Number(priority) || 100, conditions: conds, actions: acts };
    try {
      const r = rule ? await updateAutomationRule(rule.id, input) : await createAutomationRule(input);
      toast(rule ? t("saved") : t("created"), { tone: "ok" });
      onSaved({ ...r, id: r.id || rule?.id || "" });
    } catch (e) {
      const field = String((e as { data?: Dict }).data?.detail && (e as { data: { detail: Dict } }).data.detail.field ? (e as { data: { detail: Dict } }).data.detail.field : "");
      setFieldErr(field);
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const setCond = (i: number, patch: Partial<RuleCondition>) => setConds((cur) => cur.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setAct = (i: number, patch: Partial<RuleAction>) => setActs((cur) => cur.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? t("editTitle") : t("newTitle")}
      description={t("editLead")}
      icon={<IconSliders />}
      size="lg"
      busy={busy}
      dirty
      footer={
        <>
          {tried && bad ? <small className="crm-bad" style={{ flex: "1 1 100%" }}>{t("fix")}</small> : null}
          <button type="button" className="crm-btn" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void save()} disabled={busy} aria-busy={busy || undefined}>
            <IconCheck aria-hidden="true" />
            {rule ? t("save") : t("createDraft")}
          </button>
        </>
      }
    >
      <div className="crm-pop crm-ruled">
        <label className="crm-field" data-err={tried && name.trim().length < 2 ? "" : undefined}>
          <span>{t("name")}</span>
          <input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} placeholder={t("namePh")} />
        </label>
        <div className="crm-row2">
          <div className="crm-field" data-err={fieldErr === "trigger_type" ? "" : undefined}>
            <span>{t("trigger")}</span>
            <CrmSelect value={trigger} onChange={setTrigger} label={t("trigger")} options={AUTOMATION_TRIGGERS.map((k) => ({ value: k, label: t(`trig.${k}`) }))} />
          </div>
          <div className="crm-row2">
            <label className="crm-field">
              <span>{t("delay")}</span>
              <input className="crm-input" inputMode="numeric" value={delayMin} onChange={(e) => setDelayMin(e.target.value.replace(/\D/g, "").slice(0, 5))} aria-describedby="crm-ruled-delay" />
              <small id="crm-ruled-delay">{t("delayHelp")}</small>
            </label>
            <label className="crm-field">
              <span>{t("priority")}</span>
              <input className="crm-input" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value.replace(/\D/g, "").slice(0, 4))} />
              <small>{t("priorityHelp")}</small>
            </label>
          </div>
        </div>

        <fieldset className="crm-ruled__sec" data-err={fieldErr === "conditions" ? "" : undefined}>
          <legend>{t("conditions")}</legend>
          {!conds.length ? <p className="crm-sub">{t("noConds")}</p> : null}
          {conds.map((c, i) => {
            const kind = KIND[c.field] ?? "text";
            const opts = words.options(kind);
            return (
              <div key={i} className="crm-cond" data-bad={tried && condIssue(c) ? "" : undefined}>
                <CrmSelect value={c.field} onChange={(v) => setCond(i, { field: v, value: multi(c.operator) ? [] : "" })} label={t("condField")} options={CONDITION_FIELDS.map((f) => ({ value: f, label: t(`field.${f.replace(/\./g, "_")}`) }))} />
                <CrmSelect value={c.operator} onChange={(v) => setCond(i, { operator: v, value: v === "exists" ? true : multi(v) ? [] : "" })} label={t("condOp")} options={CONDITION_OPS.map((o) => ({ value: o, label: t(`op.${o}`) }))} />
                {c.operator === "exists" ? (
                  <CheckBox checked={c.value !== false} onChange={(on) => setCond(i, { value: on })}>
                    {t("existsYes")}
                  </CheckBox>
                ) : multi(c.operator) && opts.length ? (
                  <span className="crm-chips" role="group" aria-label={t("condValue")}>
                    {opts.map((o) => {
                      const list = Array.isArray(c.value) ? (c.value as string[]) : [];
                      const on = list.includes(o.value);
                      return (
                        <button key={o.value} type="button" className="crm-chip" aria-pressed={on} onClick={() => setCond(i, { value: on ? list.filter((x) => x !== o.value) : [...list, o.value] })}>
                          {o.label}
                        </button>
                      );
                    })}
                  </span>
                ) : opts.length ? (
                  <CrmSelect value={String(c.value ?? "")} onChange={(v) => setCond(i, { value: v })} label={t("condValue")} options={opts} search={kind === "operator"} />
                ) : kind === "number" ? (
                  <input className="crm-input" inputMode="numeric" value={String(c.value ?? "")} onChange={(e) => setCond(i, { value: e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")) : "" })} aria-label={t("condValue")} />
                ) : (
                  <input
                    className="crm-input"
                    value={Array.isArray(c.value) ? (c.value as string[]).join(", ") : String(c.value ?? "")}
                    onChange={(e) =>
                      setCond(i, {
                        value: multi(c.operator)
                          ? e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean)
                          : e.target.value,
                      })
                    }
                    aria-label={t("condValue")}
                    placeholder={multi(c.operator) ? t("commaPh") : ""}
                  />
                )}
                <button type="button" className="crm-icobtn" onClick={() => setConds((cur) => cur.filter((_, j) => j !== i))} aria-label={t("removeCond")}>
                  <IconClose aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => setConds((cur) => [...cur, { field: "lead.status", operator: "eq", value: "" }])} style={{ justifySelf: "start" }}>
            <IconPlus aria-hidden="true" />
            {t("addCond")}
          </button>
        </fieldset>

        <fieldset className="crm-ruled__sec" data-err={fieldErr === "actions" ? "" : undefined}>
          <legend>{t("actions")}</legend>
          {acts.map((a, i) => (
            <div key={i} className="crm-act" data-bad={tried && actIssue(a) ? "" : undefined}>
              <div className="crm-act__h">
                <CrmSelect value={a.type} onChange={(v) => setAct(i, blankAction(v))} label={t("actType")} options={actionTypes.map((k) => ({ value: k, label: t(`act.${k}`) }))} />
                {acts.length > 1 ? (
                  <button type="button" className="crm-icobtn" onClick={() => setActs((cur) => cur.filter((_, j) => j !== i))} aria-label={t("removeAct")}>
                    <IconClose aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <ActionFields meta={meta} ops={ops} a={a} onChange={(params) => setAct(i, { params })} />
            </div>
          ))}
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => setActs((cur) => [...cur, blankAction(actionTypes[0] ?? "send_notification")])} style={{ justifySelf: "start" }}>
            <IconPlus aria-hidden="true" />
            {t("addAct")}
          </button>
          {acts.some((a) => a.type === "send_sms") ? <p className="crm-note crm-note--info">{t("smsApproval")}</p> : null}
        </fieldset>
      </div>
    </Modal>
  );
}

function ActionFields({ meta, ops, a, onChange }: { meta: CrmMeta; ops: CrmOperator[]; a: RuleAction; onChange: (p: Dict) => void }): ReactElement {
  const t = useTranslations("crm.auto");
  const tl = useTranslations("crm.lang");
  const ts = useStatusLabel();
  const p = a.params;
  const set = (patch: Dict) => onChange({ ...p, ...patch });
  if (a.type === "send_sms")
    return (
      <div className="crm-row2">
        <label className="crm-field">
          <span>{t("p.smsBody")}</span>
          <textarea className="crm-textarea" rows={2} value={String(p.body ?? "")} onChange={(e) => set({ body: e.target.value.slice(0, 1000) })} maxLength={1000} />
        </label>
        <div className="crm-field">
          <span>{t("p.language")}</span>
          <CrmSelect value={String(p.language ?? "uz_latn")} onChange={(v) => set({ language: v })} label={t("p.language")} options={meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }))} />
        </div>
      </div>
    );
  if (a.type === "send_notification")
    return (
      <div className="crm-row2">
        <label className="crm-field">
          <span>{t("p.message")}</span>
          <input className="crm-input" value={String(p.message ?? "")} onChange={(e) => set({ message: e.target.value })} maxLength={500} />
        </label>
        <div className="crm-field">
          <span>{t("p.recipient")}</span>
          <CrmSelect
            value={String(p.recipient_user_id ?? "") || "assigned_operator"}
            onChange={(v) => (v === "assigned_operator" ? onChange({ message: p.message, recipient: "assigned_operator" }) : onChange({ message: p.message, recipient_user_id: v }))}
            label={t("p.recipient")}
            options={[{ value: "assigned_operator", label: t("p.toOwner") }, ...ops.map((o) => ({ value: o.id, label: o.name }))]}
            search
          />
        </div>
      </div>
    );
  if (a.type === "create_task")
    return (
      <div className="crm-row2">
        <label className="crm-field">
          <span>{t("p.taskTitle")}</span>
          <input className="crm-input" value={String(p.title ?? "")} onChange={(e) => set({ title: e.target.value })} maxLength={255} />
        </label>
        <label className="crm-field">
          <span>{t("p.dueIn")}</span>
          <input className="crm-input" inputMode="numeric" value={String(p.due_in_minutes ?? "")} onChange={(e) => set({ due_in_minutes: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
        </label>
      </div>
    );
  if (a.type === "change_status")
    return (
      <div className="crm-field">
        <span>{t("p.status")}</span>
        <CrmSelect value={String(p.status ?? "")} onChange={(v) => set({ status: v })} label={t("p.status")} options={meta.statuses.filter((s) => s !== "won").map((s) => ({ value: s, label: ts(s) }))} />
        <small>{t("p.statusHelp")}</small>
      </div>
    );
  if (a.type === "assign_owner")
    return (
      <div className="crm-field">
        <span>{t("p.owner")}</span>
        <CrmSelect value={String(p.operator_user_id ?? "")} onChange={(v) => set({ operator_user_id: v })} label={t("p.owner")} options={ops.map((o) => ({ value: o.id, label: o.name }))} search />
      </div>
    );
  if (a.type === "add_tags")
    return (
      <label className="crm-field">
        <span>{t("p.tags")}</span>
        <input
          className="crm-input"
          value={(Array.isArray(p.tags) ? (p.tags as string[]) : []).join(", ")}
          onChange={(e) =>
            set({
              tags: e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 20),
            })
          }
          placeholder={t("commaPh")}
        />
      </label>
    );
  return (
    <label className="crm-field">
      <span>{t("p.reason")}</span>
      <input className="crm-input" value={String(p.reason ?? "")} onChange={(e) => set({ reason: e.target.value })} maxLength={500} />
    </label>
  );
}

// ── Dry run: a real lead, no writes ──
function DryRunDialog({ meta, rule, actionText, onClose, onOk }: { meta: CrmMeta; rule: AutomationRule; actionText: (a: RuleAction) => string; onClose: () => void; onOk: () => void }): ReactElement {
  const t = useTranslations("crm.auto");
  const ts = useStatusLabel();
  const crmErr = useCrmError();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<CrmLead[] | null>(null);
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DryRun | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => {
      listCrmLeads({ q: q.trim(), limit: 8 }, ctl.signal).then(
        (p) => setFound(p.items),
        (e) => !isAborted(e) && logApiError("crm.auto.leads", e),
      );
    }, 250);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [q]);
  const run = async () => {
    if (!lead || busy) return;
    setBusy(true);
    setRes(null);
    try {
      const ctx: Dict = rule.trigger === "status_changed" ? { previous_status: from || null, status: to || null } : {};
      const r = await dryRunRule(rule.id, lead.id, ctx);
      setRes(r);
      if (!r.writesPerformed) onOk();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t("dryTitle", { name: rule.name })}
      description={t("dryLead")}
      icon={<IconSparkle />}
      size="lg"
      busy={busy}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            {res ? t("done") : t("cancel")}
          </button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void run()} disabled={!lead || busy} aria-busy={busy || undefined}>
            <IconPlay aria-hidden="true" />
            {t("dryRun")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <label className="crm-search">
          <IconSearch aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("findLead")} aria-label={t("findLead")} />
        </label>
        {found === null ? (
          <span className="crm-sk" />
        ) : found.length ? (
          <ul className="crm-pickleads" role="listbox" aria-label={t("pickLead")}>
            {found.map((l) => (
              <li key={l.id}>
                <button type="button" role="option" aria-selected={lead?.id === l.id} onClick={() => setLead(l)}>
                  <b>{l.title || l.workId}</b>
                  <small>{[l.workId, l.customer?.name].filter(Boolean).join(" · ")}</small>
                  <StatusPill status={l.status} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="crm-sub">{t("noLeads")}</p>
        )}
        {rule.trigger === "status_changed" ? (
          <div className="crm-row2">
            <div className="crm-field">
              <span>{t("ctxFrom")}</span>
              <CrmSelect value={from} onChange={setFrom} label={t("ctxFrom")} options={[{ value: "", label: t("any") }, ...meta.statuses.map((s) => ({ value: s, label: ts(s) }))]} />
            </div>
            <div className="crm-field">
              <span>{t("ctxTo")}</span>
              <CrmSelect value={to} onChange={setTo} label={t("ctxTo")} options={[{ value: "", label: t("any") }, ...meta.statuses.map((s) => ({ value: s, label: ts(s) }))]} />
            </div>
          </div>
        ) : null}
        {res ? (
          <div className="crm-dry" data-matched={res.matched || undefined} role="status">
            <b>
              {res.matched ? <IconCheck aria-hidden="true" /> : <IconAlert aria-hidden="true" />}
              {res.matched ? t("matched") : t("notMatched")}
            </b>
            {res.reason ? <p className="crm-sub">{res.reason}</p> : null}
            {res.actions.length ? (
              <>
                <small>{t("wouldDo")}</small>
                <ul>
                  {res.actions.map((a, i) => (
                    <li key={i}>{actionText(a)}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {hasReadable(res.context) ? (
              <>
                <small>{t("saw")}</small>
                <PayloadDetails payload={res.context} />
              </>
            ) : null}
            <p className="crm-note crm-note--info">{res.writesPerformed ? t("wrote") : t("noWrites")}</p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// ── Run history ──
function Runs({ rules }: { rules: AutomationRule[] }): ReactElement {
  const t = useTranslations("crm.auto");
  const locale = useLocale();
  const crmErr = useCrmError();
  const [status, setStatus] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [items, setItems] = useState<AutomationRun[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [more, setMore] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await listAutomationRuns({ status, ruleId, limit: 30 }, signal);
        setItems(r.items);
        setTotal(r.total);
        setErr("");
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.auto.runs", e);
        setErr(crmErr(e));
      }
    },
    [status, ruleId, crmErr],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load]);
  useCrmEvents((ev) => {
    if (ev.invalidate.includes("all") || ev.invalidate.includes("automation")) void load();
  });
  const next = async () => {
    if (!items || more) return;
    setMore(true);
    try {
      const r = await listAutomationRuns({ status, ruleId, limit: 30, offset: items.length });
      setItems([...items, ...r.items.filter((x) => !items.some((y) => y.id === x.id))]);
      setTotal(r.total);
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setMore(false);
    }
  };
  const ruleName = (r: AutomationRun) => r.ruleName || rules.find((x) => x.id === r.ruleId)?.name || t("someRule");
  return (
    <>
      <div className="crm-filters">
        <CrmSelect value={status} onChange={setStatus} label={t("runStatus")} options={[{ value: "", label: t("anyRunStatus") }, ...["scheduled", "running", "completed", "failed", "skipped", "cancelled"].map((s) => ({ value: s, label: t(`run.${s}`) }))]} />
        <CrmSelect value={ruleId} onChange={setRuleId} label={t("runRule")} options={[{ value: "", label: t("anyRule") }, ...rules.map((r) => ({ value: r.id, label: r.name }))]} search />
      </div>
      {err && !items ? (
        <div className="crm-card">
          <Empty
            icon={<IconAlert />}
            title={t("runsFailed")}
            text={err}
            action={
              <button type="button" className="crm-btn" onClick={() => void load()}>
                <IconRefresh aria-hidden="true" />
                {t("retry")}
              </button>
            }
          />
        </div>
      ) : !items ? (
        <span className="crm-sk crm-sk--block" style={{ height: 200 }} />
      ) : !items.length ? (
        <div className="crm-card">
          <Empty icon={<IconSliders />} title={t("noRuns")} text={t("noRunsText")} />
        </div>
      ) : (
        <>
          <ol className="crm-runlog">
            {items.map((r) => (
              <li key={r.id} data-s={r.status}>
                <span className="crm-runlog__h">
                  <b>{ruleName(r)}</b>
                  <em className="crm-rule__st" data-s={r.status}>
                    {t.has(`run.${r.status}`) ? t(`run.${r.status}`) : t("run.other")}
                  </em>
                </span>
                <small>
                  {[r.leadWorkId, t("attempts", { n: r.attempts }), r.scheduledAt ? t("scheduled", { at: shortDateTime(r.scheduledAt, locale) }) : "", r.startedAt ? t("started", { at: shortDateTime(r.startedAt, locale) }) : "", r.completedAt ? t("completed", { at: shortDateTime(r.completedAt, locale) }) : ""].filter(Boolean).join(" · ")}
                </small>
                {r.error ? <small className="crm-bad">{r.error}</small> : null}
                {hasReadable(r.result) || hasReadable(r.context) ? (
                  <details>
                    <summary>{t("details")}</summary>
                    {hasReadable(r.context) ? (
                      <>
                        <small className="crm-muted">{t("saw")}</small>
                        <PayloadDetails payload={r.context} />
                      </>
                    ) : null}
                    {hasReadable(r.result) ? (
                      <>
                        <small className="crm-muted">{t("result")}</small>
                        <PayloadDetails payload={r.result} />
                      </>
                    ) : null}
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
          {items.length < total ? (
            <button type="button" className="crm-btn" onClick={() => void next()} disabled={more} aria-busy={more || undefined} style={{ justifySelf: "center" }}>
              {t("more", { n: total - items.length })}
            </button>
          ) : null}
        </>
      )}
    </>
  );
}
