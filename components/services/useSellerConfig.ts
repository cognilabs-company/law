"use client";

import { useEffect, useState } from "react";
import { getSellerServiceConfig, type SellerServiceConfig } from "@/lib/services/marketRuntime";
import { configSupport, rememberSellerConfig } from "@/lib/services/sellerConfig";

export type SellerConfigLoad = { state: "idle" | "loading" | "ready" | "failed"; config: SellerServiceConfig | null };

type Keyed = SellerConfigLoad & { key: string };

const IDLE: SellerConfigLoad = { state: "idle", config: null };
const LOADING: SellerConfigLoad = { state: "loading", config: null };

export function useSellerConfig(serviceId: string, uid: string, enabled: boolean): SellerConfigLoad {
  const id = serviceId.trim();
  const on = enabled && !!id && configSupport() !== "no";
  const [load, setLoad] = useState<Keyed | null>(null);

  useEffect(() => {
    if (!on) return;
    const ac = new AbortController();
    getSellerServiceConfig(id, ac.signal).then(
      (config) => {
        if (ac.signal.aborted) return;
        const filled = { ...config, serviceId: id };
        rememberSellerConfig(uid, filled);
        setLoad({ key: id, state: "ready", config: filled });
      },
      () => {
        if (ac.signal.aborted) return;
        setLoad({ key: id, state: "failed", config: null });
      },
    );
    return () => ac.abort();
  }, [on, id, uid]);

  if (!on) return IDLE;
  if (!load || load.key !== id) return LOADING;
  return load;
}
