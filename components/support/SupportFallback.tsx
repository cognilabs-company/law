"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { API_BASE, backendOrigin } from "@/lib/http";
import { fallbackSupport, normSupport, type SupportInfo, type SupportLang } from "@/lib/support";
import SupportView from "./SupportView";

// The server could not load /public/support when the page was generated →
// the built-in contacts show at once, and the browser asks the API through the
// proxy; its text replaces them when it answers. No token is sent: the page
// is public.
export default function SupportFallback({ lang }: { lang: SupportLang }) {
  const t = useTranslations("supportPage");
  const [loaded, setLoaded] = useState<{ lang: SupportLang; info: SupportInfo } | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`${API_BASE}/public/support?lang=${lang}`, { headers: { Accept: "application/json" }, signal: ctl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        const info = raw === null ? null : normSupport(raw, lang, backendOrigin("http"));
        if (info) setLoaded({ lang, info });
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [lang]);
  if (loaded && loaded.lang === lang) return <SupportView info={loaded.info} source="api" />;
  return <SupportView info={fallbackSupport(t, lang)} source="fallback" />;
}
