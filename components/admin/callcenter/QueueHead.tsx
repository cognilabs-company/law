"use client";

import type { ComponentType, ReactElement, SVGProps } from "react";
import { CountBadge } from "@/components/ui/Badge";
import IconButton from "@/components/ui/IconButton";
import Segmented from "@/components/ui/Segmented";
import { IconRefresh } from "@/components/icons";

// The head every call-centre queue shares with the urgent and quality
// queues: an icon tile, the title, the count and a refresh button, the
// lead under it and, when the queue has statuses, the status pills.

export type QueueStatus = { value: string; label: string };

export default function QueueHead({
  icon: Icon,
  title,
  lead,
  count,
  refreshLabel,
  onRefresh,
  refreshing = false,
  aiBase,
  statuses,
  status,
  onStatus,
  statusLabel,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  lead: string;
  count?: number | null;
  refreshLabel: string;
  onRefresh: () => void;
  refreshing?: boolean;
  aiBase: string;
  statuses?: readonly QueueStatus[];
  status?: string;
  onStatus?: (v: string) => void;
  statusLabel?: string;
}): ReactElement {
  return (
    <>
      <div className="ppanel__h cch">
        <h2 className="ppanel__t cch__t">
          <span className="pico">
            <Icon />
          </span>
          <span className="cch__tt">{title}</span>
        </h2>
        <div className="cch__a">
          {typeof count === "number" ? <CountBadge n={count} /> : null}
          <IconButton label={refreshLabel} icon={<IconRefresh />} onClick={onRefresh} busy={refreshing} tipAlign="end" aiId={`${aiBase}.refresh`} />
        </div>
      </div>
      <p className="ppanel__note">{lead}</p>
      {statuses && onStatus ? (
        <div className="qhead__seg">
          <Segmented
            size="sm"
            value={status ?? ""}
            onChange={onStatus}
            label={statusLabel ?? title}
            aiId={`${aiBase}.tabs`}
            options={statuses.map((s) => ({ value: s.value, label: s.label, aiId: `${aiBase}.tab.${s.value || "all"}`, aiLabel: s.label }))}
          />
        </div>
      ) : null}
    </>
  );
}
