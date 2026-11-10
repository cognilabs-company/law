"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { leadCategoryLabel } from "@/lib/leadLabels";
import { isGenericTitle, type NowJob } from "./feed";

const COCKPIT_TAB: Record<string, string> = {
  assignments: "escalations",
  complaints: "mpComplaints",
  refunds: "escalations",
  payouts: "payouts",
  payout_recoveries: "payouts",
  experience: "experience",
  achievements: "achievements",
};

export function queueHref(job: NowJob): string {
  if (job.kind === "urgent") return `/admin/call-center?view=urgent&id=${encodeURIComponent(job.id)}`;
  if (!job.cockpit) return "/admin/call-center?view=queues";
  const tab = job.kind === "complaints" && job.cockpit.quality ? "complaints" : (COCKPIT_TAB[job.kind] ?? "cockpit");
  return `/admin/call-center?tab=${tab}`;
}

export function useJobText() {
  const t = useTranslations("admin.ccx.now");
  const tp = useTranslations("admin.pipeline");
  const tc = useTranslations("callCenter.cockpit");
  const tw = useTranslations("callCenter.escalations.why");

  return useMemo(() => {
    const kind = (j: NowJob) => t(`kind.${j.kind}`);
    const reason = (j: NowJob) => {
      const r = j.cockpit?.reason ?? "";
      if (!r) return "";
      if (tw.has(r)) return tw(r);
      return tc.has(`reason.${r}`) ? tc(`reason.${r}`) : "";
    };
    const title = (j: NowJob) => {
      if (j.kind === "lead") return leadCategoryLabel(tp, j.title) || kind(j);
      if (j.cockpit) return j.title || reason(j) || kind(j);
      return isGenericTitle(j.title) ? kind(j) : j.title;
    };
    return { kind, title, reason };
  }, [t, tp, tc, tw]);
}
