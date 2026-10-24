"use client";

import "./sx-agent-flow.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { getAgentJob, isTerminal, type AgentJob } from "@/lib/services/studioAgent";
import { CircleCheckIcon, PlusIcon, TriangleAlertIcon, glyph } from "../icons";
import { useStudioLabels } from "../useStudioLabels";
import type { AgentRef } from "./useAgentJob";

// The latest agent tasks within one click, at the top of the page: each
// card shows the backend's status and progress for that task, what it was
// for and when; the open one is marked; "New task" sits first. Statuses of
// the others are read once per list change; the open task's comes live.

type Brief = { status: string; progress: number | null; saved: number; target: number };
const briefOf = (j: AgentJob): Brief => ({ status: String(j.status), progress: j.progress, saved: j.savedCount ?? j.drafts.length, target: j.targetDrafts });

export function AgentDock({ recent, currentId, current, onOpen, onNew }: { recent: readonly AgentRef[]; currentId: string; current: AgentJob | null; onOpen: (id: string) => void; onNew: () => void }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const [briefs, setBriefs] = useState<Record<string, Brief>>({});
  const ids = recent.map((r) => r.id).join(",");

  useEffect(() => {
    if (!ids) return;
    const ctl = new AbortController();
    void Promise.allSettled(ids.split(",").map((id) => getAgentJob(id, ctl.signal).then((j) => [id, briefOf(j)] as const))).then((rows) => {
      if (ctl.signal.aborted) return;
      const next: Record<string, Brief> = {};
      for (const r of rows) if (r.status === "fulfilled") next[r.value[0]] = r.value[1];
      setBriefs((cur) => ({ ...cur, ...next }));
    });
    return () => ctl.abort();
  }, [ids]);

  const briefFor = (id: string): Brief | null => (current && current.id === id ? briefOf(current) : (briefs[id] ?? null));

  return (
    <nav className="sx-agd" aria-label={t("sx.agent.recent.title")}>
      <button type="button" className="sx-agd__new" onClick={onNew} aria-pressed={!currentId}>
        <span className="sx-agd__plus" aria-hidden="true">
          {glyph(PlusIcon, { size: 18 })}
        </span>
        <b>{t("sx.agent.newJob")}</b>
      </button>
      <ul className="sx-agd__list">
        {recent.map((r) => {
          const b = briefFor(r.id);
          const st = b?.status ?? "";
          const live = !!st && !isTerminal(st);
          const tone = !st ? "none" : live ? "live" : st === "completed" ? "ok" : st === "partial_failed" ? "warn" : "bad";
          const pct = live ? Math.max(4, Math.min(100, Math.round(b?.progress ?? 8))) : st === "completed" ? 100 : 0;
          return (
            <li key={r.id}>
              <button type="button" className="sx-agd__job" data-tone={tone} aria-current={r.id === currentId ? "true" : undefined} onClick={() => onOpen(r.id)}>
                <span className="sx-agd__top">
                  <span className="sx-agd__state">
                    {tone === "ok" ? glyph(CircleCheckIcon, { size: 14 }) : tone === "warn" || tone === "bad" ? glyph(TriangleAlertIcon, { size: 14 }) : <i className="sx-agd__dot" aria-hidden="true" />}
                    {st ? (t.has(`sx.agent.status.${st}`) ? t(`sx.agent.status.${st}`) : st) : t("sx.agent.dock.unknown")}
                  </span>
                  <time>{labels.dateTime(r.at)}</time>
                </span>
                <b className="sx-agd__title">{r.codes.length ? r.codes.map((c) => labels.ctorName(c)).join(", ") : t("sx.agent.recent.anyCtor")}</b>
                <span className="sx-agd__meta">{b ? t("sx.agent.dock.drafts", { saved: b.saved, of: b.target || r.drafts }) : t("sx.agent.recent.drafts", { n: r.drafts })}</span>
                <span className="sx-agd__bar" aria-hidden="true">
                  <i style={{ width: `${pct}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
