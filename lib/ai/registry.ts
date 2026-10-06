"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

export type AiFieldHandle = {
  get: () => string;
  set: (value: string) => void;
  sensitive?: boolean;
  fillable?: boolean;
  disabled?: boolean;
};

const fields = new Map<string, AiFieldHandle>();
const selections = new Map<string, string>();
const modals = new Map<string, () => void>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function subscribeAiRegistry(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useAiField(aiId: string, handle: AiFieldHandle): void {
  const ref = useRef(handle);
  useLayoutEffect(() => {
    ref.current = handle;
  });
  useLayoutEffect(() => {
    if (!aiId) return;
    const proxy: AiFieldHandle = {
      get: () => ref.current.get(),
      set: (value) => ref.current.set(value),
      get sensitive() {
        return Boolean(ref.current.sensitive);
      },
      get fillable() {
        return ref.current.fillable !== false;
      },
      get disabled() {
        return Boolean(ref.current.disabled);
      },
    };
    fields.set(aiId, proxy);
    notify();
    return () => {
      if (fields.get(aiId) !== proxy) return;
      fields.delete(aiId);
      notify();
    };
  }, [aiId]);
}

export function useAiSelection(key: string, value: string | number | null | undefined): void {
  const v = value == null ? "" : String(value);
  useEffect(() => {
    if (!key) return;
    if (v) selections.set(key, v);
    else selections.delete(key);
    notify();
    return () => {
      if (selections.get(key) !== v) return;
      selections.delete(key);
      notify();
    };
  }, [key, v]);
}

export function useAiModal(aiId: string, open: () => void): void {
  const ref = useRef(open);
  useEffect(() => {
    ref.current = open;
  });
  useEffect(() => {
    if (!aiId) return;
    const opener = () => ref.current();
    modals.set(aiId, opener);
    return () => {
      if (modals.get(aiId) === opener) modals.delete(aiId);
    };
  }, [aiId]);
}

export function aiField(aiId: string): AiFieldHandle | null {
  return fields.get(aiId) ?? null;
}

export function aiModalOpener(aiId: string): (() => void) | null {
  return modals.get(aiId) ?? null;
}

export function aiSelections(): Record<string, string> {
  return Object.fromEntries(selections);
}

export function aiFormState(limit = 300): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, h] of fields) {
    if (h.sensitive) continue;
    const value = h.get().trim();
    if (value) out[id] = value.slice(0, limit);
  }
  return out;
}
