import { ApiError, asArr, asDict, asNum, asStr, errDetail, http, type Dict } from "@/lib/http";

export const GROUP_KIND = "second_opinion_group";
export const GROUP_COUNT_MIN = 2;
export const GROUP_COUNT_MAX = 7;

export type GroupPlacement = "auto" | "in_progress" | "completed";
export type GroupEvent = "impression" | "click" | "dismiss" | "selection_started" | "quote_viewed" | "request_created" | "purchased";

export type GroupPromotion = {
  visible: boolean;
  orderId: string;
  serviceId: string;
  placement: string;
  title: string;
  description: string;
  benefits: string[];
  eligible: boolean | null;
  dismissedForSession: boolean;
  dismissible: boolean;
  priceVisible: boolean;
  ctaLabel: string;
  optionsUrl: string;
  quoteUrl: string;
  eventUrl: string;
  sessionId: string;
};

export type GroupChannel = { value: string; label: string };

export type GroupOptions = {
  orderId: string;
  serviceId: string;
  serviceTitle: string;
  categoryTitle: string;
  serviceKind: string;
  channels: GroupChannel[];
  countMin: number;
  countMax: number;
  countDefault: number;
  directions: string[];
  priceVisible: boolean;
  quoteUrl: string;
};

export type GroupSelection = { channel: string; lawyerCount: number; directions: string[] };

export type GroupQuote = GroupSelection & {
  orderId: string;
  serviceKind: string;
  amount: number;
  currency: string;
  priceVisible: boolean;
  selectionComplete: boolean;
  eventId: string;
  requestUrl: string;
  requestPayload: Dict;
  key: string;
};

export type GroupRequestCreated = { id: string; workId: string; status: string; raw: Dict };

export type GroupErrorKind = "auth" | "not_found" | "unavailable" | "placement" | "channel" | "count" | "ineligible" | "other";
export type GroupError = { kind: GroupErrorKind; code: string; status: number; message: string };

const SESSION_KEY = "lexgo_second_opinion_session";
const enc = encodeURIComponent;
let memorySession = "";
const sentOnce = new Set<string>();

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

export function promotionSessionId(): string {
  if (memorySession) return memorySession;
  try {
    const kept = sessionStorage.getItem(SESSION_KEY);
    if (kept && /^[\w-]{8,80}$/.test(kept)) {
      memorySession = kept;
      return kept;
    }
  } catch {}
  memorySession = uuid();
  try {
    sessionStorage.setItem(SESSION_KEY, memorySession);
  } catch {}
  return memorySession;
}

export function resetPromotionSession(): void {
  memorySession = "";
  sentOnce.clear();
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function safeApiPath(url: unknown, fallback: string): string {
  const raw = asStr(url)
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/api\/backend(?=\/)/, "");
  if (!raw) return fallback;
  const path = raw.split(/[?#]/)[0];
  if (!/^\/(marketplace|urgent-advokat)\/[^/]/.test(path)) return fallback;
  if (path.includes("..") || path.includes("//") || /[\\\s]|%2e|%2f|%5c/i.test(path)) return fallback;
  return path;
}

const orderBase = (orderId: string) => `/marketplace/orders/${enc(orderId)}`;
const promoPath = (orderId: string, url?: string | null) => safeApiPath(url, `${orderBase(orderId)}/second-opinion-promotion`);
const eventPath = (orderId: string, url?: string | null) => safeApiPath(url, `${orderBase(orderId)}/second-opinion-promotion/events`);
const optionsPath = (orderId: string, url?: string | null) => safeApiPath(url, `${orderBase(orderId)}/second-opinion/options`);
const quotePath = (orderId: string, url?: string | null) => safeApiPath(url, `${orderBase(orderId)}/second-opinion/quote`);

const textList = (v: unknown): string[] =>
  asArr(v)
    .map((x) => (typeof x === "string" ? x : asStr(asDict(x).text ?? asDict(x).title ?? asDict(x).label)).trim())
    .filter(Boolean);

export function normGroupPromotion(v: unknown): GroupPromotion {
  const d = asDict(v);
  const title = asStr(d.title).trim();
  const description = asStr(d.description).trim();
  const dismissed = d.dismissed_for_session === true;
  return {
    visible: d.visible === true && !dismissed && !!(title || description),
    orderId: asStr(d.order_id),
    serviceId: asStr(d.service_id),
    placement: asStr(d.placement).trim().toLowerCase(),
    title,
    description,
    benefits: textList(d.benefits),
    eligible: typeof d.eligible === "boolean" ? d.eligible : null,
    dismissedForSession: dismissed,
    dismissible: d.dismissible !== false,
    priceVisible: d.price_visible === true,
    ctaLabel: asStr(d.cta_label).trim(),
    optionsUrl: asStr(d.options_url).trim(),
    quoteUrl: asStr(d.quote_url).trim(),
    eventUrl: asStr(d.event_url).trim(),
    sessionId: asStr(d.session_id).trim(),
  };
}

const clampInt = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

export function normGroupOptions(v: unknown): GroupOptions {
  const d = asDict(v);
  const count = asDict(d.lawyer_count);
  const lo = Math.max(1, Math.round(asNum(count.minimum ?? count.min, GROUP_COUNT_MIN)) || GROUP_COUNT_MIN);
  const hi = Math.max(lo, Math.round(asNum(count.maximum ?? count.max, GROUP_COUNT_MAX)) || GROUP_COUNT_MAX);
  const seen = new Set<string>();
  const channels: GroupChannel[] = [];
  for (const raw of asArr(d.channels)) {
    const c = typeof raw === "string" ? { value: raw } : asDict(raw);
    const value = asStr(c.value ?? c.key ?? c.code).trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    channels.push({ value, label: asStr(c.label ?? c.title).trim() });
  }
  const dirSeen = new Set<string>();
  const directions = textList(d.direction_suggestions ?? d.directions).filter((x) => {
    const k = x.toLocaleLowerCase();
    if (dirSeen.has(k)) return false;
    dirSeen.add(k);
    return true;
  });
  const category = asDict(d.category);
  return {
    orderId: asStr(d.order_id),
    serviceId: asStr(d.service_id),
    serviceTitle: asStr(d.service_title).trim(),
    categoryTitle: asStr(category.title ?? category.name).trim(),
    serviceKind: asStr(d.service_kind, GROUP_KIND) || GROUP_KIND,
    channels,
    countMin: lo,
    countMax: hi,
    countDefault: clampInt(asNum(count.default, Math.max(lo, Math.min(3, hi))), lo, hi),
    directions,
    priceVisible: d.price_visible === true,
    quoteUrl: asStr(d.quote_url).trim(),
  };
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function cleanDirections(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const x = String(raw ?? "").replace(/\s+/g, " ").trim();
    const k = x.toLocaleLowerCase();
    if (!x || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

export function quoteKey(orderId: string, sessionId: string, sel: GroupSelection): string {
  const dirs = cleanDirections(sel.directions);
  const tail = dirs.length ? `:${hash(dirs.map((x) => x.toLocaleLowerCase()).sort().join("|"))}` : "";
  return `second-opinion:${orderId}:${sessionId}:quote:${sel.channel}:${sel.lawyerCount}${tail}`;
}

export function eventKey(orderId: string, placement: string, sessionId: string, event: GroupEvent, extra = ""): string {
  return `second-opinion:${orderId}:${placement || "auto"}:${sessionId}:${event}${extra ? `:${extra}` : ""}`;
}

export function sameSelection(a: GroupSelection | null, b: GroupSelection | null): boolean {
  if (!a || !b) return false;
  const da = cleanDirections(a.directions).map((x) => x.toLocaleLowerCase()).sort().join("|");
  const db = cleanDirections(b.directions).map((x) => x.toLocaleLowerCase()).sort().join("|");
  return a.channel === b.channel && a.lawyerCount === b.lawyerCount && da === db;
}

export function normGroupQuote(v: unknown, sel: GroupSelection, key: string): GroupQuote {
  const d = asDict(v);
  const dirs = asArr(d.directions).length ? textList(d.directions) : cleanDirections(sel.directions);
  return {
    orderId: asStr(d.order_id),
    serviceKind: asStr(d.service_kind, GROUP_KIND) || GROUP_KIND,
    channel: asStr(d.channel, sel.channel) || sel.channel,
    lawyerCount: Math.round(asNum(d.lawyer_count, sel.lawyerCount)) || sel.lawyerCount,
    directions: dirs,
    amount: asNum(d.amount),
    currency: asStr(d.currency, "UZS") || "UZS",
    priceVisible: d.price_visible === true,
    selectionComplete: d.selection_complete !== false,
    eventId: asStr(d.event_id),
    requestUrl: asStr(d.request_url).trim(),
    requestPayload: asDict(d.request_payload),
    key,
  };
}

export async function getGroupPromotion(orderId: string, opts: { url?: string | null; sessionId: string; placement?: GroupPlacement; signal?: AbortSignal }): Promise<GroupPromotion> {
  const qs = `?placement=${enc(opts.placement ?? "auto")}&session_id=${enc(opts.sessionId)}`;
  return normGroupPromotion(await http(`${promoPath(orderId, opts.url)}${qs}`, { signal: opts.signal }));
}

export async function trackGroupPromotion(
  orderId: string,
  input: { event: GroupEvent; placement: string; sessionId: string; key: string; url?: string | null; metadata?: Dict },
): Promise<string> {
  const body = {
    event: input.event,
    placement: input.placement || "auto",
    session_id: input.sessionId,
    idempotency_key: input.key,
    metadata: { surface: "marketplace_order_detail", ...(input.metadata ?? {}) },
  };
  const d = asDict(await http(eventPath(orderId, input.url), { method: "POST", body: JSON.stringify(body) }));
  return asStr(d.event_id ?? asDict(d.event).id);
}

export function trackOnce(orderId: string, input: { event: GroupEvent; placement: string; sessionId: string; key: string; url?: string | null; metadata?: Dict }): boolean {
  if (sentOnce.has(input.key)) return false;
  sentOnce.add(input.key);
  trackGroupPromotion(orderId, input).catch(() => {
    sentOnce.delete(input.key);
  });
  return true;
}

export async function getGroupOptions(orderId: string, url?: string | null, signal?: AbortSignal): Promise<GroupOptions> {
  return normGroupOptions(await http(optionsPath(orderId, url), { signal }));
}

export async function quoteGroupOpinion(orderId: string, input: GroupSelection & { sessionId: string; url?: string | null }): Promise<GroupQuote> {
  const sel: GroupSelection = { channel: input.channel, lawyerCount: input.lawyerCount, directions: cleanDirections(input.directions) };
  const key = quoteKey(orderId, input.sessionId, sel);
  const body = { channel: sel.channel, lawyer_count: sel.lawyerCount, directions: sel.directions, session_id: input.sessionId, idempotency_key: key };
  return normGroupQuote(await http(quotePath(orderId, input.url), { method: "POST", body: JSON.stringify(body) }), sel, key);
}

export function groupRequestBody(q: GroupQuote, orderId: string, sessionId: string, need: string): Dict {
  const payload: Dict = Object.keys(q.requestPayload).length
    ? { ...q.requestPayload }
    : { service_kind: q.serviceKind || GROUP_KIND, channel: q.channel, lawyer_count: q.lawyerCount, directions: q.directions, source_order_id: orderId, promotion_session_id: sessionId };
  const text = need.trim();
  if (text) payload.need = text;
  if (!("files" in payload)) payload.files = [];
  if (!("voice_messages" in payload)) payload.voice_messages = [];
  return payload;
}

export async function createGroupOpinionRequest(q: GroupQuote, orderId: string, sessionId: string, need: string): Promise<GroupRequestCreated> {
  const path = safeApiPath(q.requestUrl, "/urgent-advokat/requests");
  const d = asDict(await http(path, { method: "POST", body: JSON.stringify(groupRequestBody(q, orderId, sessionId, need)) }));
  const rec = d.id || d.work_id ? d : asDict(d.urgent_request ?? d.request ?? d.data);
  return { id: asStr(rec.id ?? rec.request_id), workId: asStr(rec.work_id), status: asStr(rec.status), raw: d };
}

function errorCode(e: ApiError): string {
  const detail = asDict(e.data.detail);
  return [e.code, asStr(detail.code), asStr(e.data.code), typeof e.data.detail === "string" ? e.data.detail : "", e.detail || ""].filter(Boolean).join(" ");
}

export function groupErrorOf(e: unknown): GroupError {
  if (!(e instanceof ApiError)) return { kind: "other", code: "", status: 0, message: errDetail(e) };
  const code = errorCode(e);
  const first = e.code || asStr(asDict(e.data.detail).code) || asStr(e.data.code);
  const out = (kind: GroupErrorKind): GroupError => ({ kind, code: first, status: e.status, message: errDetail(e) });
  if (e.status === 401) return out("auth");
  if (/previous_lexgo_(advokat_service|purchase)_required/i.test(code) || e.status === 402) return out("ineligible");
  if (/second_opinion_placement_mismatch/i.test(code)) return out("placement");
  if (/second_opinion_not_available/i.test(code) || e.status === 409) return out("unavailable");
  if (/source_order_not_found/i.test(code) || e.status === 404) return out("not_found");
  if (/second_opinion_channel_required/i.test(code)) return out("channel");
  if (/second_opinion_lawyer_count_invalid/i.test(code)) return out("count");
  return out("other");
}

const PROMO_EVENTS = new Set(["marketplace.order_started", "marketplace.order_completed"]);
const PROMO_URL_RE = /\/marketplace\/orders\/([^/?#]+)\/second-opinion-promotion/;

export function promotionSignalFor(ev: { event: string } & Record<string, unknown>, orderId: string): boolean {
  if (!orderId || !PROMO_EVENTS.has(ev.event) || ev.show_second_opinion_promotion !== true) return false;
  const fromUrl = PROMO_URL_RE.exec(asStr(ev.second_opinion_promotion_url))?.[1] ?? "";
  let urlId = fromUrl;
  try {
    urlId = decodeURIComponent(fromUrl);
  } catch {}
  const id = asStr(ev.order_id) || asStr(asDict(ev.order).id) || urlId;
  return !id || id === orderId;
}
