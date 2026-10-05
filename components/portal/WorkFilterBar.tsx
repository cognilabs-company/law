"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Select, { type Option } from "@/components/Select";
import { IconSearch, IconClose } from "@/components/icons";

export type ChipOption = { value: string; label: string; count?: number };
export type ChipGroup = { key: string; label: string; value: string; onChange: (v: string) => void; options: ChipOption[] };
export type SelectGroup = { key: string; label: string; value: string; onChange: (v: string) => void; options: Option[] };

export type Period = "" | "today" | "week" | "month";
export const PERIODS: Period[] = ["", "today", "week", "month"];

export function inPeriod(iso: string, period: Period, now = Date.now()): boolean {
  if (!period) return true;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  if (period === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return t >= d.getTime();
  }
  return now - t <= (period === "week" ? 7 : 30) * 86400000;
}

export function useStoredFilters<T extends Record<string, string>>(key: string, defaults: T): [T, (patch: Partial<T>) => void, () => void] {
  const [value, setValue] = useState<T>(defaults);
  useEffect(() => {
    const h = setTimeout(() => {
      try {
        const raw = localStorage.getItem(`lexgo_filters_${key}`);
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<T>;
        setValue((cur) => {
          const next = { ...cur };
          for (const k of Object.keys(cur) as (keyof T)[]) if (typeof saved[k] === "string") next[k] = saved[k] as T[keyof T];
          return next;
        });
      } catch {
        return;
      }
    }, 0);
    return () => clearTimeout(h);
  }, [key]);
  const update = (patch: Partial<T>) =>
    setValue((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(`lexgo_filters_${key}`, JSON.stringify(next));
      } catch {
        return next;
      }
      return next;
    });
  const reset = () => {
    setValue(defaults);
    try {
      localStorage.removeItem(`lexgo_filters_${key}`);
    } catch {
      return;
    }
  };
  return [value, update, reset];
}

export default function WorkFilterBar({
  q,
  onQ,
  placeholder,
  chips,
  selects,
  period,
  onPeriod,
  sort,
  onSort,
  sortOptions,
  activeCount,
  onReset,
  resultCount,
  aiTarget,
}: {
  q: string;
  onQ: (v: string) => void;
  placeholder: string;
  chips: ChipGroup[];
  selects: SelectGroup[];
  period: Period;
  onPeriod: (v: Period) => void;
  sort: string;
  onSort: (v: string) => void;
  sortOptions: Option[];
  activeCount: number;
  onReset: () => void;
  resultCount?: number;
  aiTarget?: string;
}) {
  const t = useTranslations("portal.workFilters");
  const [open, setOpen] = useState(false);
  return (
    <div className="wfb" data-ai-target={aiTarget} data-ai-label={aiTarget ? t("filters") : undefined}>
      <div className="wfb__top">
        <label className="wfb__search">
          <IconSearch />
          <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} aria-label={t("search")} />
          {q ? (
            <button type="button" className="wfb__clear" onClick={() => onQ("")} aria-label={t("clearSearch")}>
              <IconClose />
            </button>
          ) : null}
        </label>
        <button type="button" className="wfb__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {t("filters")}
          {activeCount ? <span className="wfb__n">{activeCount}</span> : null}
        </button>
        <div className="wfb__sort">
          <Select value={sort} onChange={onSort} options={sortOptions} ariaLabel={t("sortLabel")} />
        </div>
      </div>

      {chips.map((g) => (
        <div key={g.key} className="wfb__chips" role="group" aria-label={g.label}>
          <span className="wfb__lbl">{g.label}</span>
          <div className="wfb__row">
            {g.options.map((o) => (
              <button key={o.value || "all"} type="button" className="wfb__chip" aria-pressed={g.value === o.value} onClick={() => g.onChange(o.value)}>
                {o.label}
                {typeof o.count === "number" ? <span>{o.count}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className={`wfb__more${open ? " is-open" : ""}`}>
        {selects.map((s) => (
          <div key={s.key} className="wfb__fld">
            <label>{s.label}</label>
            <Select value={s.value} onChange={s.onChange} options={s.options} ariaLabel={s.label} />
          </div>
        ))}
        <div className="wfb__fld">
          <label>{t("period")}</label>
          <Select value={period} onChange={(v) => onPeriod(v as Period)} ariaLabel={t("period")} options={PERIODS.map((p) => ({ value: p, label: t(`periods.${p || "all"}`) }))} />
        </div>
      </div>

      {activeCount || q ? (
        <div className="wfb__foot">
          {typeof resultCount === "number" ? <span>{t("found", { n: resultCount })}</span> : <span />}
          <button type="button" className="wfb__reset" onClick={onReset}>
            {t("reset")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
