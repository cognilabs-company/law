import type { ComponentType, SVGProps } from "react";
import {
  IconAiAnswer,
  IconBriefcase,
  IconCalendar,
  IconCard,
  IconChartBar,
  IconCheckDouble,
  IconClipboardCheck,
  IconClock,
  IconCoins,
  IconCrown,
  IconDocLines,
  IconDocSearch,
  IconDownload,
  IconFileText,
  IconFolder,
  IconGlobe,
  IconGrid,
  IconHeadset,
  IconHistory,
  IconLayers,
  IconLightbulb,
  IconList,
  IconMegaphone,
  IconPackage,
  IconRocket,
  IconSearch,
  IconShield,
  IconSliders,
  IconStarRate,
  IconTarget,
  IconTrendingUp,
  IconUserPlus,
  IconUsers,
} from "@/components/icons";
import { STUDIO_APPROVAL_FREE } from "@/lib/services/studio";

export type StudioIcon = ComponentType<SVGProps<SVGSVGElement>>;
export type StudioGroup = "marketplace" | "documents" | "quality" | "communications" | "finance" | "security" | "operations" | "integrations" | "system";
export type ConstructorMeta = { icon: StudioIcon; group: StudioGroup; i18nKey: string };

export const STUDIO_GROUPS: StudioGroup[] = ["marketplace", "documents", "quality", "communications", "finance", "security", "operations", "integrations", "system"];

export const STUDIO_CODES = [
  "K01",
  "K02",
  "K29",
  "K03-M",
  "K04",
  "K06",
  "K07",
  "K11",
  "K12-PROMO",
  "K15",
  "K16",
  "K19",
  "M1",
  "M2",
  "M3",
  "K17",
  "K18",
  "K23",
  "K24",
  "K26",
  "K28",
  "MP01",
  "MP09",
  "MP10",
  "OPS01",
  "OPS02",
  "OPS04",
  "OPS05",
  "OPS06",
  "OPS07",
  "OPS08",
  "ORG01",
  "SEARCH01",
  "CORE",
] as const;

export const CONSTRUCTOR_META: Record<string, ConstructorMeta> = {
  K01: { icon: IconLightbulb, group: "marketplace", i18nKey: "k01" },
  K02: { icon: IconBriefcase, group: "marketplace", i18nKey: "k02" },
  K29: { icon: IconTrendingUp, group: "marketplace", i18nKey: "k29" },
  "K03-M": { icon: IconPackage, group: "marketplace", i18nKey: "k03m" },
  K04: { icon: IconCoins, group: "marketplace", i18nKey: "k04" },
  K06: { icon: IconDocLines, group: "documents", i18nKey: "k06" },
  K07: { icon: IconFileText, group: "documents", i18nKey: "k07" },
  K11: { icon: IconShield, group: "documents", i18nKey: "k11" },
  "K12-PROMO": { icon: IconMegaphone, group: "marketplace", i18nKey: "k12promo" },
  K15: { icon: IconAiAnswer, group: "system", i18nKey: "k15" },
  K16: { icon: IconFolder, group: "system", i18nKey: "k16" },
  K19: { icon: IconGlobe, group: "marketplace", i18nKey: "k19" },
  M1: { icon: IconTarget, group: "quality", i18nKey: "m1" },
  M2: { icon: IconCheckDouble, group: "quality", i18nKey: "m2" },
  M3: { icon: IconChartBar, group: "system", i18nKey: "m3" },
  CORE: { icon: IconLayers, group: "system", i18nKey: "core" },
  K17: { icon: IconCrown, group: "finance", i18nKey: "k17" },
  K18: { icon: IconCard, group: "finance", i18nKey: "k18" },
  K23: { icon: IconHeadset, group: "communications", i18nKey: "k23" },
  K24: { icon: IconTrendingUp, group: "operations", i18nKey: "k24" },
  K26: { icon: IconDocSearch, group: "documents", i18nKey: "k26" },
  K28: { icon: IconStarRate, group: "marketplace", i18nKey: "k28" },
  MP01: { icon: IconUserPlus, group: "marketplace", i18nKey: "mp01" },
  MP09: { icon: IconRocket, group: "marketplace", i18nKey: "mp09" },
  MP10: { icon: IconCalendar, group: "marketplace", i18nKey: "mp10" },
  OPS01: { icon: IconSliders, group: "operations", i18nKey: "ops01" },
  OPS02: { icon: IconClock, group: "operations", i18nKey: "ops02" },
  OPS04: { icon: IconHistory, group: "operations", i18nKey: "ops04" },
  OPS05: { icon: IconDownload, group: "operations", i18nKey: "ops05" },
  OPS06: { icon: IconChartBar, group: "operations", i18nKey: "ops06" },
  OPS07: { icon: IconList, group: "operations", i18nKey: "ops07" },
  OPS08: { icon: IconClipboardCheck, group: "operations", i18nKey: "ops08" },
  ORG01: { icon: IconUsers, group: "operations", i18nKey: "org01" },
  SEARCH01: { icon: IconSearch, group: "operations", i18nKey: "search01" },
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

export { RETIRED_MOVES, retiredGroupHref, retiredMoveOf, type RetiredMove } from "./retired";
