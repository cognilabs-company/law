"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { aiSeg } from "@/lib/ai/ids";
import { revealTarget, useAiReveal } from "@/lib/guide/targets";
import Tabs, { tabDomId, useTabMemory } from "@/components/ui/Tabs";
import Segmented from "@/components/ui/Segmented";

export type StageTab = { key: string; label: string; count: number };

export type StageTabsProps = {
  stages: readonly StageTab[];
  value: string | undefined;
  onChange: (key: string) => void;
  level?: 1 | 2;
  label?: string;
  idPrefix?: string;
  controls?: string;
  className?: string;
  aiId?: string;
};

export const PHONE_BOARD_QUERY = "(max-width: 640px)";

function subscribePhone(fn: () => void): () => void {
  const mq = window.matchMedia(PHONE_BOARD_QUERY);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
}

const readPhone = () => window.matchMedia(PHONE_BOARD_QUERY).matches;
const serverPhone = () => false;

export function usePhoneBoard(): boolean {
  return useSyncExternalStore(subscribePhone, readPhone, serverPhone);
}

export const stageStoreKey = (board: string): string => `stage:${board}`;

export function useStageTab(board: string, stages: readonly StageTab[]): [string | undefined, (key: string) => void] {
  const [auto, setAuto] = useState<string | undefined>(undefined);
  const busy = stages.find((s) => s.count > 0)?.key;
  if (auto === undefined && busy !== undefined) setAuto(busy);
  const keys = stages.map((s) => s.key);
  const fallback = auto !== undefined && keys.includes(auto) ? auto : (busy ?? keys[0]);
  return useTabMemory(stageStoreKey(board), keys, fallback);
}

export const stageTabId = (idPrefix: string, key: string): string => tabDomId(idPrefix, key);

const NEVER = /(?!)/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const quote = (s: string) => s.replace(/["\\]/g, "\\$&");

function until(test: () => boolean, ms = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const end = Date.now() + ms;
    const tick = () => {
      if (test()) resolve(true);
      else if (Date.now() > end) resolve(false);
      else window.setTimeout(tick, 30);
    };
    tick();
  });
}

export function useLeadReveal(base: string, hidden: readonly string[], show: (leadId: string) => void): void {
  const busy = useRef(new Set<string>());
  const ids = hidden.map((id) => aiSeg(id)).filter(Boolean);
  const src = base && ids.length ? `^${esc(base)}\\.(?:${ids.map(esc).join("|")})(?:\\..+)?$` : "";
  const live = useRef("");
  useAiReveal(src ? new RegExp(src) : NEVER, async (key) => {
    if (busy.current.has(key)) return;
    const leadSeg = key.slice(base.length + 1).split(".")[0];
    const lead = hidden.find((id) => aiSeg(id) === leadSeg);
    if (!lead) return;
    busy.current.add(key);
    try {
      show(lead);
      const card = `${base}.${leadSeg}`;
      const ready = await until(() => !!document.querySelector(`[data-ai-id="${quote(card)}"]`));
      if (!ready || key === card) return;
      const released = await until(() => !live.current || !new RegExp(live.current).test(key));
      if (released) await revealTarget(key);
    } finally {
      busy.current.delete(key);
    }
  });
  useEffect(() => {
    live.current = src;
  }, [src]);
}

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export default function StageTabs({ stages, value, onChange, level = 1, label, idPrefix, controls, className, aiId }: StageTabsProps) {
  const tl = useTranslations("admin.leadCard");
  const name = label ?? tl("stages");
  const current = value !== undefined && stages.some((s) => s.key === value) ? value : stages[0]?.key;
  if (!stages.length) return null;
  if (level === 2) {
    return (
      <Segmented
        className={cx("lstab", "lstab--pills", className)}
        value={current}
        onChange={onChange}
        label={name}
        size="sm"
        aiId={aiId}
        options={stages.map((s) => ({ value: s.key, label: s.label, count: s.count, aiId: aiId ? `${aiId}.${aiSeg(s.key)}` : undefined, aiLabel: s.label }))}
      />
    );
  }
  return (
    <Tabs
      className={cx("lstab", "lstab--line", className)}
      variant="line"
      idPrefix={idPrefix}
      controls={controls}
      value={current}
      onChange={onChange}
      label={name}
      aiId={aiId}
      items={stages.map((s) => ({ key: s.key, label: s.label, count: s.count, aiLabel: s.label }))}
    />
  );
}
