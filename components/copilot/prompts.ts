import type { LucideIcon } from "lucide-react";
import {
  BriefcaseIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  FilePenLineIcon,
  FileSearchIcon,
  FilesIcon,
  FileTextIcon,
  GaugeIcon,
  GitBranchIcon,
  HandshakeIcon,
  HeadsetIcon,
  HistoryIcon,
  LightbulbIcon,
  ListChecksIcon,
  ListOrderedIcon,
  NotebookPenIcon,
  ReplyIcon,
  ScaleIcon,
  SearchIcon,
  ShieldAlertIcon,
  TargetIcon,
  UsersIcon,
} from "lucide-react";
import { surfaceBelongsTo, type CopilotPanelMode, type CopilotSurface } from "@/lib/services/copilotPanel";

export const CLIENT_PROMPTS = ["findService", "findLawyer", "workStatus", "missingInfo", "explainSimple", "meetingPrep", "supportDraft", "secondOpinion", "myWorks", "myDocuments", "deadlines"] as const;
export const LAWYER_PROMPTS = [
  "summarizeRequest",
  "missingFacts",
  "workPlan",
  "factTimeline",
  "evidenceMap",
  "contradictions",
  "reviewDraft",
  "clientReply",
  "meetingAgenda",
  "meetingSummary",
  "scopeReview",
  "completionCheck",
  "prioritize",
  "handoffPack",
] as const;
export type CopilotPromptKey = (typeof CLIENT_PROMPTS)[number] | (typeof LAWYER_PROMPTS)[number];

export const PROMPT_ICONS: Record<CopilotPromptKey, LucideIcon> = {
  findService: SearchIcon,
  findLawyer: UsersIcon,
  workStatus: GaugeIcon,
  missingInfo: FileSearchIcon,
  explainSimple: LightbulbIcon,
  meetingPrep: CalendarClockIcon,
  supportDraft: HeadsetIcon,
  secondOpinion: ScaleIcon,
  summarizeRequest: FileTextIcon,
  missingFacts: FileSearchIcon,
  workPlan: ListChecksIcon,
  factTimeline: HistoryIcon,
  evidenceMap: GitBranchIcon,
  contradictions: ShieldAlertIcon,
  reviewDraft: FilePenLineIcon,
  clientReply: ReplyIcon,
  meetingAgenda: CalendarClockIcon,
  meetingSummary: NotebookPenIcon,
  scopeReview: TargetIcon,
  completionCheck: ClipboardCheckIcon,
  prioritize: ListOrderedIcon,
  handoffPack: HandshakeIcon,
  myWorks: BriefcaseIcon,
  myDocuments: FilesIcon,
  deadlines: CalendarDaysIcon,
};

const GENERAL_ONLY = new Set<CopilotPromptKey>(["myWorks", "myDocuments", "deadlines", "prioritize"]);

const NEEDS_ENTITY = new Set<CopilotPromptKey>([
  "workStatus",
  "missingInfo",
  "explainSimple",
  "meetingPrep",
  "secondOpinion",
  "summarizeRequest",
  "missingFacts",
  "workPlan",
  "factTimeline",
  "evidenceMap",
  "contradictions",
  "reviewDraft",
  "clientReply",
  "meetingAgenda",
  "meetingSummary",
  "scopeReview",
  "completionCheck",
  "handoffPack",
]);

const NEEDS_TOOL: Partial<Record<CopilotPromptKey, string[]>> = {
  findService: ["search_services"],
  findLawyer: ["search_lawyers"],
  workStatus: ["get_work_context", "get_case_context", "get_my_works"],
  prioritize: ["get_my_works", "get_deadlines"],
  factTimeline: ["get_work_context", "get_case_context", "get_chat_context"],
  evidenceMap: ["get_work_context", "get_case_context"],
  completionCheck: ["get_work_context"],
  scopeReview: ["get_work_context", "get_chat_context"],
  myWorks: ["get_my_works"],
  myDocuments: ["get_my_documents"],
  deadlines: ["get_deadlines"],
};

const BY_SURFACE: Record<CopilotSurface, CopilotPromptKey[]> = {
  client_dashboard: ["findService", "findLawyer", "myWorks", "deadlines", "supportDraft"],
  service_catalog: ["findService", "findLawyer", "explainSimple"],
  lawyer_marketplace: ["findLawyer", "findService"],
  client_work_detail: ["workStatus", "missingInfo", "explainSimple", "meetingPrep", "secondOpinion", "supportDraft", "myWorks", "deadlines"],
  client_document_detail: ["explainSimple", "missingInfo", "workStatus", "myDocuments", "deadlines"],
  client_chat: ["missingInfo", "explainSimple", "meetingPrep"],
  client_case_detail: ["workStatus", "missingInfo", "explainSimple", "meetingPrep", "secondOpinion", "myWorks", "deadlines"],
  client_meeting: ["meetingPrep", "missingInfo", "explainSimple", "deadlines"],
  client_support: ["supportDraft", "workStatus", "findService", "myWorks"],
  lawyer_dashboard: ["prioritize", "deadlines"],
  lawyer_work_detail: ["summarizeRequest", "missingFacts", "workPlan", "scopeReview", "completionCheck", "clientReply"],
  lawyer_case_detail: ["factTimeline", "evidenceMap", "contradictions", "workPlan", "missingFacts", "handoffPack"],
  lawyer_chat: ["summarizeRequest", "missingFacts", "contradictions", "clientReply"],
  lawyer_document_request: ["summarizeRequest", "missingFacts", "reviewDraft", "clientReply", "prioritize", "deadlines"],
  lawyer_editor: ["reviewDraft", "contradictions", "missingFacts"],
  lawyer_meeting: ["meetingAgenda", "meetingSummary", "missingFacts", "deadlines", "prioritize"],
  lawyer_checklist: ["completionCheck", "scopeReview", "missingFacts"],
  lawyer_work_queue: ["prioritize", "deadlines"],
};

export function copilotPrompts(mode: CopilotPanelMode, surface: CopilotSurface, hasEntity: boolean, tools: string[] | null): CopilotPromptKey[] {
  const home: CopilotSurface = mode === "lawyer_copilot" ? "lawyer_dashboard" : "client_dashboard";
  const own = surfaceBelongsTo(surface, mode) ? surface : home;
  const known = tools && tools.length ? new Set(tools) : null;
  const fits = (k: CopilotPromptKey) => {
    const need = NEEDS_TOOL[k];
    return (hasEntity ? !GENERAL_ONLY.has(k) : !NEEDS_ENTITY.has(k)) && (!known || !need || need.some((x) => known.has(x)));
  };
  const list = BY_SURFACE[own].filter(fits);
  return list.length ? list : BY_SURFACE[home].filter(fits);
}
