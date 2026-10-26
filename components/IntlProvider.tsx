"use client";

import { NextIntlClientProvider, IntlErrorCode, useLocale, useTimeZone, useNow, type AbstractIntlMessages, type IntlError } from "next-intl";
import { use, type ReactNode } from "react";

// Nested inside the server-rendered NextIntlClientProvider (app/[locale]/
// layout.tsx): re-provides the same locale with the messages and quiet
// handling of a missing key — dynamic keys (backend statuses, free-text
// regions…) fall back to the last key segment instead of throwing
// MISSING_MESSAGE to the console.
//
// The messages (~1 MB per locale) are loaded here as their own content-hashed
// chunk, NOT passed down from the server layout: as a layout prop they were
// serialized into every page's HTML and again into the layout's RSC prefetch
// (~300 KB gzip each, twice per cold visit), and never cached across visits.
// A chunk is downloaded once and then served from the browser cache.
const LOADERS: Record<string, () => Promise<{ default: object }>> = {
  uz: () => import("@/messages/uz.json"),
  ru: () => import("@/messages/ru.json"),
  en: () => import("@/messages/en.json"),
};
type Tracked = Promise<AbstractIntlMessages> & { status?: "fulfilled"; value?: AbstractIntlMessages };
const loaded = new Map<string, Tracked>();
function messagesFor(locale: string): Promise<AbstractIntlMessages> {
  let p = loaded.get(locale);
  if (!p) {
    const load = LOADERS[locale] ?? LOADERS.uz;
    const next: Tracked = load().then((m) => m.default as AbstractIntlMessages);
    // Marked the way React's use() reads it, so a resolved load never
    // suspends again (locale switches, remounts).
    next.then(
      (v) => {
        next.status = "fulfilled";
        next.value = v;
      },
      () => loaded.delete(locale),
    );
    loaded.set(locale, next);
    p = next;
  }
  return p;
}
// Start the download as soon as this module runs, before React renders the
// provider: one step less between the main bundle and hydration.
if (typeof document !== "undefined" && document.documentElement.lang) void messagesFor(document.documentElement.lang);

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
  const messages = use(messagesFor(locale));
  const timeZone = useTimeZone();
  const now = useNow();
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone} now={now} onError={onError} getMessageFallback={getMessageFallback}>
      {children}
    </NextIntlClientProvider>
  );
}
