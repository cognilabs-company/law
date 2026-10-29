"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAward, IconShieldCheck } from "@/components/icons";
import { useAchievementLabels } from "@/components/portal/achievementLabels";
import { categoryName } from "@/lib/categoryNames";
import { dateOnly } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { uzLabel } from "@/lib/uzScript";
import { listPublicAchievements, type PublicAchievement } from "@/lib/services/achievements";

// An advocate's verified achievements on the public profile (final
// contract 2026-10-29 §5): the sanitized endpoint only — stage, result,
// category, year, the operator-approved public_description and LexGo's
// mark. Never the private description, evidence or the software's analysis.
const PAGE = 20;
export default function PublicAchievements({ sellerId }: { sellerId: string }): ReactElement | null {
  const t = useTranslations("portal.achievements");
  const locale = useLocale();
  const L = useAchievementLabels();
  const [items, setItems] = useState<PublicAchievement[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    listPublicAchievements(sellerId, { limit: PAGE }, ctl.signal).then(
      (p) => {
        setItems(p.items);
        setMore(p.hasMore);
      },
      (e) => {
        if (!isAborted(e)) logApiError("marketplace.achievements", e);
      },
    );
    return () => ctl.abort();
  }, [sellerId]);
  async function next() {
    if (busy) return;
    setBusy(true);
    try {
      const p = await listPublicAchievements(sellerId, { limit: PAGE, offset: items.length });
      setItems((xs) => [...xs, ...p.items]);
      setMore(p.hasMore);
    } catch (e) {
      logApiError("marketplace.achievements.more", e);
    } finally {
      setBusy(false);
    }
  }
  if (!items.length) return null;
  const cat = (a: PublicAchievement) => (a.categoryTitle ? uzLabel(categoryName({ slug: "", title: a.categoryTitle }, locale), locale) : "");
  return (
    <section className="mk-panel mk-ach" data-ai-target="marketplace:seller-achievements">
      <h2 className="mk-panel__t">{t("title")}</h2>
      <ul className="mk-ach__list">
        {items.map((a) => (
          <li key={a.id} className="mk-ach__item">
            <span className="mk-ach__ic" aria-hidden="true">
              <IconAward />
            </span>
            <span className="mk-ach__m">
              <b>{L.stage(a.stage) || L.result(a.result)}</b>
              <small>{[L.stage(a.stage) ? L.result(a.result) : "", cat(a), a.year ? String(a.year) : ""].filter(Boolean).join(" · ")}</small>
              {a.publicDescription ? <p>{a.publicDescription}</p> : null}
              {a.verified ? (
                <em className="mk-ach__ok">
                  <IconShieldCheck aria-hidden="true" />
                  {a.verifiedAt ? t("verifiedOn", { date: dateOnly(a.verifiedAt, locale) }) : t("verified")}
                </em>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {more ? (
        <button type="button" className="btn btn--line btn--sm mk-ach__more" onClick={() => void next()} disabled={busy}>
          {t("showMore")}
        </button>
      ) : null}
    </section>
  );
}
