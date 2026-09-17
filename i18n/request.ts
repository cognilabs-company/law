import { getRequestConfig } from "next-intl/server";
import { hasLocale, IntlErrorCode } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Same quiet missing-key handling as components/IntlProvider (client).
    onError(err) {
      if (err.code === IntlErrorCode.MISSING_MESSAGE) {
        if (process.env.NODE_ENV !== "production") console.warn(`[i18n] ${err.message}`);
        return;
      }
      console.error(err);
    },
    getMessageFallback({ key, namespace }) {
      const last = key.split(".").pop() ?? key;
      return process.env.NODE_ENV === "production" ? last.replace(/[_-]+/g, " ") : `${namespace ? `${namespace}.` : ""}${key}`;
    },
  };
});
