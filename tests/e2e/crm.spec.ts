import { expect, test, type Locator, type Page } from "@playwright/test";
import { ADMIN, CALL_CENTER, mockBackend, signIn, type Who } from "./mock";

// The CRM and the operator AI copilot (contract 2026-10-26, /crm/*) against
// a mocked backend shaped like production: meta-driven UI, the queue claim
// and its 409 race, lock versions and their 409, AI apply of the ticked
// paths only, no revenue for operators, merge behind its permission, export
// as a background job — and no missing translation on any screen.

const look = { colorScheme: process.env.CRM_DARK ? ("dark" as const) : ("light" as const), ...(process.env.CRM_NARROW ? { viewport: { width: 420, height: 900 } } : { viewport: { width: 1440, height: 960 } }) };
test.use(look);
test.describe.configure({ timeout: 120_000 });
const shot = async (page: Page, name: string) => {
  if (!process.env.CRM_SHOTS) return;
  await page.waitForTimeout(600);
  // On a phone nothing in the CRM may stick out past the screen.
  if (process.env.CRM_NARROW) {
    const wide = await page.evaluate(() => {
      const root = document.querySelector(".crm")?.getBoundingClientRect();
      return root ? [...document.querySelectorAll(".crm > *")].filter((el) => el.getBoundingClientRect().right > root.right + 1).map((el) => el.className) : [];
    });
    expect(wide).toEqual([]);
  }
  const suffix = `${process.env.CRM_DARK ? "dark" : "light"}${process.env.CRM_NARROW ? "-phone" : ""}`;
  await page.screenshot({ path: `${process.env.CRM_SHOTS}/crm-${name}-${suffix}.png`, fullPage: false });
};
// On a phone the workspace is two tabs (history, details); on desktop both
// columns show. The AI Copilot opens from the glance's "AI yordam" drawer.
const wsTab = async (page: Page, name: RegExp) => {
  if (process.env.CRM_NARROW) await page.locator(".crm-ws__tabs").getByRole("tab", { name }).click();
};
// next-intl reports a missing key as a console error; none may appear.
const openAi = async (page: Page) => {
  await page.locator(".crm-glance").getByRole("button", { name: "AI yordam" }).click();
  return page.getByRole("dialog", { name: "AI yordam" }).locator(".crm-ai");
};
const watchIntl = (page: Page) => {
  const missing: string[] = [];
  page.on("console", (m) => {
    if (/MISSING_MESSAGE|INVALID_KEY|FORMATTING_ERROR/.test(m.text())) missing.push(m.text().slice(0, 200));
  });
  return missing;
};

const OPERATOR: Who = { ...CALL_CENTER, permissions: ["callcenter.access", "crm.leads.view", "crm.leads.claim", "crm.leads.manage", "crm.customers.view", "crm.ai.use", "crm.analytics.self", "crm.exports.create"] };
// Contract 13cb257 §6: six fixed statuses.
const STATUSES = ["new", "qualified", "proposal", "decision_pending", "won", "rejected"];
const TRANSITIONS: Record<string, string[]> = { new: ["qualified", "proposal", "decision_pending", "won", "rejected"], qualified: ["proposal", "decision_pending", "won", "rejected"], proposal: ["qualified", "decision_pending", "won", "rejected"], decision_pending: ["proposal", "won", "rejected"], won: [], rejected: [] };
const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#d97706", "#16a34a", "#dc2626"];
type Col = { key: string; title: string; color: string; order: number; is_final?: boolean };
const COLUMNS = (): Col[] => STATUSES.map((key, i) => ({ key, title: key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), color: COLORS[i], order: (i + 1) * 10, is_final: key === "won" || key === "rejected" }));
const meta = (perms: string[], revenue = false, cols: Col[] = COLUMNS()) => ({
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
const CUSTOMER = { id: "c1", public_id: "CRM-3CD76084", user_id: null, name: "Dilnoza Karimova", preferred_language: "uz_latn", region: "Toshkent", primary_phone: "+998901234567", primary_telegram: "@dilnoza", primary_email: "" };
const soon = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const lead = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
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
const ME = { id: OPERATOR.id, name: OPERATOR.name, lexgo_id: "LGCC-1", role: "call_center" };

function crmServer(perms: string[], revenue = false) {
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

test("operator mission control: queue, mine, overdue, my metrics, no revenue, honest telephony", async ({ page }) => {
  const missing = watchIntl(page);
  const { routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm");
  const hero = page.locator(".crm-hero");
  await expect(hero.locator(".crm-counter").nth(0)).toContainText("3", { timeout: 20000 }); // first page of the run: cold dev compile
  await expect(hero.locator(".crm-counter").nth(1)).toContainText("7");
  await expect(hero.locator(".crm-counter").nth(2)).toContainText("1");
  await expect(page.locator(".crm-agenda li").first()).toContainText("kechikdi");
  // Leads by status: a donut of the six, the total in the middle.
  const donut = page.locator(".crm-donut");
  await expect(donut.locator(".crm-donut__slice")).toHaveCount(6);
  await expect(donut.locator(".crm-donut__center")).toContainText("17");
  await expect(page.getByText("IP-telefoniya hali ulanmagan")).toBeVisible();
  // Operators: no analytics section, no revenue anywhere.
  await expect(page.locator(".crm-nav").getByText("Tahlil")).toHaveCount(0);
  await expect(page.locator(".crm")).not.toContainText("25 039 162");
  await expect(page.getByText("To'langan tushum")).toHaveCount(0);
  await shot(page, "overview");
  // Hover shows one status in the middle; a click opens its list.
  const row = donut.getByRole("button", { name: /^Saralangan: 5 ta, 29%/ });
  await row.hover();
  await expect(donut.locator(".crm-donut__center")).toContainText("Saralangan");
  await expect(donut.locator(".crm-donut__center")).toContainText("29%");
  await row.click();
  await expect(page).toHaveURL(/\/admin\/crm\/leads\?tab=all&status=qualified/);
  expect(missing).toEqual([]);
});

test("queue claim: mine on success; a 409 race shakes the row out and never shows it as mine", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads?tab=queue&view=table");
  const rows = page.locator(".crm-table tbody tr");
  await expect(rows).toHaveCount(3);
  await shot(page, "leads");
  // Keyboard: j moves down, c claims the active row (q2: someone was faster).
  await page.locator("body").press("j");
  await expect(rows.nth(1)).toHaveAttribute("data-active", "true");
  await page.locator("body").press("c");
  await expect(page.getByText("Kimdir tezroq bo'ldi").first()).toBeVisible();
  await expect.poll(() => st.claims).toEqual(["q2"]);
  // q2 is never shown as owned by this operator.
  await page.getByRole("tab", { name: /Meniki/ }).click();
  await expect(page.locator(".crm-table")).not.toContainText("Aliment undirish");
  await page.getByRole("tab", { name: /Navbat/ }).click();
  await rows.first().getByRole("button", { name: "Olish" }).click();
  await expect(page.getByText(/endi sizniki/).first()).toBeVisible();
  await expect.poll(() => st.claims).toEqual(["q2", "q1"]);
  await expect(page.locator(".crm-table")).not.toContainText("Ijara shartnomasi tekshiruvi", { timeout: 8000 });
  expect(missing).toEqual([]);
});

test("lead workspace: status moves follow meta, carry the lock, recover from a version conflict; transfer needs a reason", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer([...(OPERATOR.permissions ?? []), "crm.leads.assign"]);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads/m1");
  const head = page.locator(".crm-glance");
  await expect(head).toContainText("Ijara shartnomasi tekshiruvi");
  // At a glance: who (with a one-tap call), the request, the next step.
  await expect(head.getByRole("heading", { level: 1 })).toContainText("Dilnoza Karimova");
  await expect(head.locator(".crm-glance__call")).toHaveAttribute("href", /^tel:\+998/);
  await expect(head.locator(".crm-glance__track li")).not.toHaveCount(0);
  await expect(head.locator(".crm-glance__track li i svg")).toHaveCount(await head.locator(".crm-glance__track li").count());
  // One primary action: it opens the composer on the call result, focused.
  await head.getByRole("button", { name: "Qo'ng'iroq natijasini yozish" }).click();
  await expect(page.locator(".crm-composer").getByRole("button", { name: "Qo'ng'iroq natijasi" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".crm-composer textarea")).toBeFocused();
  // qualified → proposal, decision pending, won, rejected only (the meta map),
  // all behind "Boshqa holat".
  await head.getByRole("button", { name: "Boshqa holat" }).click();
  await expect(head.getByRole("menuitem")).toHaveCount(4);
  await page.keyboard.press("Escape");
  await expect(head.getByRole("menu")).toHaveCount(0);
  await wsTab(page, /Ma'lumot/);
  await expect(page.getByText("Ehtimoliy dublikat").first()).toBeVisible();
  await wsTab(page, /Tarix/);
  // Timeline: oldest first, immutable (no edit/delete controls).
  const tl = page.locator(".crm-tl__ev");
  await expect(tl.first()).toContainText("Lid yaratildi");
  await expect(page.locator(".crm-tl").getByRole("button", { name: /tahrir|o'chir/i })).toHaveCount(0);
  await shot(page, "lead");

  await head.getByRole("button", { name: "Boshqa holat" }).click();
  await head.getByRole("menuitem", { name: /Taklif/ }).click();
  const sheet = page.getByRole("dialog", { name: /Taklif/ });
  await sheet.getByRole("textbox", { name: /Sabab/ }).fill("Mijoz bilan gaplashildi");
  await sheet.getByRole("button", { name: "O'tkazish" }).click();
  // 409: the lead reloads, a dialog shows what the other user changed
  // (never a silent overwrite), and the typed reason stays.
  const cf = page.getByRole("dialog", { name: "Siz ishlayotganda lid o'zgardi." });
  await expect(cf).toBeVisible();
  await cf.getByRole("button", { name: "Tushunarli" }).click();
  await expect(sheet.getByRole("textbox", { name: /Sabab/ })).toHaveValue("Mijoz bilan gaplashildi");
  await sheet.getByRole("button", { name: "O'tkazish" }).click();
  await expect(sheet).toBeHidden();
  expect(st.writes.map((w) => w.body.expected_lock_version)).toEqual([4, 5]);
  expect(st.writes[1].body).toMatchObject({ status: "proposal", reason: "Mijoz bilan gaplashildi" });

  // Transfer without a reason never reaches the backend.
  await wsTab(page, /Ma'lumot/);
  await page.getByRole("button", { name: "O'tkazish", exact: true }).first().click();
  const tr = page.getByRole("dialog", { name: "Lidni o'tkazish" });
  await tr.getByRole("radio", { name: /Akmal Operator/ }).click();
  await tr.getByRole("button", { name: "O'tkazish" }).click();
  await expect(tr.getByText("O'tkazish uchun sabab kerak.")).toBeVisible();
  expect(st.writes.filter((w) => w.path === "transfer")).toHaveLength(0);
  await tr.getByRole("textbox").last().fill("Smena almashinuvi");
  await tr.getByRole("button", { name: "O'tkazish" }).click();
  await expect.poll(() => st.writes.filter((w) => w.path === "transfer").length).toBe(1);
  expect(st.writes.find((w) => w.path === "transfer")?.body).toMatchObject({ operator_user_id: "op-2", reason: "Smena almashinuvi" });
  expect(missing).toEqual([]);
});

test("AI copilot: 202 → poll → cards; only the ticked paths, with edits and the lock, are applied", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads/m1");
  const ai = await openAi(page);
  await expect(ai).toContainText("AI faqat taklif qiladi");
  await ai.getByRole("button", { name: "Kopilotdan so'rash" }).click();
  await expect(ai.locator(".crm-think")).toBeVisible();
  await expect(ai.getByText("Mijoz ijara shartnomasini")).toBeVisible({ timeout: 15000 });
  await expect(ai.locator(".crm-warnbox")).toContainText("Narxni mijozga kafolat sifatida aytmang.");
  await expect(ai.locator(".crm-flag")).toHaveCount(2);
  // Nothing was applied by itself.
  expect(st.applied).toBeNull();
  // Ticked the way an operator does: on the card's label.
  for (const name of [/^Qisqacha/, /^Shoshilinchlik/]) {
    await ai.locator("label.cbx__row").filter({ hasText: name }).click();
    await expect(ai.getByRole("checkbox", { name })).toBeChecked();
  }
  await ai.getByRole("textbox", { name: "Qisqacha" }).fill("Operator tuzatgan qisqacha matn");
  // A draft can be edited and copied, never applied.
  await expect(ai.getByRole("checkbox", { name: /Javob qoralamalari/ })).toBeDisabled();
  await shot(page, "lead-copilot");
  await ai.getByRole("button", { name: "Tanlanganlarni qo'llash (2)" }).click();
  const prev = page.getByRole("dialog", { name: "Shu o'zgarishlar qo'llansinmi?" });
  await expect(prev).toContainText("Operator tuzatgan qisqacha matn");
  await prev.getByRole("button", { name: "Tanlanganlarni qo'llash (2)" }).click();
  await expect.poll(() => st.applied).not.toBeNull();
  expect(st.applied).toEqual({ selected_paths: ["summary", "urgency"], overrides: { summary: "Operator tuzatgan qisqacha matn" }, expected_lock_version: 4 });
  expect(missing).toEqual([]);
});

test("AI copilot: all eleven run types; a run already going opens instead of a second; an SMS draft goes to the SMS pane", async ({ page }) => {
  const missing = watchIntl(page);
  const { routes } = crmServer([...(OPERATOR.permissions ?? []), "crm.sms.manage"]);
  const r = routes as Record<string, unknown>;
  r["POST /crm/leads/m1/ai/runs"] = () => ({ status: 409, json: { detail: { code: "crm_ai_run_active", run_id: "run-9" } } });
  r["/crm/ai/runs/run-9"] = { id: "run-9", lead_id: "m1", run_type: "sms_draft", language: "uz_latn", status: "completed", output: { sms_draft: "Assalomu alaykum! Shartnoma nusxasini yuboring.", operator_confirmation_required: true, auto_executed: false }, created_at: new Date().toISOString() };
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads/m1");
  const ai = await openAi(page);
  await expect(ai.locator(".crm-ai__types .crm-chip")).toHaveCount(11);
  await ai.locator(".crm-ai__types").getByRole("button", { name: "SMS qoralamasi" }).click();
  await ai.getByRole("button", { name: "Kopilotdan so'rash" }).click();
  // The run already going is opened, not a second one.
  await expect(ai.getByRole("textbox", { name: "SMS qoralamasi" })).toHaveValue("Assalomu alaykum! Shartnoma nusxasini yuboring.");
  await expect(ai.getByRole("button", { name: /Hammasini|apply all/i })).toHaveCount(0);
  await ai.getByRole("button", { name: "SMS qoralamasiga o'tkazish" }).click();
  await wsTab(page, /Tarix/);
  const sms = page.locator(".crm-smspane");
  await expect(sms.getByRole("textbox").first()).toHaveValue("Assalomu alaykum! Shartnoma nusxasini yuboring.");
  expect(missing).toEqual([]);
});

test("customer profile: current and past leads, contacts, and merge only with its permission", async ({ page }) => {
  const missing = watchIntl(page);
  const { routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/customers/c1");
  await expect(page.locator(".crm-lhead")).toContainText("Dilnoza Karimova");
  await expect(page.getByText("Joriy lidlar")).toBeVisible();
  await expect(page.getByText("O'tgan lidlar")).toBeVisible();
  await expect(page.locator(".crm-leadcard")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /Birlashtirish/ })).toHaveCount(0);
  await shot(page, "customer");
  expect(missing).toEqual([]);
});

test("superadmin: global analytics with revenue; merge asks for a typed confirmation; export runs in the background", async ({ page }) => {
  const missing = watchIntl(page);
  const ALL = ["crm.customers.view", "crm.customers.manage", "crm.customers.merge", "crm.leads.view", "crm.leads.manage", "crm.leads.claim", "crm.leads.assign", "crm.analytics.self", "crm.analytics.global", "crm.revenue.view", "crm.ai.use", "crm.exports.create", "crm.templates.manage"];
  const { routes } = crmServer(ALL, true);
  const mock = await mockBackend(page, await signIn(page, ADMIN, routes as never));
  await page.goto("/uz/admin/crm/analytics");
  await expect(page.locator(".crm-revenue")).toContainText("25 039 162");
  await expect(page.locator(".crm-board li")).toHaveCount(1);
  await shot(page, "analytics");

  await page.goto("/uz/admin/crm/customers/c1");
  await page.getByRole("button", { name: /Birlashtirish/ }).click();
  const dlg = page.getByRole("dialog", { name: "Mijozlarni birlashtirish" });
  await dlg.getByRole("textbox").fill("Dilnoza");
  await dlg.getByRole("button", { name: /Dilnoza K\./ }).click();
  await expect(dlg.locator(".crm-compare__side")).toHaveCount(2);
  await dlg.getByRole("textbox").first().fill("Bir xil odam, tasdiqlandi");
  const go = dlg.getByRole("button", { name: "Butunlay birlashtirish" });
  await expect(go).toBeDisabled();
  await dlg.getByRole("textbox", { name: /BIRLASHTIRISH/ }).fill("BIRLASHTIRISH");
  await expect(go).toBeEnabled();
  await dlg.getByRole("button", { name: "Bekor qilish" }).click();
  expect(mock.calls.filter((c) => c.path === "/crm/customers/merge")).toHaveLength(0);

  await page.goto("/uz/admin/crm/leads");
  await page.getByRole("button", { name: "Excelga eksport" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Eksportni boshlash" }).click();
  await expect(page.locator(".crm-job")).toBeVisible();
  await expect(page.locator(".crm-job").getByRole("button", { name: "Yuklab olish" })).toBeVisible({ timeout: 15000 });
  expect(mock.calls.find((c) => c.method === "POST" && c.path === "/crm/exports")?.body).toMatchObject({ scope: "leads" });
  expect(missing).toEqual([]);
});

// A real HTML5 drag: press, nudge (so the browser starts a drag), glide over
// the column, release.
// Drops `from` on `to`: on its upper part when `to` is a card (lands before
// it), else low in the column (lands at the end).
async function dragCard(page: Page, from: Locator, to: Locator, onCard = false) {
  await from.hover(); // waits until the card has stopped animating in
  await to.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, onCard ? b.y + b.height * 0.25 : b.y + 140, { steps: 12 });
  await page.mouse.move(b.x + b.width / 2 + 2, onCard ? b.y + b.height * 0.25 + 1 : b.y + 141, { steps: 2 });
  await page.mouse.up();
}

test("kanban: GET /crm/kanban, reorder in a column, status moves with the lock; won without a paid order snaps back", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  st.queue = [lead("q1"), lead("q2", { title: "Aliment undirish" }), lead("q3", { title: "Mehnat nizosi", lock_version: 3 })];
  st.queue.forEach((l) => (l.allowed_actions = ["view_timeline", "change_status", "claim"]));
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads?tab=all&view=board");
  const cols = page.locator(".crm-col");
  await expect(cols).toHaveCount(6);
  const fresh = cols.first();
  await expect(fresh.locator(".crm-kcard")).toHaveCount(3);
  // Six fixed columns, each with its own icon in the stepper set; no old ones.
  await expect(page.locator(".crm-board")).not.toContainText(/Bog'lanildi|To'lov kutilmoqda/);
  await shot(page, "board");

  // Inside a column: the new place goes to the move endpoint with the lock.
  await dragCard(page, fresh.locator(".crm-kcard").nth(2), fresh.locator(".crm-kcard").first(), true);
  await expect.poll(() => st.moves.length).toBe(1);
  expect(st.moves[0]).toMatchObject({ id: "q3", column_key: "new", position: 0, expected_lock_version: 3 });
  await expect(fresh.locator(".crm-kcard").first()).toContainText("Mehnat nizosi");

  // Another column: a status change with the lock, the card follows only after the backend agrees.
  const target = cols.nth(1);
  await dragCard(page, fresh.locator(".crm-kcard").filter({ hasText: "Aliment undirish" }), target);
  await expect.poll(() => st.writes.find((w) => w.path === "status:q2")?.body).toMatchObject({ status: "qualified", expected_lock_version: 1 });
  await expect(target.locator(".crm-kcard")).toContainText(["Aliment undirish"]);

  // Won without a paid order: refused, the card stays where it was, the reason is said.
  await fresh.locator(".crm-kcard").filter({ hasText: "Ijara shartnomasi" }).getByRole("button", { name: "Ko'chirish…" }).click();
  await fresh.locator(".crm-kcard__menu").getByRole("button", { name: "Yutildi" }).click();
  await expect(page.getByText("«Yutildi» uchun to'langan buyurtma kerak.").first()).toBeVisible();
  await expect(fresh.locator(".crm-kcard")).toContainText(["Ijara shartnomasi"]);
  await expect(cols.nth(4).locator(".crm-kcard")).toHaveCount(0);

  // Rejected asks for a reason first.
  await fresh.locator(".crm-kcard").filter({ hasText: "Ijara shartnomasi" }).getByRole("button", { name: "Ko'chirish…" }).click();
  await fresh.locator(".crm-kcard__menu").getByRole("button", { name: "Rad etilgan" }).click();
  const sheet = page.getByRole("dialog", { name: /rad etilsinmi/ });
  await sheet.getByRole("button", { name: "Rad etish" }).click();
  await expect(sheet).toContainText("Sababni yozing.");
  await sheet.getByRole("textbox").fill("Mijoz boshqa yurist bilan ishlaydi");
  await sheet.getByRole("button", { name: "Rad etish" }).click();
  await expect.poll(() => st.writes.filter((w) => w.path === "status:q1").at(-1)?.body).toMatchObject({ status: "rejected", reason: "Mijoz boshqa yurist bilan ishlaydi" });
  await expect(cols.nth(5).locator(".crm-kcard")).toContainText(["Ijara shartnomasi"]);
  expect(missing).toEqual([]);
});

test("kanban: load more pages one column; status settings keep all six keys", async ({ page }) => {
  const { st, routes } = crmServer([...(OPERATOR.permissions ?? []), "crm.automation.manage"]);
  st.queue = Array.from({ length: 33 }, (_, i) => lead(`n${i}`, { title: `Murojaat ${i + 1}` }));
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads?tab=all&view=board");
  const fresh = page.locator(".crm-col").first();
  await expect(fresh.locator(".crm-kcard")).toHaveCount(30);
  await fresh.getByRole("button", { name: /Yana yuklash \(3\)/ }).click();
  await expect(fresh.locator(".crm-kcard")).toHaveCount(33);
  await expect(fresh.getByRole("button", { name: /Yana yuklash/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Holat sozlamalari" }).click();
  const drawer = page.getByRole("dialog", { name: "Holat sozlamalari" });
  await expect(drawer.locator(".crm-colmgr__row")).toHaveCount(6);
  await expect(drawer.getByRole("button", { name: /olib tashlash|arxivlash/i })).toHaveCount(0);
  await drawer.getByRole("textbox", { name: "2-holat nomi" }).fill("Ehtiyoj aniqlandi");
  await drawer.getByRole("button", { name: "Ehtiyoj aniqlandi — yuqoriga" }).click();
  await drawer.getByRole("button", { name: "Saqlash" }).click();
  await expect.poll(() => st.colWrites.length).toBe(1);
  const body = st.colWrites[0].body as { columns: { key: string; title: string; order: number }[] };
  expect(body.columns.map((c) => c.key)).toEqual(["qualified", "new", "proposal", "decision_pending", "won", "rejected"]);
  expect(body.columns.map((c) => c.order)).toEqual([10, 20, 30, 40, 50, 60]);
  expect(body.columns[0].title).toBe("Ehtiyoj aniqlandi");
});

test("kanban: without crm.automation.manage there are no status settings; a claim from the board says who has it", async ({ page }) => {
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads?tab=queue&view=board");
  await expect(page.getByRole("tab", { name: /Hammasi/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Holat sozlamalari" })).toHaveCount(0);
  const fresh = page.locator(".crm-col").first();
  // No next action yet: the card shows the customer's phone, not a dash.
  const reach = fresh.locator(".crm-kcard").filter({ hasText: "Mehnat nizosi" }).locator(".crm-kcard__reach");
  await expect(reach).toHaveText("+998901234567");
  await fresh.locator(".crm-kcard").filter({ hasText: "Ijara shartnomasi" }).getByRole("button", { name: "Olish" }).click();
  await expect.poll(() => st.claims).toEqual(["q1"]);
  await fresh.locator(".crm-kcard").filter({ hasText: "Aliment undirish" }).getByRole("button", { name: "Olish" }).click();
  await expect(page.getByText(/Kimdir tezroq bo'ldi/).first()).toBeVisible();
});

test("realtime: another user's move slides the card over; an actionable event pops a card that opens the lead", async ({ page }) => {
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  const mock = await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads?tab=all&view=board");
  const cols = page.locator(".crm-col");
  await expect(cols.first().locator(".crm-kcard")).toHaveCount(3);
  await expect.poll(() => mock.sockets.length).toBeGreaterThan(0);
  // The backend moved q3 to "qualified" (another operator): the card moves at once.
  const q3 = st.queue.find((l) => l.id === "q3")!;
  Object.assign(q3, { status: "qualified", lock_version: 2 });
  await mock.push({ event: "crm.lead.moved", lead_id: "q3", from: "new", to: "qualified", position: 0, lock_version: 2 });
  await expect(cols.nth(1).locator(".crm-kcard").first()).toContainText("Mehnat nizosi");
  await expect(cols.first().locator(".crm-kcard")).toHaveCount(2);
  // An assignment pops a card; its button opens the lead.
  await mock.push({ event: "crm.lead.assigned", lead_id: "m1", notification: { title: "", body: "Ijara shartnomasi tekshiruvi" } });
  const card = page.locator(".ntf").filter({ hasText: "Sizga lid biriktirildi" });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Ochish" }).click();
  await expect(page).toHaveURL(/\/admin\/crm\/leads\/m1$/);
});

test("calls: a phone contact, the consent text, a live transcript with AI assist, and a no-answer completion", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer([...(OPERATOR.permissions ?? []), "crm.calls.start"]);
  st.mine[0].allowed_actions = [...(st.mine[0].allowed_actions as string[]), "start_call"];
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads/m1?pane=calls");
  await wsTab(page, /Tarix/);
  const pane = page.locator(".crm-callpane");
  await expect(pane).toContainText("IP-telefoniya hali ulanmagan");
  await pane.getByRole("button", { name: "Qo'ng'iroqni boshlash" }).click();
  await expect.poll(() => st.callWrites[0]?.body).toMatchObject({ contact_id: "k1", direction: "outbound" });
  const live = pane.locator(".crm-livecall");
  await expect(live.locator(".crm-consent")).toContainText("Suhbat sifat uchun yozib olinmoqda");
  await live.getByRole("textbox", { name: "Matn qatori" }).fill("Shartnoma nusxasini qanday yuboraman?");
  await live.getByRole("textbox", { name: "Matn qatori" }).press("Enter");
  await expect.poll(() => st.callWrites.find((w) => w.path === "transcript")?.body).toMatchObject({ request_ai_assist: true, segments: [{ speaker: "customer", text: "Shartnoma nusxasini qanday yuboraman?" }] });
  await expect(live.locator(".crm-tscript")).toContainText("Shartnoma nusxasini qanday yuboraman?");
  await shot(page, "live-call");
  await live.getByRole("button", { name: "Javob yo'q" }).click();
  await expect(live).toContainText("180 soniyadan keyin standart SMS");
  await live.getByRole("button", { name: "Qo'ng'iroqni yakunlash" }).click();
  await expect.poll(() => st.callWrites.find((w) => w.path === "complete")?.body).toMatchObject({ status: "no_answer" });
  await expect(pane.locator(".crm-calllog")).toContainText("Javob yo'q");
  expect(missing).toEqual([]);
});

test("SMS: a draft is approved with edits; a missing provider shows as not configured with a retry, never as sent", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer([...(OPERATOR.permissions ?? []), "crm.sms.manage"]);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads/m1?pane=sms");
  await wsTab(page, /Tarix/);
  const pane = page.locator(".crm-smspane");
  await expect(pane).toContainText("180 soniyadan keyin standart SMS");
  await pane.getByRole("textbox").first().fill("Assalomu alaykum! Shartnoma nusxasini yuboring.");
  await pane.getByRole("button", { name: "Qoralamani saqlash" }).click();
  const row = pane.locator(".crm-sms").first();
  await expect(row).toContainText("Qoralama");
  await row.getByRole("button", { name: "Tahrirlash" }).click();
  await row.getByRole("textbox").fill("Assalomu alaykum! Iltimos, shartnoma nusxasini yuboring.");
  await row.getByRole("button", { name: "Tahrir bilan tasdiqlash" }).click();
  await expect.poll(() => st.smsApprovals[0]).toMatchObject({ id: "s1", body: "Assalomu alaykum! Iltimos, shartnoma nusxasini yuboring." });
  await expect(row).toContainText("SMS provayderi sozlanmagan");
  await expect(row).not.toContainText(/Yuborildi|Yetkazildi/);
  await expect(row.getByRole("button", { name: "Qayta yuborish" })).toBeVisible();
  await shot(page, "sms");
  expect(missing).toEqual([]);
});

test("robots: built with pickers, a draft until a dry run on a real lead; Turn on only after it", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer([...(OPERATOR.permissions ?? []), "crm.automation.manage"]);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/automation");
  await page.getByRole("button", { name: "Yangi robot" }).first().click();
  const ed = page.getByRole("dialog", { name: "Yangi robot" });
  await expect(ed.locator("textarea[name], select, input[type=checkbox]")).toHaveCount(0);
  await ed.getByRole("textbox", { name: "Nomi" }).fill("Javobsiz qo'ng'iroq");
  await ed.getByRole("button", { name: /Qachon ishlaydi/ }).click();
  await page.getByRole("listbox").getByRole("option", { name: "Qo'ng'iroqqa javob bo'lmaganda" }).click();
  await ed.getByRole("button", { name: "Shart qo'shish" }).click();
  await ed.getByRole("button", { name: /^Shart/ }).first().click();
  await page.getByRole("listbox").getByRole("option", { name: "quyidagilardan biri" }).click();
  await ed.locator(".crm-cond .crm-chips").getByRole("button", { name: "Yangi" }).click();
  await ed.locator(".crm-cond .crm-chips").getByRole("button", { name: "Saralangan" }).click();
  await ed.getByRole("button", { name: /^Amal/ }).first().click();
  await page.getByRole("listbox").getByRole("option", { name: "Bildirishnoma yuborish" }).click();
  await ed.getByRole("textbox", { name: "Xabar matni" }).fill("Qayta qo'ng'iroq qiling");
  await ed.getByRole("button", { name: "Qoralama sifatida saqlash" }).click();
  await expect.poll(() => st.ruleWrites[0]?.body).toMatchObject({ name: "Javobsiz qo'ng'iroq", trigger_type: "call_no_answer", status: "draft", conditions: [{ field: "lead.status", operator: "in", value: ["new", "qualified"] }], actions: [{ type: "send_notification", message: "Qayta qo'ng'iroq qiling" }] });
  const card = page.locator(".crm-rule").first();
  await expect(card).toContainText("Agar: Lid holati quyidagilardan biri Yangi, Saralangan");
  // Turn on stays shut until a dry run on a real lead.
  await expect(card.getByRole("button", { name: "Yoqish" })).toBeDisabled();
  await card.getByRole("button", { name: "Sinab ko'rish" }).click();
  const dry = page.getByRole("dialog", { name: /sinash/ });
  await dry.getByRole("option", { name: /Ijara shartnomasi/ }).first().click();
  await dry.getByRole("button", { name: "Sinovni boshlash" }).click();
  await expect(dry.locator(".crm-dry")).toContainText("Shartlar mos keldi");
  await expect(dry.locator(".crm-dry")).toContainText("Bildirishnoma yuborish: «Qayta qo'ng'iroq qiling»");
  await expect(dry.locator(".crm-dry")).toContainText("Sinov hech narsani o'zgartirmadi");
  await shot(page, "robot-dry");
  await dry.getByRole("button", { name: "Tayyor" }).click();
  await card.getByRole("button", { name: "Yoqish" }).click();
  await expect.poll(() => st.ruleWrites.find((w) => w.path === "patch")?.body).toEqual({ status: "active" });
  await page.getByRole("tab", { name: "Ishga tushishlar" }).click();
  await expect(page.locator(".crm-runlog")).toContainText("1 urinish");
  expect(missing).toEqual([]);
});

test("live office: read-only, audited, transcript with lead context and live AI hints; hidden without permission", async ({ page }) => {
  const missing = watchIntl(page);
  const { routes } = crmServer([...(OPERATOR.permissions ?? []), "crm.live_calls.view"]);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/live");
  await expect(page.getByRole("note")).toContainText("Har bir ko'rish jurnalga yoziladi");
  await page.getByRole("button", { name: /Akmal Operator/ }).click();
  const d = page.locator(".crm-lo__detail");
  await expect(d.locator(".crm-tscript")).toContainText("Shartnomada kafil bandi bor.");
  await expect(d).toContainText("LEAD-M1");
  await expect(d.locator(".crm-lo__ai")).toContainText("Kafil bandi bo'yicha yuristimiz izoh beradi.");
  // Nothing to change from here.
  await expect(d.getByRole("button")).toHaveCount(0);
  await shot(page, "live-office");
  expect(missing).toEqual([]);
});

test("a hidden section is out of the menu and its URL says no access", async ({ page }) => {
  const { routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/live");
  await expect(page.locator("[data-denied]")).toContainText("Bu bo'lim sizning ruxsatlaringizga kirmaydi");
  const nav = page.locator(".crm-nav");
  await expect(nav.getByRole("link", { name: "Jonli ofis" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Robotlar" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Umumiy tahlil" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Lidlar" })).toHaveCount(1);
});

test("a finished lead reopens as a new cycle; the old cycle keeps its final status", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  st.mine = [...st.mine, lead("w1", { status: "won", title: "Nikoh shartnomasi", cycle_number: 1, lock_version: 7, assigned_operator_user_id: ME.id, assigned_operator: ME, allowed_actions: ["view_timeline", "edit", "reopen"], closed_at: "2026-09-20T08:00:00Z" })];
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads/w1");
  const head = page.locator(".crm-glance");
  await expect(head).not.toContainText("2-sikl");
  await head.getByRole("button", { name: "Qayta ochish" }).click();
  const sheet = page.getByRole("dialog", { name: /qayta ochish/ });
  await sheet.getByRole("button", { name: "Qayta ochish" }).click();
  await expect(sheet).toContainText("Murojaat matnini yozing.");
  await sheet.getByRole("textbox").first().fill("Yana murojaat: shartnomaga o'zgartirish");
  await sheet.getByRole("button", { name: "Qayta ochish" }).click();
  await expect.poll(() => st.writes.find((w) => w.path === "reopen:w1")?.body).toMatchObject({ inquiry: "Yana murojaat: shartnomaga o'zgartirish", source: "phone", expected_lock_version: 7 });
  await expect(head).toContainText("2-sikl");
  await wsTab(page, /Tarix/);
  await page.getByRole("tab", { name: /Sikllar/ }).click();
  const cycles = page.locator(".crm-cycles li");
  await expect(cycles).toHaveCount(2);
  await expect(cycles.nth(1)).toContainText("Yutildi");
  await expect(cycles.first()).toContainText("Joriy");
  await expect(page.locator(".crm-shist")).toContainText("Holat o'zgardi");
  await shot(page, "history");
  expect(missing).toEqual([]);
});

test("no page refetches by itself: once loaded, every CRM screen stays quiet", async ({ page }) => {
  const ALL = ["crm.customers.view", "crm.customers.manage", "crm.customers.merge", "crm.leads.view", "crm.leads.manage", "crm.leads.claim", "crm.leads.assign", "crm.analytics.self", "crm.analytics.global", "crm.revenue.view", "crm.ai.use", "crm.exports.create", "crm.templates.manage"];
  const { routes } = crmServer(ALL, true);
  const mock = await mockBackend(page, await signIn(page, ADMIN, routes as never));
  const crmCalls = () => mock.calls.filter((c) => c.path.startsWith("/crm")).length;
  for (const url of ["/uz/admin/crm", "/uz/admin/crm/leads?tab=all", "/uz/admin/crm/leads?tab=all&view=board", "/uz/admin/crm/leads/m1", "/uz/admin/crm/customers", "/uz/admin/crm/customers/c1", "/uz/admin/crm/templates", "/uz/admin/crm/analytics"]) {
    await page.goto(url);
    await expect(page.locator(".crm-top")).toBeVisible();
    await page.waitForTimeout(1500);
    const before = crmCalls();
    await page.waitForTimeout(2000);
    expect(crmCalls() - before, `${url} kept fetching`).toBe(0);
  }
});

// CRM customer/lead contract 2026-10-27: one paged, searchable customer
// select; a new customer is made above the still-open lead form and comes
// back selected with its region; no category and no user id are sent; the
// details render as labelled sections — no raw JSON, codes or ids.
test("new lead: one customer select, a new customer above the form, region from the customer, readable details", async ({ page }) => {
  const missing = watchIntl(page);
  const ALL = ["crm.customers.view", "crm.customers.manage", "crm.leads.view", "crm.leads.manage", "crm.leads.claim", "crm.analytics.self", "crm.ai.use"];
  const { st, routes } = crmServer(ALL);
  const opt = (i: number, extra: Record<string, unknown> = {}) => ({ id: `s${i}`, public_id: `CRM-${1000 + i}`, name: `Mijoz ${i}`, region: i % 2 ? "Toshkent" : "Buxoro", primary_phone: `+99890000${String(i).padStart(4, "0")}`, is_lexgo_user: i === 1, lexgo_user_label: "LexGo foydalanuvchisi", lexgo_id: i === 1 ? "LGC-1" : null, lead_count: i, display_label: `Mijoz ${i} · CRM-${1000 + i}`, ...extra });
  const selectQs: string[] = [];
  const created: Record<string, unknown>[] = [];
  const NEW = { id: "c-new", public_id: "CRM-NEW00001", user_id: null, is_lexgo_user: false, lexgo_user_label: "", reused: false, account_linking: { status: "unlinked", user_id: null, automatic_by_verified_phone: true, required_action: "" }, name: "Aziza Karimova", preferred_language: "uz_latn", region: "Samarqand", primary_phone: "+998901112233", status: "active", source: "manual", lead_count: 0, active_lead_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), notes: "", contacts: [], leads: [], orders: [], activity_count: 0 };
  Object.assign(routes, {
    "/crm/customers/select": (_: unknown, url: URL) => {
      const q = url.searchParams.get("q") ?? "";
      const offset = Number(url.searchParams.get("offset") ?? 0);
      selectQs.push(`${q}|${offset}`);
      if (q === "yo'q") return { items: [], total: 0, limit: 30, offset: 0, has_more: false };
      const all = Array.from({ length: 45 }, (_, i) => opt(i + 1)).filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));
      const items = all.slice(offset, offset + 30);
      return { items, total: all.length, limit: 30, offset, has_more: offset + items.length < all.length };
    },
    "POST /crm/customers": (b: Record<string, unknown>) => (created.push(b), NEW),
    "POST /crm/leads": (b: Record<string, unknown>) => (created.push({ lead: b }), { ...st.mine[0], id: "m1" }),
  });
  const mock = await mockBackend(page, await signIn(page, ADMIN, routes as never));
  await page.goto("/uz/admin/crm/leads");
  await page.getByRole("button", { name: "Yangi lid" }).first().click();
  const lead = page.getByRole("dialog", { name: "Yangi lid" });
  await expect(lead).toBeVisible();
  // A category field and a LexGo user-id field are gone.
  await expect(lead.getByText("Kategoriya")).toHaveCount(0);
  await expect(lead.getByText(/foydalanuvchi ID/)).toHaveCount(0);
  await lead.getByLabel("Nomi", { exact: true }).fill("Shartnomani tekshirish");
  await lead.getByLabel("Murojaat to'liq").fill("Ijara shartnomasi");

  // The select loads its first page on open, shows the badge, and appends on scroll.
  await lead.getByRole("button", { name: /Mijoz/ }).first().click();
  const list = page.getByRole("listbox", { name: "Mijozni qidirish" });
  await expect(list.getByRole("option")).toHaveCount(30);
  await expect(list.getByRole("option").first().locator(".crm-lxbadge")).toHaveText("LexGo foydalanuvchisi");
  await expect(list.getByRole("option").nth(1).locator(".crm-lxbadge")).toHaveCount(0);
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(list.getByRole("option")).toHaveCount(45);
  await shot(page, "lead-picker");
  // A search is debounced into one request; nothing found offers a new customer.
  await page.getByRole("textbox", { name: "Mijozni qidirish" }).fill("yo'q");
  await expect(page.getByText("Mijoz topilmadi. Yangi mijoz qo'shishingiz mumkin.")).toBeVisible();
  expect(selectQs.filter((q) => q.startsWith("y")).length).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Yangi mijoz qo'shish" }).click();

  // The customer form opens above the lead form; no LexGo account field.
  const cust = page.getByRole("dialog", { name: "Yangi mijoz" });
  await expect(cust).toBeVisible();
  await expect(lead).toBeVisible();
  await expect(cust.getByText(/LexGo akkaunt ID/)).toHaveCount(0);
  await cust.getByLabel("Ism", { exact: true }).fill("Aziza Karimova");
  await cust.getByLabel("Telefon").fill("+998901112233");
  await shot(page, "lead-new-customer");
  await cust.getByRole("button", { name: "Yaratish va tanlash" }).click();
  await expect(cust).toHaveCount(0);
  expect(created[0]).not.toHaveProperty("user_id");
  expect(created[0]).toMatchObject({ name: "Aziza Karimova" });

  // Back on the same lead form: the draft stayed, the customer is picked, the region came with it.
  await expect(lead.getByLabel("Nomi", { exact: true })).toHaveValue("Shartnomani tekshirish");
  await expect(lead.getByLabel("Murojaat to'liq")).toHaveValue("Ijara shartnomasi");
  await expect(lead.locator(".crm-picker")).toContainText("Aziza Karimova");
  await expect(lead.getByLabel("Hudud")).toHaveValue("Samarqand");
  await lead.getByLabel("Hudud").fill("Buxoro");
  await expect(lead.getByText("Saqlangach mijozning hududi ham yangilanadi.")).toBeVisible();
  // Sources read as words, never codes.
  await expect(lead.locator(".crm-field", { hasText: "Manba" })).toContainText("Telefon");
  await lead.getByRole("button", { name: "Lidni yaratish" }).click();
  await expect(page).toHaveURL(/\/admin\/crm\/leads\/m1$/);
  const body = (created[1] as { lead: Record<string, unknown> }).lead;
  expect(body).toMatchObject({ customer_id: "c-new", title: "Shartnomani tekshirish", region: "Buxoro", source: "phone" });
  expect(body).not.toHaveProperty("category");
  expect(body).not.toHaveProperty("client_user_id");
  expect(body).not.toHaveProperty("customer");
  expect(mock.refused).toEqual([]);
  expect(missing).toEqual([]);
});

test("lead details: detail_sections read as labelled values; ids, codes and raw JSON never show", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  st.mine[0] = {
    ...st.mine[0],
    detail_sections: [
      { key: "request", title: "Murojaat", items: [{ key: "title", label: "Murojaat nomi", value_type: "text", value: "Ijara", items: [] }] },
      {
        key: "additional",
        title: "Qo'shimcha",
        items: [
          { key: "kanban", label: "Kanban", value_type: "group", value: null, items: [{ key: "moved_by_user_id", label: "Moved by user id", value_type: "text", value: "2b0a4af1-b3b9-421c-8b5a-229c20bd59f3", items: [] }] },
          { key: "documents", label: "Hujjatlar", value_type: "group", value: null, items: [{ key: "has_contract", label: "Shartnoma bor", value_type: "boolean", value: true, items: [] }, { key: "signed_at", label: "Imzolangan", value_type: "datetime", value: "2026-10-20T09:30:00Z", items: [] }, { key: "pipeline", label: "Yo'l", value_type: "text", value: "ai_classify", items: [] }] },
          { key: "tags", label: "Teglar", value_type: "list", value: null, items: [{ key: "t0", label: "", value_type: "text", value: "Ijara", items: [] }, { key: "t1", label: "", value_type: "text", value: "Shoshilinch", items: [] }] },
        ],
      },
    ],
  };
  const mock = await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads/m1");
  await wsTab(page, /Mijoz|Ma'lumot/);
  const more = page.locator("section", { has: page.locator("#crm-more-t") });
  await expect(more).toContainText("Shartnoma bor");
  await expect(more.locator(".crm-yn")).toHaveText("Ha");
  await expect(more).toContainText("Teglar");
  await expect(more.locator(".crm-dl__chips i")).toHaveCount(2);
  await expect(more).not.toContainText("2b0a4af1");
  await expect(more).not.toContainText("Moved by");
  await expect(more).not.toContainText("ai_classify");
  await expect(more).not.toContainText("2026-10-20T");
  // The timeline payload is labelled values too — never a <pre> of JSON.
  await expect(page.locator(".crm-tl pre")).toHaveCount(0);
  await shot(page, "lead-details");
  expect(mock.refused).toEqual([]);
  expect(missing).toEqual([]);
});

test("draft order: service, specialist and package are chosen by name; the review and the result show no ids", async ({ page }) => {
  const missing = watchIntl(page);
  const { routes } = crmServer(OPERATOR.permissions ?? []);
  let conv: Record<string, unknown> | null = null;
  const sellerQs: string[] = [];
  const pkgQs: string[] = [];
  Object.assign(routes, {
    "/services": [
      { id: "svc-1", title: "Shartnoma ekspertizasi", category_title: "Shartnomalar", subcategory: "Ijara" },
      { id: "svc-2", title: "Da'vo arizasi", category_title: "Fuqarolik", subcategory: "" },
    ],
    "/marketplace/lawyers": (_: unknown, url: URL) => (sellerQs.push(url.searchParams.get("service_id") ?? ""), { items: [{ user_id: "u-s1", display_name: "Madina Yusupova", region: "Toshkent", rating: 4.8 }], total: 1, limit: 30, offset: 0 }),
    "/service-packages": (_: unknown, url: URL) => (pkgQs.push(url.searchParams.get("service_id") ?? ""), [{ id: "pk-1", title: "Biznes start", category_title: "Biznes", duration: "1 oy", is_active: true }]),
    // Gaps closed §20: the updated lead with converted_order { work_id }.
    "POST /crm/leads/m1/conversion": (b: Record<string, unknown>) => ((conv = b), { id: "m1", work_id: "LEAD-M1", converted_order_id: "0f9d8c7b-0000-4000-8000-000000000001", converted_order: { id: "0f9d8c7b-0000-4000-8000-000000000001", work_id: "ORD-7Q2K", status: "operator_draft", payment_status: "unpaid" } }),
  });
  const mock = await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads/m1");
  await wsTab(page, /Mijoz|Ma'lumot/);
  await page.getByRole("button", { name: "Buyurtma tayyorlash" }).click();
  const dlg = page.getByRole("dialog", { name: "Buyurtma tayyorlash" });
  await expect(dlg.getByPlaceholder("uuid")).toHaveCount(0);
  await dlg.getByRole("button", { name: "Xizmat", exact: true }).click();
  await page.getByRole("option", { name: /Shartnoma ekspertizasi/ }).click();
  await dlg.getByRole("button", { name: "Mutaxassis", exact: true }).click();
  await expect(page.getByRole("option", { name: /Madina Yusupova/ })).toContainText("★ 4.8");
  await page.getByRole("option", { name: /Madina Yusupova/ }).click();
  expect(sellerQs.at(-1)).toBe("svc-1");
  await dlg.getByRole("button", { name: "Paket", exact: true }).click();
  await expect(page.getByRole("option", { name: /Biznes start/ })).toContainText("Biznes · 1 oy");
  await page.getByRole("option", { name: /Biznes start/ }).click();
  // Packages are asked for the chosen service (gaps closed §21).
  expect(pkgQs.at(-1)).toBe("svc-1");
  await dlg.getByLabel("Narx, so'm").fill("450000");
  await shot(page, "conversion");
  await dlg.getByRole("button", { name: "Ko'rib chiqish" }).click();
  await expect(dlg.locator(".crm-draft")).toContainText("Shartnoma ekspertizasi");
  await expect(dlg.locator(".crm-draft")).toContainText("Madina Yusupova");
  await expect(dlg.locator(".crm-draft")).toContainText("Biznes start");
  await dlg.getByRole("button", { name: "Qoralama yaratish" }).click();
  await expect(dlg).toContainText("ORD-7Q2K");
  await expect(dlg).not.toContainText("0f9d8c7b");
  await expect(dlg).not.toContainText("LEAD-M1");
  expect(conv).toMatchObject({ service_id: "svc-1", seller_user_id: "u-s1", package_id: "pk-1", price: 450000 });
  expect(mock.refused).toEqual([]);
  expect(missing).toEqual([]);
});

test("Eslatma: a reminder time becomes the lead's next action and shows in the history", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  const mock = await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads/m1");
  await wsTab(page, /Tarix/);
  const composer = page.locator(".crm-composer");
  // Only the follow-up type offers a time.
  await expect(composer.locator(".crm-remind")).toHaveCount(0);
  await composer.getByRole("button", { name: "Eslatma" }).click();
  await expect(composer.locator(".crm-remind")).toBeVisible();
  await composer.getByRole("button", { name: "24 soatdan keyin" }).click();
  await composer.getByRole("textbox", { name: /Izoh yozing/ }).fill("Shartnoma nusxasini so'rab qayta qo'ng'iroq qilish");
  await shot(page, "remind");
  await composer.getByRole("button", { name: "Qo'shish" }).click();
  await expect(page.getByText("Eslatma qo'shildi va keyingi amal belgilandi.").first()).toBeVisible();
  // The lock-carrying PATCH first, then the history entry with the time in it.
  const patch = st.writes.find((w) => w.path === "patch")?.body as Record<string, unknown>;
  expect(patch).toMatchObject({ expected_lock_version: 4 });
  const at = Date.parse(String(patch.next_action_at));
  expect(at - Date.now()).toBeGreaterThan(22 * 3_600_000);
  expect(at - Date.now()).toBeLessThan(25 * 3_600_000);
  const call = mock.calls.find((c) => c.method === "POST" && c.path === "/crm/leads/m1/activities");
  expect(call?.body).toMatchObject({ activity_type: "follow_up", payload: { remind_at: patch.next_action_at } });
  // The composer is cleared and the reminder box resets.
  await expect(composer.getByRole("textbox", { name: /Izoh yozing/ })).toHaveValue("");
  // A note without a time does not touch the lead.
  await composer.getByRole("button", { name: "Izoh" }).click();
  await composer.getByRole("textbox", { name: /Izoh yozing/ }).fill("Oddiy izoh");
  await composer.getByRole("button", { name: "Qo'shish" }).click();
  await expect(page.getByText("Tarixga qo'shildi.").first()).toBeVisible();
  expect(st.writes.filter((w) => w.path === "patch")).toHaveLength(1);
  expect(mock.refused).toEqual([]);
  expect(missing).toEqual([]);
});
