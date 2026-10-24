// What POST /secure-chats/{room_id}/messages/upload takes (backend contract
// of 23 Oct 2026): the extension decides, the MIME type is not checked; a
// file may be up to 50 MB, an .mp4 or .mov video up to 200 MB; one file per
// request. Checked before the upload so a refused file never shows up as a
// failed bubble, and the backend's own refusals are read the same way.

import { ApiError } from "./http";

const MB = 1024 * 1024;

export const SECURE_UPLOAD_EXTS: readonly string[] = ["pdf", "doc", "docx", "xls", "xlsx", "odt", "rtf", "txt", "jpg", "jpeg", "png", "heic", "webp", "mp3", "m4a", "ogg", "wav", "webm", "mp4", "mov", "zip"];

// For a file input's accept list.
export const SECURE_UPLOAD_ACCEPT = SECURE_UPLOAD_EXTS.map((x) => `.${x}`).join(",");

const extOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";

// Video gets the larger limit; .webm stays at the regular one.
export const secureUploadLimitMb = (name: string): number => (/^(mp4|mov)$/.test(extOf(name)) ? 200 : 50);

export type SecureUploadProblem = { kind: "type" } | { kind: "size"; mb: number } | { kind: "quota"; usedBytes: number; quotaBytes: number } | { kind: "broken" };

export function secureUploadProblem(file: File): SecureUploadProblem | null {
  if (!SECURE_UPLOAD_EXTS.includes(extOf(file.name))) return { kind: "type" };
  const mb = secureUploadLimitMb(file.name);
  return file.size > mb * MB ? { kind: "size", mb } : null;
}

// The backend's refusal of an upload: 413 for a file over its limit or a
// full workspace quota (neither carries detail.code), 415 for a blocked type
// or a file that is not what its extension says, 422 for a damaged archive.
export function secureUploadRefusal(e: unknown, name: string): SecureUploadProblem | null {
  if (!(e instanceof ApiError)) return null;
  if (e.status === 415) return { kind: "type" };
  if (e.status === 422) return { kind: "broken" };
  if (e.status !== 413) return null;
  const d = e.data.detail && typeof e.data.detail === "object" && !Array.isArray(e.data.detail) ? (e.data.detail as Record<string, unknown>) : e.data;
  const quota = Number(d.quota_bytes);
  if (Number.isFinite(quota) && quota > 0) return { kind: "quota", usedBytes: Number(d.used_bytes) || 0, quotaBytes: quota };
  return { kind: "size", mb: secureUploadLimitMb(name) };
}
