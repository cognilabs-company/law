"use client";

import { NextIntlClientProvider, IntlErrorCode, useLocale, useMessages, useTimeZone, useNow, type IntlError } from "next-intl";
import type { ReactNode } from "react";

// Nested inside the server-rendered NextIntlClientProvider (app/[locale]/
// layout.tsx): re-provides the same locale/messages with quiet handling of a
// missing key — dynamic keys (backend statuses, free-text regions…) fall back
// to the last key segment instead of throwing MISSING_MESSAGE to the console.
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

export default function IntlProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const messages = useMessages();
  const timeZone = useTimeZone();
  const now = useNow();
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone} now={now} onError={onError} getMessageFallback={getMessageFallback}>
      {children}
    </NextIntlClientProvider>
  );
}
