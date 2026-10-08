"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";

type Pending = { el: HTMLAnchorElement | null; href: string };

export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const allow = useRef(false);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    if (!dirty) return;
    allow.current = false;
    const onBefore = (e: BeforeUnloadEvent) => {
      if (allow.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (allow.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
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
      setPending({ el: a, href: "" });
    };
    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBefore);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  function go(href: string) {
    if (dirty && !allow.current) setPending({ el: null, href });
    else router.push(href);
  }

  function confirm() {
    const p = pending;
    allow.current = true;
    setPending(null);
    if (!p) return;
    if (p.el?.isConnected) p.el.click();
    else if (p.href) router.push(p.href);
  }

  function release() {
    allow.current = true;
  }

  return { asking: pending !== null, go, confirm, cancel: () => setPending(null), release };
}
