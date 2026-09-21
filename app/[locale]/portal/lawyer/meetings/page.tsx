"use client";

import MeetingLauncher from "@/components/chat/MeetingLauncher";

// Lawyer video meetings: start one with a client or a colleague, re-join an
// active one, browse the history. Gated for pending sellers by PortalShell.
export default function Page() {
  return <MeetingLauncher rich />;
}
