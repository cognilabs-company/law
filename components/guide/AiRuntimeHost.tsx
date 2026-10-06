"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { pageFor } from "@/lib/guide/pages";
import type { GuideRole } from "@/lib/guide/types";
import { OVERLAY } from "@/lib/ai/dom";
import { buildAiSnapshot } from "@/lib/ai/manifest";
import { abortCommands } from "@/lib/ai/commands";
import { aiEngaged, resetAiEngagement, scheduleRuntime, setRuntimeProvider, subscribeEngagement } from "@/lib/ai/runtime";
import { startAiRealtime } from "@/lib/ai/realtime";
import { aiSessionId, dropAiSessions, getAiScope, subscribeAiSession } from "@/lib/ai/session";
import { cachedInstructorContract } from "@/lib/services/instructorV21";
import AiActionConfirm, { AiFillPreview } from "./AiActionConfirm";

const WATCHED = ["data-ai-id", "data-ai-target", "hidden", "aria-hidden", "open"];

const notEngaged = () => false;

const hasAiSession = () => Boolean(aiSessionId(getAiScope()));

function relevant(records: MutationRecord[]): boolean {
  for (const r of records) {
    const node = r.target instanceof Element ? r.target : r.target.parentElement;
    if (node && node.closest(OVERLAY)) continue;
    if (r.type === "attributes") return true;
    for (const n of [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)]) {
      if (!(n instanceof Element)) continue;
      if (n.matches("[data-ai-id],[data-ai-target],.amodal,dialog") || n.querySelector("[data-ai-id],[data-ai-target]")) return true;
    }
  }
  return false;
}

export default function AiRuntimeHost() {
  const { session } = useAuth();
  const owner = session?.id || "";
  const pathname = usePathname();
  const locale = useLocale();
  const tg = useTranslations("guide");
  const engaged = useSyncExternalStore(subscribeEngagement, aiEngaged, notEngaged);
  const hasSession = useSyncExternalStore(subscribeAiSession, hasAiSession, notEngaged);
  const ownerRef = useRef(owner);

  useEffect(() => {
    setRuntimeProvider(() => {
      const scope = getAiScope();
      if (!scope) return null;
      const contract = cachedInstructorContract(scope.role);
      const page = pageFor(window.location.pathname, scope.role as GuideRole);
      const first = page?.tour[0];
      const description = first && first.target === "ai-help:current-page" && tg.has(first.text) ? tg(first.text) : "";
      return { locale, ...buildAiSnapshot({ role: contract?.role || scope.role, description }) };
    });
    return () => setRuntimeProvider(null);
  }, [locale, tg]);

  useEffect(() => {
    const prev = ownerRef.current;
    ownerRef.current = owner;
    if (!prev || prev === owner) return;
    abortCommands("logout");
    dropAiSessions(prev);
    resetAiEngagement();
  }, [owner]);

  useEffect(() => {
    if (!owner) return;
    return startAiRealtime(() => aiSessionId(getAiScope()));
  }, [owner]);

  useEffect(() => {
    scheduleRuntime();
  }, [pathname]);

  useEffect(() => {
    if (!engaged || !owner || !hasSession) return;
    const obs = new MutationObserver((records) => {
      if (relevant(records)) scheduleRuntime();
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: WATCHED });
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRuntime();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      obs.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [engaged, owner, hasSession]);

  if (!owner) return null;
  return (
    <>
      <AiActionConfirm />
      <AiFillPreview />
    </>
  );
}
