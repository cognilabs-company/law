"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { StatusPill } from "../StatusPill";
import { journeyStatusOf } from "./journeyApi";

const TONE_STATUS = { draft: "draft", completed: "published", abandoned: "rejected", archived: "archived" } as const;

export function JourneyStatusPill({ status, size = "md" }: { status: string; size?: "sm" | "md" }): ReactElement {
  const t = useTranslations("studio");
  const s = journeyStatusOf(status) || "draft";
  return <StatusPill status={TONE_STATUS[s]} size={size} label={t(`sx.journeyRun.status.${s}`)} className="sx-jr-status" />;
}
