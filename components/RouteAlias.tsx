"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

// Client-side alias for a route people type from the plan/GM document
// (e.g. /portal/call-center → /admin/call-center). Rendered inside the
// locale layout, so the redirect keeps the language prefix.
export default function RouteAlias({ to }: { to: string }) {
  const router = useRouter();
  const t = useTranslations("secureChat");
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return (
    <div className="portal portal--redirect" aria-busy="true">
      <span className="rf__spinner" />
      <span className="advmuted">{t("loading")}</span>
    </div>
  );
}
