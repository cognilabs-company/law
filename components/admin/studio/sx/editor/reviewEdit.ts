import type { SchemaModel, SxValues } from "../contract";
import { patternOf, schemaFieldAt, validatePayload } from "../schema/model";

type Dict = Record<string, unknown>;

export const REVIEWING_STATUSES: ReadonlySet<string> = new Set(["submitted", "in_review"]);
export const EDIT_IN_REVIEW = "edit_in_review";

const REQUIRED_TOKEN = /^@(required|file)$|^@code:[a-z0-9_]*(required|missing)$/;
const SAFE_PATH = /^[A-Za-z0-9_$][A-Za-z0-9_.$-]*$/;

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const actionName = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (!isDict(v)) return "";
  const name = v.action ?? v.key ?? v.name ?? v.code;
  return typeof name === "string" ? name.trim() : "";
};

export function editInReviewOf(raw: unknown): boolean {
  if (!isDict(raw)) return false;
  if (raw.can_edit_in_review === true) return true;
  const acts = raw.allowed_actions;
  if (Array.isArray(acts)) return acts.some((a) => actionName(a) === EDIT_IN_REVIEW);
  if (isDict(acts)) return acts[EDIT_IN_REVIEW] === true;
  return false;
}

export function isRequiredToken(token: string): boolean {
  return REQUIRED_TOKEN.test(String(token ?? ""));
}

export function missingRequired(model: SchemaModel | null, payload: SxValues, opts: { fileMissing?: boolean } = {}): string[] {
  if (!model) return [];
  const out: string[] = [];
  for (const [path, token] of Object.entries(validatePayload(model, payload, null))) {
    if (!isRequiredToken(token) || !SAFE_PATH.test(path)) continue;
    const top = schemaFieldAt(model.ctor.typed, patternOf(path.split(".")[0] ?? ""));
    if (top && (top.generated || top.readOnly || top.hidden)) continue;
    if (!out.includes(path)) out.push(path);
  }
  if (opts.fileMissing && !out.includes("file")) out.push("file");
  return out;
}

export function reviewFocusHref(id: string, path: string): string {
  const base = `/admin/studio/o/${encodeURIComponent(id)}`;
  return path ? `${base}?focus=${encodeURIComponent(path)}` : base;
}
