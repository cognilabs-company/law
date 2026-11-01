"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { saveConsent, readConsent, NO_OPTIONAL } from "@/lib/consent";
import { useConsent } from "@/lib/useConsent";
import CookieSettingsButton from "@/components/legal/CookieSettingsButton";
import { IconMap } from "@/components/icons";
import "@/components/legal/cookieConsent.css";

// Yandex Maps sets Yandex's own cookies, so a map is drawn only with the
// visitor's "functional" consent (lib/consent.ts). Until then this card
// stands in its place: one click allows maps (and only maps — the other
// categories keep their state) and shows it; "Cookie settings" opens the
// full choice. Before the browser's choice is known (server render) it is
// an empty box of the map's size, so nothing jumps.
// `onList` (the marketplace) adds "Show the list instead".
export default function MapConsentGate({ children, compact, onList }: { children: ReactNode; compact?: boolean; onList?: () => void }) {
  const t = useTranslations("cookies.map");
  const on = useConsent("functional");
  if (on) return <>{children}</>;
  if (on === undefined) return <div className={`ckmap${compact ? " ckmap--compact" : ""}`} aria-hidden="true" />;

  const allow = () => {
    const cur = readConsent()?.choices ?? NO_OPTIONAL;
    saveConsent({ ...cur, functional: true });
  };

  return (
    <div className={`ckmap${compact ? " ckmap--compact" : ""}`} data-ai-id="cookies.map-gate">
      <div className="ckmap__card">
        <span className="ckmap__ic" aria-hidden="true">
          <IconMap />
        </span>
        <h3 className="ckmap__t">{t("title")}</h3>
        <p className="ckmap__p">{t("text")}</p>
        <div className="ckmap__acts">
          <button type="button" className="btn btn--grad btn--sm" onClick={allow} data-ai-id="cookies.map-gate.allow">
            {t("allow")}
          </button>
          <CookieSettingsButton className="btn btn--line btn--sm" aiId="cookies.map-gate.settings">
            {t("settings")}
          </CookieSettingsButton>
          {onList ? (
            <button type="button" className="btn btn--line btn--sm" onClick={onList} data-ai-id="cookies.map-gate.list">
              {t("list")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
