"use client";

import { useLocale, useTranslations } from "next-intl";
import { humanize } from "@/lib/labels";
import type { HrmField, HrmModule, HrmType } from "@/lib/services/hrm";

// Names for what the catalog defines. The backend writes them in Uzbek;
// Russian and English read our dictionary where it has the key and the
// backend's words otherwise, so a record type added tomorrow still shows.
export function useHrmText() {
  const t = useTranslations("internal.hrmc");
  const locale = useLocale();
  const pick = (key: string, backend: string, fallback = "") => (locale !== "uz" && t.has(key) ? t(key) : backend || (t.has(key) ? t(key) : fallback));
  return {
    t,
    locale,
    module: (m: HrmModule | null, key = "") => pick(`modules.${m?.key ?? key}.title`, m?.title ?? "", humanize(m?.key ?? key)),
    moduleLead: (key: string) => (t.has(`modules.${key}.lead`) ? t(`modules.${key}.lead`) : ""),
    type: (ty: HrmType | null, domain = "", key = "") => pick(`types.${ty?.domain ?? domain}.${ty?.key ?? key}`, ty?.title ?? "", humanize(ty?.key ?? key)),
    field: (f: HrmField) => pick(`fields.${f.key}`, f.label, humanize(f.key)),
    option: (v: string) => (t.has(`options.${v}`) ? t(`options.${v}`) : humanize(v)),
  };
}

// The modules grouped the way HR people think of them.
export const HRM_GROUPS: { key: string; domains: string[] }[] = [
  { key: "people", domains: ["people", "employment", "documents", "skills"] },
  { key: "time", domains: ["scheduling", "attendance", "timesheet", "leave", "travel"] },
  { key: "work", domains: ["tasks", "workflow", "payroll"] },
  { key: "lifecycle", domains: ["recruiting", "onboarding", "offboarding", "movements"] },
  { key: "company", domains: ["policies", "lms", "notifications", "analytics"] },
];

// Where each module lives. Ten of them kept the address they had before
// the catalog; the rest sit under /internal/hrm.
export const HRM_ROUTE: Record<string, string> = {
  leave: "/internal/leave",
  travel: "/internal/travel",
  recruiting: "/internal/recruiting",
  onboarding: "/internal/onboarding",
  offboarding: "/internal/offboarding",
  movements: "/internal/movements",
  policies: "/internal/policies",
  lms: "/internal/learning",
  documents: "/internal/documents",
  skills: "/internal/skills",
};
export const hrmRoute = (domain: string) => HRM_ROUTE[domain] ?? `/internal/hrm/${domain}`;
