"use client";

import { useTranslations } from "next-intl";
import { errDetail } from "@/lib/http";
import { marketErrorCode } from "@/lib/services/marketplace";

export function useMarketError() {
  const t = useTranslations("marketplace.errors");
  return (e: unknown, fallback: string): string => {
    const msg = errDetail(e);
    if (msg) return msg;
    const code = marketErrorCode(e);
    return code && t.has(code) ? t(code) : fallback;
  };
}
