"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useAuth, type Role } from "@/lib/auth";
import { onInstructorOpen } from "@/lib/guide/panel";
import { copilotModeFor, copilotPortalRole, loadCopilotAccess, peekCopilotAccess, type CopilotCapsAccess, type CopilotPanelMode } from "@/lib/services/copilotPanel";
import { closeCopilot, copilotDispatch, useCopilotState, type CopilotAccess } from "./store";

const CopilotPanel = dynamic(() => import("./CopilotPanel"), { ssr: false });

function accessFrom(owner: string, mode: CopilotPanelMode, role: Role, caps: CopilotCapsAccess | undefined): CopilotAccess {
  if (!caps || caps.status === "error") return { owner, mode, role, available: true, tools: null };
  if (caps.status === "denied") return { owner, mode, role, available: false, tools: [] };
  const confirmed = caps.role ? copilotModeFor({ backendRole: caps.role }) : mode;
  const confirmedRole = caps.role ? copilotPortalRole(caps.role) : role;
  return { owner, mode: confirmed, role: confirmedRole, available: !!confirmed && !!confirmedRole, tools: caps.tools };
}

export default function CopilotHost() {
  const { session, ready } = useAuth();
  const state = useCopilotState();
  const owner = ready && session ? session.id || session.phone || "" : "";
  const backendRole = ready && session ? (session.backendRole ?? "").trim().toLowerCase() : "";

  useEffect(() => {
    copilotDispatch({ type: "host", delta: 1 });
    const off = onInstructorOpen(() => closeCopilot());
    return () => {
      off();
      copilotDispatch({ type: "host", delta: -1 });
    };
  }, []);

  useEffect(() => {
    const mode = owner ? copilotModeFor({ backendRole }) : null;
    const role = copilotPortalRole(backendRole);
    if (!owner || !mode || !role) {
      copilotDispatch({ type: "access", access: { owner, mode: null, role: null, available: false, tools: null } });
      return;
    }
    copilotDispatch({ type: "access", access: accessFrom(owner, mode, role, peekCopilotAccess(owner)) });
    let live = true;
    void loadCopilotAccess(owner).then((caps) => {
      if (live && caps.status !== "error") copilotDispatch({ type: "access", access: accessFrom(owner, mode, role, caps) });
    });
    return () => {
      live = false;
    };
  }, [owner, backendRole]);

  if (!state.mounted || !state.access.mode || !state.access.role) return null;
  return createPortal(<CopilotPanel state={state} mode={state.access.mode} role={state.access.role} />, document.body);
}
