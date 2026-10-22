import { asArr, asDict, asNum, asStr, http, httpBlobNamed } from "@/lib/http";
import { cleanDocText, cleanDocTitle } from "@/lib/docTitle";

// The ready-document catalog, read straight from the templates
// (FRONTEND_MOBILE_LEGAL_DOCUMENT_TEMPLATES_FULL_FLOW_2026_10_22.md §1):
// GET /document-templates is the canonical list — 989 templates on
// 2026-10-22 against 3 services — so a catalog built from /services alone
// shows an empty page. A template needs no linked service to be opened,
// previewed, filled or sent to the duty lawyer.

export type TemplateCard = {
  id: string;
  title: string;
  description: string;
  category: string;
  language: string;
  price: number;
  hasSourceFile: boolean;
  sourceFileName: string;
  mimeType: string;
  updatedAt: string;
};

const FILE_EXT = /\.[A-Za-z0-9]{1,8}$/;

// §3.1: never a UUID for a name — the title, else the source file's name
// without its extension.
function titleOf(d: Record<string, unknown>): string {
  return cleanDocTitle(asStr(d.title)) || cleanDocTitle(asStr(d.source_file_name).replace(FILE_EXT, ""));
}

// Only what a card shows: the list also carries every template's full text,
// fields and sections (2 MB for the whole catalog), none of which a card needs.
export function normTemplateCard(v: unknown): TemplateCard {
  const d = asDict(v);
  const title = titleOf(d);
  const description = cleanDocText(asStr(d.description));
  return {
    id: asStr(d.id),
    title,
    description: description && description !== title ? description : "",
    category: asStr(d.category),
    language: asStr(d.language),
    price: asNum(d.price),
    hasSourceFile: d.has_source_file === true,
    sourceFileName: asStr(d.source_file_name),
    mimeType: asStr(d.source_file_mime_type),
    updatedAt: asStr(d.updated_at ?? d.published_at ?? d.created_at),
  };
}

export async function listTemplateCards(filter: { category?: string; language?: string }, signal?: AbortSignal): Promise<TemplateCard[]> {
  const qs = new URLSearchParams();
  if (filter.category) qs.set("category", filter.category);
  if (filter.language) qs.set("language", filter.language);
  const q = qs.toString();
  const data = await http(`/document-templates${q ? `?${q}` : ""}`, { signal });
  const list = Array.isArray(data) ? data : asArr(asDict(data).items ?? asDict(data).templates);
  return list
    .filter((v) => asDict(v).is_active !== false)
    .map(normTemplateCard)
    .filter((c) => c.id && c.title);
}

// §6: the backend's own rendering of the template, line breaks and all.
export type TemplateRender = { title: string; text: string };

export async function renderDocumentTemplate(templateId: string, answers: Record<string, string> = {}, signal?: AbortSignal): Promise<TemplateRender> {
  const d = asDict(await http(`/document-templates/${encodeURIComponent(templateId)}/render`, { method: "POST", body: JSON.stringify({ answers }), signal }));
  const p = asDict(d.preview);
  const text = [d.rendered_text, d.preview_text, d.text, d.content, p.rendered_text, p.text, d.template_text].map((x) => asStr(x)).find((x) => x.trim()) ?? "";
  return { title: cleanDocTitle(asStr(d.title)), text };
}

// §9: the clean DOCX (blanks instead of field markers) — never the
// marker-bearing source file. 402 comes back as an ApiError for the plan gate.
export async function getDocumentTemplateCleanFile(templateId: string): Promise<{ blob: Blob; name: string }> {
  return httpBlobNamed(`/document-templates/${encodeURIComponent(templateId)}/clean-source-file`);
}
