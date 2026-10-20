"use client";

import "../sx-tones.css";
import "./sx-home.css";
import "./sx-entity.css";
import { useId, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { useStudioAccess } from "@/lib/services/studio";
import { SxLinkButton } from "../Button";
import { enterStyle } from "../hooks";
import { ArrowRightIcon, BriefcaseBusinessIcon, CircleCheckIcon, CircleDashedIcon, CirclePauseIcon, PackageIcon, PlusIcon, ctorIcon, glyph } from "../icons";
import { SxCount } from "../shared/Count";
import type { SxHue } from "../tones";
import type { SxIcon } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { createHrefOf, createTypeOf, recordsHrefOf, type EntityCard } from "./entityModel";

type StatKey = "active" | "inactive" | "incomplete";

const BASE = "admin.studio.home.entity";
const STAT_ICON: Readonly<Record<StatKey, SxIcon>> = { active: CircleCheckIcon, inactive: CirclePauseIcon, incomplete: CircleDashedIcon };
const STATS: readonly StatKey[] = ["active", "inactive", "incomplete"];

function iconOf(card: EntityCard): SxIcon {
  const type = createTypeOf(card);
  return type === "service" ? BriefcaseBusinessIcon : type === "package" ? PackageIcon : ctorIcon(card.code, "services_packages");
}

function hueOf(card: EntityCard): SxHue {
  const type = createTypeOf(card);
  return type === "package" ? "iris" : type === "service" ? "blue" : "cyan";
}

function share(n: number | null, total: number): number {
  return n !== null && total > 0 ? Math.max(0, Math.min(100, (n / total) * 100)) : 0;
}

function EntityCardItem({ card, index }: { card: EntityCard; index: number }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const acc = useStudioAccess();
  const type = createTypeOf(card);
  const name = type ? t(`sx.hm.ent.name.${type}`) : card.title || labels.ctorName(card.code);
  const base = aiId(BASE, card.key);
  const listHref = recordsHrefOf(card.listUrl, card.code);
  const incompleteHref = card.incompleteUrl ? recordsHrefOf(card.incompleteUrl, card.code) : "";
  const createHref = acc.canEdit ? createHrefOf(card) : "";
  const fmt = (n: number) => labels.num(n);
  const value = (k: StatKey) => (k === "active" ? card.active : k === "inactive" ? card.inactive : card.incomplete);
  const split = card.active !== null || card.inactive !== null;
  const denom = Math.max(card.total, (card.active ?? 0) + (card.inactive ?? 0));
  const summary = t("sx.hm.ent.aria", {
    total: fmt(card.total),
    active: card.active === null ? "—" : fmt(card.active),
    inactive: card.inactive === null ? "—" : fmt(card.inactive),
    incomplete: card.incomplete === null ? "—" : fmt(card.incomplete),
  });

  return (
    <li className="sx-ecard sx-lift sx-enter" data-hue={hueOf(card)} style={enterStyle(index + 1)}>
      <div className="sx-ecard__top">
        <span className="sx-ecard__tile sx-sq" aria-hidden="true">
          {glyph(iconOf(card), { size: 22 })}
        </span>
        <div className="sx-ecard__id">
          <h3 className="sx-ecard__name">
            {listHref ? (
              <Link className="sx-ecard__link" href={listHref} data-ai-id={base} data-ai-type="card" data-ai-label={name}>
                {name}
                <span className="sx-vh">. {summary}</span>
              </Link>
            ) : (
              name
            )}
          </h3>
          {card.studioObjects !== null ? <p className="sx-ecard__meta sx-num">{t("sx.hm.ent.studio", { n: fmt(card.studioObjects) })}</p> : null}
        </div>
        {createHref ? (
          <SxLinkButton variant="secondary" size="sm" icon={PlusIcon} href={createHref} className="sx-ecard__create" aiId={aiId(base, "create")} aiLabel={t(`sx.hm.ent.create.${type}`)}>
            <span className="sx-ecard__create-l">{t(`sx.hm.ent.create.${type}`)}</span>
          </SxLinkButton>
        ) : null}
      </div>
      <div className="sx-ecard__total" aria-hidden="true">
        <SxCount value={card.total} format={fmt} className="sx-ecard__n" />
        <span className="sx-ecard__tl">{t("sx.hm.ent.total")}</span>
      </div>
      {split ? (
        <span className="sx-ecard__bar" aria-hidden="true">
          <span className="sx-ecard__seg" data-k="active" style={{ width: `${share(card.active, denom)}%` }} />
          <span className="sx-ecard__seg" data-k="inactive" style={{ width: `${share(card.inactive, denom)}%` }} />
        </span>
      ) : null}
      <ul className="sx-ecard__stats" aria-label={t("sx.hm.ent.stats", { name })}>
        {STATS.map((k) => {
          const n = value(k);
          const label = t(`sx.hm.ent.${k}`);
          const full = n === null ? `${label}: —` : `${label}: ${fmt(n)}`;
          const inner = (
            <>
              {glyph(STAT_ICON[k], { size: 14 })}
              <span className="sx-ecard__stat-n sx-num">{n === null ? "—" : fmt(n)}</span>
              <span className="sx-ecard__stat-l">{label}</span>
            </>
          );
          const linked = k === "incomplete" && n !== null && n > 0 && !!incompleteHref;
          return (
            <li key={k}>
              {linked ? (
                <Link
                  href={incompleteHref}
                  className="sx-ecard__stat"
                  data-k={k}
                  title={t("sx.hm.ent.incompleteHint")}
                  aria-label={t("sx.hm.ent.openIncomplete", { name, n: fmt(n) })}
                  data-ai-id={aiId(base, "incomplete")}
                  data-ai-type="link"
                  data-ai-label={full}
                >
                  {inner}
                  <span className="sx-ecard__stat-go" aria-hidden="true">
                    {glyph(ArrowRightIcon, { size: 13 })}
                  </span>
                </Link>
              ) : (
                <span className="sx-ecard__stat" data-k={k} data-zero={n ? undefined : ""} title={k === "incomplete" ? t("sx.hm.ent.incompleteHint") : undefined} data-ai-id={aiId(base, k)} data-ai-type="stat" data-ai-label={full}>
                  <span className="sx-ecard__stat-in" aria-hidden="true">
                    {inner}
                  </span>
                  <span className="sx-vh">{full}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {listHref ? (
        <span className="sx-ecard__foot" aria-hidden="true">
          <span className="sx-ecard__foot-t">{t("sx.hm.ent.openList")}</span>
          <span className="sx-ecard__go">{glyph(ArrowRightIcon, { size: 16 })}</span>
        </span>
      ) : null}
    </li>
  );
}

export function EntityCards({ cards }: { cards: readonly EntityCard[] }): ReactElement | null {
  const t = useTranslations("studio");
  const headingId = useId();
  if (!cards.length) return null;
  return (
    <section className="sx-home__entities" aria-labelledby={headingId} data-ai-id={BASE} data-ai-type="section" data-ai-label={t("sx.hm.ent.title")}>
      <div className="sx-home__hrow">
        <h2 id={headingId} className="sx-home__h">
          {t("sx.hm.ent.title")}
        </h2>
      </div>
      <ul className="sx-egrid">
        {cards.map((c, i) => (
          <EntityCardItem key={c.key} card={c} index={i} />
        ))}
      </ul>
    </section>
  );
}
