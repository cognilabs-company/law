import { asArr, asStr, http, type Dict } from "@/lib/http";
import { marketChatHref } from "@/lib/services/marketplace";
import type { RuntimeTemplate } from "@/lib/services/marketRuntime";
import type { OrderView } from "./types";

export type DocKind = "catalog" | "docx" | "pdf" | "unknown";
export type DocAction = "constructor" | "onlyoffice" | "pdf" | "chat" | "none";
export type DocRoute = { kind: DocKind; mode: "required" | "optional"; action: DocAction; href: string };
export type DocTemplate = RuntimeTemplate & { raw?: Record<string, unknown> };
export type SellerRole = "lawyer" | "advocate" | "";

const enc = encodeURIComponent;
const dictOf = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const FILE_KEYS = ["file_type", "format", "mime_type", "extension", "file_name", "filename", "url"] as const;

function fileKindOf(value: unknown): DocKind | null {
  const v = asStr(value).trim().toLowerCase();
  if (!v) return null;
  if (v.includes("wordprocessingml") || v.includes("msword")) return "docx";
  if (v === "application/pdf") return "pdf";
  const path = v.split(/[?#]/)[0] ?? "";
  const dot = path.lastIndexOf(".");
  const token = dot >= 0 ? path.slice(dot + 1) : path;
  if (token === "docx" || token === "doc") return "docx";
  if (token === "pdf") return "pdf";
  return null;
}

function uploadKindOf(raw: Record<string, unknown> | undefined): DocKind {
  const d = dictOf(raw);
  for (const key of FILE_KEYS) {
    const kind = fileKindOf(d[key]);
    if (kind) return kind;
  }
  return "unknown";
}

export function docKindOf(t: DocTemplate): DocKind {
  const source = asStr(t.source).trim().toLowerCase();
  if (source === "catalog") return "catalog";
  if (source === "upload") return uploadKindOf(t.raw);
  if (source === "catalog_or_upload") return t.documentTemplateId ? "catalog" : uploadKindOf(t.raw);
  return "unknown";
}

export function sellerRoleOf(listHref: string): SellerRole {
  if (/(^|\/)portal\/lawyer(\/|$)/.test(listHref)) return "lawyer";
  if (/(^|\/)portal\/advocate(\/|$)/.test(listHref)) return "advocate";
  return "";
}

export function docRouteOf(input: { template: DocTemplate; view: OrderView; sellerRole: SellerRole; serviceId: string; roomId: string; recordId: string; workId: string; serviceTitle: string }): DocRoute | null {
  const { template, view, sellerRole, roomId, recordId, workId, serviceTitle } = input;
  const modeRaw = asStr(template.mode).trim().toLowerCase();
  if (modeRaw !== "required" && modeRaw !== "optional") return null;
  const mode: DocRoute["mode"] = modeRaw;
  const kind = docKindOf(template);
  const route = (action: DocAction, href: string): DocRoute => ({ kind, mode, action, href });
  const chat = (): DocRoute => (roomId ? route("chat", marketChatHref({ roomId, workId, serviceTitle })) : route("none", ""));
  const editor = (): DocRoute => (sellerRole && recordId ? route("onlyoffice", `/portal/${sellerRole}/document-requests/${enc(recordId)}/editor`) : chat());
  if (kind === "catalog" || kind === "docx") return view === "seller" ? editor() : chat();
  return chat();
}

export type DocLeadKey = "catalogClient" | "catalogSeller" | "docxClient" | "docxSeller" | "pdf" | "viaChat";
export type DocActionKey = "openConstructor" | "openEditor" | "openPdf" | "openChat";

export const DOC_ACTION_KEY: Readonly<Record<DocAction, DocActionKey | null>> = {
  constructor: "openConstructor",
  onlyoffice: "openEditor",
  pdf: "openPdf",
  chat: "openChat",
  none: null,
};

export function docLeadKey(kind: DocKind, view: OrderView, action: DocAction): DocLeadKey {
  if (kind === "catalog") {
    if (view === "seller") return "catalogSeller";
    return action === "constructor" ? "catalogClient" : "viaChat";
  }
  if (kind === "docx") {
    if (view === "client") return "docxClient";
    return action === "onlyoffice" ? "docxSeller" : "viaChat";
  }
  if (kind === "pdf") return action === "pdf" ? "pdf" : "viaChat";
  return "viaChat";
}

export function templateOfRuntime(runtime: { template: RuntimeTemplate; raw?: Dict } | null): DocTemplate | null {
  if (!runtime) return null;
  return { ...runtime.template, raw: dictOf(runtime.raw?.template) };
}

export function needsRecordId(kind: DocKind, view: OrderView, roomId: string): boolean {
  return view === "seller" && !!roomId && (kind === "catalog" || kind === "docx");
}

export async function roomDocumentRecordId(roomId: string, signal?: AbortSignal): Promise<string> {
  if (!roomId) return "";
  try {
    const d = dictOf(await http(`/secure-chats/${enc(roomId)}`, { signal }));
    const room = dictOf(d.room);
    const ids = asArr(d.document_lawyer_request_ids ?? room.document_lawyer_request_ids)
      .map((x) => (typeof x === "string" ? x : asStr(dictOf(x).id)).trim())
      .filter(Boolean);
    return ids[ids.length - 1] ?? "";
  } catch {
    return "";
  }
}
