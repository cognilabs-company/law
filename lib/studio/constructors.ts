import type { ComponentType, SVGProps } from "react";
import {
  IconAiAnswer,
  IconAward,
  IconBell,
  IconBriefcase,
  IconCalendar,
  IconChartBar,
  IconCheckDouble,
  IconClipboardCheck,
  IconClipboardList,
  IconCoins,
  IconDocLines,
  IconFileText,
  IconFolder,
  IconGlobe,
  IconGrid,
  IconLayers,
  IconLightbulb,
  IconList,
  IconPackage,
  IconShield,
  IconShieldCheck,
  IconTarget,
  IconUsers,
} from "@/components/icons";
import { STUDIO_APPROVAL_FREE } from "@/lib/services/studio";

export type StudioIcon = ComponentType<SVGProps<SVGSVGElement>>;
export type StudioGroup = "marketplace" | "documents" | "quality" | "system";
export type ConstructorMeta = { icon: StudioIcon; group: StudioGroup; i18nKey: string };

export const STUDIO_GROUPS: StudioGroup[] = ["marketplace", "documents", "quality", "system"];

export const STUDIO_CODES = [
  "K01",
  "K02",
  "K03-M",
  "K04",
  "K05",
  "K06",
  "K07",
  "K08",
  "K09",
  "K10",
  "K11",
  "K12-M",
  "K13",
  "K14",
  "K15",
  "K16",
  "K19",
  "K20",
  "M1",
  "M2",
  "M3",
  "CORE",
] as const;

export const CONSTRUCTOR_META: Record<string, ConstructorMeta> = {
  K01: { icon: IconLightbulb, group: "marketplace", i18nKey: "k01" },
  K02: { icon: IconBriefcase, group: "marketplace", i18nKey: "k02" },
  "K03-M": { icon: IconPackage, group: "marketplace", i18nKey: "k03m" },
  K04: { icon: IconCoins, group: "marketplace", i18nKey: "k04" },
  K05: { icon: IconClipboardList, group: "documents", i18nKey: "k05" },
  K06: { icon: IconDocLines, group: "documents", i18nKey: "k06" },
  K07: { icon: IconFileText, group: "documents", i18nKey: "k07" },
  K08: { icon: IconList, group: "quality", i18nKey: "k08" },
  K09: { icon: IconClipboardCheck, group: "quality", i18nKey: "k09" },
  K10: { icon: IconCalendar, group: "quality", i18nKey: "k10" },
  K11: { icon: IconShield, group: "documents", i18nKey: "k11" },
  "K12-M": { icon: IconUsers, group: "marketplace", i18nKey: "k12m" },
  K13: { icon: IconAward, group: "quality", i18nKey: "k13" },
  K14: { icon: IconBell, group: "documents", i18nKey: "k14" },
  K15: { icon: IconAiAnswer, group: "system", i18nKey: "k15" },
  K16: { icon: IconFolder, group: "system", i18nKey: "k16" },
  K19: { icon: IconGlobe, group: "marketplace", i18nKey: "k19" },
  K20: { icon: IconShieldCheck, group: "system", i18nKey: "k20" },
  M1: { icon: IconTarget, group: "quality", i18nKey: "m1" },
  M2: { icon: IconCheckDouble, group: "quality", i18nKey: "m2" },
  M3: { icon: IconChartBar, group: "system", i18nKey: "m3" },
  CORE: { icon: IconLayers, group: "system", i18nKey: "core" },
};

export const FALLBACK_META: ConstructorMeta = { icon: IconGrid, group: "system", i18nKey: "" };

export function ctorMeta(code: string): ConstructorMeta {
  return CONSTRUCTOR_META[code] ?? CONSTRUCTOR_META[code.toUpperCase()] ?? FALLBACK_META;
}

export function ctorOrder(code: string): number {
  const i = (STUDIO_CODES as readonly string[]).indexOf(code);
  return i < 0 ? STUDIO_CODES.length : i;
}

export const approvalFreeCodes: string[] = STUDIO_APPROVAL_FREE;
