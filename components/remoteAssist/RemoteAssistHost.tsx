"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { useRaConsole } from "@/lib/remoteAssist/store";
import { claimRaTabHandle } from "@/lib/remoteAssist/tabHandle";

// Remote assistance on every page: the client half (consent, the live bar,
// running commands) for any signed-in tab, and the operator console once an
// operator opened it. Both load on demand — this file stays tiny.

const RaClient = dynamic(() => import("./RaClient"), { ssr: false });
const RaConsole = dynamic(() => import("./RaConsole"), { ssr: false });

export default function RemoteAssistHost() {
  const { session, ready } = useAuth();
  const con = useRaConsole();
  // Every tab names itself before any share starts, so a share can tell
  // which tab it captured (lib/remoteAssist/tabHandle.ts).
  useEffect(() => claimRaTabHandle(), []);
  if (!ready || !session?.id) return null;
  return (
    <>
      <RaClient selfId={session.id} />
      {con ? createPortal(<RaConsole state={con} />, document.body) : null}
    </>
  );
}
