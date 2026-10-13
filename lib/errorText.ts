import { ApiError, contactBlockedOf, errDetail } from "./http";

type Tr = (key: string, values?: Record<string, string | number>) => string;

export function requestIdOf(e: unknown): string {
  if (!(e instanceof ApiError)) return "";
  const v = e.data.request_id ?? e.data.requestId;
  return typeof v === "string" ? v : "";
}

export function errorText(e: unknown, tc: Tr): string {
  if (contactBlockedOf(e)) return tc("contactBlocked");
  if (!(e instanceof ApiError)) return tc("serverError");
  if (e.status === 0) return e.detail === "aborted" ? "" : tc("offline");
  const server = errDetail(e);
  // The backend's own words are kept wherever it sent any (10-13 spec §6);
  // ours stand in only when it sent none.
  if (e.status === 401) return server || tc("loginRequired");
  if (e.status === 403) return server || tc("forbidden");
  if (e.status === 404) return server && server !== "Not Found" ? server : tc("notFound");
  if (e.status === 409) return server || tc("conflict");
  if (e.status === 422) return server || Object.values(e.fieldErrors)[0] || tc("serverError");
  if (e.status === 413) return server || tc("fileTooBig");
  if (e.status === 415) return server || tc("unsupportedFile");
  if (e.status === 429) return server || tc("rateLimited");
  if (e.status === 503) return server || tc("serviceUnavailable");
  if (e.status >= 500) {
    const id = requestIdOf(e);
    return id ? `${tc("serverError")} ${tc("requestId", { id })}` : tc("serverError");
  }
  return server || tc("serverError");
}
