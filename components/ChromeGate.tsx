"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PREVIEW_PATH } from "@/lib/marketPreview";
import { useDeskEmbedded } from "@/components/portal/desk/deskMode";

// The site's chrome and watchers, left out of the marketplace preview and
// of pages shown inside a window of the cabinet's desktop (the desktop
// itself keeps one of each).
export default function ChromeGate({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  const embedded = useDeskEmbedded();
  return path.endsWith(PREVIEW_PATH) || embedded ? null : <>{children}</>;
}
