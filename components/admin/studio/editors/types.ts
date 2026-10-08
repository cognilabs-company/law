import type { ComponentType } from "react";
import type { StudioConstructor, StudioFieldErrors } from "@/lib/services/studio";

export type StudioPayload = Record<string, unknown>;

export type StudioEditorFile = { hasFile: boolean; fileName: string; fileUrl: string; versionId: string };

export type StudioEditorProps = {
  code: string;
  constructor: StudioConstructor | null;
  payload: StudioPayload;
  onChange: (next: StudioPayload) => void;
  errors: StudioFieldErrors;
  readOnly: boolean;
  file: StudioEditorFile | null;
  onUploadFile: ((file: File) => Promise<void>) | null;
  title: string;
};

export type StudioClientValidate = (payload: StudioPayload, constructor?: StudioConstructor | null) => StudioFieldErrors;
export type ClientValidate = StudioClientValidate;

export type StudioEditorEntry = {
  Editor: ComponentType<StudioEditorProps>;
  validate: (payload: StudioPayload, constructor: StudioConstructor | null) => StudioFieldErrors;
  emptyPayload: (constructor: StudioConstructor | null) => StudioPayload;
};

export const STUDIO_ERR = {
  required: "@required",
  json: "@json",
  object: "@object",
  list: "@list",
  duplicate: "@duplicate",
  lang: "@lang",
  file: "@file",
  number: "@number",
  rule: "@rule",
} as const;

export function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

export function requiredErrors(payload: StudioPayload, required: string[]): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  for (const f of required) if (isBlank(payload[f])) out[f] = STUDIO_ERR.required;
  return out;
}

export function errorFor(errors: StudioFieldErrors, name: string): string {
  if (errors[name]) return errors[name];
  for (const [k, v] of Object.entries(errors)) if (k.startsWith(`${name}.`) || k.startsWith(`${name}[`)) return v;
  return "";
}

export function errorsUnder(errors: StudioFieldErrors, prefix: string): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  for (const [k, v] of Object.entries(errors)) {
    if (k === prefix) continue;
    if (k.startsWith(`${prefix}.`)) out[k.slice(prefix.length + 1)] = v;
    else if (k.startsWith(`${prefix}[`)) out[k.slice(prefix.length).replace(/^\[(\d+)\]\.?/, "$1.").replace(/\.$/, "")] = v;
  }
  return out;
}
