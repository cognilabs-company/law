"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname } from "@/i18n/navigation";

// What a cabinet page may tell the shell's header: a title in place of the
// page name (the dashboards greet by first name) and a note after the date
// line ("2 ta ish jarayonda"). Scoped to the path it was set on, so it never
// leaks onto the next page.
export type LxHeader = { path?: string; title?: string; note?: string };

const Ctx = createContext<((h: LxHeader) => void) | null>(null);
export const LxHeaderProvider = Ctx.Provider;

export function useLxHeader(title?: string, note?: string): void {
  const set = useContext(Ctx);
  const path = usePathname();
  useEffect(() => {
    if (!set) return;
    set({ path, title, note });
    return () => set({});
  }, [set, path, title, note]);
}
