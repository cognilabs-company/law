"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSellerCabinetFull, isCabinetEmpty, type SellerCabinetFull } from "@/lib/services/dash";
import { demoCabinet, useDemoForced } from "@/lib/demoStats";
import type { ResStatus } from "@/lib/useResource";

// Seller cabinet (GET /lawyers/me/cabinet) loaded once by the portal shell and
// shared with the lawyer/advocate pages, so they don't each fetch on first load.
// `demo` is true when the numbers shown are the demo fixture (forced by the
// "Demo ko'rsatish" toggle, or because the cabinet has no activity yet);
// `real` always keeps the backend payload.
export type CabinetState = { status: ResStatus; data: SellerCabinetFull | null; real: SellerCabinetFull | null; demo: boolean };

const Ctx = createContext<CabinetState>({ status: "loading", data: null, real: null, demo: false });
export const CabinetProvider = Ctx.Provider;

export function useSellerCabinet(): CabinetState {
  return useContext(Ctx);
}

export const isDemoId = (id: string) => id.startsWith("demo-");

// Loads the cabinet and reloads it whenever refreshKey changes (the pathname),
// keeping the previous data meanwhile so the shell doesn't flash.
export function useCabinetLoader(enabled: boolean, refreshKey: string): CabinetState {
  const [state, setState] = useState<{ status: ResStatus; real: SellerCabinetFull | null }>({ status: "loading", real: null });
  const [forced] = useDemoForced();
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getSellerCabinetFull()
      .then((real) => alive && setState({ status: "ready", real }))
      .catch(() => alive && setState((s) => (s.real ? s : { status: "error", real: null })));
    return () => {
      alive = false;
    };
  }, [enabled, refreshKey]);
  return useMemo(() => {
    const real = state.real;
    // A pending/unverified seller sees their verification state, never demo numbers.
    const demo = Boolean(real && !real.limitedAccess && (forced || isCabinetEmpty(real)));
    return { status: state.status, real, demo, data: real && demo ? demoCabinet(real) : real };
  }, [state, forced]);
}
