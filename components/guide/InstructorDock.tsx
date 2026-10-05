"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { hasAdminAccess, useAuth } from "@/lib/auth";

const AiSystemAssistant = dynamic(() => import("@/components/portal/AiSystemAssistant"), { ssr: false });

export default function InstructorDock() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  if (!session) return null;
  return <AiSystemAssistant open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} role={session.role} guideRole={hasAdminAccess(session) ? "staff" : undefined} launcher="none" />;
}
