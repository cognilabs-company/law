"use client";

import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import type { Option } from "@/components/Select";
import FilterBar, { type FilterField, type FilterSelectField } from "@/components/filters/FilterBar";
import { IconCalendar } from "@/components/icons";
import { useAiField } from "@/lib/ai/registry";

type FieldIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type ChipOption = { value: string; label: string; count?: number };
export type ChipGroup = { key: string; label: string; value: string; onChange: (v: string) => void; options: ChipOption[]; icon?: FieldIcon; empty?: string };
export type SelectGroup = { key: string; label: string; value: string; onChange: (v: string) => void; options: Option[]; icon?: FieldIcon; empty?: string };

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

const aiKey = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`).replace(/_/g, "-");

function AiChoice({ id, value, options, onChange }: { id: string; value: string; options: { value: string }[]; onChange: (v: string) => void }) {
  useAiField(id, {
    get: () => value,
    set: (v) => {
      if (options.some((o) => o.value === v)) onChange(v);
    },
  });
  return null;
}

function IconSort(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 4v16M3.5 7.5L7 4l3.5 3.5M17 20V4M13.5 16.5L17 20l3.5-3.5" />
    </svg>
  );
}

function groupField(g: ChipGroup, aiId?: string): FilterSelectField {
  const empty = g.empty ?? "";
  const known = g.options.find((o) => o.value === g.value);
  const options: Option[] = g.options.map((o) => ({ value: o.value, label: typeof o.count === "number" ? `${o.label} (${o.count})` : o.label }));
  if (!known && g.value !== empty) options.push({ value: g.value, label: g.value });
  return {
    key: aiKey(g.key),
    label: g.label,
    icon: g.icon,
    value: g.value,
    onChange: g.onChange,
    options,
    empty,
    chip: known && !known.value && empty ? `${g.label}: ${known.label}` : undefined,
    aiId,
  };
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
  onReset,
  resultCount,
  aiTarget,
  aiBase,
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
  onReset: () => void;
  resultCount?: number;
  aiTarget?: string;
  aiBase?: string;
}) {
  const t = useTranslations("portal.workFilters");
  const ai = (s: string) => (aiBase ? `${aiBase}.${s}` : undefined);
  useAiField(ai("search.input") ?? "", { get: () => q, set: onQ, sensitive: true });
  const periodOptions = PERIODS.map((p) => ({ value: p, label: t(`periods.${p || "all"}`) }));
  const pickPeriod = (v: string) => onPeriod(v as Period);
  const groups: ChipGroup[] = [...chips, ...selects];
  const fields: FilterField[] = [
    ...groups.map((g) => groupField(g, ai(`filters.${aiKey(g.key)}`))),
    { key: "period", label: t("period"), icon: IconCalendar, value: period, onChange: pickPeriod, options: periodOptions, aiId: ai("filters.period") },
    { key: "sort", label: t("sortLabel"), icon: IconSort, value: sort, onChange: onSort, options: sortOptions, chip: null, aiId: ai("filters.sort") },
  ];
  return (
    <>
      <FilterBar
        className="wfb wfb--split"
        fields={fields}
        search={{ value: q, onChange: onQ, placeholder, label: t("search"), aiId: ai("search.input") }}
        count={resultCount}
        onReset={onReset}
        aiId={ai("filters")}
        aiTarget={aiTarget}
        aiLabel={aiTarget || aiBase ? t("filters") : undefined}
      />
      {aiBase ? (
        <>
          {groups.map((g) => (
            <AiChoice key={g.key} id={`${aiBase}.filters.${aiKey(g.key)}`} value={g.value} options={g.options} onChange={g.onChange} />
          ))}
          <AiChoice id={`${aiBase}.filters.period`} value={period} options={periodOptions} onChange={pickPeriod} />
          <AiChoice id={`${aiBase}.filters.sort`} value={sort} options={sortOptions} onChange={onSort} />
        </>
      ) : null}
    </>
  );
}
