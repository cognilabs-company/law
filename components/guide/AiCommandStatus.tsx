"use client";

import { useSyncExternalStore, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { cmdStatusServerSnapshot, cmdStatusSnapshot, subscribeCmdStatus } from "@/lib/ai/commands";
import type { CmdStatus } from "@/lib/ai/types";
import { IconAlert, IconCheck, IconClock, IconClose, IconRefresh } from "@/components/icons";

export type ChipCommand = { id: string; type: string };

const HIDDEN_TYPES = new Set(["show_steps", "support_handoff"]);

const ICONS: Record<Exclude<CmdStatus, "skipped">, ComponentType> = {
  pending: IconClock,
  running: IconRefresh,
  done: IconCheck,
  missing: IconAlert,
  failed: IconAlert,
  cancelled: IconClose,
};

export default function AiCommandStatus({ commands }: { commands: ChipCommand[] }) {
  const t = useTranslations("portal.aiAssistant.v21");
  const snap = useSyncExternalStore(subscribeCmdStatus, cmdStatusSnapshot, cmdStatusServerSnapshot);
  const chips = commands
    .filter((c) => !HIDDEN_TYPES.has(c.type))
    .map((c) => ({ c, st: snap.get(c.id) }))
    .filter((x): x is { c: ChipCommand; st: { status: Exclude<CmdStatus, "skipped">; reason: string } } => Boolean(x.st) && x.st?.status !== "skipped");
  if (!chips.length) return null;
  return (
    <ul className="aicmds" aria-label={t("chips")} aria-live="polite">
      {chips.map(({ c, st }) => {
        const Icon = ICONS[st.status];
        const kind = t.has(`cmd.${c.type}`) ? t(`cmd.${c.type}`) : t("cmd.unknown");
        const reason = st.reason && t.has(`reason.${st.reason}`) ? t(`reason.${st.reason}`) : "";
        const label = st.status === "missing" ? t("status.missing") : (st.status === "failed" || st.status === "cancelled") && reason ? reason : t(`status.${st.status}`);
        return (
          <li key={c.id} className={`aicmd aicmd--${st.status}`} title={reason || undefined}>
            <Icon />
            <span>
              {st.status === "missing" ? null : <b>{kind}</b>}
              {st.status === "missing" ? label : ` · ${label}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
