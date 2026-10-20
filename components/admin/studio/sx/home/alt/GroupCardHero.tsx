"use client";

import "../../sx-tones.css";
import "../sx-home.css";
import "./sx-gcard-hero.css";
import type { ReactElement } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { useStudioAccess } from "@/lib/services/studio";
import { approvalsHref } from "../../approvals/urlState";
import { enterStyle } from "../../hooks";
import { ArrowRightIcon, CircleCheckIcon, LockIcon, glyph } from "../../icons";
import { GroupTile } from "../GroupTile";
import { LastActivity } from "../LastActivity";
import { StepMap } from "../StepMap";
import { NEED_ICON, NEED_KINDS, groupHref, pctOf, type GroupCardKind, type GroupCardProps } from "../GroupCard";

export type GroupCardHeroTone = "accent" | "light" | "dark";

const GROUP_TONE: Readonly<Record<string, GroupCardHeroTone>> = {
  services_packages: "accent",
  documents_texts: "light",
  process_quality: "light",
  communications: "dark",
  finance_tariffs: "accent",
  security_access: "light",
  operations: "light",
  integrations: "dark",
  system_reference: "accent",
  advertising: "light",
};
const TONE_CYCLE: readonly GroupCardHeroTone[] = ["accent", "light", "light", "dark"];
const HERO_KEYS: ReadonlySet<string> = new Set(Object.keys(GROUP_TONE));

const enc = encodeURIComponent;
const own = (rec: object, key: string) => Object.prototype.hasOwnProperty.call(rec, key);

export function groupHeroTone(key: string, order: number): GroupCardHeroTone {
  if (own(GROUP_TONE, key)) return GROUP_TONE[key];
  const n = Number.isFinite(order) ? Math.floor(order) : 1;
  return TONE_CYCLE[(Math.max(1, n) - 1) % TONE_CYCLE.length];
}

export function GroupCardHero({ model, loadingCounts, index = 0 }: GroupCardProps): ReactElement {
  const t = useTranslations("studio");
  const acc = useStudioAccess();
  const { key, order, hue, name, what, done, total, blocked, records, runtime = null, last = null, steps, next, counts } = model;
  const base = aiId("admin.studio.home.group", key);
  const href = groupHref(key);
  const pct = pctOf(done, total);
  const tone = groupHeroTone(key, order);
  const needHref = (k: GroupCardKind) => (acc.canReview ? approvalsHref({ group: key, need: k }) : groupHref(key, k));
  const nextLabel = next ? t("sx.home.card.next", { name: next.name }) : "";
  const meta = [t("sx.hm.card.ctors", { n: total }), records === null ? "" : t("sx.hm.card.records", { n: records }), runtime ? t("sx.hm.card.runtime", { n: runtime }) : ""].filter(Boolean);
  const active = NEED_KINDS.filter((k) => (counts[k] ?? 0) > 0);
  return (
    <li className="sx-hcard sx-lift sx-enter" data-hue={hue} data-tone={tone} data-done={next ? undefined : ""} style={enterStyle(Math.min(index, 12))}>
      <div className="sx-hcard__body">
        <p className="sx-hcard__kicker sx-num">
          {meta.map((m) => (
            <span key={m} className="sx-hcard__mpart">
              {m}
            </span>
          ))}
          {last ? <LastActivity last={last} aiId={aiId(base, "last")} className="sx-hcard__last" compact /> : null}
        </p>
        <h3 className="sx-hcard__name">
          <Link className="sx-hcard__link" href={href} title={what || undefined} data-ai-id={base} data-ai-type="card" data-ai-label={name}>
            {name}
          </Link>
        </h3>
        <p className="sx-hcard__sub sx-num">
          <span>{t("sx.home.card.progress", { done, total })}</span>
          <span className="sx-hcard__pct">{t("sx.journeyRun.percent", { n: pct })}</span>
        </p>
        <StepMap steps={steps} label={t("sx.hm.card.map", { name })} className="sx-hcard__map" />
        {loadingCounts ? (
          <div className="sx-hcard__needs" aria-hidden="true">
            <span className="sx-sk sx-hcard__needs-sk" />
          </div>
        ) : active.length || blocked > 0 ? (
          <ul className="sx-hcard__needs" aria-label={t("sx.hm.card.stats")}>
            {active.map((k) => {
              const full = t(`sx.home.card.${k}`, { n: counts[k] ?? 0 });
              return (
                <li key={k}>
                  <Link href={needHref(k)} className="sx-hcard__need" data-kind={k} title={full} data-ai-id={aiId(base, "need", k)} data-ai-type="link" data-ai-label={full}>
                    {glyph(NEED_ICON[k], { size: 14 })}
                    <span>{full}</span>
                  </Link>
                </li>
              );
            })}
            {blocked > 0 ? (
              <li>
                <span className="sx-hcard__need" data-kind="blocked">
                  {glyph(LockIcon, { size: 13 })}
                  <span>{t("sx.hm.chip.blocked", { n: blocked })}</span>
                </span>
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="sx-hcard__foot">
          {next ? (
            <Link href={`/admin/studio/c/${enc(next.code)}`} className="sx-hcard__next" aria-label={nextLabel} title={nextLabel} data-ai-id={aiId(base, "next")} data-ai-type="link" data-ai-label={nextLabel}>
              <span className="sx-hcard__next-go">{glyph(ArrowRightIcon, { size: 16 })}</span>
              <span className="sx-hcard__next-txt">
                <span className="sx-hcard__next-k">{t("sx.guide.next")}</span>
                <span className="sx-hcard__next-t">{next.name}</span>
              </span>
            </Link>
          ) : (
            <Link href={href} className="sx-hcard__next" data-all="" data-ai-id={aiId(base, "view")} data-ai-type="link" data-ai-label={t("sx.home.card.allDone")}>
              <span className="sx-hcard__next-go">{glyph(CircleCheckIcon, { size: 16 })}</span>
              <span className="sx-hcard__next-txt">
                <span className="sx-hcard__next-t">{t("sx.home.card.allDone")}</span>
              </span>
            </Link>
          )}
        </div>
      </div>
      <span className="sx-hcard__art" aria-hidden="true">
        {HERO_KEYS.has(key) ? (
          <Image src={`/img/studio/hero/${key}.webp`} alt="" width={640} height={640} unoptimized />
        ) : (
          <GroupTile groupKey={key} order={order} size="xl" />
        )}
      </span>
    </li>
  );
}

export function GroupCardHeroSkeleton({ index = 0 }: { index?: number }): ReactElement {
  return (
    <li className="sx-hcard sx-enter" data-sk="" data-tone="light" data-enter="fade" aria-hidden="true" style={enterStyle(index)}>
      <div className="sx-hcard__body">
        <span className="sx-sk sx-hcard__sk-kicker" />
        <span className="sx-sk sx-hcard__sk-name" />
        <span className="sx-sk sx-hcard__sk-sub" />
        <span className="sx-sk sx-hcard__sk-map" />
        <span className="sx-sk sx-hcard__sk-btn" />
      </div>
      <span className="sx-sk sx-hcard__sk-art" />
    </li>
  );
}
