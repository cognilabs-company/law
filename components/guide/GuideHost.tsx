"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { getGuide, getIdleGuide, nextStep, patchGuide, prevStep, stopTour, subscribeGuide } from "@/lib/guide/store";
import { findTarget, focusInput, focusTarget, revealTarget, settle, targetLabel, targetMatch, waitForTarget } from "@/lib/guide/targets";
import { guideHref, remapTarget, samePath, targetHome } from "@/lib/guide/routes";
import { registryHome } from "@/lib/guide/pages";
import { emitGuideEvent, type TourEndReason } from "@/lib/guide/events";
import { forgetResolved, resolveExact, waitForExact } from "@/lib/ai/resolve";
import { isSelfTarget } from "@/lib/ai/self";
import type { GuideRole, GuideTour } from "@/lib/guide/types";
import { RobotEvents } from "@/components/lexgo/robot/RobotEvents";
import { toast } from "@/lib/toast";
import Spotlight from "./Spotlight";
import GuideCaption from "./GuideCaption";

const NAV_TIMEOUT = 9000;
const MISSING_HOLD = 2500;
const LOCATE_MS = 2600;
const LOCATE_AFTER_NAV_MS = 6000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(id);
      resolve();
    });
  });

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
  const endRef = useRef<TourEndReason | null>(null);
  const lastTourRef = useRef<GuideTour | null>(null);
  const keepFocusRef = useRef(false);
  const forcedRef = useRef<HTMLElement | null>(null);

  const stop = useCallback((reason: TourEndReason) => {
    endRef.current = reason;
    stopTour();
  }, []);

  const advance = useCallback(() => {
    const s = getGuide();
    if (s.tour && s.index >= s.tour.steps.length - 1) endRef.current = "done";
    nextStep();
  }, []);

  useEffect(() => {
    pathRef.current = pathname;
    const s = getGuide();
    if (s.phase === "idle") return;
    if (s.phase === "navigating" || s.phase === "locating" || navRef.current) {
      if (!navRef.current) expectRef.current = pathname;
      return;
    }
    if (expectRef.current && samePath(pathname, expectRef.current)) return;
    stop("route_change");
  }, [pathname, stop]);

  useEffect(() => {
    const active = g.phase !== "idle";
    if (active && !activeRef.current) {
      savedFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      expectRef.current = pathRef.current;
      keepFocusRef.current = false;
      forcedRef.current = null;
      document.body.dataset.guide = "on";
    }
    if (!active && activeRef.current) {
      delete document.body.dataset.guide;
      delete document.body.dataset.guideDock;
      expectRef.current = null;
      const back = savedFocus.current;
      const forced = forcedRef.current;
      savedFocus.current = null;
      forcedRef.current = null;
      if (keepFocusRef.current) {
        const now = document.activeElement;
        const elsewhere = now instanceof HTMLElement && now !== forced && !now.closest(".gcap") && now.matches("input,textarea,select,[contenteditable=true]");
        if (forced && forced.isConnected && endRef.current !== "clicked" && !elsewhere) forced.focus({ preventScroll: true });
      } else if (back && back.isConnected) back.focus({ preventScroll: true });
      keepFocusRef.current = false;
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
    const prev = lastTourRef.current;
    if (prev === tour) return;
    forgetResolved();
    if (prev) emitGuideEvent({ type: "tour_end", tourId: prev.id, reason: tour ? "replaced" : (endRef.current ?? "stopped") });
    endRef.current = null;
    lastTourRef.current = tour;
  }, [tour]);

  useEffect(() => {
    const s = getGuide();
    const cur = s.tour;
    if (!cur || (s.phase !== "navigating" && s.phase !== "locating")) return;
    const ctrl = new AbortController();
    const signal = ctrl.signal;
    const fixed = cur.source === "instructor21";

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
        if (fixed && cur.navigate && !href) {
          emitGuideEvent({ type: "nav_failed", tourId: cur.id, href: cur.navigate, reason: "route_not_allowed" });
          stop("nav_failed");
          return;
        }
        const first = cur.steps[0] ? remapTarget(cur.steps[0].target, role) : "";
        const home = !fixed && first ? targetHome(first, role, registryHome) : "";
        if (home && first && !findTarget(first) && (!href || !samePath(home, href))) href = home;
        const query = href.includes("?") ? href.slice(href.indexOf("?")).split("#")[0] : "";
        const there = href ? samePath(pathRef.current, href) && (!query || window.location.search === query) : true;
        if (href && !there) {
          const ok = await go(href);
          if (signal.aborted) return;
          if (!ok) {
            toast(t("navFailed"), { tone: "err" });
            emitGuideEvent({ type: "nav_failed", tourId: cur.id, href, reason: "navigation_timeout" });
            stop("nav_failed");
            return;
          }
          emitGuideEvent({ type: "nav_ok", tourId: cur.id, href, already: false });
          await sleep(160, signal);
        } else if (href) {
          emitGuideEvent({ type: "nav_ok", tourId: cur.id, href, already: true });
        }
        if (signal.aborted) return;
        if (!cur.steps.length) {
          stop("done");
          return;
        }
        patchGuide({ phase: "locating" });
        return;
      }

      const step = cur.steps[s.index];
      if (!step) {
        stop("done");
        return;
      }
      const id = remapTarget(step.target, role);
      const flexible = cur.source === "page" || cur.source === "local";
      const skip = () => {
        const known = new Set([...s.missing, id]);
        const pick = (from: number, by: number) => {
          for (let k = from; k >= 0 && k < cur.steps.length; k += by) if (!known.has(remapTarget(cur.steps[k].target, role))) return k;
          return -1;
        };
        let to = pick(s.index + s.dir, s.dir);
        if (to < 0 && s.dir < 0) to = pick(s.index + 1, 1);
        if (to >= 0) {
          patchGuide({ index: to, phase: "locating", element: null, missing: [...known] });
          return true;
        }
        if (s.shown > 0) {
          stop("done");
          return true;
        }
        return false;
      };
      if (flexible && s.missing.includes(id) && skip()) return;
      if (fixed && s.missing.includes(id)) {
        emitGuideEvent({ type: "step_missing", tourId: cur.id, index: s.index, commandId: step.commandId ?? "", target: id });
        advance();
        return;
      }
      let el: HTMLElement | null = null;
      if (fixed) {
        el = resolveExact(id, true)?.el ?? null;
        if (!el) {
          await revealTarget(id);
          if (signal.aborted) return;
          el = (await waitForExact(id, cur.navigate && !s.shown ? LOCATE_AFTER_NAV_MS : LOCATE_MS, signal))?.el ?? null;
        }
      } else {
        el = findTarget(id, false, true);
        if (!el) {
          await revealTarget(id);
          el = await waitForTarget(id, LOCATE_MS, signal, true);
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
      }
      if (signal.aborted) return;
      if (!el) {
        if (flexible && skip()) return;
        RobotEvents.emit("reactError");
        patchGuide({ phase: "missing", element: null, missing: [...s.missing, id] });
        emitGuideEvent({ type: "step_missing", tourId: cur.id, index: s.index, commandId: step.commandId ?? "", target: id });
        return;
      }
      await settle(el, signal);
      if (signal.aborted) return;
      const settled = fixed ? resolveExact(id, true)?.el : findTarget(id, false, true);
      patchGuide({ phase: "showing", element: settled ?? el, shown: s.shown + 1 });
    })();

    return () => ctrl.abort();
  }, [tour, index, phase, role, router, t, stop, advance]);

  const element = g.element;
  const step = tour?.steps[index];
  const focusWanted = step?.focus !== false;
  const focusMode = step?.focusMode ?? "auto";
  const hold = step?.holdMs ?? 0;
  const auto = tour?.source === "instructor21";
  const selfStep = phase !== "idle" && Boolean(step) && isSelfTarget(remapTarget(step?.target ?? "", role));

  useEffect(() => {
    if (!selfStep) return;
    document.body.dataset.guideSelf = "on";
    return () => {
      delete document.body.dataset.guideSelf;
    };
  }, [selfStep]);

  useEffect(() => {
    if (phase !== "showing" || !element) return;
    let restore: () => void = () => {};
    let focused = false;
    if (focusMode === "force") {
      focused = focusInput(element);
      if (focused) {
        keepFocusRef.current = true;
        forcedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
    } else if (focusWanted && focusMode !== "none") {
      restore = focusTarget(element);
    }
    if (!(document.activeElement instanceof Node && element.contains(document.activeElement))) document.querySelector<HTMLElement>(".gcap__btn--pri")?.focus({ preventScroll: true });
    element.setAttribute("aria-describedby", "guide-caption");
    RobotEvents.emit("point", { target: element });
    const s = getGuide();
    const st = s.tour?.steps[s.index];
    if (s.tour && st) {
      const id = remapTarget(st.target, role);
      const m = s.tour.source === "instructor21" ? resolveExact(id) : targetMatch(id);
      emitGuideEvent({ type: "step_shown", tourId: s.tour.id, index: s.index, commandId: st.commandId ?? "", target: id, by: m?.by ?? "exact", canonical: m?.canonical ?? id, focused });
    }
    const onClick = (e: MouseEvent) => {
      const hit = e.target instanceof Element ? e.target.closest("a[href],button,[role=button]") : null;
      if (!hit || !element.contains(hit) || hit.closest(".gcap")) return;
      const now = getGuide();
      const cs = now.tour?.steps[now.index];
      if (now.tour && cs) emitGuideEvent({ type: "step_clicked", tourId: now.tour.id, index: now.index, commandId: cs.commandId ?? "", target: remapTarget(cs.target, role) });
      window.setTimeout(() => stop("clicked"), 0);
    };
    element.addEventListener("click", onClick);
    return () => {
      element.removeEventListener("click", onClick);
      element.removeAttribute("aria-describedby");
      restore();
    };
  }, [phase, element, focusWanted, focusMode, role, stop]);

  useEffect(() => {
    if (phase !== "showing" || hold <= 0) return;
    const id = window.setTimeout(advance, hold);
    return () => window.clearTimeout(id);
  }, [phase, hold, index, tour, advance]);

  useEffect(() => {
    if (phase !== "missing" || !auto) return;
    const id = window.setTimeout(advance, MISSING_HOLD);
    return () => window.clearTimeout(id);
  }, [phase, auto, index, tour, advance]);

  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        stop("user_stop");
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input,textarea,select,[contenteditable=true],[role=tab],[role=radio],[role=option],[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox],[role=slider],[role=spinbutton],[role=gridcell],[role=treeitem],[role=switch],[role=combobox]")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevStep();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [phase, advance, stop]);

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
      {phase === "showing" && step && tour ? <Spotlight targetId={remapTarget(step.target, role)} stepKey={`${tour.id}:${index}`} variant={step.style} strict={auto} /> : null}
      {phase !== "idle" && tour ? (
        <GuideCaption
          text={text}
          busy={busy}
          missing={missing}
          index={index}
          total={tour.steps.length || 1}
          onNext={advance}
          onPrev={prevStep}
          onStop={() => stop("user_stop")}
        />
      ) : null}
    </>
  );
}
