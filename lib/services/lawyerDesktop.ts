// LexGo lawyer virtual desktop (FRONTEND_LAWYER_VIRTUAL_DESKTOP_2026_10_17.md):
// the backend's shell feed for the desktop view — bootstrap, preferences,
// window state, widgets, the activity center, search, the command palette,
// pinned and recent items, snippets and presence. Business data stays with
// the existing modules; these are read-optimised summaries and the
// desktop's own state. Every reader is lenient about field names.
import { asArr, asDict, asNum, asStr, http, type Dict } from "@/lib/http";

const enc = encodeURIComponent;
const BASE = "/lawyer-desktop";
const send = (method: "POST" | "PUT" | "PATCH" | "DELETE", value?: unknown, signal?: AbortSignal): RequestInit => ({ method, body: value === undefined ? undefined : JSON.stringify(value), signal });
const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};
const rows = (raw: unknown, ...keys: string[]): unknown[] => {
  if (Array.isArray(raw)) return raw;
  const d = asDict(raw);
  for (const k of [...keys, "items", "results", "data"]) if (Array.isArray(d[k])) return d[k] as unknown[];
  return [];
};

// A route the desktop may open: relative, inside the site, with no query
// (§28 — never anything a token could hide in).
export function safeRoute(v: unknown): string {
  const s = asStr(v).trim();
  if (!/^\/(?!\/)[^\s\\]*$/.test(s) || /^\/[a-z]+:/i.test(s)) return "";
  return s.replace(/[?#].*$/, "");
}

// A stable, non-secret id for this browser installation (§4).
const DEVICE_KEY = "lexgo_desk_device";
export function deviceKey(): string {
  try {
    let k = localStorage.getItem(DEVICE_KEY);
    if (!k) {
      k = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, k);
    }
    return k;
  } catch {
    return "browser-session";
  }
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

export type DeskLink = { appId: string; route: string };
export type QuickAction = { id: string; label: string; route: string; enabled: boolean };
export type RegistryApp = { id: string; name: string; icon: string; route: string; multi: boolean; entityTypes: string[]; actions: QuickAction[] };
export type DeskPrefs = {
  theme: string;
  wallpaperKey: string;
  taskbar: string;
  focusMode: boolean;
  focusType: string;
  focusId: string;
  widgets: string[];
  settings: Dict;
  version: number;
};
export type SavedWindow = {
  key: string;
  appId: string;
  entityType: string;
  entityId: string;
  state: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  route: string;
  context: Dict;
  revision: number;
};
export type DeskItem = { id: string; kind: string; entityType: string; entityId: string; appId: string; title: string; subtitle: string; route: string; badge: string; at: string };
export type DeskCounts = { activeOrders: number; pendingRequests: number; unreadNotifications: number; unreadMessages: number };
export type Bootstrap = {
  apps: RegistryApp[];
  prefs: DeskPrefs;
  wallpapers: string[];
  windows: SavedWindow[];
  pinned: DeskItem[];
  recent: DeskItem[];
  counts: DeskCounts;
  presence: string;
  wsPath: string;
  heartbeatSeconds: number;
};

const link = (raw: unknown, fallbackApp = ""): DeskLink => {
  const d = asDict(raw);
  return { appId: asStr(d.app_id) || fallbackApp, route: safeRoute(d.route ?? d.url ?? d.href) };
};

function normAction(raw: unknown): QuickAction | null {
  // The registry sends plain action codes ("new_folder"); richer entries
  // may come as objects.
  if (typeof raw === "string") return raw ? { id: raw, label: raw, route: "", enabled: true } : null;
  const d = asDict(raw);
  const label = asStr(d.label ?? d.title ?? d.name);
  if (!label) return null;
  const dl = asDict(d.deep_link);
  return { id: asStr(d.id ?? d.action_id ?? d.key) || label, label, route: safeRoute(dl.route ?? d.route), enabled: d.enabled !== false };
}

function normApp(raw: unknown): RegistryApp | null {
  const d = asDict(raw);
  const id = asStr(d.id ?? d.app_id ?? d.key);
  if (!id) return null;
  return {
    id,
    name: asStr(d.name ?? d.title ?? d.label) || id,
    icon: asStr(d.icon ?? d.icon_name),
    route: safeRoute(d.default_route ?? d.route),
    multi: d.multi_window === true || d.supports_multiple_windows === true || d.multi_instance === true,
    entityTypes: asArr(d.entity_types ?? d.supported_entity_types).map((x) => asStr(x)).filter(Boolean),
    actions: asArr(d.quick_actions).map(normAction).filter((x): x is QuickAction => !!x),
  };
}

export function normPrefs(raw: unknown): DeskPrefs {
  const d = asDict(raw);
  return {
    theme: asStr(d.theme) || "system",
    wallpaperKey: asStr(d.wallpaper_key),
    taskbar: asStr(d.taskbar_position) || "bottom",
    focusMode: d.focus_mode === true,
    focusType: asStr(d.focus_entity_type),
    focusId: asStr(d.focus_entity_id),
    widgets: asArr(d.widgets).map((x) => asStr(x)).filter(Boolean),
    settings: asDict(d.settings),
    version: asNum(d.layout_version, 0),
  };
}

export function normWindow(raw: unknown): SavedWindow | null {
  const d = asDict(raw);
  const key = asStr(d.window_key ?? d.key);
  const appId = asStr(d.app_id);
  if (!key || !appId) return null;
  return {
    key,
    appId,
    entityType: asStr(d.entity_type),
    entityId: asStr(d.entity_id),
    state: asStr(d.state) || "normal",
    x: asNum(d.x, 0),
    y: asNum(d.y, 0),
    w: asNum(d.width, 0),
    h: asNum(d.height, 0),
    z: asNum(d.z_index, 0),
    route: safeRoute(d.route),
    context: asDict(d.context),
    revision: asNum(d.revision, 0),
  };
}

export function normItem(raw: unknown): DeskItem | null {
  const d = asDict(raw);
  const title = asStr(d.title ?? d.label);
  if (!title) return null;
  const m = asDict(d.meta);
  return {
    id: asStr(d.id ?? d.item_id),
    kind: asStr(d.kind),
    entityType: asStr(d.entity_type),
    entityId: asStr(d.entity_id),
    appId: asStr(d.app_id),
    title,
    subtitle: asStr(d.subtitle),
    route: safeRoute(d.route),
    badge: asStr(m.badge),
    at: asStr(d.updated_at ?? d.created_at ?? d.opened_at),
  };
}

const normCounts = (raw: unknown): DeskCounts => {
  const d = asDict(raw);
  return { activeOrders: asNum(d.active_orders, 0), pendingRequests: asNum(d.pending_requests, 0), unreadNotifications: asNum(d.unread_notifications, 0), unreadMessages: asNum(d.unread_messages, 0) };
};

export async function getBootstrap(device: string, signal?: AbortSignal): Promise<Bootstrap> {
  const d = asDict(await http(`${BASE}/bootstrap${qs({ device_key: device })}`, { signal }));
  const rt = asDict(d.realtime);
  return {
    apps: rows(d.apps).map(normApp).filter((x): x is RegistryApp => !!x),
    prefs: normPrefs(d.preferences),
    wallpapers: rows(d.wallpapers).map((w) => asStr(asDict(w).key ?? w)).filter(Boolean),
    windows: rows(d.windows).map(normWindow).filter((x): x is SavedWindow => !!x),
    pinned: rows(d.pinned).map(normItem).filter((x): x is DeskItem => !!x),
    recent: rows(d.recent).map(normItem).filter((x): x is DeskItem => !!x),
    counts: normCounts(d.counts),
    presence: asStr(asDict(d.presence).status) || "offline",
    wsPath: asStr(rt.ws_url) || "/lawyer-desktop/ws?token={access_token}",
    heartbeatSeconds: Math.max(30, asNum(rt.heartbeat_seconds, 30)),
  };
}

// ── Preferences and windows ─────────────────────────────────────────────────

export type PrefsInput = {
  theme?: string;
  wallpaper_key?: string;
  taskbar_position?: string;
  focus_mode?: boolean;
  focus_entity_type?: string;
  focus_entity_id?: string;
  widgets?: string[];
  settings?: Dict;
  expected_layout_version: number;
};
export async function savePrefs(p: PrefsInput): Promise<DeskPrefs> {
  const d = asDict(await http(`${BASE}/preferences`, send("PUT", p)));
  return normPrefs(d.preferences ?? d);
}

export type WindowInput = {
  window_key: string;
  app_id: string;
  entity_type?: string;
  entity_id?: string;
  state: "normal" | "minimized" | "maximized" | "fullscreen" | "closed";
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  active_tab?: string;
  monitor_key: string;
  route: string;
  context: Dict;
  revision: number;
};
// The saved records with their new revisions.
export async function saveWindows(device: string, windows: WindowInput[]): Promise<SavedWindow[]> {
  const d = await http(`${BASE}/windows/batch`, send("PUT", { device_key: device, windows: windows.slice(0, 50) }));
  return rows(d, "windows").map(normWindow).filter((x): x is SavedWindow => !!x);
}

// ── Feeds ───────────────────────────────────────────────────────────────────

export type Widget = { id: string; title: string; value: string; currency: string; caption: string; items: { title: string; subtitle: string; link: DeskLink }[]; link: DeskLink };
export async function getWidgets(signal?: AbortSignal): Promise<Widget[]> {
  return rows(await http(`${BASE}/widgets`, { signal }), "widgets").map((raw) => {
    const d = asDict(raw);
    const v = d.value ?? d.count ?? d.total ?? asDict(d.data).value;
    return {
      id: asStr(d.id ?? d.widget_id ?? d.key),
      title: asStr(d.title ?? d.label),
      value: v === undefined || v === null ? "" : typeof v === "number" ? String(v) : asStr(asDict(v).formatted ?? v),
      currency: asStr(d.currency),
      caption: asStr(d.caption ?? d.subtitle ?? d.description),
      items: rows(d.items ?? asDict(d.data).items).slice(0, 4).map((x) => {
        const i = asDict(x);
        return { title: asStr(i.title ?? i.label), subtitle: asStr(i.subtitle ?? i.deadline ?? i.starts_at), link: link(i.deep_link ?? i) };
      }).filter((i) => i.title),
      link: link(d.deep_link ?? d),
    };
  }).filter((w) => w.id);
}

export type Activity = { id: string; kind: string; title: string; subtitle: string; priority: string; at: string; unread: boolean; link: DeskLink };
export async function getActivity(signal?: AbortSignal): Promise<Activity[]> {
  return rows(await http(`${BASE}/activity-center${qs({ limit: 30 })}`, { signal }), "items", "activity").map((raw) => {
    const d = asDict(raw);
    return {
      id: asStr(d.id) || `${asStr(d.kind)}-${asStr(d.title)}-${asStr(d.created_at)}`,
      kind: asStr(d.kind ?? d.type ?? d.source),
      title: asStr(d.title ?? d.label),
      subtitle: asStr(d.subtitle ?? d.body ?? d.message),
      priority: asStr(d.priority) || "normal",
      at: asStr(d.occurred_at ?? d.created_at ?? d.updated_at ?? d.at),
      unread: d.is_read === false || d.unread === true,
      link: link(d.deep_link, "activity-center"),
    };
  }).filter((a) => a.title);
}

export type SearchHit = { id: string; type: string; title: string; subtitle: string; at: string; link: DeskLink; entityType: string; entityId: string };
export async function searchDesk(q: string, signal?: AbortSignal): Promise<SearchHit[]> {
  return rows(await http(`${BASE}/search${qs({ q, types: "orders,chats,files,services,documents", limit: 20 })}`, { signal }), "results", "items").map((raw) => {
    const d = asDict(raw);
    return {
      id: asStr(d.id ?? d.entity_id) || asStr(d.title),
      type: asStr(d.type ?? d.kind),
      title: asStr(d.title),
      subtitle: asStr(d.subtitle),
      at: asStr(d.updated_at),
      link: link(d.deep_link ?? d),
      entityType: asStr(d.entity_type),
      entityId: asStr(d.entity_id ?? d.id),
    };
  }).filter((h) => h.title);
}

export type Command = { id: string; label: string; group: string; hint: string; enabled: boolean; link: DeskLink };
export async function getCommands(q: string, signal?: AbortSignal): Promise<Command[]> {
  return rows(await http(`${BASE}/command-palette${qs({ q })}`, { signal }), "commands", "actions", "items").map((raw) => {
    const d = asDict(raw);
    return {
      id: asStr(d.id ?? d.action_id ?? d.key) || asStr(d.label),
      label: asStr(d.label ?? d.title ?? d.name),
      group: asStr(d.group ?? d.section ?? d.scope),
      hint: asStr(d.shortcut ?? d.hint),
      enabled: d.enabled !== false,
      link: link(d.deep_link ?? d),
    };
  }).filter((c) => c.label);
}

// ── Pinned and recent ───────────────────────────────────────────────────────

export type ItemInput = { entity_type: string; entity_id: string; app_id: string; title: string; subtitle?: string; route: string; meta?: Dict };
export const getItems = async (kind: "pinned" | "recent", signal?: AbortSignal) => rows(await http(`${BASE}/items${qs({ kind })}`, { signal })).map(normItem).filter((x): x is DeskItem => !!x);
export const addItem = (kind: "pinned" | "recent", item: ItemInput) => http(`${BASE}/items/${kind}`, send("POST", item));
export const removeItem = (id: string) => http(`${BASE}/items/${enc(id)}`, send("DELETE"));

// ── Snippets ────────────────────────────────────────────────────────────────

export type Snippet = { id: string; category: string; title: string; content: string; favorite: boolean; personal: boolean; uses: number };
function normSnippet(raw: unknown): Snippet | null {
  const d = asDict(raw);
  const id = asStr(d.id);
  if (!id) return null;
  const owner = asStr(d.source ?? d.owner_type ?? d.kind);
  return {
    id,
    category: asStr(d.category) || "general",
    title: asStr(d.title),
    content: asStr(d.content ?? d.body),
    favorite: d.is_favorite === true || d.favorite === true,
    personal: d.is_personal === true || owner === "personal" || owner === "user" || (d.is_system !== true && owner !== "lexgo" && owner !== "system"),
    uses: asNum(d.use_count ?? d.usage_count, 0),
  };
}
export async function getSnippets(filter: { q?: string; category?: string; favorite?: boolean } = {}, signal?: AbortSignal): Promise<Snippet[]> {
  return rows(await http(`${BASE}/snippets${qs({ q: filter.q, category: filter.category, favorite: filter.favorite || undefined, limit: 50 })}`, { signal }), "snippets").map(normSnippet).filter((x): x is Snippet => !!x);
}
export type SnippetInput = { category: string; title: string; content: string; is_favorite: boolean };
export const createSnippet = (s: SnippetInput) => http(`${BASE}/snippets`, send("POST", s));
export const updateSnippet = (id: string, s: Partial<SnippetInput>) => http(`${BASE}/snippets/${enc(id)}`, send("PATCH", s));
export const useSnippet = (id: string) => http(`${BASE}/snippets/${enc(id)}/use`, send("POST", {}));
export const deleteSnippet = (id: string) => http(`${BASE}/snippets/${enc(id)}`, send("DELETE"));

// ── Presence ────────────────────────────────────────────────────────────────

export type PresenceInput = { device_key: string; status: "online" | "away" | "busy" | "in_call" | "editing"; active_app_id?: string; entity_type?: string; entity_id?: string; meta?: Dict };
export const heartbeat = (p: PresenceInput) => http(`${BASE}/presence/heartbeat`, send("POST", p));
export const goOffline = (device: string) => http(`${BASE}/presence/offline${qs({ device_key: device })}`, send("POST"));
