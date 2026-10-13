"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { canInternal } from "@/lib/services/internalHrm";
import { HrmHead } from "@/components/internal/HrmUi";
import { NAV_GROUPS, navHref, navId } from "./nav";

// MedControl HR's «Boʻlimlar»: every area of the workspace as a tile with
// its pages, for finding one's way without the menu.
export default function SectionsPage() {
  const t = useTranslations("internal");
  const { session } = useAuth();
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => (!i.permission || canInternal(session, i.permission)) && i.href !== "/internal/sections") })).filter((g) => g.items.length);
  return (
    <section className="hrm-page">
      <HrmHead title={t("sections.title")} lead={t("sections.lead")} />
      <div className="hrm-sections">
        {groups.map((g) => (
          <article key={g.key} className="hrm-section-tile">
            <header>
              <span className="hrm-section-tile__i"><g.Icon /></span>
              <h3>{t(`groups.${g.key}`)}</h3>
              <small>{t("sections.pages", { n: g.items.length })}</small>
            </header>
            <ul>
              {g.items.map((i) => (
                <li key={navId(i)}>
                  <Link href={navHref(i)}>
                    <i.Icon />
                    <span>{t(`nav.${i.key}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
