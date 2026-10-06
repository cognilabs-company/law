import type { AiElementType } from "./ids";

export type InstructorMode = "auto" | "v20" | "v21";

export const AI_COMMAND_TYPES = [
  "navigate",
  "highlight",
  "scroll_to",
  "focus_input",
  "open_modal",
  "fill_form",
  "preview_action",
  "confirm_required",
  "support_handoff",
  "show_steps",
  "tooltip",
] as const;

export type AiCommandType = (typeof AI_COMMAND_TYPES)[number];

export const MUTATING_ACTIONS = [
  "start_support_ticket",
  "prepare_subscription_purchase",
  "start_document_request",
  "prepare_marketplace_purchase",
  "prepare_urgent_advokat_request",
] as const;

export type MutatingAction = (typeof MUTATING_ACTIONS)[number];

export type InstructorContract = {
  version: string;
  commandTypes: string[];
  mutatingActions: string[];
  capabilities: string[];
  role: string;
  allowedRoutes: string[];
};

export type AiStep = { text: string; target: string };

export type AiCommand = {
  id: string;
  type: string;
  status: string;
  requiresFrontend: boolean;
  href: string;
  routeKey: string;
  target: string;
  modal: string;
  text: string;
  style: string;
  durationMs: number;
  fields: Record<string, string>;
  action: string;
  payload: Record<string, unknown>;
  requiresConfirmation: boolean;
  steps: AiStep[];
  reason: string;
  category: string;
};

export type AiEndpoints = {
  events: string;
  runtime: string;
  preview: string;
  confirm: string;
};

export type AiChatResponse = {
  contractVersion: string;
  sessionId: string;
  responseId: string;
  answer: string;
  intent: string;
  rawCommands: unknown[];
  toolResults: Record<string, unknown>;
  suggestions: string[];
  endpoints: AiEndpoints;
};

export type AiViewport = { width: number; height: number };

export type RuntimeState = {
  current_route: string;
  visible_ai_ids: string[];
  selected_items: Record<string, string>;
  form_state: Record<string, string>;
  viewport: AiViewport;
  open_modal: string;
};

export type ManifestEntity = { type: string; id?: string; slug?: string };

export type ManifestElement = {
  ai_id: string;
  type: AiElementType;
  label: string;
  description?: string;
  actions: string[];
  route?: string;
  entity?: ManifestEntity;
};

export type UiManifest = {
  route: string;
  role: string;
  page_title: string;
  page_description?: string;
  elements: ManifestElement[];
};

export type AiTurn = { role: "user" | "assistant"; content: string };

export type AiChatRequest = {
  session_id?: string;
  locale: string;
  message: string;
  runtime_state: RuntimeState;
  ui_manifest: UiManifest;
  history: AiTurn[];
};

export type AiRuntimeRequest = {
  session_id: string;
  locale: string;
  runtime_state: RuntimeState;
  ui_manifest: UiManifest;
};

export type AiEventType = "command_completed" | "target_missing" | "command_failed" | "command_cancelled" | "element_clicked";

export type AiEventStatus = "completed" | "failed" | "cancelled";

export type AiEventBody = {
  session_id: string;
  event_type: AiEventType;
  command_id?: string;
  command_type?: string;
  status: AiEventStatus;
  target?: string;
  details: Record<string, unknown>;
};

export type AiActor = { userId: string; name: string; role: string };

export type ActionPreview = {
  action: string;
  title: string;
  summary: string;
  amount: number | null;
  currency: string;
  amountText: string;
  billingPeriod: string;
  onBehalfOf: AiActor | null;
  requiresConfirmation: boolean;
  canExecute: boolean;
  confirmToken: string;
  expiresAt: number;
  warnings: string[];
  details: string[];
  message: string;
};

export type ActionResult = {
  status: string;
  ticketId: string;
  ticketWorkId: string;
  paymentUrl: string;
  nextHref: string;
  nextTarget: string;
  resultRef: string;
  commands: unknown[];
  message: string;
};

export type CmdStatus = "pending" | "running" | "done" | "missing" | "failed" | "cancelled" | "skipped";

export type CmdState = { status: CmdStatus; reason: string };
