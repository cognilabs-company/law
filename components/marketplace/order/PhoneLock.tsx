"use client";

import "./phoneLock.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { IconLock } from "@/components/icons";
import { phoneWaitsForPayment } from "@/lib/services/clientPhone";

export default function PhoneLock({ reason = "", className, aiId }: { reason?: string; className?: string; aiId?: string }): ReactElement {
  const t = useTranslations("marketplace.phonePrivacy");
  return (
    <span className={`mk-phonelock${className ? ` ${className}` : ""}`} data-ai-id={aiId}>
      <IconLock aria-hidden="true" />
      {phoneWaitsForPayment(reason) ? t("afterPayment") : t("hidden")}
    </span>
  );
}
