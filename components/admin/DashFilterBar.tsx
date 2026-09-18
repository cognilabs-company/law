"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";
import { REGION_KEYS } from "@/lib/lawyers";
import { EMPTY_FILTER, isFiltered, type DashFilter } from "@/lib/services/dash";
import { dayBefore } from "@/lib/demoStats";
import { useDemoForced } from "@/lib/demoStats";
import { IconRefresh, IconBolt } from "@/components/icons";

const PRESETS: { key: "d7" | "d30" | "d90"; days: number }[] = [
  { key: "d7", days: 7 },
  { key: "d30", days: 30 },
  { key: "d90", days: 90 },
];

// Filter state for one dashboard page (region + date range + preset) and the
// shared "Demo ko'rsatish" flag.
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

// Region + date range + presets + reset, and the demo toggle. `note` is an
// optional caveat under the bar (e.g. which metrics the region filter reaches).
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
  const regions = [{ value: "", label: te("all") }, ...REGION_KEYS.map((k) => ({ value: k, label: te(k) }))];

  function preset(key: "d7" | "d30" | "d90", days: number) {
    // Today is read in the click handler (never during render).
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (value.preset === key) onChange({ ...value, from: "", to: "", preset: "" });
    else onChange({ ...value, from: dayBefore(today, days - 1), to: today, preset: key });
  }

  return (
    <div className={`dfbar${compact ? " dfbar--compact" : ""}`} role="group" aria-label={t("aria")}>
      <div className="dfbar__row">
        <span className="dfbar__f dfbar__f--region">
          <Select value={value.region} onChange={(region) => onChange({ ...value, region })} options={regions} ariaLabel={t("region")} />
        </span>
        <span className="dfbar__f dfbar__f--date">
          <DatePicker value={value.from} onChange={(from) => onChange({ ...value, from, preset: "" })} placeholder={t("from")} ariaLabel={t("from")} max={value.to || undefined} clearLabel={t("clear")} />
        </span>
        <span className="dfbar__f dfbar__f--date">
          <DatePicker value={value.to} onChange={(to) => onChange({ ...value, to, preset: "" })} placeholder={t("to")} ariaLabel={t("to")} min={value.from || undefined} clearLabel={t("clear")} />
        </span>
        <div className="segs dfbar__segs" role="tablist" aria-label={t("presets")}>
          {PRESETS.map((p) => (
            <button key={p.key} type="button" role="tab" className="seg" aria-selected={value.preset === p.key} onClick={() => preset(p.key, p.days)}>
              {t(p.key)}
            </button>
          ))}
        </div>
        {isFiltered(value) ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(EMPTY_FILTER)}>
            <IconRefresh />
            {t("reset")}
          </button>
        ) : null}
        {showDemo ? (
          <button
            type="button"
            className={`chip dfbar__demo${demoForced ? " on" : ""}`}
            aria-pressed={demoForced}
            onClick={() => onDemoForced(!demoForced)}
            title={t("demoTitle")}
          >
            <IconBolt />
            {demoForced ? t("demoOn") : t("demo")}
          </button>
        ) : null}
      </div>
      {note ? (
        <p className="dfbar__note">
          {note}
        </p>
      ) : null}
    </div>
  );
}
