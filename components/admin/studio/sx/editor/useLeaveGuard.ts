"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

export type LeaveGuard = { go: (href: string) => void; release: () => Promise<void> };
export type LeaveGuardText = { title: string; text: string; confirmLabel: string; cancelLabel: string };

const REMOVE_WAIT_MS = 300;
const LOCALE_PREFIX = /^\/(uz|ru|en)(?=\/|$)/;
let tokens = 0;

function historyState(): Record<string, unknown> | null {
  const s: unknown = window.history.state;
  return s && typeof s === "object" ? (s as Record<string, unknown>) : null;
}

export function useLeaveGuard(active: boolean, text: LeaveGuardText): LeaveGuard {
  const router = useRouter();
  const routerRef = useRef(router);
  const textRef = useRef(text);
  const activeRef = useRef(false);
  const releasedRef = useRef(false);
  const tokenRef = useRef("");
  const onSentinelRef = useRef(false);
  const skipRef = useRef(0);
  const waiterRef = useRef<(() => void) | null>(null);
  const pendingRef = useRef<Promise<void> | null>(null);
  const askingRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    routerRef.current = router;
    textRef.current = text;
  });

  const isOurs = useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    const s = historyState();
    return onSentinelRef.current || (Boolean(tokenRef.current) && s?.__sxLeave === tokenRef.current);
  }, []);

  const pushSentinel = useCallback(() => {
    if (!tokenRef.current) tokenRef.current = `sx-leave-${++tokens}`;
    window.history.pushState({ __sxLeave: tokenRef.current }, "");
    onSentinelRef.current = true;
  }, []);

  const removeSentinel = useCallback((): Promise<void> => {
    if (pendingRef.current) return pendingRef.current;
    if (typeof window === "undefined" || !isOurs()) return Promise.resolve();
    const p = new Promise<void>((resolve) => {
      let done = false;
      const finish = (timedOut: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (timedOut) skipRef.current = Math.max(0, skipRef.current - 1);
        waiterRef.current = null;
        pendingRef.current = null;
        onSentinelRef.current = false;
        resolve();
      };
      const timer = setTimeout(() => finish(true), REMOVE_WAIT_MS);
      waiterRef.current = () => finish(false);
      skipRef.current += 1;
      window.history.back();
    });
    pendingRef.current = p;
    return p;
  }, [isOurs]);

  const ask = useCallback((): Promise<boolean> => {
    if (askingRef.current) return askingRef.current;
    const tx = textRef.current;
    const p = confirmDialog({ title: tx.title, text: tx.text, confirmLabel: tx.confirmLabel, cancelLabel: tx.cancelLabel, tone: "danger" }).finally(() => {
      askingRef.current = null;
    });
    askingRef.current = p;
    return p;
  }, []);

  const release = useCallback(async (): Promise<void> => {
    releasedRef.current = true;
    await removeSentinel();
  }, [removeSentinel]);

  const guarding = useCallback(() => activeRef.current && !releasedRef.current, []);

  const go = useCallback(
    (href: string) => {
      if (guarding()) {
        void ask().then(async (ok) => {
          if (!ok) return;
          await release();
          routerRef.current.push(href);
        });
        return;
      }
      void (pendingRef.current ?? Promise.resolve()).then(() => routerRef.current.push(href));
    },
    [ask, guarding, release],
  );

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (skipRef.current > 0) {
        skipRef.current -= 1;
        e.stopImmediatePropagation();
        waiterRef.current?.();
        return;
      }
      onSentinelRef.current = false;
      if (!guarding()) return;
      e.stopImmediatePropagation();
      pushSentinel();
      void ask().then((ok) => {
        if (!ok || !guarding()) return;
        releasedRef.current = true;
        onSentinelRef.current = false;
        window.history.go(-2);
      });
    };
    window.addEventListener("popstate", onPop, true);
    return () => window.removeEventListener("popstate", onPop, true);
  }, [ask, guarding, pushSentinel]);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      if (!releasedRef.current && isOurs()) void removeSentinel();
      return;
    }
    releasedRef.current = false;
    if (!isOurs()) pushSentinel();
    const onBefore = (e: BeforeUnloadEvent) => {
      if (!guarding()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!guarding() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      const a = target?.closest("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      const href = `${url.pathname}${url.search}${url.hash}`;
      void ask().then(async (ok) => {
        if (!ok) return;
        await release();
        if (a.isConnected) a.click();
        else routerRef.current.push(href.replace(LOCALE_PREFIX, "") || "/");
      });
    };
    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBefore);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, ask, guarding, isOurs, pushSentinel, release, removeSentinel]);

  return useMemo(() => ({ go, release }), [go, release]);
}
