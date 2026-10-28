"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAward } from "@/components/icons";
import AchievementLevelMark from "@/components/portal/AchievementLevelMark";
import { dateOnly } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { listPublicAchievements, type PublicAchievement } from "@/lib/services/achievements";

// TSK-493303: a seller's verified achievements on the public profile —
// the backend sends only approved ones and only safe fields (no evidence,
// notes or case details). Nothing to show, nothing rendered.
export default function PublicAchievements({ sellerId }: { sellerId: string }): ReactElement | null {
  const t = useTranslations("portal.achievements");
  const locale = useLocale();
  const [items, setItems] = useState<PublicAchievement[]>([]);
  useEffect(() => {
    const ctl = new AbortController();
    listPublicAchievements(sellerId, ctl.signal).then(setItems, (e) => {
      if (!isAborted(e)) logApiError("marketplace.achievements", e);
    });
    return () => ctl.abort();
  }, [sellerId]);
  if (!items.length) return null;
  return (
    <section className="mk-panel mk-ach" data-ai-target="marketplace:seller-achievements">
      <h2 className="mk-panel__t">{t("title")}</h2>
      <ul className="mk-ach__list">
        {items.map((a) => (
          <li key={a.id} className="mk-ach__item">
            <span className="mk-ach__ic mk-ach__lv" data-level={a.level ?? undefined} aria-hidden="true">
              {a.level ? <AchievementLevelMark level={a.level} /> : <IconAward />}
            </span>
            <span className="mk-ach__m">
              <b>{a.level ? t(`level.${a.level}`) : a.title}</b>
              {a.level ? null : <small>{[t(`type.${a.type}`), a.achievedAt ? dateOnly(a.achievedAt, locale) : ""].filter(Boolean).join(" · ")}</small>}
              {a.description ? <p>{a.description}</p> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
