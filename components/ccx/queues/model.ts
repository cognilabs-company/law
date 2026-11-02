import { parseServerTime } from "@/lib/http";

export type QKey = "queue" | "urgent" | "escalations" | "complaints" | "mpComplaints" | "warranty" | "cancellations" | "experience" | "achievements" | "licenses" | "payouts" | "recoveries";
export type FamKey = "work" | "disputes" | "verify" | "money" | "people";
export type QFilter = "all" | "mine" | "late";
export type QTone = "hot" | "warn" | "ok";

export const FAMILIES: { key: FamKey; queues: QKey[] }[] = [
  { key: "work", queues: ["queue", "urgent"] },
  { key: "disputes", queues: ["escalations", "complaints", "mpComplaints", "warranty", "cancellations"] },
  { key: "verify", queues: ["experience", "achievements", "licenses"] },
  { key: "money", queues: ["payouts", "recoveries"] },
  { key: "people", queues: [] },
];

export const ALL_QUEUES: QKey[] = FAMILIES.flatMap((f) => f.queues);

export const QUEUE_OF_TAB: Record<string, QKey> = {
  escalations: "escalations",
  complaints: "complaints",
  mpComplaints: "mpComplaints",
  warranty: "warranty",
  cancellations: "cancellations",
  experience: "experience",
  achievements: "achievements",
  licenses: "licenses",
  payouts: "payouts",
};

const TAB: Record<QKey, string> = {
  queue: "queue",
  urgent: "urgent",
  escalations: "escalations",
  complaints: "complaints",
  mpComplaints: "mpComplaints",
  warranty: "warranty",
  cancellations: "cancellations",
  experience: "experience",
  achievements: "achievements",
  licenses: "licenses",
  payouts: "payouts",
  recoveries: "payouts",
};

export type QJob = {
  key: string;
  queue: QKey;
  id: string;
  code: string;
  title: string;
  detail: string;
  category?: string;
  serviceKind?: string;
  whyCode?: string;
  amount?: number;
  who: string;
  whoId: string;
  phone: string;
  at: string;
  baseAgeMin?: number;
  slaMin: number;
  slaBreached: boolean;
  mine: boolean;
  nowKey: string;
  raw?: unknown;
};

export type QLane = { queue: QKey; status: "ready" | "failed" | "denied"; total: number; jobs: QJob[] };

export type QView = QJob & { ageMin: number; late: boolean; tone: QTone };

const DAY = 1440;
const WARN = 240;

export const shortId = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

export function viewOf(j: QJob, fetchedAt: number, now: number): QView {
  const drift = fetchedAt && now > fetchedAt ? (now - fetchedAt) / 60000 : 0;
  const at = parseServerTime(j.at);
  const age = j.baseAgeMin != null ? j.baseAgeMin + drift : Number.isFinite(at) && now > at ? (now - at) / 60000 : 0;
  if (j.slaMin) {
    const left = j.slaMin - age;
    const late = j.slaBreached || left <= 0;
    return { ...j, ageMin: age, late, tone: late ? "hot" : left <= Math.max(5, j.slaMin * 0.25) ? "warn" : "ok" };
  }
  const late = age >= DAY;
  return { ...j, ageMin: age, late, tone: late ? "hot" : age >= WARN ? "warn" : "ok" };
}

export const PANEL_QUEUES: QKey[] = ["escalations", "complaints", "mpComplaints", "warranty", "cancellations", "experience", "achievements", "licenses", "payouts", "recoveries"];

export const opensPanel = (j: QJob) => PANEL_QUEUES.includes(j.queue);

export function openHref(j: QJob): string {
  if (j.queue === "urgent") return `/admin/call-center?view=urgent&id=${encodeURIComponent(j.id)}`;
  if (j.nowKey) return `/admin/call-center?pick=${encodeURIComponent(j.nowKey)}`;
  return `/admin/call-center?tab=${TAB[j.queue]}`;
}

export const queueHref = (q: QKey) => `/admin/call-center?tab=${TAB[q]}`;

export const familyOf = (q: QKey): FamKey => FAMILIES.find((f) => f.queues.includes(q))?.key ?? "work";

export type LaneView = { queue: QKey; status: QLane["status"]; count: number; jobs: QView[]; oldest: QView | null; late: number };

export function laneViews(lanes: Partial<Record<QKey, QLane>>, at: number, now: number, filter: QFilter): Partial<Record<QKey, LaneView>> {
  const out: Partial<Record<QKey, LaneView>> = {};
  for (const q of ALL_QUEUES) {
    const lane = lanes[q];
    if (!lane) continue;
    const all = lane.jobs.map((j) => viewOf(j, at, now)).sort((a, b) => b.ageMin - a.ageMin);
    const jobs = filter === "mine" ? all.filter((j) => j.mine) : filter === "late" ? all.filter((j) => j.late) : all;
    out[q] = { queue: q, status: lane.status, count: filter === "all" ? lane.total : jobs.length, jobs, oldest: jobs[0] ?? null, late: jobs.filter((j) => j.late).length };
  }
  return out;
}
