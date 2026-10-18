"use client";

import type { ReactElement, ReactNode } from "react";
import { LucideProvider } from "lucide-react";

export const SX_ICON_DEFAULTS = { size: 18, strokeWidth: 1.75 } as const;

export function SxIconScope({ children }: { children: ReactNode }): ReactElement {
  return (
    <LucideProvider size={SX_ICON_DEFAULTS.size} strokeWidth={SX_ICON_DEFAULTS.strokeWidth}>
      {children}
    </LucideProvider>
  );
}
