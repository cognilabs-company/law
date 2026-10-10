// Live office: who is doing what right now, read from the audit trail.
// Pure functions only (no fetch, no React) so the room rules can be checked
// against real audit rows outside the app.

export const ROOMS = ["lobby", "talk", "urgent", "documents", "desk", "ai", "market", "studio", "admin"] as const;
export type OfficeRoom = (typeof ROOMS)[number];

export type PersonKind = "lead" | "operator" | "lawyer" | "jurist" | "client";
export const KINDS: PersonKind[] = ["lead", "operator", "lawyer", "jurist", "client"];

export type Verb =
  | "login" | "logout" | "view" | "create" | "update" | "remove" | "download" | "upload" | "submit" | "publish"
  | "claim" | "generate" | "message" | "call" | "search" | "complete" | "accept" | "work";

export type OfficeStatus = "working" | "idle" | "away";

// A real action keeps a person "working" this long; any sign of life (a
// token refresh included) keeps them seated as "idle" up to IDLE_MS.
export const WORK_MS = 5 * 60_000;
export const IDLE_MS = 30 * 60_000;

export type RawEvent = {
  id: string;
  userId: string;
  action: string;
  targetType: string;
  detail: string;
  title: string;
  at: number;
};

export type OfficeEvent = RawEvent & {
  room: OfficeRoom;
  object: string;
  verb: Verb;
  // Signs of life that move nobody: token refresh, background runtime ticks.
  presence: boolean;
};

export type Segment = {
  kind: "room" | "away" | "out";
  room: OfficeRoom;
  from: number;
  to: number;
  events: OfficeEvent[];
};

export type OfficePerson = {
  id: string;
  name: string;
  kind: PersonKind;
  role: string;
  status: OfficeStatus;
  room: OfficeRoom;
  arrivedAt: number;
  lastAt: number;
  lastSeenAt: number;
  last: OfficeEvent | null;
  segments: Segment[];
  actions: number;
  leftAt: number;
};

const PRESENCE = /^(refresh|ai_instructor_runtime_update|studio_activity_heartbeat|heartbeat)$/;

// First match wins: [action pattern, room, object].
const RULES: [RegExp, OfficeRoom, string][] = [
  [/^(login|login_2fa|logout|refresh|session_|totp_|2fa_|identity_|telegram_|consent_accept|password_|notification_preferences|profile_|security_)/, "lobby", "account"],
  [/^urgent_advokat|^sos/, "urgent", "urgent"],
  [/^studio_/, "studio", "studio"],
  [/^secure_chat_file/, "talk", "file"],
  [/^secure_chat|^chat_/, "talk", "chat"],
  [/^support_ticket|^support_/, "talk", "ticket"],
  [/complaint/, "talk", "complaint"],
  [/^call_center_queue/, "talk", "queue"],
  [/^call_center|^call_|^meeting|^document_request_meeting/, "talk", "call"],
  [/^ai_document_analysis|^document_analysis/, "documents", "analysis"],
  [/^contract_/, "documents", "contract"],
  [/^(service_)?template_|^service_template_/, "documents", "template"],
  [/^document_lawyer_request|^service_document_lawyer_request/, "documents", "lawyerRequest"],
  [/^document_|^service_document_|^custom_document|^existing_document/, "documents", "document"],
  [/^workspace_/, "documents", "file"],
  [/^ai_legal_corpus/, "ai", "corpus"],
  [/^marketplace_ai_search/, "ai", "aiSearch"],
  [/^ai_/, "ai", "assistant"],
  [/^task_/, "desk", "task"],
  [/^case_|^legal_case/, "desk", "case"],
  [/^calendar_|^deadline_|^business_holiday/, "desk", "calendar"],
  [/^lawyer_client/, "desk", "client"],
  [/^conflict_check/, "desk", "conflict"],
  [/^matching/, "market", "matching"],
  [/^marketplace_order|^order_|^service_order/, "market", "order"],
  [/^payment_|^refund_|^payout_|^invoice_/, "market", "payment"],
  [/^package_|^service_package/, "market", "package"],
  [/^ads_product|^promotion_|^ads_/, "market", "ad"],
  [/^lawyer_service_capability|^lawyer_service|^service_/, "market", "service"],
  [/^marketplace_/, "market", "marketplace"],
  [/^lawyer_profile/, "market", "profile"],
  [/^subscription|^plan_|^gift|^warranty|^upsell/, "market", "subscription"],
  [/^seller_availability/, "market", "profile"],
  [/^admin_user|^user_|^role_|^register_request/, "admin", "user"],
  [/^platform_policy|^legal_consent|^policy_/, "admin", "policy"],
  [/^organization_/, "admin", "organization"],
  [/^academy_/, "admin", "course"],
  [/^b2b_/, "admin", "b2b"],
  [/^seller_verification|^seller_register|^lawyer_verif|^verification_|^review/, "admin", "verification"],
  [/^approval/, "admin", "approval"],
  [/^audit_/, "admin", "audit"],
  [/^workspace_file|^file_/, "documents", "file"],
];

// Last match wins, so the specific endings sit below the general ones.
const VERBS: [RegExp, Verb][] = [
  [/view|open|list|candidates|_preview|get$|signed_url/, "view"],
  [/create|_add$|_clone$|_start$|_request$/, "create"],
  [/update|patch|upsert|_edit($|_)|_status$|_change|_set$|_assign|_move|preferences|_grant$|_save$/, "update"],
  [/delete|archive|cancel|stop|deactivate|revoke|reject|_remove/, "remove"],
  [/download|export/, "download"],
  [/upload/, "upload"],
  [/submit/, "submit"],
  [/publish|approved|approve$|_activate$/, "publish"],
  [/claim|_take$/, "claim"],
  [/generate|finalize|_version_create|calculate/, "generate"],
  [/_message$|_chat$/, "message"],
  [/_call$|call_create$/, "call"],
  [/search|^matching$/, "search"],
  [/complete|_done$|_close$|_closed$/, "complete"],
  [/accept/, "accept"],
  [/^sos$|^complaint$/, "create"],
  [/_enable$|_disable$/, "update"],
  [/^login/, "login"],
  [/^logout$|^session_revoke$/, "logout"],
];

export function classify(action: string): { room: OfficeRoom; object: string } {
  const a = action.trim().toLowerCase();
  for (const [re, room, object] of RULES) if (re.test(a)) return { room, object };
  return { room: "desk", object: "other" };
}

export function verbOf(action: string): Verb {
  const a = action.trim().toLowerCase();
  let v: Verb = "work";
  for (const [re, verb] of VERBS) if (re.test(a)) v = verb;
  return v;
}

export function toOfficeEvent(e: RawEvent): OfficeEvent {
  const { room, object } = classify(e.action);
  return { ...e, room, object, verb: verbOf(e.action), presence: PRESENCE.test(e.action) };
}

// Leadership wins from any role, primary or extra (a superadmin whose
// primary role is "client" still sits with the leadership); otherwise the
// primary role decides, and only a client is read from the extra roles.
function roleKind(r: string): PersonKind {
  if (["superadmin", "admin", "manager"].includes(r)) return "lead";
  if (["call_center", "call_center_lawyer", "sales_operator", "sales"].includes(r)) return "operator";
  if (r === "advokat" || r === "advokat_tashkiloti") return "lawyer";
  if (r === "yurist") return "jurist";
  return "client";
}

export function kindOf(role: string, roles: string[]): PersonKind {
  const all = [role, ...roles].map((r) => r.toLowerCase());
  if (all.some((r) => roleKind(r) === "lead")) return "lead";
  const primary = roleKind(role.toLowerCase());
  if (primary !== "client") return primary;
  for (const k of ["operator", "lawyer", "jurist"] as PersonKind[]) if (all.some((r) => roleKind(r) === k)) return k;
  return "client";
}

// The day's path, in order: one "room" segment per stay in a room, "out"
// from a logout until the next sign of life, "away" for a silent gap longer
// than IDLE_MS. A login while already seated in a room (a token re-login)
// does not split the stay.
export function segmentsOf(events: OfficeEvent[]): Segment[] {
  const out: Segment[] = [];
  let lastAt = 0;
  for (const e of events) {
    let cur = out[out.length - 1];
    if (cur && cur.kind !== "out" && lastAt && e.at - lastAt > IDLE_MS) {
      out.push({ kind: "away", room: cur.room, from: lastAt, to: e.at, events: [] });
      cur = out[out.length - 1];
    }
    lastAt = e.at;
    if (e.verb === "logout") {
      if (cur?.kind === "out") {
        cur.to = e.at;
        cur.events.push(e);
      } else out.push({ kind: "out", room: "lobby", from: e.at, to: e.at, events: [e] });
      continue;
    }
    if (cur?.kind === "out") cur.to = e.at;
    if (e.presence || (e.verb === "login" && cur?.kind === "room")) {
      if (cur?.kind === "room") cur.to = e.at;
      continue;
    }
    if (cur?.kind === "room" && cur.room === e.room) {
      cur.to = e.at;
      cur.events.push(e);
    } else out.push({ kind: "room", room: e.room, from: e.at, to: e.at, events: [e] });
  }
  return compact(out);
}

const BLIP_MS = 60_000;

// Out and back within a minute (or a bare login on the way in) is a blip,
// not a departure: drop it, then join the stays it split.
function compact(list: Segment[]): Segment[] {
  const kept = list.filter((x, i) => {
    if (i === list.length - 1) return true;
    const next = list[i + 1];
    if (x.kind === "out") return next.from - x.from >= BLIP_MS;
    if (x.kind === "room" && x.room === "lobby" && x.events.every((e) => e.verb === "login")) return next.from - x.to >= BLIP_MS;
    return true;
  });
  const res: Segment[] = [];
  for (const x of kept) {
    const prev = res[res.length - 1];
    if (prev && prev.kind === x.kind && prev.room === x.room && x.kind !== "away") {
      prev.to = Math.max(prev.to, x.to);
      prev.events.push(...x.events);
    } else res.push({ ...x, events: [...x.events] });
  }
  return res;
}

export type DirectoryUser = { id: string; name: string; role: string; roles: string[] };

export function buildPeople(rows: RawEvent[], users: Map<string, DirectoryUser>, now: number): OfficePerson[] {
  const byUser = new Map<string, OfficeEvent[]>();
  for (const r of rows) {
    if (!r.userId || !Number.isFinite(r.at)) continue;
    const list = byUser.get(r.userId) ?? [];
    list.push(toOfficeEvent(r));
    byUser.set(r.userId, list);
  }
  const people: OfficePerson[] = [];
  for (const [id, list] of byUser) {
    list.sort((x, y) => x.at - y.at);
    const segments = segmentsOf(list);
    const real = list.filter((e) => !e.presence);
    const last = real[real.length - 1] ?? null;
    const seen = list[list.length - 1];
    const lastAt = last?.at ?? 0;
    const lastSeenAt = seen.at;
    const status: OfficeStatus = seen.verb === "logout" || now - lastSeenAt > IDLE_MS ? "away" : now - lastAt <= WORK_MS ? "working" : "idle";
    const stay = [...segments].reverse().find((x) => x.kind === "room");
    const u = users.get(id);
    people.push({
      id,
      name: u?.name || "",
      kind: u ? kindOf(u.role, u.roles) : "client",
      role: u?.role ?? "",
      status,
      room: stay?.room ?? "lobby",
      arrivedAt: list[0].at,
      lastAt,
      lastSeenAt,
      last,
      segments,
      actions: segments.reduce((n, x) => n + (x.kind === "room" ? x.events.length : 0), 0),
      leftAt: status === "away" ? lastSeenAt : 0,
    });
  }
  return people;
}

// Local midnight, and the UTC calendar days the audit filter needs to cover
// it (the backend filters by UTC date).
export function dayWindow(now: number): { start: number; dateFrom: string; dateTo: string } {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { start, dateFrom: iso(start), dateTo: iso(now) };
}
