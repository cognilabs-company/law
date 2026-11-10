"use client";

import "./serviceBrowser.css";
import { useMemo, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconArrowRight, IconBriefcase, IconCheck, IconSearch, IconStarRate, IconUsers } from "@/components/icons";
import { useRouter } from "@/i18n/navigation";
import type { BoughtOrder } from "@/lib/useBoughtServices";
import { fmtRating } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import type { MarketSeller } from "@/lib/services/marketplace";

// Browsing by service: every service on the marketplace as a card, grouped
// by category, with its own catalog price, how many specialists offer it
// and the best rating among them. Picking one finds the specialists who
// offer it (the directory narrows to that service).

export type ServiceOption = { value: string; label: string; categoryId: string; basePrice: number };
type Card = ServiceOption & { sellers: number; rating: number };

const HUES = ["blue", "violet", "teal", "amber", "rose", "green"] as const;

export default function ServiceBrowser({
  services,
  categories,
  sellers,
  loading,
  onPick,
  bought,
}: {
  services: readonly ServiceOption[];
  categories: readonly { value: string; label: string }[];
  sellers: readonly MarketSeller[];
  loading: boolean;
  onPick: (serviceId: string) => void;
  // Services this client already bought (open orders): the card opens the order.
  bought?: ReadonlyMap<string, BoughtOrder>;
}): ReactElement {
  const t = useTranslations("marketplace.byService");
  const router = useRouter();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");

  const cards = useMemo<Card[]>(() => {
    const stat = new Map<string, { sellers: number; rating: number }>();
    for (const s of sellers) {
      for (const x of s.services) {
        const cur = stat.get(x.id) ?? { sellers: 0, rating: 0 };
        stat.set(x.id, { sellers: cur.sellers + 1, rating: Math.max(cur.rating, s.rating || 0) });
      }
    }
    return services.map((x) => ({ ...x, ...(stat.get(x.value) ?? { sellers: 0, rating: 0 }) }));
  }, [services, sellers]);

  const catLabel = useMemo(() => new Map(categories.map((c) => [c.value, c.label])), [categories]);
  const hueOf = useMemo(() => {
    const ids = [...new Set(services.map((s) => s.categoryId))];
    return (id: string) => HUES[Math.max(0, ids.indexOf(id)) % HUES.length];
  }, [services]);
  const usedCats = useMemo(() => [...new Set(cards.filter((c) => c.sellers > 0).map((c) => c.categoryId))].filter((id) => catLabel.has(id)), [cards, catLabel]);

  const needle = q.trim().toLowerCase();
  const shown = cards
    .filter((c) => (!cat || c.categoryId === cat) && (!needle || c.label.toLowerCase().includes(needle) || (catLabel.get(c.categoryId) ?? "").toLowerCase().includes(needle)))
    // Services someone offers first, the most offered on top.
    .sort((a, b) => Number(b.sellers > 0) - Number(a.sellers > 0) || b.sellers - a.sellers || a.label.localeCompare(b.label));

  return (
    <section className="mksv" aria-label={t("title")} data-ai-target="marketplace:services" data-ai-id="marketplace.by-service">
      <header className="mksv__h">
        <div>
          <h2>{t("title")}</h2>
          <p>{t("lead")}</p>
        </div>
        <label className="mksv__search">
          <IconSearch aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        </label>
      </header>
      {usedCats.length > 1 ? (
        <div className="mksv__cats" role="group" aria-label={t("categories")}>
          <button type="button" aria-pressed={!cat} onClick={() => setCat("")}>
            {t("allCategories")}
          </button>
          {usedCats.map((id) => (
            <button key={id} type="button" aria-pressed={cat === id} onClick={() => setCat(cat === id ? "" : id)}>
              {catLabel.get(id)}
            </button>
          ))}
        </div>
      ) : null}
      {loading ? (
        <div className="mksv__grid" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="mksv__card mksv__card--ghost" aria-hidden="true" />
          ))}
        </div>
      ) : !shown.length ? (
        <p className="mksv__empty">{needle || cat ? t("noMatch") : t("empty")}</p>
      ) : (
        <ul className="mksv__grid">
          {shown.map((c) => {
            const mine = bought?.get(c.value) ?? null;
            const off = c.sellers === 0 && !mine;
            return (
              <li key={c.value}>
                <button
                  type="button"
                  className="mksv__card"
                  data-hue={hueOf(c.categoryId)}
                  data-off={off || undefined}
                  data-bought={mine ? "" : undefined}
                  disabled={off}
                  onClick={() => (mine ? router.push(mine.href) : onPick(c.value))}
                  aria-label={mine ? t("cardBought", { name: c.label }) : off ? t("cardOff", { name: c.label }) : t("cardAria", { name: c.label, n: c.sellers })}
                  data-ai-id={`marketplace.by-service.${c.value}`}
                  data-ai-type="button"
                  data-ai-label={c.label}
                >
                  <span className="mksv__top">
                    <span className="mksv__ic" aria-hidden="true">
                      <IconBriefcase />
                    </span>
                    {catLabel.get(c.categoryId) ? <span className="mksv__cat">{catLabel.get(c.categoryId)}</span> : null}
                  </span>
                  <b className="mksv__title">{c.label}</b>
                  <span className="mksv__meta">
                    <span>
                      <IconUsers aria-hidden="true" />
                      {off ? t("noSellers") : t("sellers", { n: c.sellers })}
                    </span>
                    {c.rating > 0 ? (
                      <span>
                        <IconStarRate aria-hidden="true" />
                        {fmtRating(c.rating, locale)}
                      </span>
                    ) : null}
                  </span>
                  <span className="mksv__foot">
                    <span className="mksv__price">{c.basePrice > 0 ? t("price", { price: fmtUzs(c.basePrice) }) : " "}</span>
                    {mine ? (
                      <span className="mksv__bought">
                        <IconCheck aria-hidden="true" />
                        {t("bought")}
                      </span>
                    ) : !off ? (
                      <span className="mksv__go">
                        {t("find")}
                        <IconArrowRight aria-hidden="true" />
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
