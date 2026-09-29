"use client";

import type { ReactNode } from "react";
import { IconCheck, IconCrown, IconGem, IconLeaf, IconStar } from "@/components/icons";

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
// whichever of the three fixed LexGo.AI slugs the plan is). Moved here from
// PlansPanel because it is the CARD's furniture: nothing outside a card ever
// asks what a slug looks like. The pricing helpers stayed behind for the
// opposite reason — they are the page's rules, not the card's.
export function tierIcon(slug: string) {
  if (slug === "lexgo-ai-pro") return { Icon: IconCrown, cls: "pro" };
  if (slug === "lexgo-ai-lite") return { Icon: IconGem, cls: "lite" };
  if (slug === "lexgo-ai-free") return { Icon: IconLeaf, cls: "free" };
  return null;
}

// The recommended plan's button is the one thing on a plan grid that is meant
// to be noticed, so it gets btn--unlock on top of the house btn--grad: a
// blue→cyan gradient painted three times wider than the button, which slides
// on hover, and a crown that fills in with it (globals.css wp-plans). Every
// other plan keeps btn--line — if all of them shouted, none of them would.
// It travels with the card so a featured card looks featured everywhere.
export const FEATURED_CTA = "btn--grad btn--unlock";

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
  /** "current" paints the frame green, "featured" lifts and glows it. */
  state?: "plain" | "featured" | "current";
  /** The banner across the top edge. Absent → no banner. */
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
}: PlanCardProps) {
  const tier = tierIcon(slug);
  const frame =
    state === "current" ? " splan--current" : state === "featured" ? " splan--feat" : "";
  // splan--pick only says "this card answers to a click"; splan--sel is the
  // ring that says which one the buy button will charge for.
  const pick = onSelect ? ` splan--pick${selected ? " splan--sel" : ""}` : "";

  return (
    <div className={`splan${frame}${pick}`} onClick={onSelect}>
      {ribbon ? (
        <span className={`splan__ribbon${state === "current" ? " splan__ribbon--current" : ""}`}>
          {state === "current" ? <IconCheck /> : <IconStar />}
          {ribbon}
        </span>
      ) : null}
      {tier ? (
        <span className={`splan__icon splan__icon--${tier.cls}`}>
          <tier.Icon />
        </span>
      ) : null}
      <div className="splan__h">
        <b className="splan__name">{name}</b>
        {(saves ?? []).map((s, i) => (
          <span className="splan__save" key={i}>
            {s}
          </span>
        ))}
      </div>
      <div className="splan__price">
        <b>{price.amount}</b>
        {price.unit ? <span>{price.unit}</span> : null}
        {price.was ? <s className="splan__was">{price.was}</s> : null}
      </div>
      {totalNote ? <p className="splan__total">{totalNote}</p> : null}
      {usage ? <p className="splan__usage">{usage}</p> : null}
      <ul className="splan__feats">
        {features.map((f, k) => (
          <li key={k}>
            <IconCheck />
            {f}
          </li>
        ))}
      </ul>
      {cta.onClick ? (
        <button
          type="button"
          className={`btn ${CTA_CLASS[cta.variant ?? "line"]} btn--full`}
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
