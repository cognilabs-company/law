"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// Pages the owner's PDF (2026-11-27) folded into one menu entry each: the
// pair shows as tabs on top of both pages (S11 monitoring + integrations,
// S14 templates + document settings, S20 audit + OTP delivery).
const SETS = {
  monitoring: [
    { href: "/admin/monitoring", key: "monitoring" },
    { href: "/admin/integrations", key: "integrations" },
  ],
  documents: [
    { href: "/admin/templates", key: "templates" },
    { href: "/admin/document-settings", key: "documentSettings" },
  ],
  audit: [
    { href: "/admin/audit-trail", key: "audit" },
    { href: "/admin/otp-delivery", key: "otpDelivery" },
  ],
} as const;

export default function AdminTabs({ set }: { set: keyof typeof SETS }) {
  const t = useTranslations("admin.nav");
  const path = usePathname();
  return (
    <nav className="adm-tabs" aria-label={t(SETS[set][0].key)}>
      {SETS[set].map((x) => {
        const on = path === x.href || path.endsWith(x.href);
        return (
          <Link key={x.href} href={x.href} className={`adm-tabs__a${on ? " is-on" : ""}`} aria-current={on ? "page" : undefined}>
            {t(x.key)}
          </Link>
        );
      })}
    </nav>
  );
}
