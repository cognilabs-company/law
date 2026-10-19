"use client";

import "./sx-stage.css";
import { useTranslations } from "next-intl";
import { runStage, type StageRun } from "./engine";

export type SxStageKey = "draft" | "submitted" | "in_review" | "approved" | "published" | "returned" | "rejected";

export type SxStageShow = {
  to: SxStageKey;
  from?: SxStageKey | null;
  steps?: readonly SxStageKey[];
  count?: number;
  origin?: Element | DOMRect | null;
  title: string;
  text?: string;
};

export const STAGE_KEYS: readonly SxStageKey[] = ["draft", "submitted", "in_review", "approved", "published", "returned", "rejected"];

export function stageKeyOf(status: string): SxStageKey | null {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "changes_requested") return "returned";
  return (STAGE_KEYS as readonly string[]).includes(s) ? (s as SxStageKey) : null;
}

type Job = { ids: Set<number>; show: SxStageShow };
type Slot = { job: Job; run: StageRun | null; boot: number };

const MAX_QUEUE = 3;

let jobSeq = 0;
let current: Slot | null = null;
const queue: Job[] = [];
let skipLabel = "";

function rememberSkip(label: string) {
  if (label) skipLabel = label;
}

export function useStageText(): (to: SxStageKey, count?: number) => { title: string; text: string } {
  const t = useTranslations("studio");
  return (to, count) => {
    rememberSkip(t.has("sx.stage.skip") ? t("sx.stage.skip") : "");
    const many = typeof count === "number" && count > 1;
    const base = `sx.stage.${to}`;
    const title = many && t.has(`${base}.titleMany`) ? t(`${base}.titleMany`, { n: count }) : t.has(`${base}.title`) ? t(`${base}.title`) : to;
    const text = t.has(`${base}.text`) ? t(`${base}.text`) : "";
    return { title, text };
  };
}

function stepsOf(show: SxStageShow): SxStageKey[] {
  const list = show.steps && show.steps.length ? [...show.steps] : [show.to];
  if (list[list.length - 1] !== show.to) list.push(show.to);
  return list;
}

function merge(a: SxStageShow, b: SxStageShow): SxStageShow {
  const all = [...stepsOf(a), ...stepsOf(b)];
  return { ...b, from: a.from ?? b.from, steps: all.filter((k, i) => i === 0 || all[i - 1] !== k), origin: b.origin ?? a.origin };
}

function next() {
  current = null;
  const job = queue.shift();
  if (job) begin(job);
}

function begin(job: Job) {
  const slot: Slot = { job, run: null, boot: 0 };
  current = slot;
  slot.boot = window.setTimeout(() => {
    slot.boot = 0;
    if (current !== slot) return;
    try {
      slot.run = runStage(job.show, {
        skipLabel,
        onDone: () => {
          if (current === slot) next();
        },
        onSkip: skipAll,
      });
    } catch {
      if (current === slot) next();
    }
  }, 0);
}

function stopSlot(slot: Slot, fast: boolean) {
  if (slot.boot) {
    window.clearTimeout(slot.boot);
    slot.boot = 0;
    if (current === slot) next();
    return;
  }
  slot.run?.stop(fast);
}

function skipAll() {
  queue.length = 0;
  if (current) stopSlot(current, true);
}

function cancel(id: number) {
  if (current?.job.ids.has(id)) {
    current.job.ids.delete(id);
    if (!current.job.ids.size) stopSlot(current, false);
    return;
  }
  const at = queue.findIndex((job) => job.ids.has(id));
  if (at < 0) return;
  queue[at].ids.delete(id);
  if (!queue[at].ids.size) queue.splice(at, 1);
}

export function playStage(show: SxStageShow): () => void {
  if (typeof window === "undefined" || typeof document === "undefined" || !document.body) return () => {};
  if (!show || !(STAGE_KEYS as readonly string[]).includes(show.to)) return () => {};
  const id = ++jobSeq;
  if (!current) begin({ ids: new Set([id]), show });
  else if (queue.length < MAX_QUEUE) queue.push({ ids: new Set([id]), show });
  else {
    const last = queue[queue.length - 1];
    last.ids.add(id);
    last.show = merge(last.show, show);
  }
  return () => cancel(id);
}
