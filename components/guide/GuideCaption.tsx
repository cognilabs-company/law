"use client";

import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { IconArrowRight, IconChevronLeft, IconClose } from "@/components/icons";
import RobotAvatar from "./RobotAvatar";
import Typewriter from "./Typewriter";

export default function GuideCaption({
  text,
  busy,
  missing,
  index,
  total,
  onNext,
  onPrev,
  onStop,
}: {
  text: string;
  busy: boolean;
  missing: boolean;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onStop: () => void;
}) {
  const t = useTranslations("guide.ui");
  const locale = useLocale();
  const last = index >= total - 1;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`gcap${busy ? " is-busy" : ""}${missing ? " is-missing" : ""}`} role="region" aria-label={t("narrator")} id="guide-caption">
      <div className="gcap__in">
        <RobotAvatar size={44} mood={busy ? "think" : "talk"} className="gcap__av" />
        <div className="gcap__body">
          <div className="gcap__top">
            <b>{t("narrator")}</b>
            {total > 1 && !busy ? (
              <span className="gcap__count">
                {index + 1}/{total}
              </span>
            ) : null}
          </div>
          <p className="gcap__text">
            {busy ? (
              <span className="gcap__typing">
                <i />
                <i />
                <i />
                <span>{text}</span>
              </span>
            ) : (
              <Typewriter key={`${index}:${text}`} text={text} locale={locale} />
            )}
          </p>
        </div>
        <div className="gcap__acts">
          {index > 0 && !busy ? (
            <button type="button" className="gcap__btn gcap__btn--ghost" onClick={onPrev} aria-label={t("back")}>
              <IconChevronLeft />
              <span>{t("back")}</span>
            </button>
          ) : null}
          {!busy ? (
            <button type="button" className="gcap__btn gcap__btn--pri" onClick={onNext}>
              <span>{missing ? (last ? t("close") : t("skip")) : last ? t("done") : t("next")}</span>
              {last ? null : <IconArrowRight />}
            </button>
          ) : null}
          <button type="button" className="gcap__x" onClick={onStop} aria-label={t("stop")} title={t("stopHint")}>
            <IconClose />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
