"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PREVIEW_PATH } from "@/lib/marketPreview";

export default function ChromeGate({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  return path.endsWith(PREVIEW_PATH) ? null : <>{children}</>;
}
