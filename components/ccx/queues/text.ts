"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { leadCategoryLabel } from "@/lib/leadLabels";
import { fmtUzs } from "@/lib/money";
import { isGenericTitle } from "../now/feed";
import type { QJob, QKey } from "./model";

export function useQText() {
  const t = useTranslations("admin.ccx.queues");
  const tp = useTranslations("admin.pipeline");
  const tw = useTranslations("callCenter.escalations.why");
  const tk = useTranslations("portal.client.urgent");
  const te = useTranslations("enums");

  return useMemo(() => {
    const queue = (q: QKey) => t(`q.${q}`);
    const title = (j: QJob) => {
      if (j.category !== undefined) return leadCategoryLabel(tp, j.category) || t("untitled");
      if (j.queue === "urgent") return j.serviceKind && tk.has(`kinds.${j.serviceKind}`) ? tk(`kinds.${j.serviceKind}`) : queue("urgent");
      const why = j.whyCode && tw.has(j.whyCode) ? tw(j.whyCode) : "";
      const money = j.amount ? `${fmtUzs(j.amount)} ${te("currency")}` : "";
      const head = j.title && !isGenericTitle(j.title) ? j.title : "";
      return [head, why, money].filter(Boolean).join(" · ") || queue(j.queue);
    };
    return { queue, title };
  }, [t, tp, tw, tk, te]);
}
