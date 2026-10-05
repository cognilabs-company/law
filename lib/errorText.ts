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
  if (e.status === 403) return server || tc("forbidden");
  if (e.status === 404) return server && server !== "Not Found" ? server : tc("notFound");
  if (e.status === 409) return server || tc("conflict");
  if (e.status === 422) return server || Object.values(e.fieldErrors)[0] || tc("serverError");
  if (e.status === 429) return server || tc("rateLimited");
  if (e.status >= 500) {
    const id = requestIdOf(e);
    return id ? `${tc("serverError")} ${tc("requestId", { id })}` : tc("serverError");
  }
  return server || tc("serverError");
}
