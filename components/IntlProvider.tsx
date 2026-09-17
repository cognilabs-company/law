"use client";

import { NextIntlClientProvider, IntlErrorCode, type AbstractIntlMessages, type IntlError } from "next-intl";
import type { ReactNode } from "react";

// Client-side intl provider with quiet handling of a missing key: dynamic
// keys (backend statuses, free-text regions…) fall back to the last key
// segment instead of throwing a red MISSING_MESSAGE into the console.
function onError(err: IntlError) {
  if (err.code === IntlErrorCode.MISSING_MESSAGE) {
    if (process.env.NODE_ENV !== "production") console.warn(`[i18n] ${err.message}`);
    return;
  }
  console.error(err);
}
function getMessageFallback({ key, namespace }: { key: string; namespace?: string; error: IntlError }) {
  const last = key.split(".").pop() ?? key;
  return process.env.NODE_ENV === "production" ? last.replace(/[_-]+/g, " ") : `${namespace ? `${namespace}.` : ""}${key}`;
}

export default function IntlProvider({ locale, messages, children }: { locale: string; messages: AbstractIntlMessages; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} onError={onError} getMessageFallback={getMessageFallback}>
      {children}
    </NextIntlClientProvider>
  );
}
