"use client";

import { useLocale, useTranslations } from "next-intl";
import { fmtDateTime } from "@/lib/date";
import { isReturn, type TaskStatus } from "@/lib/services/taskManagement";
import { hm } from "./model";

export function useTx() {
  const t = useTranslations("teamTasks");
  const x = useTranslations("admin.ccx.tasks");
  const locale = useLocale();
  const status = (s: TaskStatus | "") => (s ? t(`status.${s}`) : "");
  const when = (iso: string) => (iso ? fmtDateTime(iso, locale) : "");
  const act = (from: TaskStatus, to: TaskStatus) => (isReturn(from, to) ? t("act.return") : t(`act.${to}`));
  const due = (iso: string, now: number) => {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    if (!now) return fmtDateTime(iso, locale);
    const ref = new Date(now);
    const day = (v: Date) => new Date(v.getFullYear(), v.getMonth(), v.getDate()).getTime();
    const diff = Math.round((day(d) - day(ref)) / 86_400_000);
    const time = hm(d);
    if (diff === 0) return t("due.today", { time });
    if (diff === 1) return t("due.tomorrow", { time });
    if (diff === -1) return t("due.yesterday", { time });
    return fmtDateTime(iso, locale, d.getFullYear() !== ref.getFullYear());
  };
  return { t, x, locale, status, when, act, due };
}
