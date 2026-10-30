import { CALL_CENTER, type Who } from "./mock";

// The mocked CRM backend the CRM specs (crm.spec.ts) and the layout tour
// (redesign-tour.spec.ts) share: shaped like production (contract
// 2026-10-26, /crm/*), every value made up.
export const OPERATOR: Who = { ...CALL_CENTER, permissions: ["callcenter.access", "crm.leads.view", "crm.leads.claim", "crm.leads.manage", "crm.customers.view", "crm.ai.use", "crm.analytics.self", "crm.exports.create"] };
// Contract 13cb257 §6: six fixed statuses.
export const STATUSES = ["new", "qualified", "proposal", "decision_pending", "won", "rejected"];
export const TRANSITIONS: Record<string, string[]> = { new: ["qualified", "proposal", "decision_pending", "won", "rejected"], qualified: ["proposal", "decision_pending", "won", "rejected"], proposal: ["qualified", "decision_pending", "won", "rejected"], decision_pending: ["proposal", "won", "rejected"], won: [], rejected: [] };
export const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#d97706", "#16a34a", "#dc2626"];
export type Col = { key: string; title: string; color: string; order: number; is_final?: boolean };
export const COLUMNS = (): Col[] => STATUSES.map((key, i) => ({ key, title: key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), color: COLORS[i], order: (i + 1) * 10, is_final: key === "won" || key === "rejected" }));
export const meta = (perms: string[], revenue = false, cols: Col[] = COLUMNS()) => ({
  statuses: cols.map((c) => ({ ...c, is_final: c.key === "won" || c.key === "rejected", transitions: TRANSITIONS[c.key] ?? [] })),
  kanban: { columns_url: "/crm/kanban", settings_url: "/crm/kanban/columns", fixed_status_keys: STATUSES, move_url_template: "/crm/leads/{lead_id}/status", realtime_events: ["crm.kanban.columns_updated", "crm.lead.moved"] },
  customer_lifecycles: ["prospect", "customer"],
  automation: { rule_url: "/crm/automation/rules", actions: ["add_tags", "assign_owner", "change_status", "create_task", "escalate", "send_notification", "send_sms"], sms_operator_approval_default: true, no_answer_sms_delay_seconds: 180 },
  detail_rendering: { field: "detail_sections", raw_json_forbidden: true },
  scores: ["cold", "warm", "hot"],
  languages: ["uz_latn", "uz_cyrl", "ru"],
  contact_types: ["phone", "telegram", "email"],
  sources: ["manual", "web", "telegram", "phone"],
  permissions: perms,
  scope: perms.includes("crm.analytics.global") ? "all" : "own_and_queue",
  revenue_visible: revenue,
  telephony: { provider: "disabled", enabled: false, recording_consent_required: true, live_transcription: true, transcript_append_url: "/crm/calls/{call_id}/transcript" },
});
export const CUSTOMER = { id: "c1", public_id: "CRM-3CD76084", user_id: null, name: "Dilnoza Karimova", preferred_language: "uz_latn", region: "Toshkent", primary_phone: "+998901234567", primary_telegram: "@dilnoza", primary_email: "" };
export const soon = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
export const lead = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  work_id: `LEAD-${id.toUpperCase()}`,
  customer_id: "c1",
  customer: CUSTOMER,
  client_user_id: null,
  source: "phone",
  title: "Ijara shartnomasi tekshiruvi",
  problem: "Ijara shartnomasini imzolashdan oldin tekshirib bermoqchiman.",
  category: "contracts",
  region: "Toshkent",
  urgency: "normal",
  score: "warm",
  status: "new",
  preferred_language: "uz_latn",
  assigned_operator_user_id: null,
  assigned_operator: null,
  next_action_at: null,
  claimed_at: null,
  duplicate_status: "clear",
  duplicate_of_lead_id: null,
  converted_service_id: null,
  converted_order_id: null,
  lost_reason: "",
  details: {},
  watchers: [],
  allowed_actions: ["view_timeline", "add_activity", "run_ai", "claim", "edit", "change_status", "set_next_action"],
  lock_version: 1,
  created_at: "2026-10-26T08:00:00Z",
  updated_at: "2026-10-26T08:00:00Z",
  closed_at: null,
  ...extra,
});
export const ME = { id: OPERATOR.id, name: OPERATOR.name, lexgo_id: "LGCC-1", role: "call_center" };

export function crmServer(perms: string[], revenue = false) {
  const st = {
    queue: [lead("q1", { urgency: "urgent", score: "hot" }), lead("q2", { title: "Aliment undirish", score: "cold" }), lead("q3", { title: "Mehnat nizosi" })],
    mine: [
      lead("m1", { status: "qualified", assigned_operator_user_id: ME.id, assigned_operator: ME, next_action_at: soon(-180), allowed_actions: ["view_timeline", "add_activity", "run_ai", "edit", "change_status", "set_next_action", "manage_watchers", "transfer", "prepare_conversion"], lock_version: 4, duplicate_status: "needs_review" }),
      lead("m2", { status: "proposal", title: "Meros ulushi", assigned_operator_user_id: ME.id, assigned_operator: ME, next_action_at: soon(25) }),
    ],
    claims: [] as string[],
    writes: [] as { path: string; body: Record<string, unknown> }[],
    activities: [
      { id: "a2", activity_type: "call_note", title: "Qo'ng'iroq", body: "Mijoz ertaga hujjatlarni yuboradi.", actor: ME, actor_user_id: ME.id, payload: { duration_sec: 240 }, created_at: "2026-10-26T09:30:00Z", visibility: "staff" },
      { id: "a1", activity_type: "system", title: "Lid yaratildi", body: "", actor: null, actor_user_id: null, payload: { source: "phone" }, created_at: "2026-10-26T08:00:00Z", visibility: "staff" },
    ] as Record<string, unknown>[],
    run: null as null | Record<string, unknown>,
    polls: 0,
    applied: null as null | Record<string, unknown>,
    conflictOnce: true,
    exportPolls: 0,
    boardCalls: 0,
    columns: COLUMNS(),
    // Kanban rank per lead: the column order the backend keeps.
    rank: {} as Record<string, number>,
    moves: [] as Record<string, unknown>[],
    moveConflictOnce: false,
    colWrites: [] as { method: string; body: unknown; url: string }[],
    calls: [] as Record<string, unknown>[],
    callWrites: [] as { path: string; body: Record<string, unknown> }[],
    sms: [] as Record<string, unknown>[],
    smsApprovals: [] as Record<string, unknown>[],
    rules: [] as Record<string, unknown>[],
    ruleWrites: [] as { path: string; body: Record<string, unknown> }[],
  };
  const page = (all: Record<string, unknown>[], url: URL) => {
    const want = url.searchParams.get("status");
    if (want && url.searchParams.get("limit") === "30") st.boardCalls++;
    const rk = (l: Record<string, unknown>) => st.rank[String(l.id)] ?? 1e6;
    const items = want ? all.filter((l) => l.status === want).sort((a, b) => rk(a) - rk(b)) : all;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    return { items: items.slice(offset, offset + limit), total: items.length, limit, offset, counts: { new: 3, qualified: 5, proposal: 3, decision_pending: 2, won: 2, rejected: 2 } };
  };
  const allLeads = () => [...st.mine, ...st.queue];
  const routes: Record<string, unknown> = {
    "/crm/meta": () => meta(perms, revenue, st.columns),
    "/crm/kanban": (_: unknown, url: URL) => {
      st.boardCalls++;
      const lim = Number(url.searchParams.get("column_limit") ?? 30);
      const mine = url.searchParams.get("mine_only") === "true";
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const rk = (l: Record<string, unknown>) => st.rank[String(l.id)] ?? 1e6;
      const pool = (mine ? st.mine : allLeads()).filter((l) => !q || String(l.title).toLowerCase().includes(q));
      return {
        columns: st.columns.map((c) => {
          const leads = pool.filter((l) => l.status === c.key).sort((a, b) => rk(a) - rk(b));
          return { ...c, is_final: c.key === "won" || c.key === "rejected", count: leads.length, has_more: leads.length > lim, items: leads.slice(0, lim) };
        }),
        total: pool.length,
        column_limit: lim,
        fixed_statuses: true,
        reorder_supported: true,
      };
    },
    "PATCH /call-center/leads/[^/]+/move": (b: Record<string, unknown>, url: URL) => {
      const id = url.pathname.split("/").at(-2) ?? "";
      st.moves.push({ id, ...b });
      const l = allLeads().find((x) => x.id === id)!;
      if (st.moveConflictOnce) {
        st.moveConflictOnce = false;
        Object.assign(l, { lock_version: Number(l.lock_version) + 1 });
        return { status: 409, json: { detail: { code: "crm_lead_version_conflict", current_lock_version: l.lock_version } } };
      }
      if (b.expected_lock_version !== l.lock_version) return { status: 409, json: { detail: { code: "crm_lead_version_conflict", current_lock_version: l.lock_version } } };
      const rk = (x: Record<string, unknown>) => st.rank[String(x.id)] ?? 1e6;
      const col = allLeads().filter((x) => x.status === b.column_key && x.id !== id).sort((a, c) => rk(a) - rk(c));
      col.splice(Number(b.position), 0, l);
      col.forEach((x, i) => (st.rank[String(x.id)] = (i + 1) * 10));
      Object.assign(l, { lock_version: Number(l.lock_version) + 1 });
      return { lead: l, kanban: { column_key: b.column_key, position: b.position, rank: st.rank[id], moved_at: new Date().toISOString(), moved_by_user_id: ME.id } };
    },
    "PUT /crm/kanban/columns": (b: { columns: Col[] }, url: URL) => {
      st.colWrites.push({ method: "PUT", body: b, url: url.search });
      st.columns = b.columns;
      return { columns: st.columns };
    },
    // Any lead's status (§6): won needs a paid order, rejected a reason.
    "POST /crm/leads/(?!m1/)[^/]+/status": (b: Record<string, unknown>, url: URL) => {
      const id = url.pathname.split("/").at(-2) ?? "";
      const l = allLeads().find((x) => x.id === id)!;
      st.writes.push({ path: `status:${id}`, body: b });
      if (b.status === "won" && !l.converted_order_id) return { status: 409, json: { detail: { code: "crm_paid_order_required", message: "paid order required" } } };
      if (b.status === "rejected" && !String(b.reason ?? "").trim()) return { status: 422, json: { detail: { code: "crm_rejection_reason_required", field: "reason" } } };
      if (b.expected_lock_version !== l.lock_version) return { status: 409, json: { detail: { code: "crm_lead_version_conflict", current_lock_version: l.lock_version } } };
      Object.assign(l, { status: b.status, lock_version: Number(l.lock_version) + 1, lost_reason: b.status === "rejected" ? b.reason : l.lost_reason });
      return l;
    },
    "/crm/leads": (_: unknown, url: URL) => (url.searchParams.get("queue_only") ? page(st.queue, url) : url.searchParams.get("mine_only") ? page(st.mine, url) : page([...st.mine, ...st.queue], url)),
    "/crm/leads/m1": () => st.mine[0],
    "/crm/leads/q1": () => st.queue.find((l) => l.id === "q1") ?? st.mine.find((l) => l.id === "q1"),
    "POST /crm/leads/q[0-9]/claim": (_: unknown, url: URL) => {
      const id = url.pathname.split("/").at(-2) ?? "";
      st.claims.push(id);
      if (id === "q2") return { status: 409, json: { detail: { code: "crm_lead_already_claimed", message: "already claimed" } } };
      const l = st.queue.find((x) => x.id === id);
      st.queue = st.queue.filter((x) => x.id !== id);
      const owned = { ...l, assigned_operator_user_id: ME.id, assigned_operator: ME, claimed_at: new Date().toISOString(), allowed_actions: ["view_timeline", "add_activity", "run_ai", "edit", "change_status"] };
      st.mine = [owned, ...st.mine];
      return owned;
    },
    "POST /crm/leads/m1/status": (b: Record<string, unknown>) => {
      st.writes.push({ path: "status", body: b });
      if (st.conflictOnce) {
        st.conflictOnce = false;
        st.mine[0] = { ...st.mine[0], lock_version: 5, updated_at: new Date().toISOString() };
        return { status: 409, json: { detail: { code: "crm_lead_version_conflict", message: "changed" } } };
      }
      // A stale lock is refused, as the backend does.
      if (b.expected_lock_version !== st.mine[0].lock_version) return { status: 409, json: { detail: { code: "crm_lead_version_conflict", message: "changed" } } };
      st.mine[0] = { ...st.mine[0], status: String(b.status), lock_version: Number(b.expected_lock_version) + 1 };
      return st.mine[0];
    },
    "POST /crm/leads/m1/transfer": (b: Record<string, unknown>) => (st.writes.push({ path: "transfer", body: b }), st.mine[0]),
    "/crm/leads/[^/]+/history": (_: unknown, url: URL) => {
      const id = url.pathname.split("/").at(-2) ?? "";
      const l = allLeads().find((x) => x.id === id) ?? st.mine[0];
      const n = Number(l.cycle_number ?? 1);
      return {
        lead_id: id,
        current_cycle_id: `cy${n}`,
        cycle_number: n,
        cycles: Array.from({ length: n }, (_, i) => ({ id: `cy${i + 1}`, sequence: i + 1, inquiry: i === 0 ? "Ijara shartnomasini tekshirish" : "Yana murojaat: shartnomaga o'zgartirish", source: "phone", status: i + 1 < n ? "closed" : "open", initial_status: "new", terminal_status: i + 1 < n ? "won" : "", order_id: null, payment_id: null, opened_at: "2026-09-01T08:00:00Z", closed_at: i + 1 < n ? "2026-09-20T08:00:00Z" : null, snapshot: { previous_status: null, reason: "" } })),
        status_history: [{ id: "h1", customer_id: "c1", lead_id: id, actor: ME, actor_user_id: ME.id, activity_type: "status_changed", title: "Holat o'zgardi", body: "Yangi → Saralangan", payload: {}, visibility: "staff", created_at: "2026-10-26T09:00:00Z" }],
      };
    },
    "POST /crm/leads/[^/]+/reopen": (b: Record<string, unknown>, url: URL) => {
      const id = url.pathname.split("/").at(-2) ?? "";
      const l = allLeads().find((x) => x.id === id)!;
      st.writes.push({ path: `reopen:${id}`, body: b });
      if (b.expected_lock_version !== l.lock_version) return { status: 409, json: { detail: { code: "crm_lead_version_conflict" } } };
      Object.assign(l, { status: "new", cycle_number: Number(l.cycle_number ?? 1) + 1, lock_version: Number(l.lock_version) + 1 });
      return l;
    },
    "/crm/leads/w1": () => allLeads().find((x) => x.id === "w1"),
    "/crm/leads/m1/calls": () => st.calls,
    "POST /crm/leads/m1/calls": (b: Record<string, unknown>) => {
      st.callWrites.push({ path: "start", body: b });
      if (!b.contact_id) return { status: 422, json: { detail: { code: "crm_phone_contact_required", field: "contact_id" } } };
      const c = { id: "call-1", lead_id: "m1", contact_id: b.contact_id, direction: b.direction, purpose: b.purpose, status: "initiated", provider: "disabled", metadata: { recording_consent_text: "Assalomu alaykum! Suhbat sifat uchun yozib olinmoqda." }, transcript: [], created_at: new Date().toISOString() };
      st.calls = [c, ...st.calls];
      return { status: 201, json: c };
    },
    "POST /crm/calls/call-1/transcript": (b: Record<string, unknown>) => {
      st.callWrites.push({ path: "transcript", body: b });
      return { call_id: "call-1", ai_run_id: b.request_ai_assist ? "run-live" : null };
    },
    "/crm/ai/runs/run-live": { id: "run-live", lead_id: "m1", run_type: "live_call_assist", status: "completed", output: { reply_drafts: ["Hujjat nusxasini Telegram orqali yuborishingiz mumkin."] }, created_at: new Date().toISOString() },
    "POST /crm/calls/call-1/complete": (b: Record<string, unknown>) => {
      st.callWrites.push({ path: "complete", body: b });
      st.calls = st.calls.map((c) => (c.id === "call-1" ? { ...c, status: b.status, summary: b.summary } : c));
      return st.calls[0];
    },
    "/crm/leads/m1/sms": () => ({ items: st.sms, count: st.sms.length }),
    "/crm/automation/rules": () => ({ items: st.rules, count: st.rules.length, available_actions: ["add_tags", "assign_owner", "change_status", "create_task", "escalate", "send_notification", "send_sms"] }),
    "POST /crm/automation/rules": (b: Record<string, unknown>) => {
      st.ruleWrites.push({ path: "create", body: b });
      const r = { id: "r1", ...b, created_at: "2026-10-29T10:00:00Z", updated_at: "2026-10-29T10:00:00Z" };
      st.rules = [r, ...st.rules];
      return { status: 201, json: r };
    },
    "PATCH /crm/automation/rules/r1": (b: Record<string, unknown>) => {
      st.ruleWrites.push({ path: "patch", body: b });
      st.rules = st.rules.map((r) => (r.id === "r1" ? { ...r, ...b } : r));
      return st.rules[0];
    },
    "POST /crm/automation/rules/r1/dry-run": (b: Record<string, unknown>) => {
      st.ruleWrites.push({ path: "dry", body: b });
      return { rule_id: "r1", matched: true, matched_context: { lead: { status: "qualified", source: "phone" } }, proposed_actions: [{ type: "send_notification", message: "Qayta qo'ng'iroq qiling", recipient: "assigned_operator" }], writes_performed: false };
    },
    "/crm/live-calls": { items: [{ call: { id: "lc1", status: "in_progress", started_at: new Date(Date.now() - 95_000).toISOString() }, operator: { id: "op-2", name: "Akmal Operator", lexgo_id: "LGCC-2", role: "call_center" }, lead: { id: "m1", work_id: "LEAD-M1", title: "Ijara shartnomasi tekshiruvi", status: "qualified", customer: CUSTOMER } }], count: 1, realtime_channel: "crm:live-calls", privacy: { permission_required: "crm.live_calls.view", audit_required: true } },
    "/crm/live-calls/lc1": { call: { id: "lc1", status: "in_progress", started_at: new Date(Date.now() - 95_000).toISOString(), transcript: [{ speaker: "customer", text: "Shartnomada kafil bandi bor." }, { speaker: "operator", text: "Uni yurist ko'rib chiqadi." }] }, operator: { id: "op-2", name: "Akmal Operator", lexgo_id: "LGCC-2", role: "call_center" }, lead: { id: "m1", work_id: "LEAD-M1", title: "Ijara shartnomasi tekshiruvi", status: "qualified", customer: CUSTOMER }, ai_suggestions: { reply_drafts: ["Kafil bandi bo'yicha yuristimiz izoh beradi."] } },
    "/crm/automation/runs": { items: [{ id: "run9", rule_id: "r1", rule_name: "Javobsiz qo'ng'iroq", lead_id: "m1", lead_work_id: "LEAD-M1", status: "completed", attempts: 1, scheduled_at: "2026-10-29T10:00:00Z", started_at: "2026-10-29T10:00:01Z", completed_at: "2026-10-29T10:00:02Z", context: {}, result: { notified: true }, error: "" }], total: 1, limit: 30, offset: 0 },
    "POST /crm/leads/m1/sms": (b: Record<string, unknown>) => {
      const x = { id: `s${st.sms.length + 1}`, lead_id: "m1", body: b.body, language: b.language, contact_id: b.contact_id, status: "draft", created_at: new Date().toISOString() };
      st.sms = [x, ...st.sms];
      return { status: 201, json: x };
    },
    "POST /crm/sms/[^/]+/approve": (b: Record<string, unknown>, url: URL) => {
      const id = url.pathname.split("/").at(-2) ?? "";
      st.smsApprovals.push({ id, ...b });
      st.sms = st.sms.map((x) => (x.id === id ? { ...x, body: b.body ?? x.body, status: "provider_configuration_required" } : x));
      return st.sms.find((x) => x.id === id);
    },
    "/crm/leads/w1/timeline": [],
    "/crm/leads/m1/timeline": () => st.activities,
    "PATCH /crm/leads/m1": (b: Record<string, unknown>) => {
      st.writes.push({ path: "patch", body: b });
      if (b.expected_lock_version !== st.mine[0].lock_version) return { status: 409, json: { detail: { code: "crm_lead_version_conflict", message: "changed" } } };
      st.mine[0] = { ...st.mine[0], ...("next_action_at" in b ? { next_action_at: b.next_action_at } : {}), lock_version: Number(b.expected_lock_version) + 1 };
      return st.mine[0];
    },
    "POST /crm/leads/m1/activities": (b: Record<string, unknown>) => {
      const a = { id: `a${st.activities.length + 1}`, activity_type: b.activity_type, title: b.title, body: b.body, actor: ME, actor_user_id: ME.id, payload: (b.payload as Record<string, unknown>) ?? {}, created_at: new Date().toISOString(), visibility: "staff" };
      st.activities = [a, ...st.activities];
      return a;
    },
    "/crm/leads/m1/ai/runs": () => (st.run ? [st.run] : []),
    "POST /crm/leads/m1/ai/runs": (b: Record<string, unknown>) => {
      st.run = { id: "run-1", lead_id: "m1", operator_user_id: ME.id, run_type: b.run_type, language: b.language, instruction: b.instruction, status: "queued", model: "gpt", output: {}, tools: [], error: "", started_at: null, completed_at: null, created_at: new Date().toISOString() };
      return { status: 202, json: st.run };
    },
    "/crm/ai/runs/run-1": () => {
      st.polls += 1;
      if (st.run && st.polls >= 2)
        st.run = {
          ...st.run,
          status: "completed",
          completed_at: new Date().toISOString(),
          output: {
            summary: "Mijoz ijara shartnomasini imzolashdan oldin tekshiruv so'ramoqda; muddat — ertaga.",
            category: "contracts",
            urgency: "high",
            confidence: 0.82,
            risk_flags: ["Muddat qisqa", "Kafil shartlari noaniq"],
            missing_information: ["Shartnoma nusxasi", "Ijara muddati"],
            questions: ["Shartnoma kim tomonidan tuzilgan?"],
            service_candidates: [{ title: "Shartnoma ekspertizasi", reason: "Katalogdagi aniq xizmat", score: 0.9 }],
            reply_drafts: ["Assalomu alaykum! Shartnoma nusxasini yuboring, bugun ko'rib chiqamiz."],
            next_action: { at: soon(24 * 60), note: "Shartnoma kelgach qo'ng'iroq" },
            operator_warnings: ["Narxni mijozga kafolat sifatida aytmang."],
            operator_confirmation_required: true,
            auto_executed: false,
          },
        };
      return st.run;
    },
    "POST /crm/ai/runs/run-1/apply": (b: Record<string, unknown>) => ((st.applied = b), { ok: true }),
    "/crm/me/metrics": { operator: ME, total: 12, active: 7, won: 3, closed: 2, conversion_percent: 25, average_first_response_minutes: 14, overdue_next_actions: 1, status_counts: { new: 0, qualified: 4, proposal: 2, decision_pending: 1, won: 3, rejected: 2 }, cycle_metrics: { total: 14, open: 7, won: 4, rejected: 2, completed: 6, conversion_percent: 66.7 }, revenue_visible: false },
    "/crm/analytics": { total_leads: 17, status_counts: { new: 3, qualified: 5, proposal: 3, decision_pending: 2, won: 2, rejected: 2 }, source_counts: { phone: 9, web: 5, telegram: 3 }, operators: [{ operator_user_id: ME.id, operator: ME, total: 12, won: 3, conversion_percent: 25 }], paid_revenue: 25039162, currency: "UZS", revenue_visible: true },
    "/crm/customers": { items: [{ ...CUSTOMER, status: "active", source: "phone", lead_count: 4, active_lead_count: 2, created_at: "2026-10-20T08:00:00Z", updated_at: "2026-10-26T08:00:00Z" }, { ...CUSTOMER, id: "c2", public_id: "CRM-AA11", name: "Dilnoza K.", primary_phone: "+998901234560", lead_count: 1, active_lead_count: 1, status: "active", source: "web", created_at: "2026-10-25T08:00:00Z", updated_at: "2026-10-25T08:00:00Z" }], total: 2, limit: 48, offset: 0 },
    "/crm/customers/c1": () => ({
      ...CUSTOMER,
      status: "active",
      source: "phone",
      lead_count: 4,
      active_lead_count: 2,
      created_at: "2026-10-20T08:00:00Z",
      updated_at: "2026-10-26T08:00:00Z",
      notes: "Ertalab qo'ng'iroq qilish qulay.",
      contacts: [
        { id: "k1", customer_id: "c1", contact_type: "phone", value: "+998901234567", label: "Asosiy", is_primary: true, is_verified: true, status: "active", source: "operator", created_at: "", updated_at: "" },
        { id: "k2", customer_id: "c1", contact_type: "telegram", value: "@dilnoza", label: "", is_primary: false, is_verified: false, status: "active", source: "operator", created_at: "", updated_at: "" },
      ],
      leads: [st.mine[0], st.mine[1], lead("old1", { status: "won", title: "Nikoh shartnomasi", closed_at: "2026-09-01T08:00:00Z" }), lead("old2", { status: "rejected", title: "Eski murojaat", closed_at: "2026-08-01T08:00:00Z" })],
      orders: [],
      activity_count: 9,
    }),
    "/crm/customers/c2": { ...CUSTOMER, id: "c2", public_id: "CRM-AA11", name: "Dilnoza K.", status: "active", source: "web", lead_count: 1, active_lead_count: 1, created_at: "", updated_at: "", notes: "", contacts: [{ id: "k9", customer_id: "c2", contact_type: "phone", value: "+998901234560", label: "", is_primary: true, is_verified: false, status: "active", source: "web", created_at: "", updated_at: "" }], leads: [lead("x1", { customer_id: "c2" })], orders: [], activity_count: 1 },
    "/crm/customers/c1/timeline": [{ id: "t1", customer_id: "c1", lead_id: null, actor: null, actor_user_id: null, activity_type: "customer_created", title: "Mijoz yaratildi", body: "Dilnoza Karimova", payload: { source: "phone" }, visibility: "staff", created_at: "2026-10-20T08:00:00Z" }],
    "/crm/operators": { items: [ME, { id: "op-2", name: "Akmal Operator", lexgo_id: "LGCC-2", role: "call_center", active_leads: 3 }], total: 2 },
    "/crm/operator-templates": { items: [{ id: "tp1", title: "Hujjat so'rash", template_type: "chat", language: "uz_latn", content: "Iltimos, shartnoma nusxasini yuboring.", tags: [], status: "active" }], total: 1 },
    "POST /crm/exports": (b: Record<string, unknown>) => ({ status: 202, json: { id: "ex1", scope: b.scope, status: "queued", status_url: "/crm/exports/ex1" } }),
    "/crm/exports/ex1": () => ((st.exportPolls += 1), { id: "ex1", scope: "leads", status: st.exportPolls >= 2 ? "ready" : "processing", download_url: "/crm/exports/ex1/download" }),
  };
  return { st, routes };
}
