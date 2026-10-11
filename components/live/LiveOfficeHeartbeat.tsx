"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { hasInternalAccess } from "@/lib/services/internalHrm";
import { sendHeartbeat } from "@/lib/services/internalLive";
import { areaOf, contextOf } from "@/lib/liveOfficeContext";
import { deviceId, endLiveOfficeSession, setLiveSessionId, tabSessionKey } from "@/lib/liveOfficeSession";

// Where an internal employee is working, sent every 30 s while they are
// signed in (guide §9). Only the page they are on is reported — the module,
// a readable label, the object open on it and its link — never keystrokes
// or mouse movement. A route change re-sends at once with the new context.

export default function LiveOfficeHeartbeat() {
  const { session, ready } = useAuth();
  const pathname = usePathname();
  const t = useTranslations("internal.live.modules");
  const internal = ready && !!session && hasInternalAccess(session);
  // Not an employee record (403/404): stop asking for this sign-in.
  const off = useRef("");
  const last = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const owner = session?.id ?? "";

  useEffect(() => {
    if (!internal || off.current === owner) return;
    let stopped = false;
    let interval = 30_000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const beat = async (force = false) => {
      if (stopped || off.current === owner) return;
      const area = areaOf(pathname);
      // The page's own name from the workspace header (the document title is
      // often just the site's), else the title without the brand.
      const heading = typeof document !== "undefined" ? document.querySelector(".ptop h1")?.textContent?.trim() ?? "" : "";
      const docTitle = typeof document !== "undefined" ? document.title.replace(/\s*[|·—–-]\s*LexGo.*$/i, "").trim() : "";
      const title = heading || (/^lexgo\b/i.test(docTitle) ? "" : docTitle);
      const areaName = t.has(area) ? t(area) : area;
      const label = title && title.toLowerCase() !== areaName.toLowerCase() ? `${areaName}: ${title}` : areaName;
      const search = typeof window !== "undefined" ? window.location.search : "";
      const status = typeof document !== "undefined" && document.visibilityState === "visible" ? "working" : "online";
      const key = `${pathname}${search}|${status}`;
      // A route change re-sends at once, but never twice within a second.
      if (!force && key === last.current.key && Date.now() - last.current.at < 1000) return;
      last.current = { key, at: Date.now() };
      try {
        const r = await sendHeartbeat({
          session_key: tabSessionKey(),
          device_id: deviceId(),
          platform: "web",
          module: area,
          action_label: label.slice(0, 200),
          ...contextOf(pathname, search, area),
          org_unit_id: null,
          room_id: null,
          status,
          meta: {},
        });
        setLiveSessionId(r.sessionId);
        if (r.intervalSeconds >= 10) interval = r.intervalSeconds * 1000;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) off.current = owner;
      }
    };

    const loop = () => {
      timer = setTimeout(async () => {
        await beat(true);
        if (!stopped) loop();
      }, interval);
    };
    // The page title is set after navigation: give it a moment.
    const first = setTimeout(() => void beat(), 400);
    loop();
    const onVisible = () => void beat();
    const onHide = () => endLiveOfficeSession();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      stopped = true;
      clearTimeout(first);
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
    };
  }, [internal, owner, pathname, t]);

  return null;
}
