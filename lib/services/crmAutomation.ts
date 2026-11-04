// CRM robots (ROP CRM final contract 2026-11-04 §16–§19). Everything the
// builder offers — triggers, actions and their fields, condition operators,
// execution modes, statuses, integrations and safety rules — comes from
// GET /crm/automation/catalog. Production OpenAPI types these responses as
// free objects, so every reader below accepts the field names the contract
// uses and their common spellings, and never invents an option.

import { ApiError, asArr, asDict, asStr, http, type Dict } from "@/lib/http";
export type { Dict };

const enc = encodeURIComponent;
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const int = (v: unknown, d = 0): number => num(v) ?? d;
const qs = (q: Record<string, string | number | boolean | null | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const strs = (v: unknown): string[] => asArr(v).map((x) => (typeof x === "string" ? x : asStr(asDict(x).key ?? asDict(x).value ?? asDict(x).code))).filter(Boolean);
const list = (v: unknown, ...keys: string[]): unknown[] => {
  if (Array.isArray(v)) return v;
  const d = asDict(v);
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as unknown[];
  // A map keyed by the item's own key ({send_sms: {...}}).
  if (keys.length && Object.values(d).every((x) => x && typeof x === "object" && !Array.isArray(x))) return Object.entries(d).map(([k, x]) => ({ key: k, ...asDict(x) }));
  return [];
};

// ── Catalog ────────────────────────────────────────────────────────────

export type CatalogOption = { value: string; label: string; description: string };
export type CatalogField = {
  key: string;
  label: string;
  type: string; // text | textarea | number | integer | boolean | select | multiselect | datetime | duration | tags | operator | status | template | language | contact …
  required: boolean;
  options: CatalogOption[];
  defaultValue: unknown;
  description: string;
  placeholder: string;
  min: number | null;
  max: number | null;
  multiple: boolean;
};
export type CatalogTrigger = { key: string; label: string; description: string; group: string; contextFields: string[] };
export type CatalogAction = {
  key: string;
  label: string;
  description: string;
  group: string;
  risk: string; // low | medium | high
  integration: string;
  integrationAvailable: boolean;
  approvalRequired: boolean;
  clientFacing: boolean;
  fields: CatalogField[];
};
export type CatalogConditionField = { key: string; label: string; type: string; options: CatalogOption[] };
export type AutomationCatalog = {
  triggers: CatalogTrigger[];
  actions: CatalogAction[];
  operators: CatalogOption[];
  conditionFields: CatalogConditionField[];
  executionModes: CatalogOption[];
  statuses: CatalogOption[];
  integrations: Record<string, boolean>;
  safetyRules: string[];
  groups: CatalogOption[];
  // §16 step 7: the stop policy and schedule forms, when the catalog
  // describes them (field definitions like an action's).
  stopPolicyFields: CatalogField[];
  scheduleFields: CatalogField[];
};

const optionOf = (v: unknown): CatalogOption | null => {
  if (typeof v === "string" || typeof v === "number") return { value: String(v), label: "", description: "" };
  const d = asDict(v);
  const value = asStr(d.value ?? d.key ?? d.code ?? d.id ?? d.type);
  if (!value) return null;
  return { value, label: asStr(d.label ?? d.title ?? d.name), description: asStr(d.description ?? d.help) };
};
const options = (v: unknown): CatalogOption[] => list(v, "items", "options", "choices", "values").map(optionOf).filter((x): x is CatalogOption => !!x);

export function catalogFieldOf(v: unknown): CatalogField | null {
  const d = asDict(v);
  const key = asStr(d.key ?? d.name ?? d.field ?? d.path);
  if (!key) return null;
  const opts = options(d.options ?? d.choices ?? d.enum ?? d.values);
  const rawType = asStr(d.type ?? d.input ?? d.widget ?? d.kind).toLowerCase();
  const type = rawType || (opts.length ? "select" : "text");
  return {
    key,
    label: asStr(d.label ?? d.title),
    type,
    required: d.required === true,
    options: opts,
    defaultValue: d.default ?? d.default_value,
    description: asStr(d.description ?? d.help ?? d.hint),
    placeholder: asStr(d.placeholder ?? d.example),
    min: num(d.min ?? d.minimum),
    max: num(d.max ?? d.maximum),
    multiple: d.multiple === true || type === "multiselect" || type === "tags" || type === "list" || type === "array",
  };
}

export function automationCatalogOf(v: unknown): AutomationCatalog {
  const d = asDict(v);
  const integ = asDict(d.integrations ?? d.integration_availability);
  const integrations: Record<string, boolean> = {};
  for (const [k, x] of Object.entries(integ)) integrations[k] = typeof x === "boolean" ? x : asDict(x).available === true || asDict(x).enabled === true;
  for (const x of asArr(d.integrations)) {
    const r = asDict(x);
    const k = asStr(r.key ?? r.code);
    if (k) integrations[k] = r.available === true || r.enabled === true;
  }
  const triggers = list(d.triggers, "items")
    .map((x) => {
      const r = asDict(x);
      const key = asStr(r.key ?? r.type ?? r.trigger_type ?? r.code);
      return key ? { key, label: asStr(r.label ?? r.title ?? r.name), description: asStr(r.description), group: asStr(r.group ?? r.category), contextFields: strs(r.context_fields ?? r.context) } : null;
    })
    .filter((x): x is CatalogTrigger => !!x);
  const actions = list(d.actions, "items")
    .map((x) => {
      const r = asDict(x);
      const key = asStr(r.key ?? r.type ?? r.action_type ?? r.code);
      if (!key) return null;
      const integration = asStr(r.integration ?? r.integration_key ?? r.channel);
      const avail = r.integration_available ?? r.available;
      return {
        key,
        label: asStr(r.label ?? r.title ?? r.name),
        description: asStr(r.description),
        group: asStr(r.group ?? r.category),
        risk: asStr(r.risk ?? r.risk_level).toLowerCase(),
        integration,
        integrationAvailable: typeof avail === "boolean" ? avail : integration ? integrations[integration] !== false : true,
        approvalRequired: r.approval_required === true || r.requires_approval === true,
        clientFacing: r.client_facing === true,
        fields: list(r.fields ?? r.params ?? r.schema, "items", "fields")
          .map(catalogFieldOf)
          .filter((f): f is CatalogField => !!f),
      };
    })
    .filter((x): x is CatalogAction => !!x);
  const conditionFields = list(d.condition_fields ?? d.fields, "items")
    .map((x) => {
      if (typeof x === "string") return { key: x, label: "", type: "text", options: [] };
      const r = asDict(x);
      const key = asStr(r.key ?? r.field ?? r.path);
      return key ? { key, label: asStr(r.label ?? r.title), type: asStr(r.type) || "text", options: options(r.options ?? r.enum ?? r.values) } : null;
    })
    .filter((x): x is CatalogConditionField => !!x);
  return {
    triggers,
    actions,
    operators: options(d.condition_operators ?? d.operators),
    conditionFields,
    executionModes: options(d.execution_modes),
    statuses: options(d.statuses ?? d.rule_statuses),
    integrations,
    safetyRules: asArr(d.safety_rules ?? d.safety).map((x) => (typeof x === "string" ? x : asStr(asDict(x).text ?? asDict(x).description ?? asDict(x).title))).filter(Boolean),
    groups: options(d.action_groups ?? d.groups),
    stopPolicyFields: list(asDict(d.stop_policy).fields ?? d.stop_policy_fields ?? d.stop_policies, "items", "fields").map(catalogFieldOf).filter((f): f is CatalogField => !!f),
    scheduleFields: list(asDict(d.schedule).fields ?? d.schedule_fields, "items", "fields").map(catalogFieldOf).filter((f): f is CatalogField => !!f),
  };
}
export async function getAutomationCatalog(signal?: AbortSignal): Promise<AutomationCatalog> {
  return automationCatalogOf(await http("/crm/automation/catalog", { signal }));
}

// ── Smart scripts ──────────────────────────────────────────────────────

export type SmartScript = { key: string; title: string; description: string; trigger: string; actions: string[]; group: string };
export function smartScriptOf(v: unknown): SmartScript | null {
  const d = asDict(v);
  const key = asStr(d.key ?? d.script_key ?? d.template_key ?? d.code);
  if (!key) return null;
  return {
    key,
    title: asStr(d.title ?? d.name ?? d.label),
    description: asStr(d.description ?? d.summary),
    trigger: asStr(d.trigger_type ?? d.trigger),
    actions: asArr(d.actions).map((a) => (typeof a === "string" ? a : asStr(asDict(a).type ?? asDict(a).action_type))).filter(Boolean),
    group: asStr(d.group ?? d.category),
  };
}
export async function listSmartScripts(signal?: AbortSignal): Promise<SmartScript[]> {
  const d = await http("/crm/automation/smart-scripts", { signal });
  return list(d, "items", "scripts", "smart_scripts").map(smartScriptOf).filter((x): x is SmartScript => !!x);
}
export async function instantiateSmartScript(key: string, body: { name?: string; priority?: number; status?: string }): Promise<AutomationRule> {
  const d = asDict(await http(`/crm/automation/smart-scripts/${enc(key)}/instantiate`, { method: "POST", body: JSON.stringify({ name: body.name?.trim() || null, priority: body.priority ?? 100, status: body.status ?? "draft" }) }));
  return automationRuleOf(d.rule ?? d);
}

// ── Conditions ─────────────────────────────────────────────────────────

export type CondLeaf = { kind: "cond"; id: string; field: string; operator: string; value: unknown };
export type CondGroup = { kind: "group"; id: string; op: "and" | "or"; items: CondNode[] };
export type CondNode = CondLeaf | CondGroup;
let seq = 0;
export const nodeId = (): string => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
export const emptyGroup = (op: "and" | "or" = "and"): CondGroup => ({ kind: "group", id: nodeId(), op, items: [] });

// Reads the backend's conditions: a plain list (all must match) or a tree
// {operator|op|logic: and|or, conditions|rules|items|all|any: […]}.
export function condTreeOf(v: unknown): CondGroup {
  const read = (x: unknown): CondNode | null => {
    if (Array.isArray(x)) return { kind: "group", id: nodeId(), op: "and", items: x.map(read).filter((n): n is CondNode => !!n) };
    const d = asDict(x);
    if (Array.isArray(d.all) || Array.isArray(d.any)) {
      return { kind: "group", id: nodeId(), op: Array.isArray(d.any) ? "or" : "and", items: asArr(d.any ?? d.all).map(read).filter((n): n is CondNode => !!n) };
    }
    const kids = d.conditions ?? d.rules ?? d.items ?? d.children;
    const logic = asStr(d.logic ?? d.op ?? d.combinator ?? (Array.isArray(kids) ? d.operator : "")).toLowerCase();
    if (Array.isArray(kids)) return { kind: "group", id: nodeId(), op: logic === "or" ? "or" : "and", items: kids.map(read).filter((n): n is CondNode => !!n) };
    const field = asStr(d.field ?? d.path ?? d.key);
    if (!field) return null;
    return { kind: "cond", id: nodeId(), field, operator: asStr(d.operator ?? d.op) || "eq", value: d.value };
  };
  const root = read(v ?? []);
  if (!root) return emptyGroup();
  return root.kind === "group" ? root : { kind: "group", id: nodeId(), op: "and", items: [root] };
}
// What the backend gets: a flat list while everything is AND (the shape it
// has always accepted), the {operator, conditions} tree once OR or nesting
// is used (§16 "condition tree supports and and or").
export function condBody(g: CondGroup): unknown {
  const leaf = (c: CondLeaf) => ({ field: c.field, operator: c.operator, value: ["exists", "not_exists"].includes(c.operator) ? null : c.value });
  const flat = g.op === "and" && g.items.every((n) => n.kind === "cond");
  if (flat) return (g.items as CondLeaf[]).filter((c) => c.field).map(leaf);
  const tree = (n: CondNode): unknown => (n.kind === "cond" ? leaf(n) : { operator: n.op, conditions: n.items.filter((x) => x.kind === "group" || x.field).map(tree) });
  return tree(g);
}
export const condCount = (g: CondGroup): number => g.items.reduce((s, n) => s + (n.kind === "cond" ? 1 : condCount(n)), 0);

// ── Rules ──────────────────────────────────────────────────────────────

export type RuleActionX = { id: string; type: string; params: Dict };
export type AutomationRule = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  delaySec: number;
  priority: number;
  executionMode: string;
  schedule: Dict;
  stopPolicy: Dict;
  conditions: CondGroup;
  actions: RuleActionX[];
  status: string;
  lockVersion: number;
  templateKey: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string;
  runCount: number;
  failureCount: number;
};
export const ACTION_META_KEYS = ["type", "action", "action_type", "id", "index", "order", "position"];
export function ruleActionOf(v: unknown): RuleActionX | null {
  const d = asDict(v);
  const type = asStr(d.type ?? d.action ?? d.action_type);
  if (!type) return null;
  const params = Object.keys(asDict(d.params)).length ? asDict(d.params) : Object.fromEntries(Object.entries(d).filter(([k]) => !ACTION_META_KEYS.includes(k)));
  return { id: nodeId(), type, params };
}
export function automationRuleOf(v: unknown): AutomationRule {
  const d = asDict(v);
  const stats = asDict(d.stats);
  return {
    id: asStr(d.id),
    name: asStr(d.name),
    description: asStr(d.description),
    trigger: asStr(d.trigger_type ?? d.trigger),
    delaySec: int(d.delay_seconds),
    priority: int(d.priority, 100),
    executionMode: asStr(d.execution_mode),
    schedule: asDict(d.schedule),
    stopPolicy: asDict(d.stop_policy),
    conditions: condTreeOf(d.conditions),
    actions: asArr(d.actions)
      .map(ruleActionOf)
      .filter((a): a is RuleActionX => !!a),
    status: asStr(d.status) || "draft",
    lockVersion: int(d.lock_version),
    templateKey: asStr(d.template_key),
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
    lastRunAt: asStr(d.last_run_at ?? stats.last_run_at),
    runCount: int(d.run_count ?? stats.runs ?? stats.total),
    failureCount: int(d.failure_count ?? stats.failed),
  };
}
export type RuleDraft = {
  name: string;
  description: string;
  trigger: string;
  delaySec: number;
  priority: number;
  executionMode: string;
  schedule: Dict;
  stopPolicy: Dict;
  conditions: CondGroup;
  actions: RuleActionX[];
};
export const actionBody = (a: RuleActionX): Dict => ({ type: a.type, ...a.params });
export function ruleBody(r: RuleDraft): Dict {
  const b: Dict = {
    name: r.name.trim(),
    description: r.description.trim(),
    trigger_type: r.trigger,
    delay_seconds: Math.max(0, Math.round(r.delaySec)),
    priority: Math.round(r.priority),
    conditions: condBody(r.conditions),
    actions: r.actions.map(actionBody),
    schedule: r.schedule,
    stop_policy: r.stopPolicy,
  };
  if (r.executionMode) b.execution_mode = r.executionMode;
  return b;
}
export async function listAutomationRulesX(q: { status?: string; trigger?: string; q?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<{ items: AutomationRule[]; total: number }> {
  const d = await http(`/crm/automation/rules${qs({ status: q.status, trigger_type: q.trigger, q: q.q?.trim(), limit: q.limit ?? 200, offset: q.offset ?? 0 })}`, { signal });
  const items = list(d, "items", "rules")
    .map(automationRuleOf)
    .filter((r) => r.id);
  return { items, total: int(asDict(d).total, items.length) };
}
export async function getAutomationRule(id: string, signal?: AbortSignal): Promise<AutomationRule> {
  const d = asDict(await http(`/crm/automation/rules/${enc(id)}`, { signal }));
  return automationRuleOf(d.rule ?? d);
}
export async function createAutomationRuleX(r: RuleDraft, status: "draft" | "active"): Promise<AutomationRule> {
  const d = asDict(await http("/crm/automation/rules", { method: "POST", body: JSON.stringify({ ...ruleBody(r), entity_type: "lead", status }) }));
  return automationRuleOf(d.rule ?? d);
}
export async function updateAutomationRuleX(rule: Pick<AutomationRule, "id" | "lockVersion">, patch: Partial<RuleDraft> & { status?: string }): Promise<AutomationRule> {
  const body: Dict = patch.name !== undefined ? ruleBody(patch as RuleDraft) : {};
  if (patch.status) body.status = patch.status;
  body.expected_lock_version = rule.lockVersion;
  const d = asDict(await http(`/crm/automation/rules/${enc(rule.id)}`, { method: "PATCH", body: JSON.stringify(body) }));
  return automationRuleOf(d.rule ?? d);
}
export async function cloneAutomationRule(id: string, name?: string): Promise<AutomationRule> {
  const d = asDict(await http(`/crm/automation/rules/${enc(id)}/clone`, { method: "POST", body: JSON.stringify({ name: name?.trim() || null }) }));
  return automationRuleOf(d.rule ?? d);
}
export async function reorderAutomationRules(ids: string[]): Promise<void> {
  await http("/crm/automation/rules/reorder", { method: "POST", body: JSON.stringify({ rule_ids: ids }) });
}

// ── Preview and dry run ────────────────────────────────────────────────

export type TraceRow = { label: string; matched: boolean; detail: string };
export type RulePreview = { summary: string; steps: string[]; warnings: string[]; trace: TraceRow[]; matched: boolean | null; writesPerformed: boolean };
const traceOf = (v: unknown): TraceRow[] =>
  asArr(v).map((x) => {
    if (typeof x === "string") return { label: x, matched: true, detail: "" };
    const r = asDict(x);
    return {
      label: asStr(r.label ?? r.description ?? r.text) || [asStr(r.field), asStr(r.operator), r.value === undefined ? "" : String(r.value)].filter(Boolean).join(" "),
      matched: r.matched === true || r.passed === true || r.result === true,
      detail: asStr(r.actual === undefined ? r.reason ?? r.detail : r.actual),
    };
  });
export function rulePreviewOf(v: unknown): RulePreview {
  const d = asDict(v);
  const summary = asStr(d.summary ?? d.human_readable ?? d.description ?? d.text);
  const steps = asArr(d.steps ?? d.action_summaries ?? d.actions_preview ?? d.proposed_actions)
    .map((x) => (typeof x === "string" ? x : asStr(asDict(x).summary ?? asDict(x).description ?? asDict(x).label ?? asDict(x).title)))
    .filter(Boolean);
  return {
    summary,
    steps,
    warnings: asArr(d.warnings).map((x) => (typeof x === "string" ? x : asStr(asDict(x).message ?? asDict(x).text))).filter(Boolean),
    trace: traceOf(d.condition_trace ?? d.trace),
    matched: typeof d.matched === "boolean" ? d.matched : typeof d.would_match === "boolean" ? d.would_match : null,
    writesPerformed: d.writes_performed === true,
  };
}
export async function previewAutomationRule(r: RuleDraft, leadId: string | null, triggerContext: Dict = {}): Promise<RulePreview> {
  const b = ruleBody(r);
  return rulePreviewOf(
    await http("/crm/automation/rules/preview", {
      method: "POST",
      body: JSON.stringify({ name: b.name, trigger_type: b.trigger_type, delay_seconds: b.delay_seconds, conditions: b.conditions, actions: b.actions, lead_id: leadId || null, trigger_context: triggerContext }),
    }),
  );
}
export async function dryRunAutomationRule(id: string, leadId: string, triggerContext: Dict = {}): Promise<RulePreview> {
  return rulePreviewOf(await http(`/crm/automation/rules/${enc(id)}/dry-run`, { method: "POST", body: JSON.stringify({ lead_id: leadId, trigger_context: triggerContext }) }));
}

// ── Runs ───────────────────────────────────────────────────────────────

export type RunStep = { index: number; type: string; status: string; attempts: number; input: Dict; output: Dict; error: string; startedAt: string; completedAt: string };
export type AutomationRunX = {
  id: string;
  ruleId: string;
  ruleName: string;
  leadId: string;
  leadWorkId: string;
  leadTitle: string;
  trigger: string;
  status: string;
  attempts: number;
  scheduledAt: string;
  startedAt: string;
  completedAt: string;
  error: string;
  steps: RunStep[];
  canRetry: boolean;
  canCancel: boolean;
};
// Without explicit flags from the backend: which statuses can be retried or
// cancelled (§18). The server still decides; a refusal arrives as
// crm_automation_run_not_retryable / _not_cancellable.
const RETRYABLE = new Set(["failed", "partially_failed", "error", "cancelled", "canceled"]);
const CANCELLABLE = new Set(["scheduled", "queued", "pending", "running", "waiting", "waiting_approval", "retrying"]);
export function runStepOf(v: unknown, i: number): RunStep {
  const d = asDict(v);
  return {
    index: int(d.index ?? d.step_index ?? d.position, i),
    type: asStr(d.action_type ?? d.type ?? d.action),
    status: asStr(d.status),
    attempts: int(d.attempts ?? d.attempt_count),
    input: asDict(d.input ?? d.params ?? d.request),
    output: asDict(d.output ?? d.result ?? d.response),
    error: asStr(asDict(d.error).message ?? d.error ?? d.last_error),
    startedAt: asStr(d.started_at),
    completedAt: asStr(d.completed_at ?? d.finished_at),
  };
}
export function automationRunXOf(v: unknown): AutomationRunX {
  const d = asDict(v);
  const lead = asDict(d.lead);
  const rule = asDict(d.rule);
  const status = asStr(d.status);
  const acts = asArr(d.allowed_actions).map((x) => asStr(x));
  return {
    id: asStr(d.id),
    ruleId: asStr(d.rule_id ?? rule.id),
    ruleName: asStr(d.rule_name ?? rule.name),
    leadId: asStr(d.lead_id ?? lead.id),
    leadWorkId: asStr(d.lead_work_id ?? lead.work_id),
    leadTitle: asStr(d.lead_title ?? lead.title),
    trigger: asStr(d.trigger_type ?? d.trigger),
    status,
    attempts: int(d.attempts ?? d.attempt_count),
    scheduledAt: asStr(d.scheduled_at ?? d.run_at),
    startedAt: asStr(d.started_at),
    completedAt: asStr(d.completed_at ?? d.finished_at),
    error: asStr(asDict(d.error).message ?? d.error ?? d.last_error),
    steps: asArr(d.steps ?? d.step_runs ?? d.actions).map(runStepOf),
    canRetry: typeof d.can_retry === "boolean" ? d.can_retry : acts.length ? acts.includes("retry") : RETRYABLE.has(status),
    canCancel: typeof d.can_cancel === "boolean" ? d.can_cancel : acts.length ? acts.includes("cancel") : CANCELLABLE.has(status),
  };
}
export type RunQuery = { status?: string; ruleId?: string; leadId?: string; limit?: number; offset?: number };
export async function listAutomationRunsX(q: RunQuery = {}, signal?: AbortSignal): Promise<{ items: AutomationRunX[]; total: number }> {
  const d = await http(`/crm/automation/runs${qs({ status: q.status, rule_id: q.ruleId, lead_id: q.leadId, limit: q.limit ?? 100, offset: q.offset ?? 0 })}`, { signal });
  const items = list(d, "items", "runs")
    .map(automationRunXOf)
    .filter((r) => r.id);
  return { items, total: int(asDict(d).total, items.length) };
}
export async function getAutomationRun(id: string, signal?: AbortSignal): Promise<AutomationRunX> {
  const d = asDict(await http(`/crm/automation/runs/${enc(id)}`, { signal }));
  return automationRunXOf(d.run ?? d);
}
export async function retryAutomationRun(id: string, fromStep: number | null): Promise<AutomationRunX> {
  const d = asDict(await http(`/crm/automation/runs/${enc(id)}/retry`, { method: "POST", body: JSON.stringify({ from_step_index: fromStep }) }));
  return automationRunXOf(d.run ?? d);
}
export async function cancelAutomationRun(id: string): Promise<AutomationRunX> {
  const d = asDict(await http(`/crm/automation/runs/${enc(id)}/cancel`, { method: "POST", body: "{}" }));
  return automationRunXOf(d.run ?? d);
}

// ── Approval drafts ────────────────────────────────────────────────────

export type ApprovalDraft = {
  id: string;
  status: string;
  type: string; // the action that produced it (send_sms, prepare_email …)
  channel: string;
  title: string;
  leadId: string;
  leadWorkId: string;
  leadTitle: string;
  customerName: string;
  ruleName: string;
  runId: string;
  payload: Dict;
  editable: boolean;
  editableFields: string[];
  createdAt: string;
  decidedAt: string;
  reason: string;
};
export function approvalDraftOf(v: unknown): ApprovalDraft {
  const d = asDict(v);
  const lead = asDict(d.lead);
  const payload = asDict(d.payload ?? d.draft ?? d.content);
  const fields = strs(d.editable_fields ?? d.editable_paths);
  return {
    id: asStr(d.id),
    status: asStr(d.status),
    type: asStr(d.action_type ?? d.type ?? d.draft_type),
    channel: asStr(d.channel),
    title: asStr(d.title ?? d.summary),
    leadId: asStr(d.lead_id ?? lead.id),
    leadWorkId: asStr(d.lead_work_id ?? lead.work_id),
    leadTitle: asStr(d.lead_title ?? lead.title),
    customerName: asStr(d.customer_name ?? asDict(lead.customer).name ?? asDict(d.customer).name),
    ruleName: asStr(d.rule_name ?? asDict(d.rule).name),
    runId: asStr(d.run_id),
    payload,
    // §18: editing before approval where the response type supports it.
    editable: d.editable === true || d.edit_supported === true || d.can_edit === true || fields.length > 0,
    editableFields: fields,
    createdAt: asStr(d.created_at),
    decidedAt: asStr(d.decided_at),
    reason: asStr(d.reason ?? d.decision_reason),
  };
}
export async function listApprovalDrafts(q: { status?: string; leadId?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<{ items: ApprovalDraft[]; total: number }> {
  const d = await http(`/crm/automation/drafts${qs({ status: q.status, lead_id: q.leadId, limit: q.limit ?? 100, offset: q.offset ?? 0 })}`, { signal });
  const items = list(d, "items", "drafts")
    .map(approvalDraftOf)
    .filter((x) => x.id);
  return { items, total: int(asDict(d).total, items.length) };
}
export async function decideApprovalDraft(id: string, decision: "approve" | "reject", reason: string, editedPayload: Dict | null): Promise<ApprovalDraft> {
  const d = asDict(await http(`/crm/automation/drafts/${enc(id)}/decision`, { method: "POST", body: JSON.stringify({ decision, reason: reason.trim(), edited_payload: editedPayload }) }));
  return approvalDraftOf(d.draft ?? d);
}

// ── Metrics ────────────────────────────────────────────────────────────

export type AutomationMetrics = { total: number; byStatus: Record<string, number>; successRate: number | null; queueSize: number; oldestScheduledAt: string; queueLagSec: number | null };
export function automationMetricsOf(v: unknown): AutomationMetrics {
  const d = asDict(v);
  const counts = asDict(d.status_counts ?? d.by_status ?? d.counts);
  const byStatus: Record<string, number> = {};
  for (const [k, x] of Object.entries(counts)) byStatus[k] = int(x);
  const queue = asDict(d.queue ?? d.scheduled);
  const rate = num(d.success_rate);
  return {
    total: int(d.total_runs ?? d.total, Object.values(byStatus).reduce((s, n) => s + n, 0)),
    byStatus,
    successRate: rate === null ? null : rate <= 1 ? rate * 100 : rate,
    queueSize: int(d.scheduled_queue_size ?? d.queue_size ?? queue.size ?? queue.count),
    oldestScheduledAt: asStr(d.oldest_scheduled_at ?? queue.oldest_scheduled_at ?? queue.oldest_at),
    queueLagSec: num(d.queue_lag_seconds ?? queue.lag_seconds),
  };
}
export async function getAutomationMetrics(range: { from?: string; to?: string } = {}, signal?: AbortSignal): Promise<AutomationMetrics> {
  return automationMetricsOf(await http(`/crm/automation/metrics${qs({ date_from: range.from, date_to: range.to })}`, { signal }));
}

// ── Errors ─────────────────────────────────────────────────────────────

export const AUTOMATION_CONFLICTS = ["crm_automation_rule_version_conflict", "crm_automation_run_not_retryable", "crm_automation_run_not_cancellable"] as const;
export const isRuleConflict = (e: unknown): boolean => e instanceof ApiError && e.code === "crm_automation_rule_version_conflict";

// A readable line for a value from a step's input/output or a draft
// payload: never JSON, never a raw key.
export const humanKey = (k: string): string => {
  const s = k.replace(/[_.-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : k;
};
export function readableRows(d: Dict, prefix = "", label: (k: string) => string = humanKey): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined || v === "") continue;
    if (/(^|_)(id|ids|user_id|token|secret)$/.test(k)) continue;
    const name = prefix ? `${prefix} · ${label(k)}` : label(k);
    if (Array.isArray(v)) {
      const flat = v.map((x) => (x && typeof x === "object" ? Object.values(asDict(x)).filter((y) => typeof y !== "object").join(" · ") : String(x))).filter(Boolean);
      if (flat.length) out.push({ label: name, value: flat.join(", ") });
    } else if (typeof v === "object") out.push(...readableRows(asDict(v), name, label));
    else if (typeof v === "boolean") out.push({ label: name, value: v ? "✓" : "—" });
    else out.push({ label: name, value: String(v) });
  }
  return out;
}
