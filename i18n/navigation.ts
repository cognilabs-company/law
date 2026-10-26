import { createElement, useMemo, type ComponentProps } from "react";
import { useLocale } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import NavPendingSignal from "@/components/NavPendingSignal";
import { isSamePage, startNavPending } from "@/lib/navProgress";
import { routing } from "./routing";

// Locale-aware navigation helpers. Always import Link/useRouter/usePathname
// from here (not from next/link) so the active locale prefix is preserved.
const nav = createNavigation(routing);
export const { redirect, usePathname, getPathname } = nav;

// Link and router.push/replace also switch on the navigation pending state
// (lib/navProgress) at the click, so a page that takes a moment to arrive
// still answers the click at once (top bar) instead of looking ignored.
export function Link({ children, ...props }: ComponentProps<typeof nav.Link>) {
  return createElement(nav.Link, props, children, createElement(NavPendingSignal));
}

type Router = ReturnType<typeof nav.useRouter>;
export function useRouter(): Router {
  const router = nav.useRouter();
  const current = useLocale();
  return useMemo(() => {
    const pend = (href: Parameters<Router["push"]>[0], locale?: string) => {
      if (!isSamePage(getPathname({ href, locale: locale ?? current }))) startNavPending();
    };
    return {
      ...router,
      push: (href, options) => {
        pend(href, options?.locale);
        router.push(href, options);
      },
      replace: (href, options) => {
        pend(href, options?.locale);
        router.replace(href, options);
      },
    };
  }, [router, current]);
}
