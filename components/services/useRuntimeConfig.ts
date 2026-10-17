"use client";

import { useEffect, useState } from "react";
import { getRuntimeConfig, type RuntimeConfig, type RuntimePlacement } from "@/lib/services/marketRuntime";

export type RuntimeLoad = { state: "idle" | "loading" | "ready" | "failed"; config: RuntimeConfig | null };

type Keyed = RuntimeLoad & { key: string };

const IDLE: RuntimeLoad = { state: "idle", config: null };
const LOADING: RuntimeLoad = { state: "loading", config: null };

export function useRuntimeConfig(serviceId: string, placement?: RuntimePlacement): RuntimeLoad {
  const place: RuntimePlacement = placement ?? "service_detail";
  const id = serviceId.trim();
  const key = id ? `${id}|${place}` : "";
  const [load, setLoad] = useState<Keyed | null>(null);

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    getRuntimeConfig(id, place, ac.signal).then(
      (config) => {
        if (!ac.signal.aborted) setLoad({ key: `${id}|${place}`, state: "ready", config });
      },
      () => {
        if (!ac.signal.aborted) setLoad({ key: `${id}|${place}`, state: "failed", config: null });
      },
    );
    return () => ac.abort();
  }, [id, place]);

  if (!key) return IDLE;
  if (!load || load.key !== key) return LOADING;
  return load;
}
