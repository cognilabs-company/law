"use client";

import "./reassign.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { clockOf, useCountdown } from "@/lib/useCountdown";
import type { MarketOrder } from "@/lib/services/marketplace";
import { glyph, ArrowRightLeftIcon, LockIcon, ShieldCheckIcon, TimerIcon, MessageSquareTextIcon } from "./icons";

// The call center handed this paid order to another specialist, who has not
// accepted yet (contract 2026-10-26 §3.2, §9). The client sees the backend's
// own neutral message — never "searching for a lawyer" and never the
// candidate's name — that the payment stays as it is, and that chat and
// calls open with a fresh room once the specialist accepts. At zero the
// page refetches; the deadline is the backend's.
export default function ReplacementPending({ o, onRefresh }: { o: MarketOrder; onRefresh: () => void }): ReactElement {
  const t = useTranslations("marketplace.orderDetail.replacement");
  const left = useCountdown(o.assignment?.deadlineAt ?? "", onRefresh);
  const counting = left !== null && left > 0;
  return (
    <section className="mrp" aria-labelledby="mrp-title" role="status" aria-live="polite">
      <div className="mrp__glow" aria-hidden="true" />
      <header className="mrp__head">
        <span className="mrp__orb" aria-hidden="true">
          {glyph(ArrowRightLeftIcon, { size: 22 })}
          <i />
        </span>
        <div className="mrp__titles">
          <h2 id="mrp-title">{t("title")}</h2>
          <p>{o.clientMessage || t("message")}</p>
        </div>
        {counting ? (
          <span className="mrp__clock sx-num" role="timer" aria-label={t("left", { time: clockOf(left) })}>
            {glyph(TimerIcon, { size: 14 })}
            {clockOf(left)}
          </span>
        ) : null}
      </header>
      <ul className="mrp__facts">
        <li>
          {glyph(ShieldCheckIcon, { size: 16 })}
          <span>{t("paymentKept")}</span>
        </li>
        <li>
          {glyph(LockIcon, { size: 16 })}
          <span>{t("privacy")}</span>
        </li>
        <li>
          {glyph(MessageSquareTextIcon, { size: 16 })}
          <span>{t("chatLater")}</span>
        </li>
      </ul>
    </section>
  );
}
