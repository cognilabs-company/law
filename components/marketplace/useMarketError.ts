"use client";

import { useTranslations } from "next-intl";
import { errDetail } from "@/lib/http";
import { marketErrorCode } from "@/lib/services/marketplace";
import { isRuntimeErrorCode, marketErrorParams } from "@/lib/services/marketRuntime";

export function useMarketError() {
  const t = useTranslations("marketplace.errors");
  return (e: unknown, fallback: string): string => {
    const code = marketErrorCode(e);
    if (code && isRuntimeErrorCode(code) && t.has(code)) return t(code, marketErrorParams(e));
    const msg = errDetail(e);
    if (msg) return msg;
    return code && t.has(code) ? t(code, marketErrorParams(e)) : fallback;
  };
}
