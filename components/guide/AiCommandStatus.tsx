"use client";

import { useSyncExternalStore, type ComponentType, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import { cmdStatusServerSnapshot, cmdStatusSnapshot, subscribeCmdStatus } from "@/lib/ai/commands";
import type { CmdStatus } from "@/lib/ai/types";
import { IconAlert, IconCheck, IconCircleX, IconClock, IconRefresh, IconSquare } from "@/components/icons";

export type ChipCommand = { id: string; type: string };

type Shown = Exclude<CmdStatus, "skipped">;

const HIDDEN_TYPES = new Set(["show_steps", "support_handoff"]);

const ICONS: Record<Shown, ComponentType<SVGProps<SVGSVGElement>>> = {
  pending: IconClock,
  running: IconRefresh,
  done: IconCheck,
  missing: IconAlert,
  failed: IconCircleX,
  cancelled: IconSquare,
};

export default function AiCommandStatus({ commands }: { commands: ChipCommand[] }) {
  const t = useTranslations("portal.aiAssistant.v21");
  const snap = useSyncExternalStore(subscribeCmdStatus, cmdStatusSnapshot, cmdStatusServerSnapshot);
  const chips = commands
    .filter((c) => !HIDDEN_TYPES.has(c.type))
    .map((c) => ({ c, st: snap.get(c.id) }))
    .filter((x): x is { c: ChipCommand; st: { status: Shown; reason: string } } => Boolean(x.st) && x.st?.status !== "skipped");
  if (!chips.length) return null;
  return (
    <ul className="aicmds" aria-label={t("chips")} aria-live="polite">
      {chips.map(({ c, st }) => {
        const Icon = ICONS[st.status];
        const kind = t.has(`cmd.${c.type}`) ? t(`cmd.${c.type}`) : t("cmd.unknown");
        const reason = st.reason && t.has(`reason.${st.reason}`) ? t(`reason.${st.reason}`) : "";
        const stopped = st.status === "failed" || st.status === "cancelled";
        const word = stopped && reason ? reason : t(`chip.${st.status}`);
        const hint = st.status === "missing" ? t("status.missing") : reason || t(`status.${st.status}`);
        return (
          <li key={c.id} className={`aicmd aicmd--${st.status}`} title={hint}>
            <Icon aria-hidden="true" />
            <span>
              <b>{kind}</b>
              <span className="aicmd__sep" aria-hidden="true">
                ·
              </span>
              {word}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
