import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { ApiError, contactBlockedOf, errDetail, errorCode, isCodeLike } from "./http";

export { errorCode, isCodeLike } from "./http";

// `has` is next-intl's own check (useTranslations("common").has): with it a
// known code is read from common.apiErrors.<code>.
type Tr = ((key: string, values?: Record<string, string | number>) => string) & { has?: (key: string) => boolean };
// Code → ready (already localized) message, for a screen's own codes.
export type CodeMessages = Partial<Record<string, string>>;

export function requestIdOf(e: unknown): string {
  if (!(e instanceof ApiError)) return "";
  const v = e.data.request_id ?? e.data.requestId;
  return typeof v === "string" ? v : "";
}

// The localized message for a backend code ('' when it isn't known): the
// screen's own map first, then the shared common.apiErrors table.
export function codeText(code: string, tc: Tr, codes?: CodeMessages): string {
  if (!code) return "";
  const own = codes?.[code];
  if (own) return own;
  const key = `apiErrors.${code}`;
  return tc.has?.(key) ? tc(key) : "";
}

// The words for a status when there is no usable server text.
function statusText(e: ApiError, tc: Tr): string {
  if (e.status === 401) return tc("loginRequired");
  if (e.status === 403) return tc("forbidden");
  if (e.status === 404) return tc("notFound");
  if (e.status === 409) return tc("conflict");
  if (e.status === 413) return tc("fileTooBig");
  if (e.status === 415) return tc("unsupportedFile");
  if (e.status === 429) return tc("rateLimited");
  if (e.status === 503) return tc("serviceUnavailable");
  if (e.status >= 500) {
    const id = requestIdOf(e);
    return id ? `${tc("serverError")} ${tc("requestId", { id })}` : tc("serverError");
  }
  return tc("serverError");
}

// The one message to show for a failed request. Backend answers 2026-10-31
// §6.3: a known code is localized; an unknown code gets the safe generic
// message for its status — a raw code is never shown. Without a code the
// backend's own words are kept wherever it sent any (10-13 spec §6); ours
// stand in only when it sent none.
export function errorText(e: unknown, tc: Tr, codes?: CodeMessages): string {
  if (contactBlockedOf(e)) return tc("contactBlocked");
  if (!(e instanceof ApiError)) return tc("serverError");
  if (e.status === 0) return e.detail === "aborted" ? "" : tc("offline");
  const code = errorCode(e);
  if (code) return codeText(code, tc, codes) || statusText(e, tc);
  const server = errDetail(e);
  if (e.status === 404) return server && server !== "Not Found" ? server : tc("notFound");
  if (e.status === 422) {
    const field = Object.values(e.fieldErrors)
      .map((m) => m.replace(/^value error,\s*/i, "").trim())
      .find((m) => m && !isCodeLike(m));
    return server || field || tc("serverError");
  }
  if (e.status >= 500 && e.status !== 503) return statusText(e, tc);
  return server || statusText(e, tc);
}

// errorText bound to the "common" messages: `const errText = useErrorText();
// errText(e)` or `errText(e, { some_code: t("someCode") })` for a screen's
// own codes.
export function useErrorText(codes?: CodeMessages): (e: unknown, more?: CodeMessages) => string {
  const tc = useTranslations("common");
  return useCallback((e: unknown, more?: CodeMessages) => errorText(e, tc, more ? { ...codes, ...more } : codes), [tc, codes]);
}
