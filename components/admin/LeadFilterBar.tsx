"use client";

import { useMemo, useState, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import DatePicker from "@/components/DatePicker";
import { leadRegionLabel, leadScoreLabel, leadSourceLabel, leadUrgencyLabel } from "@/lib/leadLabels";
import { EMPTY_LEAD_FILTER, LEAD_SCORES, leadMatches, type LeadFilter, type LeadFilterable } from "@/lib/services/leads";
import type { AdminUser } from "@/lib/services/users";
import { shortDate } from "@/lib/date";
import { IconCalendar, IconClock, IconFlag, IconHeadset, IconLayers, IconMapPin, IconMegaphone } from "@/components/icons";

export type LeadItem = { lead: LeadFilterable; stage: string };

type Quick = "today" | "week" | "month";
type FacetKey = "region" | "source" | "stage" | "score" | "urgency" | "assignee";

const QUICK: Quick[] = ["today", "week", "month"];

function IconFlame(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3c.6 2.9 2.4 4.6 3.9 6.3C17.1 10.7 18 12.2 18 14.2A6 6 0 016 14.2c0-2.3 1.1-3.9 2.6-5 .2 1.8.9 2.9 2.2 3.3C10.3 9.4 10.6 5.9 12 3z" />
    </svg>
  );
}

const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function quickRange(q: Quick): { from: string; to: string } {
  const now = new Date();
  const to = dayOf(now);
  if (q === "today") return { from: to, to };
  if (q === "month") return { from: dayOf(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = start.getDay();
  start.setDate(start.getDate() + (dow === 0 ? -6 : 1 - dow));
  return { from: dayOf(start), to };
}

function facet(items: LeadItem[], f: LeadFilter, meId: string, staged: boolean, key: FacetKey, of: (it: LeadItem) => string): (v: string) => number {
  const g: LeadFilter = { ...f, [key]: "" };
  const counts = new Map<string, number>();
  for (const it of items) {
    if (!leadMatches(it.lead, g, meId)) continue;
    if (staged && g.stage && it.stage !== g.stage) continue;
    const k = of(it);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return (v) => counts.get(v) ?? 0;
}

export default function LeadFilterBar({
  value,
  onChange,
  items,
  meId,
  regions,
  sources,
  stages,
  operators,
  scores,
  urgencies,
  count,
  searchPlaceholder,
  aiId,
}: {
  value: LeadFilter;
  onChange: (next: LeadFilter) => void;
  items: LeadItem[];
  meId: string;
  regions: string[];
  sources?: string[];
  stages?: { value: string; label: string }[];
  operators?: AdminUser[];
  scores?: boolean;
  urgencies?: string[];
  count?: number;
  searchPlaceholder?: string;
  aiId?: string;
}) {
  const t = useTranslations("admin.pipeline");
  const te = useTranslations("enums");
  const tf = useTranslations("filterBar");
  const locale = useLocale();
  const [mode, setMode] = useState<Quick | "custom" | "">("");
  const set = (patch: Partial<LeadFilter>) => onChange({ ...value, ...patch });

  const dated = Boolean(value.from || value.to);
  const period = mode && mode !== "custom" ? (dated ? mode : "") : dated || mode === "custom" ? "custom" : "";
  const day = (iso: string) => shortDate(iso, locale);
  const range =
    value.from && value.to
      ? value.from === value.to
        ? day(value.from)
        : `${day(value.from)} – ${day(value.to)}`
      : value.from
        ? `${t("f.from")}: ${day(value.from)}`
        : value.to
          ? `${t("f.to")}: ${day(value.to)}`
          : "";

  const pickPeriod = (next: string) => {
    if (next === "custom") {
      setMode("custom");
      return;
    }
    const q = QUICK.find((x) => x === next);
    setMode(q ?? "");
    set(q ? quickRange(q) : { from: "", to: "" });
  };

  const setDate = (patch: Partial<LeadFilter>) => {
    setMode("custom");
    set(patch);
  };

  const reset = () => {
    setMode("");
    onChange(EMPTY_LEAD_FILTER);
  };

  const staged = Boolean(stages);
  const tally = useMemo(
    () => ({
      stage: facet(items, value, meId, staged, "stage", (it) => it.stage),
      source: facet(items, value, meId, staged, "source", (it) => it.lead.source),
      region: facet(items, value, meId, staged, "region", (it) => it.lead.region),
      assignee: facet(items, value, meId, staged, "assignee", (it) => it.lead.assignedTo),
      score: facet(items, value, meId, staged, "score", (it) => it.lead.scoreKey),
      urgency: facet(items, value, meId, staged, "urgency", (it) => it.lead.urgency),
    }),
    [items, value, meId, staged],
  );
  const withN = (label: string, n: number) => `${label} (${n})`;
  const fid = (key: string) => (aiId ? `${aiId}.${key}` : undefined);

  const fields: FilterField[] = [
    {
      key: "period",
      label: t("periodPick.label"),
      icon: IconClock,
      value: period,
      onChange: pickPeriod,
      options: [{ value: "", label: t("periodPick.all") }, ...QUICK.map((q) => ({ value: q, label: t(`period.${q}`) })), { value: "custom", label: t("periodPick.custom") }],
      chip: period === "custom" ? range || null : undefined,
      aiId: fid("period"),
    },
    {
      key: "from",
      label: t("f.from"),
      icon: IconCalendar,
      hidden: period !== "custom",
      chip: null,
      node: <DatePicker value={value.from} onChange={(from) => setDate({ from })} placeholder={t("f.from")} ariaLabel={t("f.from")} max={value.to || undefined} clearLabel={t("f.clear")} />,
    },
    {
      key: "to",
      label: t("f.to"),
      icon: IconCalendar,
      hidden: period !== "custom",
      chip: null,
      node: <DatePicker value={value.to} onChange={(to) => setDate({ to })} placeholder={t("f.to")} ariaLabel={t("f.to")} min={value.from || undefined} clearLabel={t("f.clear")} />,
    },
    {
      key: "stage",
      label: t("d.stage"),
      icon: IconLayers,
      hidden: !stages,
      value: value.stage,
      onChange: (stage) => set({ stage }),
      options: [{ value: "", label: t("f.allStage") }, ...(stages ?? []).map((s) => ({ value: s.value, label: withN(s.label, tally.stage(s.value)) }))],
      aiId: fid("stage"),
    },
    {
      key: "assignee",
      label: t("f.assignee"),
      icon: IconHeadset,
      value: value.assignee,
      onChange: (assignee) => set({ assignee }),
      options: [
        { value: "", label: t("f.allAssignee") },
        { value: "mine", label: withN(t("f.mine"), meId ? tally.assignee(meId) : 0) },
        { value: "unassigned", label: withN(t("f.unassigned"), tally.assignee("")) },
        ...(operators ?? []).map((o) => ({ value: o.id, label: withN(o.name || o.phone || o.lexgoId, tally.assignee(o.id)) })),
      ],
      aiId: fid("assignee"),
    },
    {
      key: "score",
      label: t("d.score"),
      icon: IconFlame,
      hidden: !scores,
      value: value.score,
      onChange: (score) => set({ score }),
      options: [{ value: "", label: tf("all") }, ...LEAD_SCORES.map((s) => ({ value: s, label: withN(leadScoreLabel(t, s), tally.score(s)) }))],
      aiId: fid("score"),
    },
    {
      key: "urgency",
      label: t("d.urgency"),
      icon: IconFlag,
      hidden: !urgencies?.length,
      value: value.urgency,
      onChange: (urgency) => set({ urgency }),
      options: [{ value: "", label: tf("all") }, ...(urgencies ?? []).map((u) => ({ value: u, label: withN(leadUrgencyLabel(t, u), tally.urgency(u)) }))],
      aiId: fid("urgency"),
    },
    {
      key: "source",
      label: t("d.source"),
      icon: IconMegaphone,
      hidden: !sources,
      value: value.source,
      onChange: (source) => set({ source }),
      options: [{ value: "", label: t("f.allSource") }, ...(sources ?? []).map((s) => ({ value: s, label: withN(leadSourceLabel(t, s), tally.source(s)) }))],
      aiId: fid("source"),
    },
    {
      key: "region",
      label: t("d.region"),
      icon: IconMapPin,
      value: value.region,
      onChange: (region) => set({ region }),
      options: [{ value: "", label: t("f.allRegion") }, ...regions.map((r) => ({ value: r, label: withN(leadRegionLabel(te, r), tally.region(r)) }))],
      aiId: fid("region"),
    },
  ];

  return (
    <FilterBar
      className="uf--tray"
      fields={fields}
      search={{ value: value.q, onChange: (q) => set({ q }), placeholder: searchPlaceholder ?? t("f.search"), aiId: fid("search") }}
      count={count}
      onReset={reset}
      aiId={aiId}
      aiTarget="leads:filters"
    />
  );
}
