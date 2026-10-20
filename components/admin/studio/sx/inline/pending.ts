"use client";

import { useSyncExternalStore } from "react";
import { isDraftOwner, type InlinePending } from "./model";

type Data = Readonly<Record<string, readonly InlinePending[]>>;

const KEY = "lexgo.sx.inline.pending.v2";
const MAX_PER_SLOT = 20;
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const EMPTY: readonly InlinePending[] = [];
const EMPTY_DATA: Data = {};

let cache: Data | null = null;
const listeners = new Set<() => void>();

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function itemOf(raw: unknown): InlinePending | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const objectId = str(r.objectId).trim();
  const code = str(r.code).trim();
  if (!objectId || !code) return null;
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0;
  return { objectId, code, title: str(r.title), isNew: r.isNew === true, value: str(r.value), status: str(r.status), at };
}

export function parsePending(text: string | null, now = Date.now()): Data {
  if (!text) return EMPTY_DATA;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return EMPTY_DATA;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_DATA;
  const out: Record<string, InlinePending[]> = {};
  for (const [slot, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list) || isDraftOwner(slot)) continue;
    const items = list
      .map(itemOf)
      .filter((x): x is InlinePending => x !== null && now - x.at < MAX_AGE_MS)
      .slice(-MAX_PER_SLOT);
    if (items.length) out[slot] = items;
  }
  return out;
}

function read(): Data {
  if (cache) return cache;
  let text: string | null = null;
  try {
    text = typeof window === "undefined" ? null : window.sessionStorage.getItem(KEY);
  } catch {
    text = null;
  }
  cache = parsePending(text);
  return cache;
}

function write(next: Data): void {
  cache = next;
  try {
    if (Object.keys(next).length) window.sessionStorage.setItem(KEY, JSON.stringify(next));
    else window.sessionStorage.removeItem(KEY);
  } catch {}
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function pendingOf(slot: string): readonly InlinePending[] {
  return read()[slot] ?? EMPTY;
}

export function usePending(slot: string): readonly InlinePending[] {
  return useSyncExternalStore(
    subscribe,
    () => pendingOf(slot),
    () => EMPTY,
  );
}

export function putPending(slot: string, item: InlinePending): void {
  const data = read();
  const list = (data[slot] ?? EMPTY).filter((x) => x.objectId !== item.objectId);
  write({ ...data, [slot]: [...list, item].slice(-MAX_PER_SLOT) });
}

export function patchPending(slot: string, objectId: string, patch: Partial<Omit<InlinePending, "objectId">>): void {
  const data = read();
  const list = data[slot] ?? EMPTY;
  if (!list.some((x) => x.objectId === objectId)) return;
  write({ ...data, [slot]: list.map((x) => (x.objectId === objectId ? { ...x, ...patch } : x)) });
}

export function ownerHasPending(owner: string): boolean {
  if (!owner) return false;
  const head = `${owner}|`;
  return Object.keys(read()).some((slot) => slot.startsWith(head));
}

export function movePendingOwner(from: string, to: string): void {
  if (!from || !to || from === to) return;
  const head = `${from}|`;
  const data = read();
  if (!Object.keys(data).some((slot) => slot.startsWith(head))) return;
  const next: Record<string, readonly InlinePending[]> = {};
  for (const [slot, list] of Object.entries(data)) if (!slot.startsWith(head)) next[slot] = list;
  for (const [slot, list] of Object.entries(data)) {
    if (!slot.startsWith(head)) continue;
    const target = `${to}|${slot.slice(head.length)}`;
    const have = next[target] ?? EMPTY;
    next[target] = [...have, ...list.filter((x) => !have.some((y) => y.objectId === x.objectId))].slice(-MAX_PER_SLOT);
  }
  write(next);
}

export function dropPending(slot: string, objectId: string): void {
  const data = read();
  const list = data[slot] ?? EMPTY;
  if (!list.some((x) => x.objectId === objectId)) return;
  const rest = list.filter((x) => x.objectId !== objectId);
  const next: Record<string, readonly InlinePending[]> = { ...data };
  if (rest.length) next[slot] = rest;
  else delete next[slot];
  write(next);
}
