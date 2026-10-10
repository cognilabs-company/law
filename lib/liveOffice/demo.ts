// Demo office: made-up staff doing made-up work, generated in the browser
// only, so the live office can be seen busy before real traffic exists.
// Nothing here is sent anywhere; every id starts with "demo-".
import type { DirectoryUser, OfficeRoom, RawEvent } from "./model";

type Rnd = () => number;

// [id, name, role, extra roles, home room]: each person mostly works from a
// home room and steps out to others, so the floor fills evenly.
const PEOPLE: [string, string, string, string[], OfficeRoom][] = [
  ["demo-lead-1", "Jasur Toshmatov", "admin", [], "admin"],
  ["demo-lead-2", "Malika Yusupova", "manager", [], "studio"],
  ["demo-op-1", "Aziz Karimov", "call_center", [], "talk"],
  ["demo-op-2", "Nilufar Saidova", "call_center", [], "talk"],
  ["demo-op-3", "Bekzod Rahimov", "call_center", [], "urgent"],
  ["demo-law-1", "Dilshod Nazarov", "advokat", [], "urgent"],
  ["demo-law-2", "Kamola Ergasheva", "advokat", [], "documents"],
  ["demo-law-3", "Sardor Aliyev", "advokat", [], "desk"],
  ["demo-law-4", "Feruza Qodirova", "advokat", [], "talk"],
  ["demo-jur-1", "Shahnoza Mirzayeva", "yurist", [], "documents"],
  ["demo-jur-2", "Otabek Usmonov", "yurist", [], "ai"],
  ["demo-jur-3", "Gulnoza Xolmatova", "yurist", [], "desk"],
  ["demo-cli-1", "Sherzod Abdullayev", "client", [], "market"],
  ["demo-cli-2", "Madina Tursunova", "client", [], "lobby"],
  ["demo-cli-3", "Javohir Islomov", "client", [], "ai"],
];

// Where each kind of account plausibly works.
const ROOMS_OF: Record<string, OfficeRoom[]> = {
  admin: ["admin", "studio", "market", "documents", "desk", "lobby"],
  manager: ["studio", "desk", "talk", "admin", "market"],
  call_center: ["talk", "urgent", "talk", "desk", "documents"],
  advokat: ["documents", "urgent", "desk", "talk", "ai"],
  yurist: ["documents", "ai", "desk", "talk", "market"],
  client: ["market", "ai", "documents", "urgent", "talk", "lobby"],
};

const ACTIONS: Record<Exclude<OfficeRoom, "lobby">, [string, string[]][]> = {
  documents: [
    ["document_request_view", ["Mehnat shartnomasi", "Ijara shartnomasi", "Da'vo arizasi"]],
    ["document_request_generate", ["Ishonchnoma", "Nikoh shartnomasi"]],
    ["contract_view", ["Oldi-sotdi shartnomasi", "Xizmat ko'rsatish shartnomasi"]],
    ["document_request_download", ["Da'vo arizasi", "Mehnat shartnomasi"]],
    ["template_view", ["Ariza namunasi"]],
  ],
  talk: [
    ["secure_chat_message", ["Mijoz bilan chat"]],
    ["secure_chat_messages_view", ["Mijoz bilan chat"]],
    ["call_center_call", ["Kiruvchi qo'ng'iroq"]],
    ["call_center_queue_view", [""]],
    ["support_ticket_answered", ["Murojaat #1042", "Murojaat #1057"]],
  ],
  urgent: [
    ["urgent_advokat_claim", ["Tezkor videokonsultatsiya"]],
    ["urgent_advokat_candidates", ["Tezkor chat konsultatsiya"]],
    ["urgent_advokat_complete", ["Tezkor videokonsultatsiya"]],
  ],
  desk: [
    ["task_status", ["Sud majlisiga tayyorgarlik", "Hujjatlarni yig'ish"]],
    ["task_create", ["Mijozga qayta qo'ng'iroq"]],
    ["case_update", ["CASE-2041", "CASE-2058"]],
    ["calendar_event_create", ["Mijoz bilan uchrashuv"]],
  ],
  ai: [
    ["ai_instructor_chat", ["Pro tarifni qayerdan olaman?"]],
    ["marketplace_ai_search", ["ajrashish bo'yicha yurist", "mehnat nizosi"]],
    ["ai_legal_corpus_view", ["Mehnat kodeksi 77-modda"]],
  ],
  market: [
    ["order_status", ["Buyurtma #318", "Buyurtma #322"]],
    ["payment_mark_paid", ["To'lov #5521"]],
    ["package_update", ["Pro tarif"]],
    ["marketplace_purchase_request_create", ["Nikoh shartnomasi"]],
  ],
  studio: [
    ["studio_object_create", ["K05 — Xizmat formasi"]],
    ["studio_object_submit", ["K12 — Reklama paketi"]],
    ["studio_object_publish", ["K06 — Hujjat shabloni"]],
  ],
  admin: [
    ["admin_user_update", ["Yangi operator"]],
    ["seller_verification_approve", ["Advokat tekshiruvi"]],
    ["platform_policy_update", ["Platforma qoidalari"]],
  ],
};

export function demoDirectory(): Map<string, DirectoryUser> {
  return new Map(PEOPLE.map(([id, name, role, roles]) => [id, { id, name, role, roles }]));
}

type Who = { id: string; role: string; home: OfficeRoom; room: OfficeRoom; present: boolean; resting: boolean; lastAt: number };
export type DemoState = { people: Who[]; seq: number };

const pick = <T,>(list: T[], rnd: Rnd): T => list[Math.floor(rnd() * list.length) % list.length];

// Back home more often than not; otherwise a room this role plausibly uses.
function nextRoom(who: Who, rnd: Rnd): OfficeRoom {
  if (who.room !== who.home && rnd() < 0.6) return who.home;
  return pick([who.home, ...ROOMS_OF[who.role]].filter((x) => x !== who.room), rnd);
}

function event(st: DemoState, who: Who, room: OfficeRoom, at: number, rnd: Rnd): RawEvent {
  const [action, details] = room === "lobby" ? ["consent_accept", [""]] : pick(ACTIONS[room], rnd);
  who.room = room;
  who.lastAt = at;
  return { id: `demo-${++st.seq}`, userId: who.id, action, targetType: "", detail: pick(details, rnd), title: "", at };
}

const mark = (st: DemoState, who: Who, action: string, at: number): RawEvent => {
  who.lastAt = at;
  return { id: `demo-${++st.seq}`, userId: who.id, action, targetType: "", detail: "", title: "", at };
};

// The morning so far: everyone came in, worked through a few rooms; three
// are on a break now, two already went home.
export function seedDemo(now: number, rnd: Rnd): { rows: RawEvent[]; state: DemoState } {
  const from = now - 3 * 3600_000;
  const st: DemoState = { people: [], seq: 0 };
  const rows: RawEvent[] = [];
  PEOPLE.forEach(([id, , role, , home], i) => {
    const who: Who = { id, role, home, room: home, present: true, resting: false, lastAt: 0 };
    st.people.push(who);
    const gone = i === 4 || i === 13;
    const resting = i === 1 || i === 8 || i === 11;
    const end = gone ? now - (20 + rnd() * 40) * 60_000 : resting ? now - (6 + rnd() * 8) * 60_000 : now - rnd() * 100_000;
    let at = Math.min(end - 10 * 60_000, from + rnd() * (now - from) * 0.4);
    rows.push(mark(st, who, "login", at));
    while (at < end) {
      at += (1 + rnd() * 6) * 60_000;
      if (at >= end) break;
      rows.push(event(st, who, rnd() < 0.35 ? nextRoom(who, rnd) : who.room, at, rnd));
    }
    // Everyone is back at their own desk by now.
    rows.push(event(st, who, who.home, end, rnd));
    if (gone) {
      rows.push(mark(st, who, "logout", end + 30_000));
      who.present = false;
    }
    who.resting = resting;
  });
  return { rows, state: st };
}

// One beat of the office, every 5–6 s: someone works on, someone walks to
// other work; now and then a break starts or ends, someone leaves or comes.
export function stepDemo(st: DemoState, now: number, rnd: Rnd): RawEvent[] {
  const out: RawEvent[] = [];
  const present = st.people.filter((p) => p.present);
  const active = present.filter((p) => !p.resting);
  const r = rnd();
  if (r < 0.07) {
    const away = st.people.filter((p) => !p.present);
    if (away.length && (present.length < 13 || rnd() < 0.5)) {
      const who = pick(away, rnd);
      who.present = true;
      who.resting = false;
      out.push(mark(st, who, "login", now - 1500));
      out.push(event(st, who, who.home, now, rnd));
    } else if (active.length > 8) {
      const who = pick(active, rnd);
      who.present = false;
      out.push(mark(st, who, "logout", now));
    }
    return out;
  }
  if (r < 0.14) {
    const resting = present.filter((p) => p.resting);
    if (resting.length) {
      const back = pick(resting, rnd);
      back.resting = false;
      out.push(event(st, back, back.room, now, rnd));
    }
    if (active.length > 6) pick(active, rnd).resting = true;
    return out;
  }
  if (!active.length) return out;
  // Whoever waited longest gets the next step, so every figure stays alive.
  const queue = [...active].sort((a, b) => a.lastAt - b.lastAt).slice(0, 4);
  const who = pick(queue, rnd);
  const room = rnd() < 0.4 ? nextRoom(who, rnd) : who.room;
  out.push(event(st, who, room, now, rnd));
  return out;
}
