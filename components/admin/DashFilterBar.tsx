"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import DatePicker from "@/components/DatePicker";
import { REGION_KEYS } from "@/lib/lawyers";
import { EMPTY_FILTER, todayIso, type DashFilter } from "@/lib/services/dash";
import { dayBefore, useDemoForced } from "@/lib/demoStats";
import { shortDate } from "@/lib/date";
import { useAiSelection } from "@/lib/ai/registry";
import { IconBolt, IconCalendar, IconClock, IconMapPin } from "@/components/icons";

type Quick = "today" | "d7" | "d30" | "d90";

const PRESETS: { key: Quick; days: number }[] = [
  { key: "today", days: 1 },
  { key: "d7", days: 7 },
  { key: "d30", days: 30 },
  { key: "d90", days: 90 },
];

export function useDashFilter(): {
  filter: DashFilter;
  setFilter: (f: DashFilter) => void;
  demoForced: boolean;
  setDemoForced: (on: boolean) => void;
} {
  const [filter, setFilter] = useState<DashFilter>(EMPTY_FILTER);
  const [demoForced, setDemoForced] = useDemoForced();
  return { filter, setFilter, demoForced, setDemoForced };
}

export default function DashFilterBar({
  value,
  onChange,
  demoForced,
  onDemoForced,
  showDemo = true,
  note,
  compact,
}: {
  value: DashFilter;
  onChange: (f: DashFilter) => void;
  demoForced: boolean;
  onDemoForced: (on: boolean) => void;
  showDemo?: boolean;
  note?: string;
  compact?: boolean;
}) {
  const t = useTranslations("admin.dash.filter");
  const te = useTranslations("enums.regions");
  const locale = useLocale();
  const [mode, setMode] = useState<"" | "today" | "custom">("");

  const dated = Boolean(value.from || value.to);
  const period = value.preset || (mode === "today" && dated ? "today" : mode === "custom" || dated ? "custom" : "");
  const day = (iso: string) => shortDate(iso, locale);
  const range =
    value.from && value.to
      ? value.from === value.to
        ? day(value.from)
        : `${day(value.from)} – ${day(value.to)}`
      : value.from
        ? `${t("from")}: ${day(value.from)}`
        : value.to
          ? `${t("to")}: ${day(value.to)}`
          : "";

  const pickPeriod = (next: string) => {
    if (next === "custom") {
      setMode("custom");
      onChange({ ...value, preset: "" });
      return;
    }
    const hit = PRESETS.find((p) => p.key === next);
    setMode(hit?.key === "today" ? "today" : "");
    if (!hit) {
      onChange({ ...value, from: "", to: "", preset: "" });
      return;
    }
    const today = todayIso();
    const key = hit.key;
    onChange({ ...value, from: dayBefore(today, hit.days - 1), to: today, preset: key === "today" ? "" : key });
  };

  const setDate = (patch: Partial<DashFilter>) => {
    setMode("custom");
    onChange({ ...value, ...patch, preset: "" });
  };

  const reset = () => {
    setMode("");
    onChange(EMPTY_FILTER);
  };

  useAiSelection("dashboard_region", value.region);
  useAiSelection("dashboard_period", period === "custom" ? range : period ? t(period) : "");

  const fields: FilterField[] = [
    {
      key: "region",
      label: t("region"),
      icon: IconMapPin,
      value: value.region,
      onChange: (region) => onChange({ ...value, region }),
      options: [{ value: "", label: te("all") }, ...REGION_KEYS.map((k) => ({ value: k, label: te(k) }))],
    },
    {
      key: "period",
      label: t("period"),
      icon: IconClock,
      value: period,
      onChange: pickPeriod,
      options: [{ value: "", label: t("allTime") }, ...PRESETS.map((p) => ({ value: p.key, label: t(p.key) })), { value: "custom", label: t("custom") }],
      chip: period === "custom" ? range || null : undefined,
    },
    {
      key: "from",
      label: t("from"),
      icon: IconCalendar,
      hidden: period !== "custom",
      chip: null,
      node: <DatePicker value={value.from} onChange={(from) => setDate({ from })} placeholder={t("from")} ariaLabel={t("from")} max={value.to || undefined} clearLabel={t("clear")} />,
    },
    {
      key: "to",
      label: t("to"),
      icon: IconCalendar,
      hidden: period !== "custom",
      chip: null,
      node: <DatePicker value={value.to} onChange={(to) => setDate({ to })} placeholder={t("to")} ariaLabel={t("to")} min={value.from || undefined} clearLabel={t("clear")} />,
    },
  ];

  const demo = showDemo ? (
    <button type="button" role="switch" aria-checked={demoForced} className="dashf__demo" onClick={() => onDemoForced(!demoForced)} title={t("demoTitle")}>
      <IconBolt aria-hidden="true" />
      <span>{t("demo")}</span>
      <i className="dashf__sw" aria-hidden="true" />
    </button>
  ) : null;

  return (
    <div className={`dashf${compact ? " dashf--compact" : ""}`}>
      <FilterBar fields={fields} onReset={reset} extra={demo} aiTarget="stats:filters" aiLabel={t("aria")} />
      {note ? <p className="dashf__note">{note}</p> : null}
    </div>
  );
}
