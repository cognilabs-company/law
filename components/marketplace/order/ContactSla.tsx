"use client";

import "./contact-sla.css";
import { type ReactElement, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconChat, IconCheck, IconClock, IconHourglass, IconInfo, IconPaperclip, IconPhone, IconVideo } from "@/components/icons";
import { useCountdown } from "@/lib/useCountdown";
import type { MarketOrder } from "@/lib/services/marketplace";
import { contactChannelOf, contactLeftParts, contactSlaState, tashkentDateTime, type ContactChannel } from "./contactSla";
import { useContactSpeedText } from "./contactSpeed";

// The contact SLA of an order (backend answers 2026-10-31 §1.3), the same on
// the seller's, the client's and the operator's order views: the speed the
// client chose (the backend's contact_speed_label), the time left until
// contact_deadline_at, and when the seller first made contact
// (contact_started_at). The host passes its own fact row, so each view keeps
// its look; `live` is false once the order is finished or cancelled, when
// only the contact time is still told. At zero the order is re-read: the
// backend decides the breach.
//
// Backend answers 2026-11-01: only the seller's first chat message, file,
// or audio/video call in the paid order's room is contact (N1) — opening the
// phone number, accepting or starting the work is not, so an order can be in
// progress with no contact yet, and the rows say so. Times are UTC, shown in
// Tashkent time with the zone named (N2); "today" is a 12-hour duration, so
// the exact deadline is always shown beside the speed.
type Pick_ = Pick<MarketOrder, "contactSpeed" | "contactSpeedLabel" | "contactDeadlineAt" | "contactStartedAt" | "contactStartedChannel" | "startedAt">;
export type FactRow = (p: { label: string; children: ReactNode }) => ReactElement;

const CHANNEL_ICON: Record<ContactChannel, ReactElement> = {
  chat: <IconChat aria-hidden="true" />,
  chat_file: <IconPaperclip aria-hidden="true" />,
  audio: <IconPhone aria-hidden="true" />,
  video: <IconVideo aria-hidden="true" />,
};

export default function ContactSla({ o, live, Row, onDeadline }: { o: Pick_; live: boolean; Row: FactRow; onDeadline?: () => void }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.contact");
  const to = useTranslations("marketplace.orders");
  const locale = useLocale();
  const speed = useContactSpeedText()(o);
  const counting = live && !o.contactStartedAt && !!o.contactDeadlineAt;
  const left = useCountdown(counting ? o.contactDeadlineAt : "", onDeadline);
  const state = contactSlaState(o, left);
  if (!speed && !o.contactDeadlineAt && !o.contactStartedAt) return null;
  const parts = left !== null ? contactLeftParts(left) : null;
  const leftText = parts ? (parts.h > 0 ? t("leftHours", { h: parts.h, m: parts.m }) : t("leftClock", { time: parts.clock })) : "";
  const channel = contactChannelOf(o.contactStartedChannel);
  const at = (iso: string) => (
    <>
      <time dateTime={iso}>{tashkentDateTime(iso, locale) || iso}</time>
      <small className="mcs__zone">{t("zone")}</small>
    </>
  );
  return (
    <>
      {speed ? (
        <Row label={to("contactSpeed")}>
          {speed}
          {state === "running" || state === "late" ? <small className="mcs__hint">{t("exactBelow")}</small> : null}
        </Row>
      ) : null}
      {state === "started" ? (
        <Row label={t("started")}>
          <span className="mcs" data-state="started">
            <IconCheck aria-hidden="true" />
            {at(o.contactStartedAt)}
            {channel ? (
              <em className="mcs__via" data-channel={channel}>
                {CHANNEL_ICON[channel]}
                {t(`channels.${channel}`)}
              </em>
            ) : null}
          </span>
        </Row>
      ) : state === "running" || state === "late" ? (
        <Row label={t("deadline")}>
          <span className="mcs" data-state={state}>
            {at(o.contactDeadlineAt)}
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
          <span className="mcs__none" data-state={state} role="note">
            <IconInfo aria-hidden="true" />
            <span>
              <b>{o.startedAt ? t("noneWorking") : t("noneYet")}</b>
              <span>{t("countsAs")}</span>
            </span>
          </span>
        </Row>
      ) : null}
    </>
  );
}
