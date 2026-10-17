import type { StudioCreationJourney, StudioJourneyType } from "@/lib/services/studio";

export const CREATE_HOME_HREF = "/admin/studio/create";

export const JOURNEY_CODE: Readonly<Record<StudioJourneyType, string>> = { service: "K02", package: "K03-M" };

const JOURNEY_TYPES: readonly StudioJourneyType[] = ["service", "package"];
const LOCALE_PREFIX = /^\/(uz|ru|en)(?=[/?#]|$)/i;
const STUDIO_PREFIX = "/admin/studio/";
const SCHEME = /[a-z][a-z0-9+.-]*:/i;
const UNSAFE = /[\\\s\p{Cc}]/u;

export function journeyTypeOfCode(code: string): StudioJourneyType | null {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return null;
  return JOURNEY_TYPES.find((t) => JOURNEY_CODE[t].toUpperCase() === c) ?? null;
}

function fallbackHref(id: string): string {
  return `${CREATE_HOME_HREF}/${encodeURIComponent(String(id ?? ""))}`;
}

export function creationJourneyHref(j: Pick<StudioCreationJourney, "id" | "resumeUrl">): string {
  const raw = typeof j.resumeUrl === "string" ? j.resumeUrl.trim() : "";
  if (!raw) return fallbackHref(j.id);
  const path = raw.replace(LOCALE_PREFIX, "");
  if (!path.startsWith(STUDIO_PREFIX) || path.length === STUDIO_PREFIX.length) return fallbackHref(j.id);
  if (path.includes("..") || path.includes("//") || SCHEME.test(path) || UNSAFE.test(path)) return fallbackHref(j.id);
  return path;
}

export function journeyObjectId(j: Pick<StudioCreationJourney, "context">): string {
  const v = j.context && typeof j.context === "object" ? j.context.studio_object_id : undefined;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}
