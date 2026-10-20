import { PowerIcon, StickerIcon, TagsIcon, UsersIcon } from "lucide-react";
import {
  BadgePercentIcon,
  BanknoteIcon,
  BracesIcon,
  BriefcaseBusinessIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CodeIcon,
  FIELD_TYPE_ICON,
  FileTextIcon,
  HashIcon,
  ImageIcon,
  LayersIcon,
  LayoutPanelTopIcon,
  LetterTextIcon,
  LinkIcon,
  ListChecksIcon,
  MailIcon,
  MegaphoneIcon,
  PercentIcon,
  PhoneIcon,
  ScrollTextIcon,
  SearchIcon,
  ShieldCheckIcon,
  TextAlignStartIcon,
  TimerIcon,
  ToggleRightIcon,
  TrendingUpIcon,
  UserCheckIcon,
  WorkflowIcon,
} from "../icons";
import type { SxControlKind } from "../contract";
import type { SxIcon } from "../types";

export type SxLook = "neon";

const SECTION_ICON: Readonly<Record<string, SxIcon>> = {
  asosiy: FileTextIcon,
  main: FileTextIcon,
  kontent: LetterTextIcon,
  faollik_va_muddat: CalendarClockIcon,
  narx_va_hisob_kitob: BanknoteIcon,
  qoidalar: ScrollTextIcon,
  kirish_va_auditoriya: UsersIcon,
  jarayon_va_qoidalar: WorkflowIcon,
  status: ToggleRightIcon,
  K02__price: BanknoteIcon,
  K02__requirements: UserCheckIcon,
  K02__delivery: TimerIcon,
  K02__template: FileTextIcon,
  K02__quality: ShieldCheckIcon,
  K02__checklist: ListChecksIcon,
  K02__rules: ScrollTextIcon,
  K02__guarantees: ShieldCheckIcon,
  K02__search: SearchIcon,
  "K03-M__pricing": BadgePercentIcon,
  "K12-PROMO__placement": LayoutPanelTopIcon,
  "K12-PROMO__name": FileTextIcon,
  "K12-PROMO__sale": MegaphoneIcon,
  "K12-PROMO__service": BriefcaseBusinessIcon,
  "K12-PROMO__banner": ImageIcon,
  "K12-PROMO__badge": StickerIcon,
};

export function sectionIcon(id: string): SxIcon {
  return SECTION_ICON[id] ?? LayersIcon;
}

export function sectionLeadKey(id: string): string {
  return `sx.ed2.sec.${id}.lead`;
}

const TITLE_KEY = /^(title|name|label|short_title|display_name)$/;
const DESC_KEY = /(^|_)(description|summary|about|body|text|content)$/;
const MONEY_KEY = /(^|_)(price|amount|cost|fee|sum|budget)(_|$)/;
const PERCENT_KEY = /(percent|pct|rate)(_|$)/;
const TAG_KEY = /(discovery_terms|keywords|tags|synonyms|terms)$/;
const POWER_KEY = /^(is_active|enabled|active|is_enabled)$/;
const DATE_KEY = /(_at|_until|_from|_to|date)$/;
const ADJUST_KEY = /(adjustment_type|adjustment|direction)$/;

export function fieldIcon(key: string, type: string | undefined, control: SxControlKind): SxIcon {
  const k = key.toLowerCase();
  if (control === "checklist") return ListChecksIcon;
  if (control === "factorOverrides") return BadgePercentIcon;
  if (TITLE_KEY.test(k)) return FileTextIcon;
  if (TAG_KEY.test(k) || control === "tags") return TagsIcon;
  if (POWER_KEY.test(k)) return PowerIcon;
  if (ADJUST_KEY.test(k)) return TrendingUpIcon;
  if (control === "percent" || PERCENT_KEY.test(k)) return PercentIcon;
  if (control === "money" || type === "money" || MONEY_KEY.test(k)) return BanknoteIcon;
  if (DESC_KEY.test(k)) return TextAlignStartIcon;
  if (control === "date" || control === "datetime" || DATE_KEY.test(k)) return CalendarDaysIcon;
  if (control === "switch") return ToggleRightIcon;
  if (control === "mono") return k === "slug" ? LinkIcon : CodeIcon;
  if (type === "phone") return PhoneIcon;
  if (type === "email") return MailIcon;
  if (control === "keyValue") return BracesIcon;
  if (control === "number") return HashIcon;
  if (control === "richtext") return LetterTextIcon;
  if (control === "textarea") return TextAlignStartIcon;
  return (type && FIELD_TYPE_ICON[type]) || FIELD_TYPE_ICON.text;
}

export const NEON_WIDE_RO: ReadonlySet<SxControlKind> = new Set<SxControlKind>(["textarea", "richtext", "object", "repeater", "keyValue", "factorOverrides", "checklist"]);
