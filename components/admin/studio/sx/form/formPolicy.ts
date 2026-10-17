"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { normPath } from "@/lib/studioSchema";
import type { SxErrors } from "../types";

export type SxFormPolicy = {
  readonly submitted: boolean;
  isTouched(path: string): boolean;
  touch(path: string): void;
  markSubmitted(): void;
  markServer(paths: readonly string[]): void;
  reset(): void;
  visible(path: string, errors: SxErrors): string;
  visibleCount(prefix: string, errors: SxErrors): number;
};

type PolicyState = { touched: ReadonlySet<string>; server: ReadonlySet<string>; submitted: boolean };

const FRESH: PolicyState = { touched: new Set(), server: new Set(), submitted: false };

function errorAt(errors: SxErrors, path: string, norm: string): string {
  const direct = errors[norm] || errors[path];
  if (direct) return direct;
  for (const [k, v] of Object.entries(errors)) if (v && normPath(k) === norm) return v;
  return "";
}

export function policyVisible(state: PolicyState, path: string, errors: SxErrors): string {
  const norm = normPath(path);
  const error = errorAt(errors, path, norm);
  if (!error) return "";
  return state.submitted || state.touched.has(norm) || state.server.has(norm) ? error : "";
}

export function policyVisibleCount(state: PolicyState, prefix: string, errors: SxErrors): number {
  const base = normPath(prefix);
  const counted = new Set<string>();
  for (const key of Object.keys(errors)) {
    const norm = normPath(key);
    if (counted.has(norm)) continue;
    if (base && norm !== base && !norm.startsWith(`${base}.`)) continue;
    if (policyVisible(state, norm, errors)) counted.add(norm);
  }
  return counted.size;
}

export function useSxFormPolicy(resetKey?: string): SxFormPolicy {
  const [state, setState] = useState<PolicyState>(FRESH);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setState(FRESH);
  }

  return useMemo<SxFormPolicy>(
    () => ({
      submitted: state.submitted,
      isTouched: (path) => state.touched.has(normPath(path)),
      touch: (path) =>
        setState((s) => {
          const norm = normPath(path);
          if (!norm || s.touched.has(norm)) return s;
          const touched = new Set(s.touched);
          touched.add(norm);
          return { ...s, touched };
        }),
      markSubmitted: () => setState((s) => (s.submitted ? s : { ...s, submitted: true })),
      markServer: (paths) =>
        setState((s) => {
          const server = new Set(s.server);
          for (const p of paths) {
            const norm = normPath(p);
            if (norm) server.add(norm);
          }
          return server.size === s.server.size ? s : { ...s, server };
        }),
      reset: () => setState(FRESH),
      visible: (path, errors) => policyVisible(state, path, errors),
      visibleCount: (prefix, errors) => policyVisibleCount(state, prefix, errors),
    }),
    [state],
  );
}

export const SxFormContext = createContext<SxFormPolicy | null>(null);

export function useSxFormContext(): SxFormPolicy | null {
  return useContext(SxFormContext);
}
