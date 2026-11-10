"use client";

import { useMemo, useRef, useState, type DragEvent, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, CalendarClock, CircleAlert, Eye, FilePen, Filter, GitBranch, GripVertical, Hourglass, ListOrdered, OctagonX, Plug, Plus, Rocket, Save, Search, Settings2, Timer, Trash2, X, Zap } from "lucide-react";
import { notify, toast } from "@/lib/toast";
import { isAborted, logApiError } from "@/lib/http";
import { CONDITION_FIELDS, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import {
  condCount,
  createAutomationRuleX,
  emptyGroup,
  getAutomationRule,
  humanKey,
  isRuleConflict,
  nodeId,
  previewAutomationRule,
  ruleBody,
  updateAutomationRuleX,
  type AutomationCatalog,
  type AutomationRule,
  type CatalogAction,
  type CatalogField,
  type CondGroup,
  type CondLeaf,
  type CondNode,
  type RuleActionX,
  type RuleDraft,
  type RulePreview,
} from "@/lib/services/crmAutomation";
import Modal from "@/components/admin/Modal";
import { useCrmError, useStatusLabel } from "../bits";
import { CrmSelect } from "../fields";
import { ApprovalBadge, FieldInput, GroupIcon, LeadPicker, TagsInput, actionLabel, actionOf, optLabel, triggerLabel, useCatalogText } from "./shared";

// The robot form, in the order the contract sets (§16): 1 name and
// description → 2 trigger → 3 delay → 4 conditions → 5 ordered actions →
// 6 execution mode → 7 stop policy / schedule → 8 preview → 9 save as a
// draft or activate. Every option comes from the catalog. Activating is
// offered once the current form has been previewed.

// The contract's twelve operators, used only when the catalog sends none.
const OPS_FALLBACK = ["eq", "ne", "in", "not_in", "contains", "not_contains", "exists", "not_exists", "gt", "gte", "lt", "lte"];
const LIST_OPS = new Set(["in", "not_in"]);
const NO_VALUE = new Set(["exists", "not_exists"]);
const UNITS = [
  { key: "min", sec: 60 },
  { key: "hour", sec: 3600 },
  { key: "day", sec: 86400 },
] as const;

export function draftOf(rule: AutomationRule | null): RuleDraft {
  return rule
    ? { name: rule.name, description: rule.description, trigger: rule.trigger, delaySec: rule.delaySec, priority: rule.priority, executionMode: rule.executionMode, schedule: rule.schedule, stopPolicy: rule.stopPolicy, conditions: rule.conditions, actions: rule.actions }
    : { name: "", description: "", trigger: "", delaySec: 0, priority: 100, executionMode: "", schedule: {}, stopPolicy: {}, conditions: emptyGroup(), actions: [] };
}

export default function RobotBuilder({ catalog, meta, rule, onClose, onSaved }: { catalog: AutomationCatalog; meta: CrmMeta; rule: AutomationRule | null; onClose: () => void; onSaved: (r: AutomationRule) => void }): ReactElement {
  const t = useTranslations("rop.robots");
  const crmErr = useCrmError();
  const [base, setBase] = useState<AutomationRule | null>(rule);
  const [d, setD] = useState<RuleDraft>(() => draftOf(rule));
  const [busy, setBusy] = useState<"" | "draft" | "active" | "preview">("");
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [picking, setPicking] = useState(false);
  const [tried, setTried] = useState(false);
  // The step being edited (its card and rail circle light up) and the
  // furthest one reached (the rail fills up to it). Presentation only.
  const [active, setActive] = useState(1);
  const [reach, setReach] = useState(rule ? 9 : 1);
  const visit = (n: number) => {
    setActive(n);
    setReach((r) => Math.max(r, n));
  };
  const tx = useCatalogText();
  const set = (p: Partial<RuleDraft>) => setD((cur) => ({ ...cur, ...p }));
  const bodyKey = JSON.stringify(ruleBody(d));
  const previewFresh = !!preview && previewKey === bodyKey;

  const unit = UNITS.slice().reverse().find((u) => d.delaySec && d.delaySec % u.sec === 0) ?? UNITS[0];
  const [delayUnit, setDelayUnit] = useState<string>(unit.key);
  const unitSec = UNITS.find((u) => u.key === delayUnit)?.sec ?? 60;

  const missing = useMemo(() => {
    const out: string[] = [];
    if (d.name.trim().length < 2) out.push(t("needName"));
    if (!d.trigger) out.push(t("needTrigger"));
    if (!d.actions.length) out.push(t("needAction"));
    d.actions.forEach((a, i) => {
      const def = actionOf(catalog, a.type);
      for (const f of def?.fields ?? []) {
        const v = a.params[f.key];
        if (f.required && (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length))) out.push(t("needField", { n: i + 1, field: f.label || humanKey(f.key) }));
      }
    });
    return out;
  }, [d, catalog, t]);

  const runPreview = async () => {
    if (busy) return;
    setBusy("preview");
    try {
      const p = await previewAutomationRule(d, lead?.id ?? null);
      setPreview(p);
      setPreviewKey(bodyKey);
    } catch (e) {
      if (!isAborted(e)) {
        logApiError("crm.automation.preview", e);
        toast(crmErr(e), { tone: "err" });
      }
    } finally {
      setBusy("");
    }
  };

  const save = async (status: "draft" | "active") => {
    setTried(true);
    if (missing.length || busy) return;
    if (status === "active" && !previewFresh) {
      toast(t("previewFirst"), { tone: "info" });
      return;
    }
    setBusy(status);
    try {
      const saved = base?.id ? await updateAutomationRuleX(base, { ...d, status }) : await createAutomationRuleX(d, status);
      notify.success(status === "active" ? t("activated") : t("savedDraft"));
      onSaved(saved);
    } catch (e) {
      if (isRuleConflict(e) && base?.id) {
        // §16: someone saved this robot first — reload it and say so.
        try {
          const fresh = await getAutomationRule(base.id);
          setBase(fresh);
          setD(draftOf(fresh));
          setPreview(null);
        } catch (e2) {
          logApiError("crm.automation.reload", e2);
        }
        toast(t("conflict"), { tone: "info" });
      } else {
        logApiError("crm.automation.save", e);
        toast(crmErr(e), { tone: "err" });
      }
    } finally {
      setBusy("");
    }
  };

  const triggerDef = catalog.triggers.find((x) => x.key === d.trigger);
  const triggerGroups = new Map<string, string>(catalog.groups.map((g) => [g.value, optLabel(g)]));
  const nConds = condCount(d.conditions);
  // A step is done when what it asks for is there; the optional ones once passed.
  const done: Record<number, boolean> = {
    1: d.name.trim().length >= 2,
    2: !!d.trigger,
    3: !!d.delaySec || reach > 3,
    4: nConds > 0 || reach > 4,
    5: d.actions.length > 0,
    6: !!d.executionMode || reach > 6,
    7: reach > 7,
    8: previewFresh,
    9: false,
  };
  const stepProps = (n: number) => ({ n, active: active === n, done: done[n], fill: n < reach, onVisit: visit });

  return (
    <div className="rb" data-rop-builder="">
      <div className="rb-head">
        <button type="button" className="crm-btn" onClick={onClose}>
          <X aria-hidden="true" />
          {t("close")}
        </button>
        <div className="rb-head__t">
          <b>{base?.id ? t("editTitle") : t("newTitle")}</b>
          <small>{t("builderLead")}</small>
        </div>
      </div>

      <ol className="rb-steps">
        <Step {...stepProps(1)} Icon={FilePen} title={t("s.name")}>
          <div className="rop-form__two">
            <label className="rop-label">
              {t("name")}
              <input className="rop-input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder={t("namePh")} aria-invalid={tried && d.name.trim().length < 2 ? true : undefined} />
              <small>{t("help.name")}</small>
            </label>
            <label className="rop-label">
              {t("priority")}
              <input className="rop-input" inputMode="numeric" value={String(d.priority)} onChange={(e) => set({ priority: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
              <small>{t("help.priority")}</small>
            </label>
          </div>
          <label className="rop-label">
            {t("description")}
            <textarea className="rop-input" value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder={t("descriptionPh")} />
            <small>{t("help.description")}</small>
          </label>
        </Step>

        <Step {...stepProps(2)} Icon={Zap} title={t("s.trigger")} help={t("help.trigger")}>
          <CrmSelect
            value={d.trigger}
            onChange={(v) => set({ trigger: v })}
            label={t("trigger")}
            placeholder={t("pickTrigger")}
            search
            invalid={tried && !d.trigger}
            popClass="rb-menu"
            options={catalog.triggers.map((x) => ({ value: x.key, label: x.label || humanKey(x.key), group: x.group ? tx("group", x.group) || triggerGroups.get(x.group) || humanKey(x.group) : undefined, hint: x.description || undefined, icon: <GroupIcon group={x.group || x.key} /> }))}
          />
          {triggerDef?.description ? <p className="rb-desc">{triggerDef.description}</p> : null}
          {tried && !d.trigger ? <p className="rb-err" role="alert">{t("needTrigger")}</p> : null}
        </Step>

        <Step {...stepProps(3)} Icon={Timer} title={t("s.delay")} help={t("help.delay")}>
          <div className="rb-delay">
            <input
              className="rop-input"
              inputMode="numeric"
              value={d.delaySec ? String(Math.round(d.delaySec / unitSec)) : ""}
              placeholder="0"
              onChange={(e) => set({ delaySec: (Number(e.target.value.replace(/\D/g, "")) || 0) * unitSec })}
              aria-label={t("delay")}
            />
            <CrmSelect value={delayUnit} onChange={(v) => { const sec = UNITS.find((u) => u.key === v)?.sec ?? 60; setDelayUnit(v); set({ delaySec: Math.round(d.delaySec / unitSec) * sec }); }} label={t("delayUnit")} options={UNITS.map((u) => ({ value: u.key, label: t(`unit.${u.key}`) }))} />
            <span className="rb-delay__sum" data-now={d.delaySec ? undefined : ""} aria-live="polite">
              <i aria-hidden="true">{d.delaySec ? <Hourglass /> : <Zap />}</i>
              <span>
                <b>{d.delaySec ? t("delayIs", { v: Math.round(d.delaySec / unitSec), u: t(`unit.${delayUnit}`) }) : t("noDelay")}</b>
                <small>{d.delaySec ? t("delaySumLater") : t("delaySumNow")}</small>
              </span>
            </span>
          </div>
        </Step>

        <Step {...stepProps(4)} Icon={Filter} title={t("s.conditions")} help={t("help.conditions")} aside={<span className="rop-pill rb-badge" data-zero={nConds ? undefined : ""}><Filter aria-hidden="true" />{t("condN", { n: nConds })}</span>}>
          <CondTree group={d.conditions} onChange={(g) => set({ conditions: g })} catalog={catalog} meta={meta} depth={0} />
        </Step>

        <Step {...stepProps(5)} Icon={ListOrdered} title={t("s.actions")} help={t("help.actions")} aside={<span className="rop-pill rb-badge" data-zero={d.actions.length ? undefined : ""}><ListOrdered aria-hidden="true" />{t("actionN", { n: d.actions.length })}</span>}>
          <ActionList actions={d.actions} onChange={(a) => set({ actions: a })} catalog={catalog} meta={meta} />
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => setPicking(true)} data-rb-add="">
            <Plus aria-hidden="true" />
            {t("addAction")}
          </button>
          {tried && !d.actions.length ? <p className="rb-err" role="alert">{t("needAction")}</p> : null}
        </Step>

        <Step {...stepProps(6)} Icon={Settings2} title={t("s.mode")} help={t("help.mode")}>
          {catalog.executionModes.length ? (
            <div className="rb-modes" role="radiogroup" aria-label={t("s.mode")}>
              {catalog.executionModes.map((m) => (
                <button key={m.value} type="button" role="radio" aria-checked={(d.executionMode || catalog.executionModes[0].value) === m.value} className="rb-mode" onClick={() => set({ executionMode: m.value })}>
                  <b>{optLabel(m)}</b>
                  {m.description ? <small>{m.description}</small> : null}
                </button>
              ))}
            </div>
          ) : (
            <Empty Icon={Settings2} text={t("modeDefault")} />
          )}
        </Step>

        <Step {...stepProps(7)} Icon={CalendarClock} title={t("s.stop")} help={t("help.stop")}>
          {catalog.stopPolicyFields.length || catalog.scheduleFields.length ? (
            <div className="rb-fields">
              {catalog.stopPolicyFields.map((f) => (
                <FieldInput key={`sp-${f.key}`} field={f} value={d.stopPolicy[f.key]} onChange={(v) => set({ stopPolicy: { ...d.stopPolicy, [f.key]: v } })} meta={meta} idBase="rb-stop" />
              ))}
              {catalog.scheduleFields.map((f) => (
                <FieldInput key={`sc-${f.key}`} field={f} value={d.schedule[f.key]} onChange={(v) => set({ schedule: { ...d.schedule, [f.key]: v } })} meta={meta} idBase="rb-sched" />
              ))}
            </div>
          ) : (
            <Empty Icon={OctagonX} text={t("stopNone")} />
          )}
        </Step>

        <Step {...stepProps(8)} Icon={Eye} title={t("s.preview")} help={t("help.preview")}>
          <div className="rb-preview__bar">
            <div className="rb-preview__lead">
              <span className="rop-label">{t("previewLead")}</span>
              <LeadPicker value={lead} onChange={setLead} />
            </div>
            <button type="button" className="crm-btn" onClick={() => void runPreview()} disabled={!!busy || !d.trigger || !d.actions.length} aria-busy={busy === "preview" || undefined}>
              <Eye aria-hidden="true" />
              {busy === "preview" ? t("previewing") : t("preview")}
            </button>
          </div>
          {preview ? <PreviewView p={preview} stale={!previewFresh} /> : <Empty Icon={Eye} text={t("previewEmpty")} />}
        </Step>

        <Step {...stepProps(9)} Icon={Rocket} title={t("s.save")} help={t("help.save")}>
          {tried && missing.length ? (
            <ul className="rb-missing" role="alert">
              {missing.map((m) => (
                <li key={m}><CircleAlert aria-hidden="true" />{m}</li>
              ))}
            </ul>
          ) : null}
          {catalog.safetyRules.length ? (
            <details className="rb-safety">
              <summary>{t("safety")}</summary>
              <ul>{catalog.safetyRules.map((r) => <li key={r}>{r}</li>)}</ul>
            </details>
          ) : null}
          <div className="rb-save">
            <button type="button" className="crm-btn" onClick={() => void save("draft")} disabled={!!busy} aria-busy={busy === "draft" || undefined} data-rb-save="draft">
              <Save aria-hidden="true" />
              {t("saveDraft")}
            </button>
            <button type="button" className="crm-btn crm-btn--pri" onClick={() => void save("active")} disabled={!!busy} aria-busy={busy === "active" || undefined} data-rb-save="active" title={previewFresh ? undefined : t("previewFirst")}>
              <Rocket aria-hidden="true" />
              {t("activate")}
            </button>
            {!previewFresh ? <small className="rop-muted">{t("previewFirst")}</small> : null}
          </div>
        </Step>
      </ol>

      {picking ? (
        <ActionPicker
          catalog={catalog}
          onClose={() => setPicking(false)}
          onPick={(a) => {
            const params: Record<string, unknown> = {};
            for (const f of a.fields) if (f.defaultValue !== undefined && f.defaultValue !== null) params[f.key] = f.defaultValue;
            set({ actions: [...d.actions, { id: nodeId(), type: a.key, params }] });
            setPicking(false);
          }}
        />
      ) : null}
    </div>
  );
}

// A designed empty state: an icon and one line.
function Empty({ Icon, text }: { Icon: typeof Zap; text: string }): ReactElement {
  return (
    <p className="rb-empty">
      <span className="rb-empty__ic" aria-hidden="true"><Icon /></span>
      <span>{text}</span>
    </p>
  );
}

function Step({ n, Icon, title, help, aside, active, done, fill, onVisit, children }: { n: number; Icon: typeof Zap; title: string; help?: string; aside?: ReactNode; active: boolean; done: boolean; fill: boolean; onVisit: (n: number) => void; children: ReactNode }): ReactElement {
  return (
    <li className="rb-step" data-step={n} data-active={active || undefined} data-done={done || undefined} data-fill={fill || undefined} onFocus={() => onVisit(n)} onPointerDown={() => onVisit(n)}>
      <span className="rb-step__dot" aria-hidden="true">
        <Icon />
      </span>
      <section className="rb-step__card" aria-label={title}>
        <div className="rb-step__h">
          <h3>
            <span className="rb-step__n">{n}</span>
            {title}
          </h3>
          {aside}
        </div>
        {help ? <p className="rb-help">{help}</p> : null}
        {children}
      </section>
    </li>
  );
}

function PreviewView({ p, stale }: { p: RulePreview; stale: boolean }): ReactElement {
  const t = useTranslations("rop.robots");
  return (
    <div className={`rb-pv${stale ? " is-stale" : ""}`} data-rb-preview="">
      {stale ? <p className="rop-pill rop-pill--warn">{t("previewStale")}</p> : null}
      {p.summary ? <p className="rb-pv__sum">{p.summary}</p> : null}
      {p.steps.length ? (
        <ol className="rb-pv__steps">
          {p.steps.map((s, i) => <li key={`${i}${s}`}>{s}</li>)}
        </ol>
      ) : null}
      {p.matched !== null ? <span className={`rop-pill ${p.matched ? "rop-pill--ok" : "rop-pill--warn"}`}>{p.matched ? t("wouldMatch") : t("wouldNotMatch")}</span> : null}
      {p.trace.length ? (
        <ul className="rb-pv__trace">
          {p.trace.map((r, i) => (
            <li key={`${i}${r.label}`} data-ok={r.matched || undefined}>
              <b>{r.matched ? "✓" : "✕"}</b>
              <span>{r.label}</span>
              {r.detail ? <small>{r.detail}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {p.warnings.length ? (
        <ul className="rb-pv__warn">
          {p.warnings.map((w) => <li key={w}><CircleAlert aria-hidden="true" />{w}</li>)}
        </ul>
      ) : null}
      <small className="rop-muted">{p.writesPerformed ? t("writesYes") : t("writesNo")}</small>
    </div>
  );
}

// ── Conditions: an and/or tree (§16) ──
function CondTree({ group, onChange, catalog, meta, depth }: { group: CondGroup; onChange: (g: CondGroup) => void; catalog: AutomationCatalog; meta: CrmMeta; depth: number }): ReactElement {
  const t = useTranslations("rop.robots");
  const put = (i: number, n: CondNode | null) => onChange({ ...group, items: n ? group.items.map((x, j) => (j === i ? n : x)) : group.items.filter((_, j) => j !== i) });
  const fields = catalog.conditionFields.length ? catalog.conditionFields : CONDITION_FIELDS.map((k) => ({ key: k, label: "", type: "text", options: [] }));
  const firstField = fields[0]?.key ?? "";
  return (
    <div className={`rb-group${depth ? " rb-group--nested" : ""}`} data-op={group.op}>
      <div className="rb-group__h">
        <span className="rop-seg rb-seg" role="group" aria-label={t("logic")} data-op={group.op}>
          <button type="button" aria-pressed={group.op === "and"} onClick={() => onChange({ ...group, op: "and" })}>{t("and")}</button>
          <button type="button" aria-pressed={group.op === "or"} onClick={() => onChange({ ...group, op: "or" })}>{t("or")}</button>
        </span>
        <small className="rop-muted">{group.op === "and" ? t("andHint") : t("orHint")}</small>
      </div>
      {group.items.length ? (
        <ul className="rb-conds">
          {group.items.map((n, i) => (
            <li key={n.id}>
              {i ? <span className="rb-join" data-op={group.op}>{group.op === "and" ? t("and") : t("or")}</span> : null}
              {n.kind === "group" ? (
                <div className="rb-subgroup">
                  <CondTree group={n} onChange={(g) => put(i, g)} catalog={catalog} meta={meta} depth={depth + 1} />
                  <button type="button" className="crm-btn crm-btn--sm" onClick={() => put(i, null)}><Trash2 aria-hidden="true" />{t("removeGroup")}</button>
                </div>
              ) : (
                <CondRow c={n} fields={fields} catalog={catalog} meta={meta} onChange={(c) => put(i, c)} onRemove={() => put(i, null)} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty Icon={depth ? GitBranch : Filter} text={depth ? t("groupEmpty") : t("noConditions")} />
      )}
      <div className="rb-group__add">
        <button type="button" className="crm-btn crm-btn--sm" onClick={() => onChange({ ...group, items: [...group.items, { kind: "cond", id: nodeId(), field: firstField, operator: "eq", value: "" }] })}>
          <Plus aria-hidden="true" />
          {t("addCondition")}
        </button>
        {depth < 2 ? (
          <button type="button" className="crm-btn crm-btn--sm" title={t("help.group")} onClick={() => onChange({ ...group, items: [...group.items, emptyGroup(group.op === "and" ? "or" : "and")] })}>
            <GitBranch aria-hidden="true" />
            {t("addGroup")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CondRow({ c, fields, catalog, meta, onChange, onRemove }: { c: CondLeaf; fields: { key: string; label: string; type: string; options: { value: string; label: string; description: string }[] }[]; catalog: AutomationCatalog; meta: CrmMeta; onChange: (c: CondLeaf) => void; onRemove: () => void }): ReactElement {
  const t = useTranslations("rop.robots");
  const to = useTranslations("rop.robots.op");
  const ts = useStatusLabel();
  const tx = useCatalogText();
  const fieldName = (k: string, label: string) => tx("cond", k) || label || humanKey(k.replace(/^(lead|customer)\./, ""));
  const opName = (v: string, label: string) => (to.has(v) ? to(v) : label || humanKey(v));
  const ops = catalog.operators.length ? catalog.operators : OPS_FALLBACK.map((v) => ({ value: v, label: "", description: "" }));
  const field = fields.find((f) => f.key === c.field);
  const hint = [tx("condD", c.field), tx("opD", c.operator)].filter(Boolean).join(" ");
  const opts = field?.options.length ? field.options.map((o) => ({ ...o, label: tx("opt", o.value) || o.label })) : c.field === "lead.status" ? meta.statuses.map((s) => ({ value: s, label: ts(s), description: "" })) : [];
  const listy = LIST_OPS.has(c.operator);
  const val = c.value === undefined || c.value === null ? "" : c.value;
  return (
    <div className="rb-cond">
      <CrmSelect value={c.field} onChange={(v) => onChange({ ...c, field: v, value: "" })} label={t("field")} search options={fields.map((f) => ({ value: f.key, label: fieldName(f.key, f.label), group: f.key.startsWith("customer.") ? t("customerFields") : t("leadFields") }))} />
      <CrmSelect value={c.operator} onChange={(v) => onChange({ ...c, operator: v, value: LIST_OPS.has(v) ? (Array.isArray(val) ? val : val ? [String(val)] : []) : Array.isArray(val) ? (val[0] ?? "") : val })} label={t("operator")} options={ops.map((o) => ({ value: o.value, label: opName(o.value, o.label) }))} />
      {NO_VALUE.has(c.operator) ? (
        <span className="rop-muted rb-cond__nv">{t("noValueNeeded")}</span>
      ) : listy ? (
        <TagsInput value={Array.isArray(val) ? val.map(String) : val ? [String(val)] : []} onChange={(v) => onChange({ ...c, value: v })} options={opts.map((o) => ({ value: o.value, label: o.label || humanKey(o.value) }))} placeholder={t("addValue")} label={t("value")} />
      ) : opts.length ? (
        <CrmSelect value={String(val)} onChange={(v) => onChange({ ...c, value: v })} label={t("value")} options={opts.map((o) => ({ value: o.value, label: o.label || humanKey(o.value) }))} />
      ) : (
        <input className="rop-input" value={String(val)} onChange={(e) => onChange({ ...c, value: /^(gt|gte|lt|lte)$/.test(c.operator) && e.target.value !== "" && Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : e.target.value })} placeholder={t("value")} aria-label={t("value")} />
      )}
      <button type="button" className="crm-btn crm-btn--icon" onClick={onRemove} aria-label={t("removeCondition")}><Trash2 aria-hidden="true" /></button>
      {hint ? <small className="rb-cond__hint">{hint}</small> : null}
    </div>
  );
}

// ── Ordered actions: drag on a desktop, up/down by touch or keyboard ──
function ActionList({ actions, onChange, catalog, meta }: { actions: RuleActionX[]; onChange: (a: RuleActionX[]) => void; catalog: AutomationCatalog; meta: CrmMeta }): ReactElement {
  const t = useTranslations("rop.robots");
  const drag = useRef<string>("");
  const [over, setOver] = useState("");
  const move = (from: number, to: number) => {
    if (to < 0 || to >= actions.length || from === to) return;
    const next = actions.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };
  if (!actions.length) return <Empty Icon={ListOrdered} text={t("noActions")} />;
  return (
    <ol className="rb-actions">
      {actions.map((a, i) => {
        const def = actionOf(catalog, a.type);
        return (
          <li
            key={a.id}
            className={`rb-action${over === a.id ? " is-over" : ""}`}
            draggable
            onDragStart={(e: DragEvent) => {
              drag.current = a.id;
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(a.id);
            }}
            onDragLeave={() => setOver("")}
            onDrop={(e) => {
              e.preventDefault();
              setOver("");
              const from = actions.findIndex((x) => x.id === drag.current);
              if (from >= 0) move(from, i);
            }}
            data-rb-action={a.type}
          >
            <div className="rb-action__h">
              <span className="rb-action__grip" aria-hidden="true"><GripVertical /></span>
              <span className="rb-action__n">{i + 1}</span>
              <div className="rb-action__t">
                <b>{actionLabel(catalog, a.type)}</b>
                {def?.description ? <small>{def.description}</small> : null}
              </div>
              <div className="rb-action__badges">
                <ApprovalBadge action={def} />
                {def && !def.integrationAvailable ? (
                  <span className="rop-pill rop-pill--bad" title={t("integrationOffHint")}><Plug aria-hidden="true" />{t("integrationOff")}</span>
                ) : null}
              </div>
              <div className="rb-action__move">
                <button type="button" className="crm-btn crm-btn--icon" onClick={() => move(i, i - 1)} disabled={!i} aria-label={t("moveUp", { n: i + 1 })}><ArrowUp aria-hidden="true" /></button>
                <button type="button" className="crm-btn crm-btn--icon" onClick={() => move(i, i + 1)} disabled={i === actions.length - 1} aria-label={t("moveDown", { n: i + 1 })}><ArrowDown aria-hidden="true" /></button>
                <button type="button" className="crm-btn crm-btn--icon" onClick={() => onChange(actions.filter((x) => x.id !== a.id))} aria-label={t("removeAction", { n: i + 1 })}><Trash2 aria-hidden="true" /></button>
              </div>
            </div>
            {def?.approvalRequired ? <p className="rb-approval"><CircleAlert aria-hidden="true" />{t("approvalExplain")}</p> : null}
            {def?.fields.length ? (
              <div className="rb-fields">
                {def.fields.map((f: CatalogField) => (
                  <FieldInput key={f.key} field={f} value={a.params[f.key]} onChange={(v) => onChange(actions.map((x) => (x.id === a.id ? { ...x, params: { ...x.params, [f.key]: v } } : x)))} meta={meta} idBase={`rb-${a.id}`} />
                ))}
              </div>
            ) : (
              <p className="rop-muted">{def ? t("noFields") : t("unknownAction")}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// §17: the action groups, searchable, each with the backend's description.
function ActionPicker({ catalog, onClose, onPick }: { catalog: AutomationCatalog; onClose: () => void; onPick: (a: CatalogAction) => void }): ReactElement {
  const t = useTranslations("rop.robots");
  const [q, setQ] = useState("");
  const groupName = new Map<string, string>(catalog.groups.map((g) => [g.value, optLabel(g)]));
  const term = q.trim().toLowerCase();
  const hits = catalog.actions.filter((a) => !term || `${a.label} ${a.key} ${a.description} ${a.group}`.toLowerCase().includes(term));
  const groups = [...new Set(hits.map((a) => a.group || ""))];
  return (
    <Modal open onClose={onClose} title={t("pickAction")} wide>
      <div className="rb-picker">
        <label className="lx-search" style={{ width: "100%" }}>
          <Search aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchAction")} aria-label={t("searchAction")} autoFocus />
        </label>
        {hits.length ? (
          groups.map((g) => (
            <section key={g || "other"} className="rb-picker__g" aria-label={g ? groupName.get(g) || humanKey(g) : t("otherActions")}>
              <h4><GroupIcon group={g || "other"} />{g ? groupName.get(g) || humanKey(g) : t("otherActions")}</h4>
              <ul>
                {hits
                  .filter((a) => (a.group || "") === g)
                  .map((a) => (
                    <li key={a.key}>
                      <button type="button" className="rb-picker__it" onClick={() => onPick(a)} data-rb-pick={a.key}>
                        <span className="rb-picker__ic" aria-hidden="true"><GroupIcon group={a.group || a.key} /></span>
                        <span className="rb-picker__t">
                          <b>{a.label || humanKey(a.key)}</b>
                          {a.description ? <small>{a.description}</small> : null}
                        </span>
                        <span className="rb-action__badges">
                          <ApprovalBadge action={a} />
                          {!a.integrationAvailable ? <span className="rop-pill rop-pill--bad"><Plug aria-hidden="true" />{t("integrationOff")}</span> : null}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))
        ) : (
          <Empty Icon={Search} text={t("noActionMatch")} />
        )}
      </div>
    </Modal>
  );
}

export { triggerLabel };
