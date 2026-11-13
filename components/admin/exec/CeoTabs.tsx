"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { permissionsOf } from "@/lib/permissions";
import "./exec.css";

// CEO platform analytics is the CEO's alone (contract 2026-11-13 §2):
// executive.analytics.view, or the primary superadmin. Not every
// superadmin — the backend gives no catch-all here.
export function canSeeCeoPlatform(session: { isPrimarySuperadmin?: boolean; permissions?: string[] } | null): boolean {
  if (!session) return false;
  return session.isPrimarySuperadmin === true || permissionsOf(session).includes("executive.analytics.view");
}

export default function CeoTabs({ current }: { current: "business" | "platform" }) {
  const t = useTranslations("exec.ceo.tabs");
  const { session } = useAuth();
  if (!canSeeCeoPlatform(session)) return null;
  return (
    <nav className="ex-tabs" aria-label={t("aria")}>
      <Link href="/admin/ceo" className={`ex-tab${current === "business" ? " is-on" : ""}`} aria-current={current === "business" ? "page" : undefined}>
        {t("business")}
      </Link>
      <Link href="/admin/ceo/platform" className={`ex-tab${current === "platform" ? " is-on" : ""}`} aria-current={current === "platform" ? "page" : undefined}>
        {t("platform")}
      </Link>
    </nav>
  );
}
