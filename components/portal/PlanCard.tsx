"use client";

import "./plans1920.css";
import type { CSSProperties, ReactNode } from "react";
import { BadgePercent, CircleCheck, Star } from "lucide-react";
import { IconCheck, IconCrown, IconGem, IconLeaf } from "@/components/icons";

// ── One tariff card for the whole app ──────────────────────────────
// The GM asked for the Tariflar page's card to appear inside the upgrade
// dialog the "Yuklab olish" button opens on Huquqiy hujjatlar. Copying the
// markup across would have been quicker and wrong: this card is not a shape,
// it is a contract — ribbon, tier icon, name, save chips, price, term total,
// usage line, feature list, CTA — and every later change to it would then
// have to be made twice, with nothing to fail if it were made once. The
// dialog and the page now render the SAME element, so they cannot drift, and
// the .splan block in globals.css keeps describing exactly one thing.
//
// The card is deliberately dumb: it is told what to show and what to do, and
// reaches for nothing itself. In particular it never derives a price, because
// the two callers price differently — the page sells a TERM (1/3/6/12 months
// plus the upfront discount; aiPricing() in PlansPanel.tsx owns those rules),
// the dialog sells a backend BILLING PERIOD (monthly / six_month / yearly /
// prepaid_yearly, which is what its buy() actually charges). Both hand over a
// finished price. Anything a caller has no concept of — the seller discount,
// the free plan's usage counter — is left out entirely and simply does not
// render, rather than being passed a zero that would read as a real "−0%".

// Tier icon shown above the plan name (purely presentational — matches
// whichever of the three fixed Tezkor Himoya AI slugs the plan is). Moved here from
// PlansPanel because it is the CARD's furniture: nothing outside a card ever
// asks what a slug looks like. The pricing helpers stayed behind for the
// opposite reason — they are the page's rules, not the card's.
export function tierIcon(slug: string) {
  if (slug === "lexgo-ai-pro") return { Icon: IconCrown, cls: "pro" };
  if (slug === "lexgo-ai-lite") return { Icon: IconGem, cls: "lite" };
  if (slug === "lexgo-ai-free") return { Icon: IconLeaf, cls: "free" };
  return null;
}

// The dashboard's vocabulary (components/portal/dash): a tariff is drawn as a
// picture card — the plan's own navy + blue drawing (public/img/doc-catalog
// Tarif_*) on the light plate the dashboard's area cards use — not a crown,
// gem or leaf in a gold / pastel tile. Any tariff the backend adds later gets
// the nearest picture by its slug, and "Paketlar" when nothing fits.
export function planArt(slug: string): string {
  const s = (slug || "").toLowerCase();
  if (s === "lexgo-ai-free" || /ai.*(free|bepul)/.test(s)) return "Tarif_ai_free";
  if (s === "lexgo-ai-pro" || /ai.*pro/.test(s)) return "Tarif_ai_pro";
  if (s === "lexgo-ai-lite" || /lexgo-ai|(^|-)ai(-|$)/.test(s)) return "Tarif_ai_lite";
  if (/premium/.test(s)) return "Tarif_advokat_premium";
  if (/standart|standard|shaxsiy|personal|advokat|lawyer/.test(s)) return "Tarif_advokat_standart";
  return "Paketlar";
}
/** `--img` for a light plate: the wide picture, or the square one (`sq`). */
export const planPlate = (slug: string, sq = false) =>
  ({ "--img": `url(/img/doc-catalog/${planArt(slug)}${sq ? "-sq" : ""}.webp)` }) as CSSProperties;

// The recommended plan's button is the one thing on a plan grid that is meant
// to be noticed, so it is the flat primary blue (the dashboard has no
// gradients and no glow); every other plan keeps btn--line — if all of them
// shouted, none of them would. It travels with the card so a featured card
// looks featured everywhere.
export const FEATURED_CTA = "btn--pri";

export type PlanCardPrice = {
  /** Headline, already formatted: "49 000", or the free label. */
  amount: string;
  /** Unit under the headline ("so'm / oy"). Absent on a free plan. */
  unit?: string;
  /** The struck-through price a discount replaced. Absent → no strike. */
  was?: string;
};

export type PlanCardCta = {
  label: string;
  /** Absent → a flat, unpressable chip (the page's "Joriy tarif"). */
  onClick?: () => void;
  disabled?: boolean;
  /** "featured" is the gradient unlock button; "soft" marks an owned plan. */
  variant?: "featured" | "line" | "soft";
  icon?: ReactNode;
  /** aria-pressed, for a CTA that toggles a choice rather than committing it. */
  pressed?: boolean;
};

export type PlanCardProps = {
  /** Decides the tier icon and nothing else — the card reads no other field. */
  slug: string;
  name: string;
  features: string[];
  price: PlanCardPrice;
  /** "featured" draws the blue frame; "current" only changes the pill. */
  state?: "plain" | "featured" | "current";
  /** The pill on the picture ("Tavsiya etiladi" / "Joriy tarif"). Absent → none. */
  ribbon?: string;
  /** "12 oy — jami 962 280 so'm". Absent → not shown. */
  totalNote?: string;
  /** Discount chips beside the name, already written out ("−10%"). */
  saves?: string[];
  /** The free plan's "this month you used N of M". Absent → not shown. */
  usage?: string;
  /** Set when the card is one of a set the client picks between. */
  onSelect?: () => void;
  selected?: boolean;
  cta: PlanCardCta;
  aiId?: string;
  planId?: string;
};

const CTA_CLASS: Record<NonNullable<PlanCardCta["variant"]>, string> = {
  featured: FEATURED_CTA,
  line: "btn--line",
  soft: "btn--soft",
};

export default function PlanCard({
  slug,
  name,
  features,
  price,
  state = "plain",
  ribbon,
  totalNote,
  saves,
  usage,
  onSelect,
  selected = false,
  cta,
  aiId,
  planId,
}: PlanCardProps) {
  const frame =
    state === "current" ? " splan--current" : state === "featured" ? " splan--feat" : "";
  // splan--pick only says "this card answers to a click"; splan--sel is the
  // ring that says which one the buy button will charge for.
  const pick = onSelect ? ` splan--pick${selected ? " splan--sel" : ""}` : "";
  const entityType = aiId ? "subscription_plan" : undefined;
  const entityId = aiId ? planId : undefined;
  const entitySlug = aiId ? slug : undefined;

  return (
    <div
      className={`splan plx-plan${frame}${pick}`}
      onClick={onSelect}
      data-ai-target={`plan:${slug}`}
      data-ai-id={aiId}
      data-ai-type={aiId ? "card" : undefined}
      data-ai-entity-type={entityType}
      data-ai-entity-id={entityId}
      data-ai-entity-slug={entitySlug}
    >
      {/* The plan's picture on the dashboard's light plate; "recommended" /
          "your plan" sit on it as the dashboard's status pills. */}
      <span className="plx-plan__art" style={planPlate(slug)}>
        {ribbon ? (
          <span className={`splan__ribbon cx-pill ${state === "current" ? "splan__ribbon--current cx-pill--ok" : "cx-pill--blue"}`}>
            {state === "current" ? <CircleCheck aria-hidden /> : <Star aria-hidden />}
            {ribbon}
          </span>
        ) : null}
      </span>
      <div className="splan__h">
        <b className="splan__name">{name}</b>
      </div>
      {saves?.length ? (
        <div className="plx-plan__saves">
          {saves.map((s, i) => (
            <span className="splan__save cx-pill cx-pill--ok" key={i}>
              <BadgePercent aria-hidden />
              {s}
            </span>
          ))}
        </div>
      ) : null}
      <div className="splan__price">
        <b>{price.amount}</b>
        {price.unit ? <span>{price.unit}</span> : null}
        {price.was ? <s className="splan__was">{price.was}</s> : null}
      </div>
      {totalNote ? <p className="splan__total">{totalNote}</p> : null}
      {usage ? <p className="splan__usage">{usage}</p> : null}
      <ol className="splan__feats" data-ai-id={aiId ? `${aiId}.features` : undefined} data-ai-type={aiId ? "list" : undefined}>
        {features.map((f, k) => (
          <li key={k}>
            <IconCheck />
            {f}
          </li>
        ))}
      </ol>
      {cta.onClick ? (
        <button
          type="button"
          className={`btn ${CTA_CLASS[cta.variant ?? "line"]} btn--full`}
          data-ai-target={`button:buy-plan:${slug}`}
          data-ai-id={aiId ? `${aiId}.buy` : undefined}
          data-ai-entity-type={entityType}
          data-ai-entity-id={entityId}
          data-ai-entity-slug={entitySlug}
          disabled={cta.disabled}
          aria-pressed={cta.pressed}
          onClick={cta.onClick}
        >
          {cta.icon}
          {cta.label}
        </button>
      ) : (
        <span className={`btn ${CTA_CLASS[cta.variant ?? "line"]} btn--full`} aria-disabled>
          {cta.icon}
          {cta.label}
        </span>
      )}
    </div>
  );
}
