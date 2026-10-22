"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ApiError, asDict } from "@/lib/http";
import { listStudioObjects, type StudioReferenceItem } from "@/lib/services/studio";
import type { SxValues } from "../contract";
import { firstReferencePage } from "../form/useReferenceOptions";

// Service rule names are unique once normalised: two names that differ only
// in letter case, spacing, apostrophe style or punctuation are the same
// rule. The backend has the last word (HTTP 409); this module lets the form
// see a twin before saving and point at the rule that already exists.

export const RULE_SOURCE = "service-rules";
export const RULE_TITLE_DUPLICATE = "@code:rule_title_duplicate";

const APOSTROPHES = /[ʻʼ‘’`´′]/g;
const NOT_WORD = /[^\p{L}\p{N}']+/gu;

export function normRuleTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFKC").toLocaleLowerCase("uz").replace(APOSTROPHES, "'").replace(NOT_WORD, " ").replace(/\s+/g, " ").trim();
}

// One existing rule, published or still a Studio draft. `value` is what a
// rule picker stores for it: the published id, or the draft's object id.
export type RuleTwin = { value: string; objectId: string; title: string; version: string; status: string; scope: string; published: boolean };

type Store = { at: number; rules: readonly RuleTwin[] | null; loading: Promise<void> | null };
const TTL_MS = 60 * 1000;
const store: Store = { at: 0, rules: null, loading: null };
const watchers = new Set<() => void>();
const GONE = new Set(["archived", "rejected", "deleted"]);

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function publishedOf(it: StudioReferenceItem): RuleTwin {
  const r = it.raw;
  return { value: it.value, objectId: "", title: str(r.title) || it.label, version: str(r.version), status: "published", scope: str(r.scope_type), published: true };
}

async function load(): Promise<void> {
  const [published, objects] = await Promise.all([
    firstReferencePage(RULE_SOURCE).catch(() => [] as StudioReferenceItem[]),
    listStudioObjects({ constructorCode: "K31", limit: 100 }).then(
      (r) => r.items,
      () => [],
    ),
  ]);
  const out: RuleTwin[] = published.map(publishedOf);
  const byValue = new Map(out.map((r) => [r.value, r]));
  for (const o of objects) {
    const status = (o.statusRaw || o.status || "").toLowerCase();
    if (GONE.has(status)) continue;
    const runtime = str(o.raw.runtime_target_id);
    const live = runtime ? byValue.get(runtime) : undefined;
    if (live) {
      live.objectId = o.id;
      continue;
    }
    const p = asDict(asDict(o.raw.current_version).payload);
    out.push({ value: o.id, objectId: o.id, title: o.title || str(p.title), version: str(p.version), status, scope: str(p.scope_type), published: false });
  }
  store.rules = out;
  store.at = Date.now();
  for (const fn of watchers) fn();
}

function ensure(): void {
  if (store.loading || (store.rules && Date.now() - store.at < TTL_MS)) return;
  store.loading = load().finally(() => {
    store.loading = null;
  });
}

// Forget the list (after a rule is saved, so the next check sees it).
export function dropRuleTwins(): void {
  store.at = 0;
}

export function useRuleList(enabled: boolean): readonly RuleTwin[] | null {
  useEffect(() => {
    if (enabled) ensure();
  }, [enabled]);
  return useSyncExternalStore(
    (fn) => {
      watchers.add(fn);
      return () => {
        watchers.delete(fn);
      };
    },
    () => store.rules,
    () => null,
  );
}

// Rules other than this one whose name matches `title` once normalised.
export function twinsOf(rules: readonly RuleTwin[] | null, title: unknown, self: readonly string[] = []): RuleTwin[] {
  const want = normRuleTitle(title);
  if (!want || !rules) return [];
  const mine = new Set(self.filter(Boolean));
  return rules.filter((r) => !mine.has(r.value) && !(r.objectId && mine.has(r.objectId)) && normRuleTitle(r.title) === want);
}

// The names a save would duplicate, as field errors: a K31 rule against the
// others, and a service's own rules against the shared ones and each other.
export function ruleDuplicateErrors(code: string, payload: SxValues, self: readonly string[]): Record<string, string> {
  const rules = store.rules;
  const out: Record<string, string> = {};
  const c = code.toUpperCase();
  if (c === "K31") {
    if (twinsOf(rules, payload.title, self).length) out.title = RULE_TITLE_DUPLICATE;
    return out;
  }
  if (c !== "K02" || !Array.isArray(payload.inline_rules)) return out;
  const seen = new Set<string>();
  payload.inline_rules.forEach((row, i) => {
    const n = normRuleTitle(asDict(row).title);
    if (!n) return;
    if (seen.has(n) || twinsOf(rules, n).length) out[`inline_rules.${i}.title`] = RULE_TITLE_DUPLICATE;
    seen.add(n);
  });
  return out;
}

const DUP_CODE = /duplicate|already_exists|_exists$|not_unique|unique|taken/i;
const NOT_NAME = new Set(["rule_version_duplicate", "studio_edit_conflict", "studio_version_conflict"]);

export type DuplicateHit = { code: string; field: string; existingId: string; existingTitle: string };

// A 409 the backend sends for a name that is already in use, whatever its
// exact code; with the existing rule when the response names it.
export function duplicateNameOf(e: unknown): DuplicateHit | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const d = asDict(e.data.detail);
  const code = str(e.code) || str(d.code) || str(e.data.code);
  if (!code || NOT_NAME.has(code) || !DUP_CODE.test(code)) return null;
  const ex = asDict(d.existing ?? d.existing_rule ?? d.conflict);
  return {
    code,
    field: (str(d.field) || str(d.path)).replace(/^(body|payload)\./, ""),
    existingId: str(d.existing_rule_id) || str(d.existing_id) || str(d.duplicate_of) || str(d.conflict_id) || str(ex.id) || str(ex.value),
    existingTitle: str(d.existing_title) || str(ex.title) || str(ex.label),
  };
}

// Where a server-reported duplicate lands in the form.
export function duplicateFieldOf(code: string, payload: SxValues, hit: DuplicateHit): string {
  if (hit.field) return hit.field;
  if (code.toUpperCase() === "K31") return "title";
  if (code.toUpperCase() === "K02" && Array.isArray(payload.inline_rules)) {
    const want = normRuleTitle(hit.existingTitle);
    const local = ruleDuplicateErrors(code, payload, []);
    const i = payload.inline_rules.findIndex((row, k) => (want && normRuleTitle(asDict(row).title) === want) || !!local[`inline_rules.${k}.title`]);
    if (i >= 0) return `inline_rules.${i}.title`;
  }
  return "";
}

// The existing rule a 409 named, kept by the name it clashed on so the note
// under that field can offer it even when it is not in the loaded list.
const reported = new Map<string, { id: string; title: string }>();

export function rememberDuplicate(title: unknown, hit: DuplicateHit): void {
  const n = normRuleTitle(title);
  if (n && hit.existingId) reported.set(n, { id: hit.existingId, title: hit.existingTitle });
}

export function reportedDuplicate(title: unknown): { id: string; title: string } | null {
  return reported.get(normRuleTitle(title)) ?? null;
}
