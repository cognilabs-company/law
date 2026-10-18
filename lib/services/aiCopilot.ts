// The client and lawyer AI copilots (FRONTEND_AI_COPILOTS_CLIENT_DESKTOP_
// MARKETPLACE_FINAL_2026_10_18.md): one endpoint, a strict mode per role,
// an optional active entity whose context the backend loads itself (so the
// browser never sends chat history, order JSON or contact data), actions
// that are previews until confirmed, and the drafts saved from them.
import { asArr, asDict, asStr, http, type Dict } from "@/lib/http";

export type CopilotMode = "system_instructor" | "client_copilot" | "lawyer_copilot";
export type CopilotEntity = { type: string; id: string; title?: string };
export type CopilotAction = { id: string; type: string; title: string; route: string; draftType: string; content: string; needsConfirm: boolean; raw: Dict };
export type CopilotSource = { type: string; title: string; route: string };
export type CopilotTool = { name: string; summary: string };
export type CopilotAnswer = {
  requestId: string;
  sessionId: string;
  answer: string;
  highlight: string;
  navigation: { route: string; title: string } | null;
  actions: CopilotAction[];
  sources: CopilotSource[];
  tools: CopilotTool[];
  provider: string;
};

const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
export const newRequestId = uuid;

// A route the app may open: relative to the site, no query, no scheme.
const route = (v: unknown) => {
  const s = asStr(v).trim();
  return /^\/(?!\/)[^\s\\]*$/.test(s) ? s.replace(/[?#].*$/, "") : "";
};

function normAnswer(raw: unknown, requestId: string, sessionId: string): CopilotAnswer {
  const d = asDict(raw);
  const nav = asDict(d.navigation);
  const navRoute = route(nav.route ?? nav.url);
  return {
    requestId: asStr(d.request_id) || requestId,
    sessionId: asStr(d.session_id) || sessionId,
    answer: asStr(d.answer ?? d.message ?? d.text),
    highlight: typeof d.highlight === "string" ? d.highlight : asStr(asDict(d.highlight).text ?? asDict(d.highlight).label),
    navigation: navRoute ? { route: navRoute, title: asStr(nav.title ?? nav.label) } : null,
    actions: asArr(d.actions)
      .map((x): CopilotAction => {
        const a = asDict(x);
        const p = asDict(a.payload ?? a.preview);
        return {
          id: asStr(a.action_id ?? a.id),
          type: asStr(a.type ?? a.kind),
          title: asStr(a.title ?? a.label ?? a.name),
          route: route(a.route),
          draftType: asStr(a.draft_type ?? a.artifact_type ?? p.type ?? a.type),
          content: asStr(p.content ?? a.content ?? a.text),
          needsConfirm: a.requires_confirmation !== false,
          raw: a,
        };
      })
      .filter((a) => a.title || a.id),
    sources: asArr(d.sources)
      .map((x) => {
        const s = asDict(x);
        return { type: asStr(s.type ?? s.kind), title: asStr(s.title ?? s.label ?? s.name), route: route(s.route) };
      })
      .filter((s) => s.title),
    tools: asArr(d.tool_results)
      .map((x) => {
        const t = asDict(x);
        const out = t.summary ?? t.result ?? t.output;
        return { name: asStr(t.tool ?? t.name), summary: typeof out === "string" ? out : out ? JSON.stringify(out).slice(0, 400) : "" };
      })
      .filter((t) => t.name),
    provider: asStr(asDict(d.metadata).provider),
  };
}

export type AskInput = {
  message: string;
  sessionId: string;
  mode: CopilotMode;
  entity?: CopilotEntity | null;
  locale: string;
  page: { route: string; pageId: string; title: string; context?: Dict };
};
export async function askCopilot(input: AskInput, signal?: AbortSignal): Promise<CopilotAnswer> {
  const requestId = uuid();
  const body: Dict = {
    message: input.message,
    session_id: input.sessionId,
    request_id: requestId,
    mode: input.mode,
    locale: input.locale,
    client_time: new Date().toISOString(),
    current_page: { route: input.page.route, page_id: input.page.pageId, title: input.page.title, context: input.page.context ?? {} },
  };
  if (input.entity?.id) {
    body.entity_type = input.entity.type;
    body.entity_id = input.entity.id;
    // A secure chat is also named by its room (the backend reads the
    // history this person may see from it).
    if (/^(secure_chat|chat|chat_room)$/.test(input.entity.type)) body.room_id = input.entity.id;
  }
  return normAnswer(await http("/api/ai/assistant", { method: "POST", body: JSON.stringify(body), signal }), requestId, input.sessionId);
}

// A previewed action, saved as a draft only after the person confirmed it.
export async function executeCopilotAction(input: { requestId: string; actionId: string; title: string; content: string; entity?: CopilotEntity | null; metadata?: Dict }): Promise<void> {
  await http("/api/ai/actions/execute", {
    method: "POST",
    body: JSON.stringify({
      request_id: input.requestId,
      action_id: input.actionId,
      confirmed: true,
      payload: { title: input.title, content: input.content, entity_type: input.entity?.type ?? "", entity_id: input.entity?.id ?? "", metadata: input.metadata ?? {} },
    }),
  });
}

export type Artifact = { id: string; type: string; title: string; content: string; at: string };
export async function listArtifacts(entity: CopilotEntity | null, signal?: AbortSignal): Promise<Artifact[]> {
  const q = new URLSearchParams({ limit: "50", offset: "0" });
  if (entity?.id) {
    q.set("entity_type", entity.type);
    q.set("entity_id", entity.id);
  }
  const d = asDict(await http(`/api/ai/artifacts?${q}`, { signal }));
  return asArr(d.items ?? d.artifacts)
    .map((x) => {
      const a = asDict(x);
      return { id: asStr(a.id), type: asStr(a.artifact_type ?? a.type ?? a.kind), title: asStr(a.title), content: asStr(a.content ?? a.body), at: asStr(a.created_at ?? a.updated_at) };
    })
    .filter((a) => a.id || a.title);
}

// Whether the answer came from the model or a fallback (metadata.provider).
export const isFallback = (provider: string) => provider === "fallback" || provider === "local_navigation";
