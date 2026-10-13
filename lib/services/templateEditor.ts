import { ApiError, asArr, asDict, asStr, http, httpBlobNamed, type Dict } from "@/lib/http";
import { cleanDocText, cleanDocTitle } from "@/lib/docTitle";
import { uzs } from "@/lib/money";

export const DEFAULT_FIELD_TYPES = ["text", "textarea", "number", "date", "phone", "email", "select", "checkbox"];
export const DOCX_MAX_BYTES = 20 * 1024 * 1024;
export const TEMPLATE_CATEGORIES = ["contract", "claim", "application", "power_of_attorney", "corporate", "other"];
export const TEMPLATE_LANGUAGES = ["uz-latn", "uz-cyrl", "ru"];
export const TEMPLATE_VISIBILITIES = ["client", "staff"];

const base = (id: string) => `/admin/document-templates/${encodeURIComponent(id)}`;

function pickList(data: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  const d = asDict(data);
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as unknown[];
  for (const k of keys) {
    const inner = asDict(d[k]);
    for (const k2 of keys) if (Array.isArray(inner[k2])) return inner[k2] as unknown[];
  }
  return [];
}

const numOr = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const firstStr = (...vs: unknown[]) => {
  for (const v of vs) {
    const s = asStr(v).trim();
    if (s) return s;
  }
  return "";
};

export type TemplateRow = {
  id: string;
  name: string;
  slug: string;
  category: string;
  language: string;
  description: string;
  price: number;
  visibility: string;
  isActive: boolean;
  status: string;
  revision: number;
  sectionsCount: number;
  fieldsCount: number;
  hasSourceFile: boolean;
  sourceFileName: string;
  createdAt: string;
  updatedAt: string;
};

export function normTemplateRow(v: unknown): TemplateRow {
  const d = asDict(v);
  const rawName = asStr(d.title ?? d.name);
  const isActive = d.is_active === true || d.is_active === 1 || d.is_active === "true";
  const sourceFileName = asStr(d.source_file_name);
  return {
    id: asStr(d.id),
    name: cleanDocTitle(rawName) || rawName,
    slug: asStr(d.slug),
    category: asStr(d.category),
    language: asStr(d.language),
    description: cleanDocText(asStr(d.description)),
    price: uzs(d, "price"),
    visibility: asStr(d.visibility, "client"),
    isActive,
    status: firstStr(d.status, d.editor_status) || (isActive ? "active" : "inactive"),
    revision: numOr(d.revision, 0),
    sectionsCount: numOr(d.sections_count ?? d.section_count, 0),
    fieldsCount: numOr(d.fields_count ?? d.field_count, asArr(d.fields).length),
    hasSourceFile: d.has_source_file === true || Boolean(sourceFileName),
    sourceFileName,
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
  };
}

export type TemplateListFilter = { q?: string; category?: string; visibility?: string; isActive?: boolean };

export async function listEditorTemplates(f?: TemplateListFilter): Promise<TemplateRow[]> {
  const qs = new URLSearchParams();
  if (f?.q) qs.set("q", f.q);
  if (f?.category) qs.set("category", f.category);
  if (f?.visibility) qs.set("visibility", f.visibility);
  if (f?.isActive != null) qs.set("is_active", String(f.isActive));
  const q = qs.toString();
  const res = await http(`/admin/document-templates${q ? `?${q}` : ""}`);
  return pickList(res, "templates", "items", "data", "results").map(normTemplateRow).filter((r) => r.id);
}

export type EditorMeta = {
  title: string;
  slug: string;
  category: string;
  language: string;
  description: string;
  price: number;
  visibility: string;
};

export type EditorOption = { value: string; label: string };

export type EditorSection = { id: string; title: string; description: string };

export type FieldDefault = string | number | boolean | null;

export type EditorField = {
  uid: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  sectionId: string;
  helpText: string;
  defaultValue: FieldDefault;
  options: EditorOption[];
  validation: Dict;
  insertText: string;
  savedKey: string;
  autoKey: boolean;
};

export type EditorDraft = {
  id: string;
  templateId: string;
  revision: number;
  baseRevision: number;
  status: string;
  editorStatus: string;
  lastSavedAt: string;
  updatedAt: string;
  meta: EditorMeta;
  sections: EditorSection[];
  fields: EditorField[];
  hasStructure: boolean;
};

export type EditorTemplateInfo = {
  id: string;
  status: string;
  revision: number;
  isActive: boolean;
  hasSourceFile: boolean;
  sourceFileName: string;
};

export type OnlyOfficeState = {
  config: Dict | null;
  serverUrl: string;
  configured: boolean;
  configErrors: string[];
  docKey: string;
};

export type EditorSession = {
  templateId: string;
  template: EditorTemplateInfo;
  draft: EditorDraft;
  provider: string;
  oo: OnlyOfficeState;
  fieldTypes: string[];
  uiContract: Dict;
};

function normOption(o: unknown): EditorOption {
  if (o && typeof o === "object") {
    const d = asDict(o);
    const value = firstStr(d.value, d.key, d.label);
    return { value, label: firstStr(d.label, d.title, d.value) };
  }
  const s = asStr(o);
  return { value: s, label: s };
}

function normDefault(v: unknown): FieldDefault {
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export function normEditorField(v: unknown, i: number, sectionFallback = ""): EditorField {
  const d = asDict(v);
  const key = firstStr(d.key, d.name);
  const insertText = firstStr(d.insert_text, d.placeholder);
  return {
    uid: `f${i}`,
    key,
    label: asStr(d.label) || key,
    type: firstStr(d.type, d.field_type) || "text",
    required: d.required === true || d.required === 1 || d.required === "true",
    sectionId: firstStr(d.section_id, d.section_key, typeof d.section === "string" ? d.section : "") || sectionFallback,
    helpText: firstStr(d.help_text, d.hint, d.description),
    defaultValue: normDefault(d.default_value),
    options: asArr(d.options ?? d.choices).map(normOption).filter((o) => o.value),
    validation: { ...asDict(d.validation) },
    insertText,
    savedKey: insertText ? key : "",
    autoKey: false,
  };
}

type Ordered<T> = { item: T; a: number; b: number; i: number };
function sortOrdered<T>(rows: Ordered<T>[]): T[] {
  return rows.sort((x, y) => x.a - y.a || x.b - y.b || x.i - y.i).map((r) => r.item);
}

function normMeta(d: Dict, tpl: Dict): EditorMeta {
  return {
    title: firstStr(d.title, tpl.title, tpl.name),
    slug: firstStr(d.slug, tpl.slug),
    category: firstStr(d.category, tpl.category),
    language: firstStr(d.language, tpl.language),
    description: asStr(d.description ?? tpl.description),
    price: numOr(d.price ?? tpl.price, 0),
    visibility: firstStr(d.visibility, tpl.visibility) || "client",
  };
}

export function normEditorDraft(v: unknown, tplRaw: unknown = {}, templateId = ""): EditorDraft {
  const d = asDict(v);
  const tpl = asDict(tplRaw);
  const rawSections = asArr(d.sections);
  const secRows: Ordered<{ s: EditorSection; raw: Dict }>[] = rawSections.map((x, i) => {
    const s = asDict(x);
    return {
      item: { s: { id: firstStr(s.id, s.key, s.section_id), title: asStr(s.title ?? s.name), description: asStr(s.description) }, raw: s },
      a: numOr(s.order ?? s.section_order, Number.MAX_SAFE_INTEGER),
      b: 0,
      i,
    };
  });
  const sortedSecs = sortOrdered(secRows).filter((r) => r.s.id);
  const sections = sortedSecs.map((r) => r.s);
  const secOrder = new Map(sections.map((s, i) => [s.id, i]));
  let rawFields = asArr(d.fields);
  if (!rawFields.length) {
    rawFields = sortedSecs.flatMap((r) => asArr(r.raw.fields).map((f) => ({ section_id: r.s.id, ...asDict(f) })));
  }
  const fieldRows: Ordered<EditorField>[] = rawFields.map((x, i) => {
    const raw = asDict(x);
    const f = normEditorField(raw, i);
    return {
      item: f,
      a: secOrder.get(f.sectionId) ?? numOr(raw.section_order, Number.MAX_SAFE_INTEGER),
      b: numOr(raw.field_order, numOr(raw.template_order, Number.MAX_SAFE_INTEGER)),
      i,
    };
  });
  const fields = sortOrdered(fieldRows)
    .filter((f) => f.key || f.label)
    .map((f, i) => ({ ...f, uid: `f${i}` }));
  return {
    id: asStr(d.id),
    templateId: firstStr(d.template_id, tpl.id) || templateId,
    revision: numOr(d.draft_revision ?? d.revision, 0),
    baseRevision: numOr(d.base_revision, 0),
    status: asStr(d.status),
    editorStatus: asStr(d.editor_status),
    lastSavedAt: firstStr(d.editor_last_saved_at, d.updated_at),
    updatedAt: asStr(d.updated_at),
    meta: normMeta(d, tpl),
    sections,
    fields,
    hasStructure: Array.isArray(d.sections) || Array.isArray(d.fields),
  };
}

function normFieldTypes(v: unknown): string[] {
  const list = asArr(v)
    .map((x) => (x && typeof x === "object" ? firstStr(asDict(x).value, asDict(x).key, asDict(x).type, asDict(x).name) : asStr(x)))
    .filter(Boolean);
  return list.length ? Array.from(new Set(list)) : DEFAULT_FIELD_TYPES;
}

export function normOnlyOffice(raw: unknown, fallbackKey = ""): OnlyOfficeState {
  const config = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Dict) : null;
  const serverUrl = asStr(config?.document_server_url).trim().replace(/\/+$/, "");
  const flag = config?.configured;
  return {
    config,
    serverUrl,
    configured: Boolean(config) && Boolean(serverUrl) && flag !== false,
    configErrors: asArr(config?.configuration_errors).map((x) => asStr(x)).filter(Boolean),
    docKey: firstStr(asDict(config?.document).key, fallbackKey),
  };
}

export function normEditorSession(v: unknown, templateId = ""): EditorSession {
  const d = asDict(v);
  const tpl = asDict(d.template);
  const draftRaw = d.draft && typeof d.draft === "object" ? d.draft : d;
  const draft = normEditorDraft(draftRaw, tpl, templateId);
  const ui = asDict(d.ui_contract);
  const tplId = firstStr(tpl.id, draft.templateId, d.template_id) || templateId;
  const tplActive = tpl.is_active === true || tpl.is_active === 1 || tpl.is_active === "true";
  const sourceFileName = firstStr(tpl.source_file_name, asDict(d.file).file_name, asDict(d.file).name);
  return {
    templateId: tplId,
    template: {
      id: tplId,
      status: firstStr(tpl.status) || (tplActive ? "active" : "draft"),
      revision: numOr(tpl.revision, 0),
      isActive: tplActive,
      hasSourceFile: tpl.has_source_file === true || Boolean(sourceFileName),
      sourceFileName,
    },
    draft,
    provider: firstStr(d.provider, asDict(d.onlyoffice).provider),
    oo: normOnlyOffice(d.onlyoffice, firstStr(d.session_id, draft.id)),
    fieldTypes: normFieldTypes(ui.field_types),
    uiContract: ui,
  };
}

export type CreateDraftInput = {
  slug: string;
  title: string;
  category: string;
  language: string;
  description: string;
  price: number;
  visibility: string;
};

export async function createEditorDraft(input: CreateDraftInput): Promise<EditorSession> {
  const res = await http("/admin/document-templates/editor-drafts", { method: "POST", body: JSON.stringify(input) });
  return normEditorSession(res);
}

export async function openTemplateEditor(id: string): Promise<EditorSession> {
  return normEditorSession(await http(`${base(id)}/editor`), id);
}

export type DraftSectionBody = { id: string; title: string; description: string; order: number };
export type DraftFieldBody = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  section_id: string;
  field_order: number;
  help_text: string;
  default_value: FieldDefault;
  options: EditorOption[];
  validation: Dict;
};
export type DraftBody = EditorMeta & { sections: DraftSectionBody[]; fields: DraftFieldBody[] };

export const KEY_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export type BuiltPayload = { body: DraftBody; serial: string; skipped: Set<string> };

function cleanDefault(f: EditorField): FieldDefault {
  const v = f.defaultValue;
  if (v === null || v === "") return null;
  if (f.type === "checkbox") return v === true || v === "true";
  if (f.type === "number" && typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : v;
  }
  return v;
}

function cleanValidation(f: EditorField): Dict {
  const out: Dict = {};
  for (const [k, v] of Object.entries(f.validation)) {
    if (v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  return out;
}

export function buildDraftPayload(meta: EditorMeta, sections: EditorSection[], fields: EditorField[]): BuiltPayload {
  const skipped = new Set<string>();
  const seen = new Set<string>();
  const order = new Map<string, number>();
  const outFields: DraftFieldBody[] = [];
  for (const f of fields) {
    const key = f.key.trim();
    if (!KEY_RE.test(key) || !f.label.trim() || seen.has(key)) {
      skipped.add(f.uid);
      continue;
    }
    seen.add(key);
    const n = (order.get(f.sectionId) ?? 0) + 1;
    order.set(f.sectionId, n);
    outFields.push({
      key,
      label: f.label.trim(),
      type: f.type,
      required: f.required,
      section_id: f.sectionId,
      field_order: n,
      help_text: f.helpText,
      default_value: cleanDefault(f),
      options: f.type === "select" ? f.options.filter((o) => o.value.trim()).map((o) => ({ value: o.value.trim(), label: o.label.trim() || o.value.trim() })) : [],
      validation: cleanValidation(f),
    });
  }
  const body: DraftBody = {
    title: meta.title.trim(),
    slug: meta.slug.trim(),
    category: meta.category,
    language: meta.language,
    description: meta.description,
    price: Math.max(0, Math.round(meta.price || 0)),
    visibility: meta.visibility,
    sections: sections.map((s, i) => ({ id: s.id, title: s.title.trim(), description: s.description, order: i + 1 })),
    fields: outFields,
  };
  return { body, serial: JSON.stringify(body), skipped };
}

export type SaveResult = { revision: number; draft: EditorDraft | null; savedAt: string };

export async function saveEditorDraft(id: string, expectedRevision: number, body: DraftBody): Promise<SaveResult> {
  const res = asDict(await http(`${base(id)}/editor/draft`, { method: "PUT", body: JSON.stringify({ expected_revision: expectedRevision, ...body }) }));
  const raw = res.draft && typeof res.draft === "object" ? asDict(res.draft) : res.draft_revision != null ? res : null;
  const draft = raw ? normEditorDraft(raw, res.template, id) : null;
  const revision = raw ? numOr(raw.draft_revision ?? raw.revision, NaN) : numOr(res.draft_revision, NaN);
  return { revision, draft, savedAt: firstStr(raw?.editor_last_saved_at, raw?.updated_at) };
}

// What the editor can do, as the backend states it (GET …/editor/ui-contract,
// also carried inside an editor session): the ways a template may be
// created, which files it takes and how large, and where they are sent. The
// values below stand in only until a contract has been read.
export type EditorUiContract = { createModes: string[]; acceptedExtensions: string[]; maxUploadBytes: number; uploadCreateUrl: string; sourceUploadUrl: string };
export const DEFAULT_UI_CONTRACT: EditorUiContract = { createModes: ["blank"], acceptedExtensions: [".docx"], maxUploadBytes: DOCX_MAX_BYTES, uploadCreateUrl: "", sourceUploadUrl: "" };
const editorPath = (url: string): string => {
  const u = (url || "").trim();
  return u.startsWith("/admin/document-templates/") && !u.includes("..") ? u : "";
};
export function uiContractOf(raw: unknown): EditorUiContract {
  const d = asDict(raw);
  const ext = asArr(d.accepted_upload_extensions).map((x) => asStr(x).toLowerCase()).filter((x) => /^\.[a-z0-9]+$/.test(x));
  const modes = asArr(d.create_modes).map((x) => asStr(x)).filter(Boolean);
  return {
    createModes: modes.length ? modes : DEFAULT_UI_CONTRACT.createModes,
    acceptedExtensions: ext.length ? ext : DEFAULT_UI_CONTRACT.acceptedExtensions,
    maxUploadBytes: numOr(d.maximum_upload_bytes, DOCX_MAX_BYTES),
    uploadCreateUrl: editorPath(asStr(d.device_upload_create_url)),
    sourceUploadUrl: editorPath(asStr(d.source_upload_url)),
  };
}
export async function getEditorUiContract(id: string, signal?: AbortSignal): Promise<EditorUiContract> {
  return uiContractOf(await http(`${base(id)}/editor/ui-contract`, { signal }));
}

export class LocalFileError extends Error {
  code: "not_docx" | "too_big";
  constructor(code: "not_docx" | "too_big") {
    super(code);
    this.name = "LocalFileError";
    this.code = code;
  }
}

export function checkDocx(file: File, contract: Pick<EditorUiContract, "acceptedExtensions" | "maxUploadBytes"> = DEFAULT_UI_CONTRACT): LocalFileError | null {
  const name = file.name.toLowerCase();
  if (!contract.acceptedExtensions.some((ext) => name.endsWith(ext))) return new LocalFileError("not_docx");
  if (file.size > contract.maxUploadBytes) return new LocalFileError("too_big");
  return null;
}

// A new template started from a file on the device
// (POST /admin/document-templates/editor-drafts/upload, multipart): the
// answer is the same editor session a blank draft gives. Sent once — a
// failed upload is never repeated on its own, so no duplicate drafts.
export async function uploadEditorDraft(input: CreateDraftInput, file: File, contract: EditorUiContract = DEFAULT_UI_CONTRACT): Promise<EditorSession> {
  const bad = checkDocx(file, contract);
  if (bad) throw bad;
  const form = new FormData();
  form.append("slug", input.slug);
  form.append("title", input.title);
  form.append("category", input.category);
  form.append("language", input.language || "uz-latn");
  if (input.description) form.append("description", input.description);
  form.append("price", String(input.price || 0));
  form.append("visibility", input.visibility || "client");
  form.append("file", file);
  return normEditorSession(await http(contract.uploadCreateUrl || "/admin/document-templates/editor-drafts/upload", { method: "POST", body: form }));
}

export type SourceUploadResult = { oo: OnlyOfficeState | null; revision: number; sourceFileName: string };

export async function uploadEditorSource(id: string, file: File, contract: EditorUiContract = DEFAULT_UI_CONTRACT): Promise<SourceUploadResult> {
  const bad = checkDocx(file, contract);
  if (bad) throw bad;
  const form = new FormData();
  form.append("file", file);
  const res = asDict(await http(contract.sourceUploadUrl || `${base(id)}/editor/source-file`, { method: "POST", body: form }));
  const draft = asDict(res.draft);
  return {
    oo: res.onlyoffice ? normOnlyOffice(res.onlyoffice, firstStr(res.session_id)) : null,
    revision: numOr(draft.draft_revision ?? res.draft_revision, NaN),
    sourceFileName: firstStr(asDict(res.template).source_file_name, res.source_file_name, asDict(res.file).file_name) || file.name,
  };
}

export const editorFileUrl = (id: string) => `${base(id)}/editor/file`;

export async function getEditorFile(id: string): Promise<{ blob: Blob; name: string }> {
  return httpBlobNamed(editorFileUrl(id));
}

export type IssueLevel = "error" | "warning";
export type EditorIssue = { code: string; message: string; key: string; sectionId: string; level: IssueLevel };

const stripBraces = (s: string) => s.replace(/^\{+\s*/, "").replace(/\s*\}+$/, "").trim();

function normIssue(v: unknown, level: IssueLevel, keyFallback = "", sectionFallback = ""): EditorIssue {
  if (typeof v === "string") {
    const m = /^([a-z_]+)\s*[:=]\s*(.+)$/.exec(v.trim());
    if (m) return { code: m[1], message: "", key: stripBraces(m[2]), sectionId: sectionFallback, level };
    const code = /^[a-z_]+$/.test(v.trim()) ? v.trim() : "";
    return { code, message: code ? "" : v, key: keyFallback, sectionId: sectionFallback, level };
  }
  const d = asDict(v);
  const fieldObj = d.field && typeof d.field === "object" ? asDict(d.field) : null;
  const key = firstStr(d.field_key, d.key, fieldObj ? firstStr(fieldObj.key, fieldObj.name) : d.field, d.name, d.field_name);
  const placeholder = firstStr(d.placeholder, d.token);
  const sectionObj = d.section && typeof d.section === "object" ? asDict(d.section) : null;
  return {
    code: firstStr(d.code, d.type, d.error, d.kind),
    message: firstStr(d.message, d.msg, d.detail, d.text),
    key: stripBraces(key || placeholder) || keyFallback,
    sectionId: firstStr(d.section_id, d.section_key, sectionObj ? firstStr(sectionObj.id, sectionObj.key) : d.section) || sectionFallback,
    level,
  };
}

export type EditorValidation = {
  valid: boolean;
  errors: EditorIssue[];
  warnings: EditorIssue[];
  sectionCount: number | null;
  fieldCount: number | null;
  requiredCount: number | null;
  placeholderCount: number | null;
};

const maybeNum = (v: unknown): number | null => {
  const n = numOr(v, NaN);
  return Number.isFinite(n) ? n : null;
};

export function normValidation(v: unknown): EditorValidation {
  const d = asDict(v);
  const errors = asArr(d.errors).map((x) => normIssue(x, "error"));
  const warnings = asArr(d.warnings).map((x) => normIssue(x, "warning"));
  for (const f of asArr(d.fields)) {
    const fd = asDict(f);
    const k = firstStr(fd.key, fd.name);
    for (const e of asArr(fd.errors)) errors.push(normIssue(e, "error", k));
    for (const w of asArr(fd.warnings)) warnings.push(normIssue(w, "warning", k));
  }
  for (const s of asArr(d.sections)) {
    const sd = asDict(s);
    const id = firstStr(sd.id, sd.key);
    for (const e of asArr(sd.errors)) errors.push(normIssue(e, "error", "", id));
    for (const w of asArr(sd.warnings)) warnings.push(normIssue(w, "warning", "", id));
  }
  const dedupe = (list: EditorIssue[]) => {
    const seen = new Set<string>();
    return list.filter((x) => {
      const sig = `${x.code}|${x.key}|${x.sectionId}|${x.message}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  };
  const errs = dedupe(errors);
  return {
    valid: typeof d.valid === "boolean" ? d.valid && errs.length === 0 : errs.length === 0,
    errors: errs,
    warnings: dedupe(warnings),
    sectionCount: maybeNum(d.section_count),
    fieldCount: maybeNum(d.field_count),
    requiredCount: maybeNum(d.required_count),
    placeholderCount: maybeNum(d.placeholder_count),
  };
}

export async function validateEditor(id: string): Promise<EditorValidation> {
  return normValidation(await http(`${base(id)}/editor/validate`, { method: "POST" }));
}

export type PreviewAnswer = string | number | boolean;
export type EditorPreview = {
  previewText: string;
  finalText: string;
  missing: { key: string; label: string }[];
  canGenerate: boolean;
  completion: number | null;
};

export async function previewEditor(id: string, answers: Record<string, PreviewAnswer>): Promise<EditorPreview> {
  const d = asDict(await http(`${base(id)}/editor/preview`, { method: "POST", body: JSON.stringify({ answers }) }));
  const missing = asArr(d.missing_required_fields).map((x) => {
    if (typeof x === "string") return { key: x, label: x };
    const m = asDict(x);
    const key = firstStr(m.key, m.name);
    return { key, label: firstStr(m.label, key) };
  });
  return {
    previewText: asStr(d.preview_text ?? d.preview),
    finalText: asStr(d.final_text),
    missing,
    canGenerate: typeof d.can_generate === "boolean" ? d.can_generate : missing.length === 0,
    completion: maybeNum(d.completion_percent),
  };
}

export type PublishResult = { revision: number | null; isActive: boolean | null };

export async function publishEditor(id: string, expectedRevision: number, activate: boolean): Promise<PublishResult> {
  const d = asDict(await http(`${base(id)}/editor/publish`, { method: "POST", body: JSON.stringify({ expected_revision: expectedRevision, activate }) }));
  const tpl = asDict(d.template);
  const active = tpl.is_active ?? d.is_active;
  return {
    revision: maybeNum(tpl.revision ?? d.revision),
    isActive: typeof active === "boolean" ? active : null,
  };
}

export type TemplateVersion = {
  id: string;
  revision: number | null;
  title: string;
  status: string;
  createdBy: string;
  createdAt: string;
};

export async function listTemplateVersions(id: string): Promise<TemplateVersion[]> {
  const res = await http(`${base(id)}/versions`);
  return pickList(res, "versions", "items", "data", "results")
    .map((x) => {
      const d = asDict(x);
      return {
        id: firstStr(d.id, d.version_id),
        revision: maybeNum(d.revision),
        title: asStr(d.title),
        status: asStr(d.status),
        createdBy: firstStr(d.created_by_name, d.created_by_user_id),
        createdAt: asStr(d.created_at),
      };
    })
    .filter((v) => v.id)
    .sort((a, b) => (b.revision ?? -1) - (a.revision ?? -1));
}

export async function restoreTemplateVersion(id: string, versionId: string): Promise<void> {
  await http(`${base(id)}/versions/${encodeURIComponent(versionId)}/restore`, { method: "POST" });
}

function detailOf(e: ApiError): Dict {
  const dd = e.data.detail;
  if (dd && typeof dd === "object" && !Array.isArray(dd)) return dd as Dict;
  return e.data;
}

function codeOf(e: ApiError): string {
  return firstStr(e.code, detailOf(e).code, e.data.code);
}

export type RevisionConflict = { expected: number | null; current: number | null };

export function revisionConflictOf(e: unknown): RevisionConflict | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const code = codeOf(e);
  if (code && code !== "draft_revision_conflict" && code !== "revision_conflict" && code !== "template_revision_conflict") return null;
  const d = detailOf(e);
  return { expected: maybeNum(d.expected_revision), current: maybeNum(d.current_revision) };
}

export function editorSaveRequiredOf(e: unknown): { message: string } | null {
  if (!(e instanceof ApiError) || e.status !== 409 || codeOf(e) !== "editor_save_required") return null;
  return { message: asStr(detailOf(e).message) };
}

export function validationFailedOf(e: unknown): EditorValidation | null {
  if (!(e instanceof ApiError) || e.status !== 422) return null;
  const d = detailOf(e);
  if (codeOf(e) !== "template_validation_failed" && !Array.isArray(d.errors)) return null;
  return normValidation({ ...d, valid: false });
}

export function slugConflictOf(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  if (e.status === 409) {
    const code = codeOf(e);
    return !code || /slug|duplicate|exists/i.test(code) || /slug/i.test(e.detail || "");
  }
  return e.status === 400 && /slug/i.test(e.detail || "");
}
