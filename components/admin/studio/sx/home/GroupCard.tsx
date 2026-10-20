"use client";

import "../sx-tones.css";
import "./sx-home.css";
import "./sx-gcard.css";
import type { ReactElement } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { useStudioAccess } from "@/lib/services/studio";
import { approvalsHref } from "../approvals/urlState";
import { enterStyle } from "../hooks";
import { ArrowRightIcon, Undo2Icon, CircleCheckIcon, HourglassIcon, LockIcon, RocketIcon, glyph } from "../icons";
import type { SxHue } from "../tones";
import type { SxIcon } from "../types";
import { GroupTile } from "./GroupTile";
import { LastActivity } from "./LastActivity";
import { StepMap, type StepMapStep } from "./StepMap";
import type { LastActivity as LastActivityData } from "./summary";

export type GroupCardKind = "returned" | "review" | "publish";
export type GroupCardModel = {
  key: string;
  order: number;
  hue: SxHue;
  name: string;
  what: string;
  done: number;
  total: number;
  blocked: number;
  records: number | null;
  runtime?: number | null;
  last?: LastActivityData | null;
  lastSlot?: boolean;
  steps: readonly StepMapStep[];
  next: { code: string; name: string } | null;
  counts: Readonly<Record<GroupCardKind, number>>;
};
export type GroupCardProps = { model: GroupCardModel; loadingCounts: boolean; index?: number };
export type GroupCardTone = "accent" | "light" | "dark";

export const NEED_KINDS: readonly GroupCardKind[] = ["returned", "review", "publish"];
export const NEED_ICON: Readonly<Record<GroupCardKind, SxIcon>> = { returned: Undo2Icon, review: HourglassIcon, publish: RocketIcon };

const GROUP_TONE: Readonly<Record<string, GroupCardTone>> = {
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
const TONE_CYCLE: readonly GroupCardTone[] = ["accent", "light", "light", "dark"];
const HERO_KEYS: ReadonlySet<string> = new Set(Object.keys(GROUP_TONE));

const enc = encodeURIComponent;
const own = (rec: object, key: string) => Object.prototype.hasOwnProperty.call(rec, key);

export function groupHref(key: string, need?: GroupCardKind): string {
  return `/admin/studio/g/${enc(key)}${need ? `?need=${need}` : ""}`;
}

export function pctOf(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

export function groupTone(key: string, order: number): GroupCardTone {
  if (own(GROUP_TONE, key)) return GROUP_TONE[key];
  const n = Number.isFinite(order) ? Math.floor(order) : 1;
  return TONE_CYCLE[(Math.max(1, n) - 1) % TONE_CYCLE.length];
}

export function GroupCard({ model, loadingCounts, index = 0 }: GroupCardProps): ReactElement {
  const t = useTranslations("studio");
  const acc = useStudioAccess();
  const { key, order, hue, name, what, done, total, blocked, records, runtime = null, last = null, steps, next, counts } = model;
  const base = aiId("admin.studio.home.group", key);
  const href = groupHref(key);
  const pct = pctOf(done, total);
  const tone = groupTone(key, order);
  const needHref = (k: GroupCardKind) => (acc.canReview ? approvalsHref({ group: key, need: k }) : groupHref(key, k));
  const nextLabel = next ? t("sx.home.card.next", { name: next.name }) : "";
  const meta = [t("sx.hm.card.ctors", { n: total }), records === null ? "" : t("sx.hm.card.records", { n: records }), runtime ? t("sx.hm.card.runtime", { n: runtime }) : ""].filter(Boolean);
  const active = NEED_KINDS.filter((k) => (counts[k] ?? 0) > 0);
  return (
    <li className="sx-gcard sx-lift sx-enter" data-hue={hue} data-tone={tone} data-done={next ? undefined : ""} style={enterStyle(Math.min(index, 12))}>
      <div className="sx-gcard__body">
        <p className="sx-gcard__kicker sx-num">
          {meta.map((m) => (
            <span key={m} className="sx-gcard__mpart">
              {m}
            </span>
          ))}
          {last ? <LastActivity last={last} aiId={aiId(base, "last")} className="sx-gcard__last" compact /> : null}
        </p>
        <h3 className="sx-gcard__name">
          <Link className="sx-gcard__link" href={href} title={what || undefined} data-ai-id={base} data-ai-type="card" data-ai-label={name}>
            {name}
          </Link>
        </h3>
        <p className="sx-gcard__sub sx-num">
          <span>{t("sx.home.card.progress", { done, total })}</span>
          <span className="sx-gcard__pct">{t("sx.journeyRun.percent", { n: pct })}</span>
        </p>
        <StepMap steps={steps} label={t("sx.hm.card.map", { name })} className="sx-gcard__map" />
        {loadingCounts ? (
          <div className="sx-gcard__needs" aria-hidden="true">
            <span className="sx-sk sx-gcard__needs-sk" />
          </div>
        ) : active.length || blocked > 0 ? (
          <ul className="sx-gcard__needs" aria-label={t("sx.hm.card.stats")}>
            {active.map((k) => {
              const full = t(`sx.home.card.${k}`, { n: counts[k] ?? 0 });
              return (
                <li key={k}>
                  <Link href={needHref(k)} className="sx-gcard__need" data-kind={k} title={full} data-ai-id={aiId(base, "need", k)} data-ai-type="link" data-ai-label={full}>
                    {glyph(NEED_ICON[k], { size: 14 })}
                    <span>{full}</span>
                  </Link>
                </li>
              );
            })}
            {blocked > 0 ? (
              <li>
                <span className="sx-gcard__need" data-kind="blocked">
                  {glyph(LockIcon, { size: 13 })}
                  <span>{t("sx.hm.chip.blocked", { n: blocked })}</span>
                </span>
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="sx-gcard__foot">
          {next ? (
            <Link href={`/admin/studio/c/${enc(next.code)}`} className="sx-gcard__next" aria-label={nextLabel} title={nextLabel} data-ai-id={aiId(base, "next")} data-ai-type="link" data-ai-label={nextLabel}>
              <span className="sx-gcard__next-go">{glyph(ArrowRightIcon, { size: 16 })}</span>
              <span className="sx-gcard__next-txt">
                <span className="sx-gcard__next-k">{t("sx.guide.next")}</span>
                <span className="sx-gcard__next-t">{next.name}</span>
              </span>
            </Link>
          ) : (
            <Link href={href} className="sx-gcard__next" data-all="" data-ai-id={aiId(base, "view")} data-ai-type="link" data-ai-label={t("sx.home.card.allDone")}>
              <span className="sx-gcard__next-go">{glyph(CircleCheckIcon, { size: 16 })}</span>
              <span className="sx-gcard__next-txt">
                <span className="sx-gcard__next-t">{t("sx.home.card.allDone")}</span>
              </span>
            </Link>
          )}
        </div>
      </div>
      <span className="sx-gcard__art" aria-hidden="true">
        {HERO_KEYS.has(key) ? (
          <Image src={`/img/studio/hero/${key}.webp`} alt="" width={640} height={640} unoptimized />
        ) : (
          <GroupTile groupKey={key} order={order} size="xl" />
        )}
      </span>
    </li>
  );
}

export function GroupCardSkeleton({ index = 0 }: { index?: number }): ReactElement {
  return (
    <li className="sx-gcard sx-enter" data-sk="" data-tone="light" data-enter="fade" aria-hidden="true" style={enterStyle(index)}>
      <div className="sx-gcard__body">
        <span className="sx-sk sx-gcard__sk-kicker" />
        <span className="sx-sk sx-gcard__sk-name" />
        <span className="sx-sk sx-gcard__sk-sub" />
        <span className="sx-sk sx-gcard__sk-map" />
        <span className="sx-sk sx-gcard__sk-btn" />
      </div>
      <span className="sx-sk sx-gcard__sk-art" />
    </li>
  );
}
