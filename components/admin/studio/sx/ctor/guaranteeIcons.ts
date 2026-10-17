import { ArrowsClockwiseIcon, CertificateIcon, ChatCircleTextIcon, ClockIcon, HeadsetIcon, LockSimpleIcon, MedalIcon, MoneyIcon, ScalesIcon, SealCheckIcon, ShieldCheckIcon } from "../icons";
import type { SxIcon } from "../types";

const row = (key: string, icon: SxIcon): { key: string; icon: SxIcon; labelKey: string } => ({ key, icon, labelKey: `sx.gicon.${key}` });

export const GUARANTEE_ICONS: readonly { key: string; icon: SxIcon; labelKey: string }[] = [
  row("shield_check", ShieldCheckIcon),
  row("money_back", MoneyIcon),
  row("on_time", ClockIcon),
  row("privacy", LockSimpleIcon),
  row("verified", SealCheckIcon),
  row("legal", ScalesIcon),
  row("rework", ArrowsClockwiseIcon),
  row("support", HeadsetIcon),
  row("chat", ChatCircleTextIcon),
  row("quality", MedalIcon),
  row("document", CertificateIcon),
];
