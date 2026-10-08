import { parseServerTime } from "@/lib/http";
import type { StudioComment, StudioDetail, StudioFieldErrors, StudioStatus, StudioVersion } from "@/lib/services/studio";
import type { StudioPayload } from "../editors/types";

export type Draft = { title: string; payload: StudioPayload };
export type Busy = "" | "save" | "submit" | "archive" | "publish" | "rollback" | "upload" | "comment";
export type SideTab = "versions" | "comments" | "file" | "steps";

export const LOCKED: StudioStatus[] = ["submitted", "in_review", "archived"];

const seeds = new Map<string, StudioDetail>();

export function seedDetail(d: StudioDetail): void {
  if (d.id) seeds.set(d.id, d);
}

export function peekSeed(id: string): StudioDetail | null {
  return id ? seeds.get(id) ?? null : null;
}

export function draftOf(d: StudioDetail): Draft {
  return { title: d.title, payload: { ...d.payload } };
}

export function draftKey(d: Draft | null): string {
  if (!d) return "";
  try {
    return JSON.stringify([d.title.trim(), d.payload]);
  } catch {
    return "";
  }
}

const same = (a: unknown, b: unknown) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

export function pruneErrors(errors: StudioFieldErrors, prev: StudioPayload, next: StudioPayload): StudioFieldErrors {
  const keys = Object.keys(errors);
  if (!keys.length) return errors;
  const out: StudioFieldErrors = {};
  let changed = false;
  for (const k of keys) {
    const root = k.split(/[.[]/)[0];
    if (root in prev || root in next ? !same(prev[root], next[root]) : false) {
      changed = true;
      continue;
    }
    out[k] = errors[k];
  }
  return changed ? out : errors;
}

export function nextMinor(v: string): string {
  const m = /^(\d+)(?:\.(\d+))?/.exec(v.trim());
  if (!m) return "1.0";
  return `${m[1]}.${(m[2] ? parseInt(m[2], 10) : 0) + 1}`;
}

export function versionOk(v: string): boolean {
  return !v.trim() || /^\d{1,4}(\.\d{1,4}){0,2}$/.test(v.trim());
}

export function currentVersionOf(d: StudioDetail | null): StudioVersion | null {
  if (!d) return null;
  return d.versions.find((v) => v.id && v.id === d.currentVersionId) ?? d.versions[0] ?? null;
}

const BACK_RE = /change|reject|declin|return|rework/;

export type ReviewNote = { text: string; by: string; at: string; rejected: boolean };

export function reviewNoteOf(d: StudioDetail | null, comments: StudioComment[] | null): ReviewNote | null {
  if (!d) return null;
  const steps = d.steps
    .filter((s) => BACK_RE.test(s.status) && s.comment)
    .sort((a, b) => (parseServerTime(b.decidedAt) || 0) - (parseServerTime(a.decidedAt) || 0));
  const s = steps[0];
  if (s) return { text: s.comment, by: s.decidedBy, at: s.decidedAt, rejected: /reject|declin/.test(s.status) };
  const c = newestFirst(comments ?? []).find((x) => /review|publish|admin/.test(x.authorRole.toLowerCase())) ?? null;
  if (c) return { text: c.text, by: c.author, at: c.createdAt, rejected: false };
  return null;
}

export function newestFirst(list: StudioComment[]): StudioComment[] {
  return list
    .map((c, i) => ({ c, i, t: parseServerTime(c.createdAt) }))
    .sort((a, b) => {
      const at = Number.isFinite(a.t) ? a.t : -Infinity;
      const bt = Number.isFinite(b.t) ? b.t : -Infinity;
      return at === bt ? b.i - a.i : bt - at;
    })
    .map((x) => x.c);
}

export function fileExt(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

export function fieldRoot(key: string): string {
  return key.split(/[.[]/)[0];
}
