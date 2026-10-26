"use client";

import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { useRaConsole } from "@/lib/remoteAssist/store";

// Remote assistance on every page: the client half (consent, the live bar,
// running commands) for any signed-in tab, and the operator console once an
// operator opened it. Both load on demand — this file stays tiny.

const RaClient = dynamic(() => import("./RaClient"), { ssr: false });
const RaConsole = dynamic(() => import("./RaConsole"), { ssr: false });

export default function RemoteAssistHost() {
  const { session, ready } = useAuth();
  const con = useRaConsole();
  if (!ready || !session?.id) return null;
  return (
    <>
      <RaClient selfId={session.id} />
      {con ? createPortal(<RaConsole state={con} />, document.body) : null}
    </>
  );
}
