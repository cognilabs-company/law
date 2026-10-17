"use client";

import "../sx-tones.css";
import "./sx-home.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { SxLinkButton } from "../Button";
import { ArrowRightIcon, ArrowUUpLeftIcon, CheckCircleIcon, HourglassMediumIcon, RocketLaunchIcon, glyph } from "../icons";
import type { SxHue } from "../tones";
import type { SxIcon } from "../types";
import { SxProgress } from "../shared/Progress";
import { GroupTile } from "./GroupTile";

export type GroupCardKind = "returned" | "review" | "publish";
export type GroupCardModel = {
  key: string;
  order: number;
  hue: SxHue;
  name: string;
  what: string;
  done: number;
  total: number;
  next: { code: string; name: string } | null;
  counts: Readonly<Record<GroupCardKind, number>>;
};
export type GroupCardProps = { model: GroupCardModel; loadingCounts: boolean };

export const NEED_KINDS: readonly GroupCardKind[] = ["returned", "review", "publish"];
export const NEED_ICON: Readonly<Record<GroupCardKind, SxIcon>> = { returned: ArrowUUpLeftIcon, review: HourglassMediumIcon, publish: RocketLaunchIcon };

const enc = encodeURIComponent;

export function groupHref(key: string, need?: GroupCardKind): string {
  return `/admin/studio/g/${enc(key)}${need ? `?need=${need}` : ""}`;
}

export function GroupCard({ model, loadingCounts }: GroupCardProps): ReactElement {
  const t = useTranslations("studio");
  const { key, order, hue, name, what, done, total, next, counts } = model;
  const base = aiId("admin.studio.home.group", key);
  const href = groupHref(key);
  const needs = NEED_KINDS.filter((k) => (counts[k] ?? 0) > 0);
  const allDone = !next;
  const nextLabel = next ? t("sx.home.card.next", { name: next.name }) : "";
  return (
    <li className="sx-gcard" data-hue={hue} data-done={allDone ? "" : undefined}>
      <div className="sx-gcard__top">
        <GroupTile groupKey={key} order={order} />
        <h3 className="sx-gcard__name">
          <Link className="sx-gcard__link" href={href} data-ai-id={base} data-ai-type="card" data-ai-label={name}>
            {name}
          </Link>
        </h3>
      </div>
      <p className="sx-gcard__what">{what}</p>
      <div className="sx-gcard__prog">
        <span className="sx-gcard__count sx-num">{t("sx.home.card.progress", { done, total })}</span>
        <SxProgress value={total ? (done / total) * 100 : 0} label={t("sx.home.card.progressLabel", { name, done, total })} size="sm" />
      </div>
      {loadingCounts ? (
        <div className="sx-gcard__needs" aria-hidden="true">
          <span className="sx-sk sx-gcard__needs-sk" />
        </div>
      ) : needs.length ? (
        <ul className="sx-gcard__needs">
          {needs.map((k) => (
            <li key={k}>
              <Link href={groupHref(key, k)} className="sx-gcard__need" data-kind={k} data-ai-id={aiId(base, "need", k)} data-ai-type="link" data-ai-label={t(`sx.home.card.${k}`, { n: counts[k] })}>
                {glyph(NEED_ICON[k], { size: 14 })}
                <span>{t(`sx.home.card.${k}`, { n: counts[k] })}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="sx-gcard__foot">
        {next ? (
          <SxLinkButton variant="secondary" size="sm" href={`/admin/studio/c/${enc(next.code)}`} iconEnd={ArrowRightIcon} aiId={aiId(base, "next")} aiLabel={nextLabel} className="sx-gcard__next">
            <span className="sx-gcard__nextt" title={nextLabel}>
              {nextLabel}
            </span>
          </SxLinkButton>
        ) : (
          <>
            <span className="sx-gcard__done">
              {glyph(CheckCircleIcon, { size: 16 })}
              <span>{t("sx.home.card.allDone")}</span>
            </span>
            <SxLinkButton variant="ghost" size="sm" href={href} aiId={aiId(base, "view")}>
              {t("sx.ui.view")}
            </SxLinkButton>
          </>
        )}
      </div>
    </li>
  );
}

export function GroupCardSkeleton(): ReactElement {
  return (
    <li className="sx-gcard" data-sk="" aria-hidden="true">
      <div className="sx-gcard__top">
        <span className="sx-sk sx-gcard__sk-tile" />
        <span className="sx-sk sx-gcard__sk-name" />
      </div>
      <span className="sx-sk" />
      <span className="sx-sk" />
      <span className="sx-sk sx-gcard__sk-btn" />
    </li>
  );
}
