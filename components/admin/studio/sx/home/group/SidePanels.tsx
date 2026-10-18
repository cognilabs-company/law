"use client";

import "../../sx-tones.css";
import "../sx-home.css";
import "../sx-group.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { useStudioAccess } from "@/lib/services/studio";
import { approvalsHref } from "../../approvals/urlState";
import { enterStyle } from "../../hooks";
import { BadgeCheckIcon, ChevronRightIcon, CircleCheckIcon, LayoutGridIcon, LockIcon, glyph } from "../../icons";
import { StartJourneyButton } from "../../shared/StartJourney";
import type { SxIcon } from "../../types";
import { useStudioLabels } from "../../useStudioLabels";
import { NEED_ICON, NEED_KINDS, groupHref, type GroupCardKind } from "../GroupCard";

const BASE = "admin.studio.group";

export function QuickLinks({ groupKey, name }: { groupKey: string; name: string }): ReactElement | null {
  const t = useTranslations("studio");
  const acc = useStudioAccess();
  const journeys = groupKey === "services_packages" && acc.canEdit;
  const links: { key: string; href: string; icon: SxIcon; label: string; hint: string }[] = [];
  if (acc.canReview) links.push({ key: "approvals", href: approvalsHref({ group: groupKey }), icon: BadgeCheckIcon, label: t("sx.gp.linkApprovals"), hint: t("sx.gp.linkApprovalsHint", { name }) });
  links.push({ key: "home", href: "/admin/studio", icon: LayoutGridIcon, label: t("sx.gp.linkHome"), hint: t("sx.gp.linkHomeHint") });
  return (
    <section className="sx-gside__card sx-enter" style={enterStyle(1)} aria-label={t("sx.gp.links")} data-ai-id={aiId(BASE, "links")} data-ai-type="section" data-ai-label={t("sx.gp.links")}>
      <h2 className="sx-gside__h">{t("sx.gp.links")}</h2>
      {journeys ? (
        <div className="sx-gside__make">
          <StartJourneyButton type="service" variant="secondary" size="sm" label={t("sx.journeyRun.newService")} aiId={aiId(BASE, "links", "new-service")} />
          <StartJourneyButton type="package" variant="secondary" size="sm" label={t("sx.journeyRun.newPackage")} aiId={aiId(BASE, "links", "new-package")} />
        </div>
      ) : null}
      <ul className="sx-gside__list">
        {links.map((l) => (
          <li key={l.key}>
            <Link href={l.href} className="sx-gside__link" data-ai-id={aiId(BASE, "links", l.key)} data-ai-type="link" data-ai-label={l.label}>
              <span className="sx-gside__ic sx-sq">{glyph(l.icon, { size: 16 })}</span>
              <span className="sx-gside__txt">
                <span className="sx-gside__t">{l.label}</span>
                <span className="sx-gside__s">{l.hint}</span>
              </span>
              <span className="sx-gside__caret">{glyph(ChevronRightIcon, { size: 16 })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type GroupHealth = { done: number; total: number; blocked: number; counts: Readonly<Record<GroupCardKind, number>> | null; loading: boolean };

export function HealthCard({ groupKey, health }: { groupKey: string; health: GroupHealth }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const acc = useStudioAccess();
  const { done, total, blocked, counts, loading } = health;
  const needHref = (k: GroupCardKind) => (acc.canReview ? approvalsHref({ group: groupKey, need: k }) : groupHref(groupKey, k));
  return (
    <section className="sx-gside__card sx-enter" style={enterStyle(2)} aria-label={t("sx.gp.status")} data-ai-id={aiId(BASE, "health")} data-ai-type="section" data-ai-label={t("sx.gp.status")}>
      <h2 className="sx-gside__h">{t("sx.gp.status")}</h2>
      <ul className="sx-gside__stats">
        <li className="sx-gside__stat" data-kind="done">
          <span className="sx-gside__sic">{glyph(CircleCheckIcon, { size: 15 })}</span>
          <span className="sx-gside__sl">{t("sx.guide.done")}</span>
          <span className="sx-gside__sn sx-num">{t("sx.gp.ofTotal", { done, total })}</span>
        </li>
        <li className="sx-gside__stat" data-kind="blocked" data-zero={blocked ? undefined : ""}>
          <span className="sx-gside__sic">{glyph(LockIcon, { size: 15 })}</span>
          <span className="sx-gside__sl">{t("sx.gp.f.blocked")}</span>
          <span className="sx-gside__sn sx-num">{labels.num(blocked)}</span>
        </li>
        {NEED_KINDS.map((k) => {
          const n = counts?.[k] ?? 0;
          const label = t(`sx.hm.chip.${k}`);
          return (
            <li key={k} className="sx-gside__stat" data-kind={k} data-zero={n ? undefined : ""}>
              <span className="sx-gside__sic">{glyph(NEED_ICON[k], { size: 15 })}</span>
              {n > 0 ? (
                <Link href={needHref(k)} className="sx-gside__sl sx-gside__slink" data-ai-id={aiId(BASE, "health", k)} data-ai-type="link" data-ai-label={t(`sx.home.card.${k}`, { n })}>
                  {label}
                </Link>
              ) : (
                <span className="sx-gside__sl">{label}</span>
              )}
              {loading ? <span className="sx-sk sx-gside__sk" aria-hidden="true" /> : <span className="sx-gside__sn sx-num">{labels.num(n)}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
