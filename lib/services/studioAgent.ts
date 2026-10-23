import { ApiError, asArr, asDict, asStr, http } from "@/lib/http";

// The Studio AI agent (FRONTEND_STUDIO_AI_AGENT_V21_AUTONOMOUS_TOOLS_2026_10_22.md).
// The backend researches, drafts, validates and saves Studio drafts; this
// module only starts a job and reads it back. Every field is read
// defensively — the job grows as it runs — and nothing here decides a
// stage, a tool or a quality verdict.

export type AgentStatus = "queued" | "running" | "completed" | "partial_failed" | "failed" | "cancelled";
export type AgentLanguage = "uz" | "ru" | "en";
export type AgentScript = "latn" | "cyrl";

export const AGENT_STATUSES: readonly AgentStatus[] = ["queued", "running", "completed", "partial_failed", "failed", "cancelled"];
export const AGENT_TERMINAL: ReadonlySet<string> = new Set(["completed", "partial_failed", "failed", "cancelled"]);
// Every stage the backend names today; anything else falls back to a
// generic label (§8). Used for labels only, never as workflow logic.
export const AGENT_STAGES = [
  "queued",
  "understanding",
  "loading_contracts",
  "catalog_research",
  "legal_research",
  "primary_research",
  "reading_sources",
  "drafting",
  "schema_validation",
  "language_review",
  "source_verification",
  "duplicate_comparison",
  "saving_drafts",
  "completed",
  "partial_failed",
  "failed",
] as const;
export const AGENT_TOOLS = [
  "list_studio_constructors",
  "get_constructor_contract",
  "search_existing_catalog",
  "search_official_legal_sources",
  "search_trusted_primary_sources",
  "read_legal_source",
  "read_trusted_source",
  "resolve_studio_reference",
  "validate_studio_draft",
  "validate_language_consistency",
  "verify_source_quality",
  "compare_with_existing_object",
  "save_studio_draft",
] as const;

export type AgentInput = {
  prompt: string;
  constructorCodes: string[];
  drafts: number;
  language: AgentLanguage;
  script: AgentScript;
  officialSources: boolean;
};

export type AgentSource = { title: string; url: string; domain: string; checkedAt: string; official: boolean | null; trusted: boolean | null };
export type AgentCheck = { ok: boolean | null; errors: string[] };
export type AgentMatch = { objectId: string; title: string; constructorCode: string; similarity: number | null; kind: string };
export type AgentDraft = {
  objectId: string;
  versionId: string;
  constructorCode: string;
  title: string;
  validation: AgentCheck;
  language: AgentCheck;
  sourcesCheck: AgentCheck;
  matches: AgentMatch[];
  comparisonRequired: boolean;
  dependencies: string[];
  improvements: string[];
  sources: AgentSource[];
};
export type AgentError = { code: string; reason: string; message: string; requested: number | null; created: number | null };
export type AgentTool = { tool: string; status: string; ok: boolean | null; durationMs: number | null; at: string };
export type AgentQuality = { validated: number | null; language: number | null; sources: number | null; comparisons: number | null };

export type AgentJob = {
  id: string;
  status: AgentStatus | string;
  stage: string;
  progress: number | null;
  prompt: string;
  constructorCodes: string[];
  targetDrafts: number;
  maxDrafts: number;
  draftCount: number | null;
  savedCount: number | null;
  language: string;
  script: string;
  officialSources: boolean | null;
  requestedAt: string;
  startedAt: string;
  finishedAt: string;
  heartbeatAt: string;
  updatedAt: string;
  attempts: number | null;
  toolCalls: number | null;
  turns: number | null;
  drafts: AgentDraft[];
  sources: AgentSource[];
  quality: AgentQuality | null;
  tools: AgentTool[];
  error: AgentError | null;
  publishRequiresHumanApproval: boolean;
  autoPublished: boolean;
};

type Dict = Record<string, unknown>;
const numOr = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const boolOr = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const strs = (v: unknown): string[] => asArr(v).map((x) => (typeof x === "string" ? x : asStr(asDict(x).title ?? asDict(x).message ?? asDict(x).summary ?? asDict(x).name ?? asDict(x).text))).map((x) => x.trim()).filter(Boolean);

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Only http(s) links are ever followed from a source (§16).
export function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : "";
}

function normSource(v: unknown): AgentSource {
  const d = asDict(v);
  const url = safeUrl(asStr(d.url ?? d.link ?? d.href));
  return {
    title: asStr(d.title ?? d.name) || domainOf(url) || url,
    url,
    domain: asStr(d.domain) || domainOf(url),
    checkedAt: asStr(d.checked_at ?? d.accessed_at ?? d.retrieved_at),
    official: boolOr(d.official ?? d.is_official),
    trusted: boolOr(d.trusted ?? d.is_trusted),
  };
}

function normCheck(v: unknown): AgentCheck {
  if (v === null || v === undefined) return { ok: null, errors: [] };
  const d = asDict(v);
  return { ok: boolOr(d.ok ?? d.valid ?? d.passed), errors: strs(d.errors ?? d.issues ?? d.problems) };
}

function normMatch(v: unknown): AgentMatch {
  const d = asDict(v);
  return {
    objectId: asStr(d.object_id ?? d.id ?? d.studio_object_id),
    title: asStr(d.title ?? d.name),
    constructorCode: asStr(d.constructor_code),
    similarity: numOr(d.similarity ?? d.score),
    kind: asStr(d.match_type ?? d.kind ?? d.relation),
  };
}

function normDraft(v: unknown): AgentDraft {
  const d = asDict(v);
  const val = asDict(d.validation);
  return {
    objectId: asStr(d.object_id ?? d.id),
    versionId: asStr(d.version_id),
    constructorCode: asStr(d.constructor_code),
    title: asStr(d.title),
    validation: { ok: boolOr(val.ok), errors: strs(val.errors) },
    language: normCheck(val.language),
    sourcesCheck: normCheck(val.sources),
    matches: asArr(d.existing_matches).map(normMatch).filter((m) => m.objectId || m.title),
    comparisonRequired: d.comparison_required === true || !!val.existing_comparison,
    dependencies: strs(d.dependency_titles),
    improvements: strs(d.improvements),
    sources: asArr(d.sources).map(normSource).filter((s) => s.url || s.title),
  };
}

function normTool(v: unknown): AgentTool {
  const d = asDict(v);
  const status = asStr(d.status ?? d.state ?? d.result_status ?? d.result);
  return {
    tool: asStr(d.tool ?? d.name ?? d.tool_name ?? d.function),
    status,
    ok: boolOr(d.ok ?? d.success) ?? (status ? !/fail|error/i.test(status) : null),
    durationMs: numOr(d.duration_ms ?? d.latency_ms ?? d.elapsed_ms),
    at: asStr(d.created_at ?? d.at ?? d.timestamp ?? d.started_at),
  };
}

export function normAgentError(v: unknown): AgentError | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return { code: "", reason: "", message: v, requested: null, created: null };
  const d = asDict(v);
  return { code: asStr(d.code), reason: asStr(d.reason), message: asStr(d.message ?? d.detail), requested: numOr(d.requested), created: numOr(d.created) };
}

export function normAgentJob(v: unknown): AgentJob {
  const d = asDict(v);
  const q = d.quality_summary === null || d.quality_summary === undefined ? null : asDict(d.quality_summary);
  const drafts = asArr(d.drafts).map(normDraft).filter((x) => x.objectId || x.title);
  const target = numOr(d.target_drafts) ?? numOr(d.max_drafts) ?? 0;
  return {
    id: asStr(d.id),
    status: asStr(d.status) || "queued",
    stage: asStr(d.stage),
    progress: numOr(d.progress_percent),
    prompt: asStr(d.prompt),
    constructorCodes: asArr(d.constructor_codes).map((x) => asStr(x)).filter(Boolean),
    targetDrafts: target,
    maxDrafts: numOr(d.max_drafts) ?? target,
    draftCount: numOr(d.draft_count),
    savedCount: numOr(d.saved_count),
    language: asStr(d.output_language),
    script: asStr(d.output_script),
    officialSources: boolOr(d.official_sources_required),
    requestedAt: asStr(d.requested_at ?? d.created_at),
    startedAt: asStr(d.started_at),
    finishedAt: asStr(d.finished_at ?? d.completed_at),
    heartbeatAt: asStr(d.worker_heartbeat_at),
    updatedAt: asStr(d.updated_at),
    attempts: numOr(d.attempt_count),
    toolCalls: numOr(d.tool_call_count),
    turns: numOr(d.agent_turns),
    drafts,
    sources: asArr(d.sources).map(normSource).filter((s) => s.url || s.title),
    quality: q
      ? { validated: numOr(q.validated_count), language: numOr(q.language_check_count), sources: numOr(q.source_check_count), comparisons: numOr(q.comparison_count) }
      : null,
    tools: asArr(d.tool_history).map(normTool).filter((x) => x.tool),
    error: normAgentError(d.error),
    // §18: these two are invariants; anything else is shown as-is, never
    // turned into a publish action.
    publishRequiresHumanApproval: d.publish_requires_human_approval !== false,
    autoPublished: d.auto_published === true,
  };
}

const enc = encodeURIComponent;

export async function createAgentJob(input: AgentInput): Promise<AgentJob> {
  const n = Math.max(1, Math.min(10, Math.round(input.drafts)));
  const body: Dict = {
    prompt: input.prompt.trim(),
    max_drafts: n,
    target_drafts: n,
    output_language: input.language,
    output_script: input.script,
    official_sources_required: input.officialSources,
  };
  if (input.constructorCodes.length) body.constructor_codes = input.constructorCodes;
  return normAgentJob(await http("/studio/ai/agent-jobs", { method: "POST", body: JSON.stringify(body) }));
}

export async function getAgentJob(id: string, signal?: AbortSignal): Promise<AgentJob> {
  return normAgentJob(await http(`/studio/ai/agent-jobs/${enc(id)}`, { signal }));
}

// §5: a create refusal mapped onto the control it is about.
export type AgentFieldError = { field: "prompt" | "constructors" | "language" | "form"; code: string; extra: string };

export function agentCreateErrorOf(e: unknown): AgentFieldError | null {
  if (!(e instanceof ApiError) || e.status !== 422) return null;
  const code = e.code ?? "";
  const raw = asDict(e.data.detail ?? e.data);
  if (code === "agent_prompt_too_short") return { field: "prompt", code, extra: "" };
  if (code === "agent_constructor_codes_invalid") return { field: "constructors", code, extra: asArr(raw.requested).map((x) => asStr(x)).join(", ") };
  if (code === "agent_language_invalid") return { field: "language", code, extra: "" };
  return { field: "form", code, extra: "" };
}

// One numeric shortfall for a partial result (§12): from the error when it
// says so, else from the counts the job carries.
export function shortfallOf(job: AgentJob): { created: number; requested: number } {
  const requested = job.error?.requested ?? job.targetDrafts;
  const created = job.error?.created ?? job.draftCount ?? job.drafts.length;
  return { created, requested };
}

export const isTerminal = (status: string): boolean => AGENT_TERMINAL.has(status);
