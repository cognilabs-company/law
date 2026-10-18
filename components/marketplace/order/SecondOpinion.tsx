"use client";

import "./side.css";
import { useId, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { SxButton, SxLinkButton } from "@/components/admin/studio/sx/Button";
import { aiId } from "@/lib/ai/ids";
import { fmtRating } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import type { MarketOrder, MarketPhase } from "@/lib/services/marketplace";
import type { SecondOpinion as SecondOpinionData, SecondOpinionSeller } from "@/lib/services/marketRuntime";
import { ArrowsClockwiseIcon, SealCheckIcon, StarIcon, StorefrontIcon, glyph } from "./icons";
import { SECTION_ID, type LoadState } from "./types";

export const OPINION_MAX = 6;

const WORK_PHASES: ReadonlySet<MarketPhase> = new Set<MarketPhase>(["in_progress", "review"]);
const DONE_PHASES: ReadonlySet<MarketPhase> = new Set<MarketPhase>(["completed", "rated"]);
const ROLE_KEYS = new Set(["advokat", "yurist", "advokat_tashkiloti"]);

export function opinionVisible(op: SecondOpinionData | null, phase: MarketPhase): boolean {
  if (!op || op.visible === false || op.items.length === 0) return false;
  if (WORK_PHASES.has(phase)) return op.showDuringWork !== false;
  if (DONE_PHASES.has(phase)) return op.showAfterCompletion !== false;
  return false;
}

export function opinionSellers(op: SecondOpinionData | null, currentSellerId: string): SecondOpinionSeller[] {
  if (!op) return [];
  const seen = new Set<string>();
  const out: SecondOpinionSeller[] = [];
  for (const s of op.items) {
    if (!s.sellerUserId || seen.has(s.sellerUserId)) continue;
    if (currentSellerId && s.sellerUserId === currentSellerId) continue;
    seen.add(s.sellerUserId);
    out.push(s);
  }
  return out;
}

export function opinionHref(s: Pick<SecondOpinionSeller, "sellerUserId" | "serviceId">, fallbackServiceId: string): string {
  const serviceId = s.serviceId || fallbackServiceId;
  const base = `/portal/client/lawyers/${encodeURIComponent(s.sellerUserId)}`;
  return serviceId ? `${base}?buy=${encodeURIComponent(serviceId)}` : base;
}

function SellerCard({ s, o, aiBase }: { s: SecondOpinionSeller; o: MarketOrder; aiBase: string }): ReactElement {
  const t = useTranslations("marketplace");
  const td = useTranslations("marketplace.orderDetail.opinion");
  const locale = useLocale();
  const id = aiId(`${aiBase}.second-opinion.seller`, s.sellerUserId);
  const name = s.name || "—";
  return (
    <li className="mso-card" data-ai-id={id} data-ai-type="card" data-ai-label={name} data-ai-entity-type="seller" data-ai-entity-id={s.sellerUserId}>
      <div className="mso-card__head">
        <h3 className="mso-card__name">{name}</h3>
        {ROLE_KEYS.has(s.sellerType) ? <p className="mso-card__role">{t(`roles.${s.sellerType}`)}</p> : null}
      </div>
      {s.verified ? (
        <span className="sx-pill mso-card__verified" data-tone="published" data-size="sm">
          {glyph(SealCheckIcon, { size: 12 })}
          <span className="sx-pill__text">{t("card.verified")}</span>
        </span>
      ) : null}
      <p className="mso-card__rating">
        {s.rating > 0 ? (
          <>
            {glyph(StarIcon, { size: 14, weight: "fill", className: "mso-card__star" })}
            <span className="sx-num">{fmtRating(s.rating, locale)}</span>
            <span className="mso-card__dot" aria-hidden="true">
              ·
            </span>
            <span>{t("card.reviews", { count: s.reviewsCount })}</span>
          </>
        ) : (
          <span>{t("card.newSeller")}</span>
        )}
      </p>
      {s.price > 0 ? <p className="mso-card__price sx-num">{t("card.priceFrom", { price: fmtUzs(s.price) })}</p> : null}
      {s.region ? <p className="mso-card__region">{s.region}</p> : null}
      <div className="mso-card__foot">
        <SxLinkButton href={opinionHref(s, o.serviceId)} size="sm" variant="secondary" icon={StorefrontIcon} aiId={`${id}.view`} aiLabel={td("view")} className="mso-card__view">
          <span aria-hidden="true">{td("view")}</span>
          <span className="sx-vh">{td("viewAria", { name })}</span>
        </SxLinkButton>
      </div>
    </li>
  );
}

export default function SecondOpinion({ o, phase, aiBase, opinion, state, onRetry }: { o: MarketOrder; phase: MarketPhase; aiBase: string; opinion: SecondOpinionData | null; state: LoadState; onRetry: () => void }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail");
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const eligible = WORK_PHASES.has(phase) || DONE_PHASES.has(phase);
  if (!eligible) return null;

  if (!opinion && state === "loading") {
    return (
      <div id={SECTION_ID.opinion} tabIndex={-1} className="mso-wrap mso-wrap--loading" aria-busy="true">
        <div className="sx-sk mso-sk" aria-hidden="true" />
        <p className="sx-vh" role="status">
          {t("opinion.loading")}
        </p>
      </div>
    );
  }

  if (!opinion && state === "error") {
    return (
      <div id={SECTION_ID.opinion} tabIndex={-1} className="mso-wrap">
        <SxNote
          tone="error"
          role="status"
          className="mso-error"
          action={
            <SxButton size="sm" variant="ghost" icon={ArrowsClockwiseIcon} onClick={onRetry} aiId={`${aiBase}.second-opinion.retry`}>
              {t("retry")}
            </SxButton>
          }
        >
          {t("opinion.error")}
        </SxNote>
      </div>
    );
  }

  if (state === "none" || !opinionVisible(opinion, phase)) return null;
  const sellers = opinionSellers(opinion, o.lawyerUserId);
  if (!sellers.length) return null;
  const extra = Math.max(0, sellers.length - OPINION_MAX);
  const shown = expanded ? sellers : sellers.slice(0, OPINION_MAX);

  return (
    <div id={SECTION_ID.opinion} tabIndex={-1} className="mso-wrap">
      <SxPanel title={t("opinion.title")} lead={WORK_PHASES.has(phase) ? t("opinion.leadWork") : t("opinion.leadDone")} aiId={`${aiBase}.second-opinion`} className="mso">
        <p className="mso-note">{t("opinion.note")}</p>
        <ul className="mso-grid" id={listId} role="list">
          {shown.map((s) => (
            <SellerCard key={s.sellerUserId} s={s} o={o} aiBase={aiBase} />
          ))}
        </ul>
        {extra > 0 ? (
          <div className="mso-more">
            <SxButton size="sm" variant="ghost" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((v) => !v)} aiId={`${aiBase}.second-opinion.more`}>
              {expanded ? t("opinion.less") : t("opinion.more", { n: extra })}
            </SxButton>
          </div>
        ) : null}
      </SxPanel>
    </div>
  );
}
