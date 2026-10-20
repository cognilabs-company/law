import { ApiError } from "@/lib/http";
import { normPath } from "@/lib/studioSchema";
import type { SxErrors } from "../types";
import { plainUzMessage } from "./useEditorErrorText";

type Dict = Record<string, unknown>;
export type ServerFieldError = { path: string; code: string; message: string };

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

function listOf(d: Dict): unknown[] {
  for (const k of ["errors", "field_errors", "fields"]) if (Array.isArray(d[k])) return d[k] as unknown[];
  if (Array.isArray(d.detail)) return d.detail;
  if (isDict(d.detail)) return listOf(d.detail);
  return [];
}

export function serverFieldErrors(raw: unknown): ServerFieldError[] {
  const src = raw instanceof ApiError ? raw.data : raw;
  if (!isDict(src)) return [];
  const out: ServerFieldError[] = [];
  for (const it of listOf(src)) {
    if (!isDict(it)) continue;
    const loc = Array.isArray(it.loc) ? it.loc.map(str).filter((s) => s && s !== "body" && s !== "payload").join(".") : "";
    const field = str(it.field) || str(it.path) || str(it.name) || loc;
    if (!field) continue;
    const path = normPath(field.replace(/^(body|payload)\./, ""));
    out.push({ path, code: str(it.code).toLowerCase(), message: str(it.message) || str(it.msg) || str(it.detail) });
  }
  return out;
}

export function withServerMessages(errors: SxErrors, raw: unknown, locale: string): SxErrors {
  if (locale !== "uz") return errors;
  const list = serverFieldErrors(raw);
  if (!list.length) return errors;
  let out: Record<string, string> | null = null;
  for (const e of list) {
    const cur = errors[e.path];
    if (!cur || !cur.startsWith("@code:") || !e.message) continue;
    const text = plainUzMessage(e.message);
    if (!text) continue;
    out = out ?? { ...errors };
    out[e.path] = text;
  }
  return out ?? errors;
}
