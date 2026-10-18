import { RefreshCwIcon, AwardIcon, MessageSquareTextIcon, ClockIcon, HeadsetIcon, LockIcon, MedalIcon, BanknoteIcon, ScaleIcon, BadgeCheckIcon, ShieldCheckIcon } from "../icons";
import type { SxIcon } from "../types";

const row = (key: string, icon: SxIcon): { key: string; icon: SxIcon; labelKey: string } => ({ key, icon, labelKey: `sx.gicon.${key}` });

export const GUARANTEE_ICONS: readonly { key: string; icon: SxIcon; labelKey: string }[] = [
  row("shield_check", ShieldCheckIcon),
  row("money_back", BanknoteIcon),
  row("on_time", ClockIcon),
  row("privacy", LockIcon),
  row("verified", BadgeCheckIcon),
  row("legal", ScaleIcon),
  row("rework", RefreshCwIcon),
  row("support", HeadsetIcon),
  row("chat", MessageSquareTextIcon),
  row("quality", MedalIcon),
  row("document", AwardIcon),
];
