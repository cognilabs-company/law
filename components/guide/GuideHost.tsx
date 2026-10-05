"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { getGuide, getIdleGuide, nextStep, patchGuide, prevStep, stopTour, subscribeGuide } from "@/lib/guide/store";
import { findTarget, focusTarget, revealTarget, targetLabel, waitForTarget } from "@/lib/guide/targets";
import { guideHref, remapTarget, samePath, targetHome } from "@/lib/guide/routes";
import { registryHome } from "@/lib/guide/pages";
import type { GuideRole } from "@/lib/guide/types";
import { RobotEvents } from "@/components/lexgo/robot/RobotEvents";
import { toast } from "@/lib/toast";
import Spotlight from "./Spotlight";
import GuideCaption from "./GuideCaption";

const NAV_TIMEOUT = 9000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(id);
      resolve();
    });
  });

async function settle(el: HTMLElement, signal: AbortSignal) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const r0 = el.getBoundingClientRect();
  const pad = 96;
  const fits = r0.top >= pad && r0.bottom <= window.innerHeight - 140;
  if (!fits) el.scrollIntoView({ block: r0.height > window.innerHeight * 0.6 ? "start" : "center", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
  let last = -1;
  let still = 0;
  const t0 = performance.now();
  while (!signal.aborted && performance.now() - t0 < 1200) {
    await new Promise((r) => window.requestAnimationFrame(r));
    const top = Math.round(el.getBoundingClientRect().top);
    still = top === last ? still + 1 : 0;
    last = top;
    if (still >= 4) break;
  }
}

export default function GuideHost() {
  const t = useTranslations("guide.ui");
  const tg = useTranslations("guide.caption");
  const { session } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const g = useSyncExternalStore(subscribeGuide, getGuide, getIdleGuide);
  const role: GuideRole = pathname.startsWith("/admin") ? "staff" : ((session?.role as GuideRole | undefined) ?? "client");
  const pathRef = useRef(pathname);
  const expectRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const savedFocus = useRef<HTMLElement | null>(null);
  const navRef = useRef(false);

  useEffect(() => {
    pathRef.current = pathname;
    const s = getGuide();
    if (s.phase === "idle" || s.phase === "navigating" || navRef.current) return;
    if (expectRef.current && samePath(pathname, expectRef.current)) return;
    stopTour();
  }, [pathname]);

  useEffect(() => {
    const active = g.phase !== "idle";
    if (active && !activeRef.current) {
      savedFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      expectRef.current = pathRef.current;
      document.body.dataset.guide = "on";
    }
    if (!active && activeRef.current) {
      delete document.body.dataset.guide;
      delete document.body.dataset.guideDock;
      expectRef.current = null;
      const back = savedFocus.current;
      savedFocus.current = null;
      if (back && back.isConnected) back.focus({ preventScroll: true });
      RobotEvents.emit("reactSuccess");
    }
    activeRef.current = active;
  }, [g.phase]);

  useEffect(
    () => () => {
      delete document.body.dataset.guide;
      delete document.body.dataset.guideDock;
    },
    [],
  );

  const tour = g.tour;
  const index = g.index;
  const phase = g.phase;

  useEffect(() => {
    const s = getGuide();
    const cur = s.tour;
    if (!cur || (s.phase !== "navigating" && s.phase !== "locating")) return;
    const ctrl = new AbortController();
    const signal = ctrl.signal;

    const go = async (href: string) => {
      navRef.current = true;
      try {
        return await travel(href);
      } finally {
        navRef.current = false;
      }
    };

    const travel = async (href: string) => {
      const from = pathRef.current;
      expectRef.current = href;
      router.push(href as Parameters<typeof router.push>[0], { scroll: false });
      const query = href.includes("?") ? href.slice(href.indexOf("?")).split("#")[0] : "";
      const t0 = Date.now();
      let seen = from;
      let since = t0;
      while (!signal.aborted) {
        const here = pathRef.current;
        if (samePath(here, href) && (!query || window.location.search === query)) return true;
        if (here !== seen) {
          seen = here;
          since = Date.now();
        }
        if (!samePath(here, from) && Date.now() - since > 1200) {
          expectRef.current = here;
          return true;
        }
        if (Date.now() - t0 > NAV_TIMEOUT) return false;
        await sleep(80, signal);
      }
      return false;
    };

    void (async () => {
      RobotEvents.emit("think");
      if (s.phase === "navigating") {
        let href = cur.navigate ? guideHref(cur.navigate, role) : "";
        const first = cur.steps[0] ? remapTarget(cur.steps[0].target, role) : "";
        const home = first ? targetHome(first, role, registryHome) : "";
        if (home && first && !findTarget(first) && (!href || !samePath(home, href))) href = home;
        const query = href.includes("?") ? href.slice(href.indexOf("?")).split("#")[0] : "";
        const there = href ? samePath(pathRef.current, href) && (!query || window.location.search === query) : true;
        if (href && !there) {
          const ok = await go(href);
          if (signal.aborted) return;
          if (!ok) {
            toast(t("navFailed"), { tone: "err" });
            stopTour();
            return;
          }
          await sleep(160, signal);
        }
        if (signal.aborted) return;
        if (!cur.steps.length) {
          stopTour();
          return;
        }
        patchGuide({ phase: "locating" });
        return;
      }

      const step = cur.steps[s.index];
      if (!step) {
        stopTour();
        return;
      }
      const id = remapTarget(step.target, role);
      let el = findTarget(id);
      if (!el) {
        await revealTarget(id);
        el = await waitForTarget(id, 2600, signal);
      }
      if (!el && !signal.aborted) {
        const home = targetHome(id, role, registryHome);
        if (home && !samePath(pathRef.current, home)) {
          const ok = await go(home);
          if (ok && !signal.aborted) {
            await revealTarget(id);
            el = await waitForTarget(id, 5000, signal);
          }
        }
      }
      if (signal.aborted) return;
      if (!el) {
        RobotEvents.emit("reactError");
        patchGuide({ phase: "missing", element: null, missing: [...s.missing, id] });
        return;
      }
      await settle(el, signal);
      if (signal.aborted) return;
      patchGuide({ phase: "showing", element: findTarget(id) ?? el, shown: s.shown + 1 });
    })();

    return () => ctrl.abort();
  }, [tour, index, phase, role, router, t]);

  const element = g.element;
  const focusWanted = tour?.steps[index]?.focus !== false;

  useEffect(() => {
    if (phase !== "showing" || !element) return;
    const restore = focusWanted ? focusTarget(element) : () => {};
    element.setAttribute("aria-describedby", "guide-caption");
    RobotEvents.emit("point", { target: element });
    const onClick = (e: MouseEvent) => {
      const hit = e.target instanceof Element ? e.target.closest("a[href],button,[role=button]") : null;
      if (hit && element.contains(hit) && !hit.closest(".gcap")) window.setTimeout(stopTour, 0);
    };
    element.addEventListener("click", onClick);
    return () => {
      element.removeEventListener("click", onClick);
      element.removeAttribute("aria-describedby");
      restore();
    };
  }, [phase, element, focusWanted]);

  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        stopTour();
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input,textarea,select,[contenteditable=true],[role=tab],[role=radio],[role=option],[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox],[role=slider],[role=spinbutton],[role=gridcell],[role=treeitem],[role=switch],[role=combobox]")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextStep();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevStep();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [phase]);

  const step = tour?.steps[index];
  const busy = phase === "navigating" || phase === "locating";
  const missing = phase === "missing";
  const label = phase === "showing" && element && !step?.caption ? targetLabel(element) : "";
  const text = busy ? (phase === "navigating" ? t("navigating") : t("locating")) : missing ? t("missing") : step?.caption || (label ? tg("generic", { label }) : "") || tour?.reply || "";
  const announce = phase === "showing" || missing ? text : "";

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      {phase === "showing" && step && tour ? <Spotlight targetId={remapTarget(step.target, role)} stepKey={`${tour.id}:${index}`} /> : null}
      {phase !== "idle" && tour ? (
        <GuideCaption
          text={text}
          busy={busy}
          missing={missing}
          index={index}
          total={tour.steps.length || 1}
          onNext={nextStep}
          onPrev={prevStep}
          onStop={stopTour}
        />
      ) : null}
    </>
  );
}
