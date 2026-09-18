"use client";

import { useTranslations } from "next-intl";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";
import { leadRegionLabel, leadScoreLabel, leadSourceLabel, leadUrgencyLabel } from "@/lib/leadLabels";
import { EMPTY_LEAD_FILTER, LEAD_SCORES, filterActive, type LeadFilter } from "@/lib/services/leads";
import type { AdminUser } from "@/lib/services/users";
import { IconClose, IconSearch, IconUser } from "@/components/icons";

// Shared CRM filter bar (sales pipeline, call-center board and queue):
// search, source / region / stage selects, assignee select, date range over
// the lead's creation day, "my leads" toggle and score / urgency chips. Every
// filter is applied client-side by the caller through leadMatches().
export default function LeadFilterBar({
  value,
  onChange,
  regions,
  sources,
  stages,
  stageLabel,
  operators,
  mine,
  scores,
  urgencies,
  searchPlaceholder,
  summary,
}: {
  value: LeadFilter;
  onChange: (next: LeadFilter) => void;
  regions: string[];
  sources?: string[];
  stages?: { value: string; label: string }[];
  stageLabel?: string;
  // Operator directory for the assignee select (omit → no select).
  operators?: AdminUser[];
  // Show the "my leads" toggle chip.
  mine?: boolean;
  scores?: boolean;
  // Urgency values present in the data (omit → no chips).
  urgencies?: string[];
  searchPlaceholder?: string;
  summary?: { shown: number; total: number };
}) {
  const t = useTranslations("admin.pipeline");
  const te = useTranslations("enums");
  const set = (patch: Partial<LeadFilter>) => onChange({ ...value, ...patch });
  const active = filterActive(value);
  const isMine = value.assignee === "mine";
  const hasChips = !!mine || !!scores || !!urgencies?.length || active || !!summary;

  return (
    <div className="lfbar">
      <div className="lfilters">
        <span className="svsel__search">
          <IconSearch />
          <input value={value.q} onChange={(e) => set({ q: e.target.value })} placeholder={searchPlaceholder ?? t("f.search")} aria-label={searchPlaceholder ?? t("f.search")} />
        </span>
        {sources ? (
          <Select value={value.source} onChange={(v) => set({ source: v })} ariaLabel={t("d.source")} options={[{ value: "", label: t("f.allSource") }, ...sources.map((s) => ({ value: s, label: leadSourceLabel(t, s) }))]} />
        ) : null}
        <Select value={value.region} onChange={(v) => set({ region: v })} ariaLabel={t("d.region")} options={[{ value: "", label: t("f.allRegion") }, ...regions.map((r) => ({ value: r, label: leadRegionLabel(te, r) }))]} />
        {stages ? (
          <Select value={value.stage} onChange={(v) => set({ stage: v })} ariaLabel={stageLabel ?? t("d.stage")} options={[{ value: "", label: stageLabel ?? t("f.allStage") }, ...stages]} />
        ) : null}
        {operators ? (
          <Select
            value={value.assignee}
            onChange={(v) => set({ assignee: v })}
            ariaLabel={t("f.assignee")}
            options={[
              { value: "", label: t("f.allAssignee") },
              { value: "unassigned", label: t("f.unassigned") },
              { value: "mine", label: t("f.mine") },
              ...operators.map((o) => ({ value: o.id, label: o.name || o.phone || o.lexgoId })),
            ]}
          />
        ) : null}
        <DatePicker value={value.from} onChange={(v) => set({ from: v })} placeholder={t("f.from")} ariaLabel={t("f.from")} max={value.to || undefined} clearLabel={t("f.clear")} />
        <DatePicker value={value.to} onChange={(v) => set({ to: v })} placeholder={t("f.to")} ariaLabel={t("f.to")} min={value.from || undefined} clearLabel={t("f.clear")} />
      </div>
      {hasChips ? (
        <div className="lchips">
          {mine ? (
            <button type="button" className="lchip lchip--me" aria-pressed={isMine} onClick={() => set({ assignee: isMine ? "" : "mine" })}>
              <IconUser />
              {t("f.mine")}
            </button>
          ) : null}
          {mine && (scores || urgencies?.length) ? <span className="lchips__sep" aria-hidden /> : null}
          {scores
            ? LEAD_SCORES.map((s) => (
                <button key={s} type="button" className={`lchip lchip--${s}`} aria-pressed={value.score === s} onClick={() => set({ score: value.score === s ? "" : s })}>
                  {leadScoreLabel(t, s)}
                </button>
              ))
            : null}
          {scores && urgencies?.length ? <span className="lchips__sep" aria-hidden /> : null}
          {urgencies?.map((u) => (
            <button key={u} type="button" className="lchip" aria-pressed={value.urgency === u} onClick={() => set({ urgency: value.urgency === u ? "" : u })}>
              {leadUrgencyLabel(t, u)}
            </button>
          ))}
          {active ? (
            <button type="button" className="lchip lchip--reset" onClick={() => onChange(EMPTY_LEAD_FILTER)}>
              <IconClose />
              {t("f.reset")}
            </button>
          ) : null}
          {summary ? <span className="lchips__sum">{t("f.shown", { n: summary.shown, total: summary.total })}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
