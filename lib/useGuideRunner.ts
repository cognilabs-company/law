"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { addGuideMark, guideHref, samePath, targetHome, waitForTarget, type GuideRole } from "./aiGuide";
import { toast } from "./toast";
import type { GuideAction } from "./services/instructor";

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const NAV_TIMEOUT = 5000;

function inView(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= 64 && r.bottom <= window.innerHeight - 24;
}

export type GuideRun = { steps: GuideAction["type"][]; ok: boolean };

export function useGuideRunner(role: GuideRole, opts: { covers?: () => DOMRect | null; onCovered?: () => void } = {}) {
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const t = useTranslations("portal.aiAssistant");
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const runId = useRef(0);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const go = useCallback(
    async (href: string): Promise<boolean> => {
      const to = guideHref(href, role);
      if (!to) return false;
      if (samePath(pathRef.current, to)) return true;
      router.push(to as Parameters<typeof router.push>[0]);
      const t0 = Date.now();
      while (!samePath(pathRef.current, to)) {
        if (Date.now() - t0 > NAV_TIMEOUT) {
          toast(t("navFailed"), { tone: "err" });
          return false;
        }
        await sleep(100);
      }
      await sleep(250);
      return true;
    },
    [role, router, t],
  );

  const locate = useCallback(
    async (target: string): Promise<HTMLElement | null> => {
      let el = await waitForTarget(target, 3500);
      if (el && el.getClientRects().length) return el;
      const home = targetHome(target, role);
      if (home && !samePath(pathRef.current, home) && (await go(home))) el = await waitForTarget(target, 4500);
      return el && el.getClientRects().length ? el : null;
    },
    [go, role],
  );

  const run = useCallback(
    async (actions: GuideAction[]): Promise<GuideRun> => {
      const my = ++runId.current;
      const steps: GuideAction["type"][] = [];
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let missing = false;
      for (const a of actions) {
        if (my !== runId.current) break;
        if (a.type === "confirm") continue;
        if (a.type === "navigate") {
          if (!(await go(a.href))) return { steps, ok: false };
          steps.push(a.type);
          continue;
        }
        const el = await locate(a.target);
        if (!el) {
          missing = true;
          continue;
        }
        if (a.type === "scroll_to" || !inView(el)) {
          el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
          await sleep(reduce ? 60 : 480);
        }
        const cover = optsRef.current.covers?.();
        if (cover) {
          const r = el.getBoundingClientRect();
          if (r.left < cover.right && r.right > cover.left && r.top < cover.bottom && r.bottom > cover.top) optsRef.current.onCovered?.();
        }
        if (a.type === "highlight") addGuideMark("ring", a.target, a.durationMs);
        else if (a.type === "tooltip") addGuideMark("tip", a.target, 5200, a.text);
        else if (a.type === "focus") {
          const f = el.matches("input,textarea,select,button,a,[tabindex]") ? el : el.querySelector<HTMLElement>("input,textarea,select,button");
          f?.focus({ preventScroll: true });
        }
        steps.push(a.type);
      }
      if (missing) toast(t("targetMissing"));
      return { steps, ok: !missing };
    },
    [go, locate, t],
  );

  const cancel = useCallback(() => {
    runId.current++;
  }, []);

  return { run, cancel, go };
}
