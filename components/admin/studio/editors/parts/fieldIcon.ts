import { createElement, type ComponentType, type ReactElement, type SVGProps } from "react";
import { studioReferenceKey, type StudioSchemaField } from "@/lib/services/studio";
import {
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconChartBar,
  IconCheckDouble,
  IconClipboardCheck,
  IconClipboardList,
  IconClock,
  IconCoins,
  IconDocLines,
  IconEdit,
  IconFileText,
  IconFolder,
  IconGem,
  IconGlobe,
  IconGrid,
  IconImage,
  IconLanguage,
  IconLayers,
  IconList,
  IconLock,
  IconMail,
  IconMegaphone,
  IconPackage,
  IconPaperclip,
  IconPhone,
  IconPower,
  IconScale,
  IconSearch,
  IconShieldCheck,
  IconSliders,
  IconUser,
  IconUsers,
} from "@/components/icons";

export type FieldIcon = ComponentType<SVGProps<SVGSVGElement>>;

const BY_SOURCE: [RegExp, FieldIcon][] = [
  [/document|template/, IconFileText],
  [/consent/, IconShieldCheck],
  [/service-categor|categor/, IconFolder],
  [/service-package|package/, IconPackage],
  [/service/, IconBriefcase],
  [/promotion/, IconMegaphone],
  [/studio/, IconLayers],
  [/user/, IconUser],
  [/plan|subscription/, IconGem],
  [/role|permission/, IconLock],
  [/organi[sz]ation|unit/, IconBuilding],
];

const word = (words: string) => new RegExp(`(^|_)(${words})(_|$)`);
const BY_KEY: [RegExp, FieldIcon][] = [
  [word("price|prices|amount|fee|fees|cost|sum|total|salary|budget|tariff"), IconCoins],
  [word("lang|langs|language|languages|locale|locales"), IconLanguage],
  [word("image|images|banner|photo|logo|icon|avatar|cover"), IconImage],
  [word("phone|tel|mobile"), IconPhone],
  [word("email|mail"), IconMail],
  [word("url|link|links|webhook|href|site|website|domain"), IconGlobe],
  [word("file|files|attachment|attachments|upload"), IconPaperclip],
  [/(_at|_date|_on|_until|_deadline)$|^(date|until|deadline)$/, IconCalendar],
  [word("days|hours|minutes|seconds|duration|timeout|sla|ttl"), IconClock],
];

const BY_TYPE: Record<string, FieldIcon> = {
  text: IconEdit,
  textarea: IconDocLines,
  richtext: IconDocLines,
  code: IconSliders,
  number: IconChartBar,
  money: IconCoins,
  boolean: IconPower,
  date: IconCalendar,
  datetime: IconClock,
  select: IconList,
  multiselect: IconCheckDouble,
  list: IconClipboardList,
  object: IconLayers,
  url: IconGlobe,
  email: IconMail,
  file: IconPaperclip,
};

function fieldIcon(f: Pick<StudioSchemaField, "key" | "type" | "source"> & { item?: Pick<StudioSchemaField, "source"> | null }): FieldIcon {
  const source = f.source || f.item?.source || "";
  if (source) {
    const key = studioReferenceKey(source).key;
    return BY_SOURCE.find(([re]) => re.test(key))?.[1] ?? IconSearch;
  }
  if (f.type === "money" || f.type === "date" || f.type === "datetime" || f.type === "boolean") return BY_TYPE[f.type];
  const byKey = BY_KEY.find(([re]) => re.test(f.key.toLowerCase()))?.[1];
  return byKey ?? BY_TYPE[f.type] ?? IconEdit;
}

const BY_SECTION: [RegExp, FieldIcon][] = [
  [/asosiy|umumiy|основ|общ|main|basic|general/i, IconGrid],
  [/kontent|matn|контент|текст|content|text/i, IconDocLines],
  [/narx|hisob|to.lov|цен|оплат|расч|price|pricing|billing|payment/i, IconCoins],
  [/kirish|auditor|доступ|аудитор|access|audience/i, IconUsers],
  [/jarayon|процесс|process|workflow|step/i, IconClipboardCheck],
  [/faollik|muddat|актив|срок|activity|schedule|period|time/i, IconClock],
  [/qoida|правил|rule|polic/i, IconScale],
];

function sectionIcon(...names: string[]): FieldIcon {
  const text = names.filter(Boolean).join(" ");
  return BY_SECTION.find(([re]) => re.test(text))?.[1] ?? IconLayers;
}

export function fieldGlyph(f: Parameters<typeof fieldIcon>[0]): ReactElement {
  return createElement(fieldIcon(f), { "aria-hidden": true });
}

export function sectionGlyph(...names: string[]): ReactElement {
  return createElement(sectionIcon(...names), { "aria-hidden": true });
}
