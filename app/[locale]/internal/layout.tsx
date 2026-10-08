"use client";

import type { ReactNode } from "react";
import InternalShell from "@/components/internal/InternalShell";

export default function InternalLayout({ children }: { children: ReactNode }) {
  return <InternalShell>{children}</InternalShell>;
}
