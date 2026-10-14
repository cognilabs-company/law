"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { canInternal } from "@/lib/services/internalHrm";
import { HrmHead } from "@/components/internal/HrmUi";
import { IconChevronDown } from "@/components/icons";
import { NAV_GROUPS, navHref, navId } from "./nav";

// Which areas the viewer folded ("pay,admin"), kept per browser. Read
// through useSyncExternalStore so the server render and the first client
// render agree: everything open.
const FOLD_KEY = "lexgo.hrm.sections.folded";
const listeners = new Set<() => void>();
const readFolded = () => {
  try {
    return localStorage.getItem(FOLD_KEY) ?? "";
  } catch {
    return "";
  }
};
const writeFolded = (keys: string[]) => {
  try {
    localStorage.setItem(FOLD_KEY, keys.join(","));
  } catch {
    /* private mode: the folds last for this page only */
  }
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

// MedControl HR's «Boʻlimlar»: every area of the workspace as a tile with
// its pages, for finding one's way without the menu. Each area has its own
// picture in public/img/sections/<group key>.svg, and folds to its header.
export default function SectionsPage() {
  const t = useTranslations("internal");
  const { session } = useAuth();
  const raw = useSyncExternalStore(subscribe, readFolded, () => "");
  const folded = new Set(raw.split(",").filter(Boolean));
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => (!i.permission || canInternal(session, i.permission)) && i.href !== "/internal/sections") })).filter((g) => g.items.length);
  const allFolded = groups.every((g) => folded.has(g.key));
  const toggle = (key: string) => writeFolded(folded.has(key) ? [...folded].filter((k) => k !== key) : [...folded, key]);
  return (
    <section className="hrm-page">
      <HrmHead
        title={t("sections.title")}
        lead={t("sections.lead")}
        actions={
          <button type="button" className="btn btn--line btn--sm" onClick={() => writeFolded(allFolded ? [] : groups.map((g) => g.key))}>
            <IconChevronDown className={`hrm-sections__all${allFolded ? "" : " is-up"}`} />
            {allFolded ? t("sections.expandAll") : t("sections.collapseAll")}
          </button>
        }
      />
      <div className="hrm-sections">
        {groups.map((g) => {
          const open = !folded.has(g.key);
          const body = `sections-${g.key}`;
          return (
            <article key={g.key} className={`hrm-section-tile${open ? " is-open" : ""}`}>
              <header>
                <Image className="hrm-section-tile__art" src={`/img/sections/${g.key}.svg`} alt="" width={56} height={56} />
                <h3>
                  <button type="button" className="hrm-section-tile__tg" aria-expanded={open} aria-controls={body} onClick={() => toggle(g.key)}>
                    {t(`groups.${g.key}`)}
                  </button>
                </h3>
                <small>{t("sections.pages", { n: g.items.length })}</small>
                <span className="hrm-section-tile__chev" aria-hidden><IconChevronDown /></span>
              </header>
              <div id={body} className="hrm-section-tile__body" inert={!open}>
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
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
