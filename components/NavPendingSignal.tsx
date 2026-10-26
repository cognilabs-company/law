"use client";

import { useEffect } from "react";
import { useLinkStatus } from "next/link";
import { holdNavPending } from "@/lib/navProgress";

// Rendered inside every Link (i18n/navigation): while Next reports this
// link's navigation as pending, the global pending state (top bar) is on.
// Renders nothing.
export default function NavPendingSignal() {
  const { pending } = useLinkStatus();
  useEffect(() => (pending ? holdNavPending() : undefined), [pending]);
  return null;
}
