"use client";

import { useTranslations } from "next-intl";
import type { RuntimeDuration } from "@/lib/services/marketRuntime";
import { IconClock } from "@/components/icons";
import { durationParts, durationStart } from "./facts";
import "./runtime.css";

export function useDurationText(): (d: RuntimeDuration) => string {
  const t = useTranslations("marketplace.runtime");
  return (d: RuntimeDuration) => {
    const p = durationParts(d);
    if (!p) return "";
    const base = p.key === "other" ? t("duration.other", { n: p.n, unit: p.unit }) : t(`duration.${p.key}`, { n: p.n });
    return p.business && p.key !== "businessDay" ? t("duration.inBusiness", { value: base }) : base;
  };
}

function useDurationNotes() {
  const t = useTranslations("marketplace.runtime");
  return (d: RuntimeDuration) => {
    const start = durationStart(d);
    const p = durationParts(d);
    const startText = start === "afterAccept" ? t("startsAfterAccept") : start === "afterPayment" ? t("startsAfterPayment") : "";
    const startNote = start === "afterAccept" ? t("startNote") : start === "afterPayment" ? t("startNotePayment") : "";
    const calNote = p?.business ? t("businessNote") : t("calendarNote");
    return { startText, note: [startNote, calNote].filter(Boolean).join(" "), label: t("durationLabel") };
  };
}

export function DurationChip({ duration, tone, start }: { duration: RuntimeDuration; tone: "row" | "side" | "ticket" | "assist"; start?: boolean }) {
  const text = useDurationText()(duration);
  const notes = useDurationNotes()(duration);
  if (!text) return null;
  const startText = start && notes.startText ? notes.startText : "";
  const lead = <span className="sr-only">{`${notes.label}: `}</span>;
  if (tone === "row") {
    return (
      <span className="mk-eta mkrt-dur" title={notes.note}>
        <IconClock aria-hidden="true" />
        {lead}
        {text}
      </span>
    );
  }
  if (tone === "side") {
    return (
      <span className="mk-side__eta mkrt-dur mkrt-dur--side">
        <IconClock aria-hidden="true" />
        <span>
          {lead}
          <b>{text}</b>
          {startText ? ` · ${startText}` : null}
          <small>{notes.note}</small>
        </span>
      </span>
    );
  }
  if (tone === "ticket") {
    return (
      <span className="mk-buy__eta mkrt-dur mkrt-dur--ticket" title={notes.note}>
        <IconClock aria-hidden="true" />
        <span>
          {lead}
          {text}
          {startText ? ` · ${startText}` : null}
          <span className="sr-only">{`. ${notes.note}`}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="mkrt-dur mkrt-dur--assist">
      <IconClock aria-hidden="true" />
      <span>
        {lead}
        <b>{text}</b>
        {startText ? ` · ${startText}` : null}
        <small>{notes.note}</small>
      </span>
    </span>
  );
}
