"use client";

import "./contact-sla.css";
import { type ReactElement, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconClock, IconHourglass } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { useCountdown } from "@/lib/useCountdown";
import type { MarketOrder } from "@/lib/services/marketplace";
import { contactLeftParts, contactSlaState } from "./contactSla";
import { useContactSpeedText } from "./contactSpeed";

// The contact SLA of an order (backend answers 2026-10-31 §1.3), the same on
// the seller's, the client's and the operator's order views: the speed the
// client chose (the backend's contact_speed_label), the time left until
// contact_deadline_at, and when the seller first made contact
// (contact_started_at). The host passes its own fact row, so each view keeps
// its look; `live` is false once the order is finished or cancelled, when
// only the contact time is still told. At zero the order is re-read: the
// backend decides the breach.
type Pick_ = Pick<MarketOrder, "contactSpeed" | "contactSpeedLabel" | "contactDeadlineAt" | "contactStartedAt">;
export type FactRow = (p: { label: string; children: ReactNode }) => ReactElement;

export default function ContactSla({ o, live, Row, onDeadline }: { o: Pick_; live: boolean; Row: FactRow; onDeadline?: () => void }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.contact");
  const to = useTranslations("marketplace.orders");
  const locale = useLocale();
  const speed = useContactSpeedText()(o);
  const counting = live && !o.contactStartedAt && !!o.contactDeadlineAt;
  const left = useCountdown(counting ? o.contactDeadlineAt : "", onDeadline);
  const state = contactSlaState(o, left);
  const when = (iso: string) => shortDateTime(iso, locale);
  if (!speed && !o.contactDeadlineAt && !o.contactStartedAt) return null;
  const parts = left !== null ? contactLeftParts(left) : null;
  const leftText = parts ? (parts.h > 0 ? t("leftHours", { h: parts.h, m: parts.m }) : t("leftClock", { time: parts.clock })) : "";
  return (
    <>
      {speed ? <Row label={to("contactSpeed")}>{speed}</Row> : null}
      {state === "started" ? (
        <Row label={t("started")}>
          <span className="mcs" data-state="started">
            <IconCheck aria-hidden="true" />
            <time dateTime={o.contactStartedAt}>{when(o.contactStartedAt)}</time>
          </span>
        </Row>
      ) : state === "running" || state === "late" ? (
        <Row label={t("deadline")}>
          <span className="mcs" data-state={state}>
            <time dateTime={o.contactDeadlineAt}>{when(o.contactDeadlineAt)}</time>
            {state === "running" && left !== null ? (
              <em className="mcs__left sx-num" role="timer" aria-label={t("leftAria", { time: leftText })} data-warn={left < 300 ? "" : undefined}>
                <IconHourglass aria-hidden="true" />
                {leftText}
              </em>
            ) : (
              <em className="mcs__left" data-late="">
                <IconClock aria-hidden="true" />
                {t("late")}
              </em>
            )}
          </span>
        </Row>
      ) : null}
    </>
  );
}
