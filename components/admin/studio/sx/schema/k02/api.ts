import { http } from "@/lib/http";
import { studioErrorOf } from "@/lib/services/studio";
import { parseServiceSuggest, suggestErrorKey, type ServiceSuggest } from "./model";

export const SERVICE_SUGGEST_PATH = "/studio/services/discovery-terms/suggest";

export async function suggestServiceTerms(body: Record<string, unknown>, signal?: AbortSignal): Promise<ServiceSuggest> {
  return parseServiceSuggest(await http(SERVICE_SUGGEST_PATH, { method: "POST", body: JSON.stringify(body), signal }));
}

export function suggestFailKey(e: unknown): string {
  const se = studioErrorOf(e);
  return suggestErrorKey(se.status, se.code);
}
