"use client";

import { useEffect, useMemo, useState } from "react";
import { logApiError } from "@/lib/http";
import { getStudioFormContext, getStudioObject, type StudioRecord } from "@/lib/services/studio";

export type RowPayload = Readonly<Record<string, unknown>> | null;

const CONCURRENCY = 4;
const done = new Map<string, RowPayload>();
const inflight = new Map<string, Promise<RowPayload>>();
const waiting: (() => void)[] = [];
let running = 0;

export function payloadKey(r: Pick<StudioRecord, "source" | "id" | "updatedAt">): string {
  return `${r.source}:${r.id}:${r.updatedAt}`;
}

function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running += 1;
      job()
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          waiting.shift()?.();
        });
    };
    if (running < CONCURRENCY) run();
    else waiting.push(run);
  });
}

async function fetchPayload(r: StudioRecord): Promise<RowPayload> {
  if (r.source === "studio" && r.studioObjectId) return (await getStudioObject(r.studioObjectId)).payload ?? null;
  if (r.actions.view.includes("/form-context")) return (await getStudioFormContext(r.actions.view)).initialPayload ?? null;
  return null;
}

export function loadRowPayload(r: StudioRecord): Promise<RowPayload> {
  const k = payloadKey(r);
  if (done.has(k)) return Promise.resolve(done.get(k) ?? null);
  const pending = inflight.get(k);
  if (pending) return pending;
  const p = schedule(() => fetchPayload(r))
    .then(
      (v) => v,
      (e: unknown) => {
        logApiError("studio.records.payload", e);
        return null;
      },
    )
    .then((v) => {
      done.set(k, v);
      inflight.delete(k);
      return v;
    });
  inflight.set(k, p);
  return p;
}

export function peekRowPayload(k: string): RowPayload | undefined {
  return done.has(k) ? (done.get(k) ?? null) : undefined;
}

export function clearRowPayloads(): void {
  done.clear();
  inflight.clear();
}

export function useRowPayloads(rows: readonly StudioRecord[], enabled: boolean): ReadonlyMap<string, Readonly<Record<string, unknown>> | null> {
  const [got, setGot] = useState<ReadonlyMap<string, RowPayload>>(() => new Map());
  const wanted = useMemo(() => (enabled ? rows.filter((r) => r.id) : []), [rows, enabled]);
  const wantKey = wanted.map(payloadKey).join("\n");

  useEffect(() => {
    if (!wanted.length) return;
    let alive = true;
    for (const r of wanted) {
      const k = payloadKey(r);
      void loadRowPayload(r).then((v) => {
        if (!alive) return;
        setGot((cur) => (cur.has(k) && cur.get(k) === v ? cur : new Map(cur).set(k, v)));
      });
    }
    return () => {
      alive = false;
    };
  }, [wantKey, wanted]);

  return useMemo(() => {
    const out = new Map<string, RowPayload>();
    for (const r of wanted) {
      const k = payloadKey(r);
      if (got.has(k)) out.set(k, got.get(k) ?? null);
      else {
        const v = peekRowPayload(k);
        if (v !== undefined) out.set(k, v);
      }
    }
    return out;
  }, [wanted, got]);
}
