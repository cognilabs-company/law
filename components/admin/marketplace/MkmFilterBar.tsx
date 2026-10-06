"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import DatePicker from "@/components/DatePicker";
import { listAdminMarketplaceSellers, MKM_STATUSES } from "@/lib/services/adminMarketplace";
import { searchUsers } from "@/lib/services/backend";
import { todayIso } from "@/lib/services/dash";
import { dayBefore } from "@/lib/demoStats";
import { shortDate } from "@/lib/date";
import { IconCalendar, IconClipboardCheck, IconClock, IconStore, IconUser } from "@/components/icons";

export type Preset = "" | "today" | "d7" | "d30" | "d90";
export type PartyPick = { id: string; label: string; sub: string };
export type MkmFilters = { from: string; to: string; preset: Preset; status: string; seller: PartyPick | null; client: PartyPick | null };
export type MkmTab = "overview" | "orders" | "sellers";

export const EMPTY_FILTERS: MkmFilters = { from: "", to: "", preset: "", status: "", seller: null, client: null };

const PRESETS: { key: Exclude<Preset, "">; days: number }[] = [
  { key: "today", days: 1 },
  { key: "d7", days: 7 },
  { key: "d30", days: 30 },
  { key: "d90", days: 90 },
];

export function presetRange(key: Exclude<Preset, "">): { from: string; to: string } {
  const days = PRESETS.find((p) => p.key === key)?.days ?? 1;
  const today = todayIso();
  return { from: dayBefore(today, days - 1), to: today };
}

export function filtersActive(f: MkmFilters): boolean {
  return !!(f.from || f.to || f.status || f.seller || f.client);
}

function partyOption(id: string, name: string, lexgoId: string, phone: string): SearchOption {
  return { value: id, label: name || phone || lexgoId || "—", sub: [lexgoId, phone].filter(Boolean).join(" · ") };
}

export default function MkmFilterBar({
  tab,
  value,
  onChange,
  q,
  onQ,
  onReset,
  count,
}: {
  tab: MkmTab;
  value: MkmFilters;
  onChange: (patch: Partial<MkmFilters>) => void;
  q: string;
  onQ: (v: string) => void;
  onReset: () => void;
  count?: number;
}) {
  const t = useTranslations("admin.marketplace.filter");
  const tu = useTranslations("admin.userSelect");
  const locale = useLocale();
  const [known, setKnown] = useState<Record<string, SearchOption>>({});
  const [custom, setCustom] = useState(false);
  const [own, setOwn] = useState(false);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    if (own) setOwn(false);
    else if (custom && !value.from && !value.to && (prev.from || prev.to)) setCustom(false);
  }

  const remember = (rows: SearchOption[]) => {
    setKnown((cur) => {
      const next = { ...cur };
      for (const r of rows) next[r.value] = r;
      return next;
    });
    return rows;
  };
  const findSellers = async (text: string) => {
    const page = await listAdminMarketplaceSellers({ q: text, dateFrom: "", dateTo: "", limit: 12 });
    return remember(page.items.map((s) => partyOption(s.userId, s.name, s.lexgoId, s.phone)));
  };
  const findClients = async (text: string) => {
    const rows = await searchUsers(text, { role: "client", limit: 12 });
    return remember(rows.filter((u) => u.id).map((u) => partyOption(u.id, u.name, u.lexgoId, u.phone)));
  };
  const pickOf = (ids: string[]): PartyPick | null => {
    const id = ids[0];
    if (!id) return null;
    const o = known[id];
    return { id, label: o?.label ?? "—", sub: o?.sub ?? "" };
  };

  const dated = Boolean(value.from || value.to);
  const period = value.preset || (custom || dated ? "custom" : "");
  const day = (iso: string) => (iso ? shortDate(iso, locale) : "…");
  const range = !dated ? "" : value.from && value.from === value.to ? day(value.from) : `${day(value.from)} – ${day(value.to)}`;

  const pickPeriod = (next: string) => {
    if (next === "custom") {
      setCustom(true);
      if (value.preset) onChange({ preset: "" });
      return;
    }
    setCustom(false);
    const hit = PRESETS.find((p) => p.key === next);
    if (hit) {
      onChange({ ...presetRange(hit.key), preset: hit.key });
      return;
    }
    if (dated || value.preset) onChange({ from: "", to: "", preset: "" });
  };

  const setDate = (patch: Partial<MkmFilters>) => {
    setCustom(true);
    setOwn(true);
    onChange({ ...patch, preset: "" });
  };

  const reset = () => {
    setCustom(false);
    onReset();
  };

  const partyScoped = tab !== "sellers";
  const hidden = !partyScoped && !!(value.status || value.seller || value.client);

  const party = (key: "seller" | "client", icon: FilterField["icon"], find: (text: string) => Promise<SearchOption[]>): FilterField => {
    const pick = value[key];
    const set = (next: PartyPick | null) => onChange(key === "seller" ? { seller: next } : { client: next });
    return {
      key,
      label: t(key),
      icon,
      hidden: !partyScoped,
      active: Boolean(pick),
      chip: pick ? `${t(key)}: ${pick.label}` : null,
      clear: () => set(null),
      node: (
        <SearchSelect
          single
          value={pick ? [pick.id] : []}
          onChange={(ids) => set(pickOf(ids))}
          options={pick ? [{ value: pick.id, label: pick.label, sub: pick.sub }] : []}
          onSearch={find}
          placeholder={t(`${key}Ph`)}
          searchPlaceholder={tu("searchPh")}
          emptyText={tu("empty")}
          ariaLabel={t(key)}
          removeLabel={tu("clear")}
        />
      ),
    };
  };

  const fields: FilterField[] = [
    {
      key: "period",
      label: t("period"),
      icon: IconClock,
      value: period,
      onChange: pickPeriod,
      options: [
        { value: "", label: t("allTime") },
        ...PRESETS.map((p) => ({ value: p.key, label: t(`presets.${p.key}`) })),
        { value: "custom", label: t("custom") },
      ],
      chip: period === "custom" ? range || null : undefined,
      aiTarget: "marketplace:period",
    },
    {
      key: "from",
      label: t("from"),
      icon: IconCalendar,
      hidden: period !== "custom",
      chip: null,
      node: <DatePicker value={value.from} onChange={(from) => setDate({ from })} placeholder={t("from")} ariaLabel={t("from")} max={value.to || undefined} clearLabel={t("clearDate")} />,
    },
    {
      key: "to",
      label: t("to"),
      icon: IconCalendar,
      hidden: period !== "custom",
      chip: null,
      node: <DatePicker value={value.to} onChange={(to) => setDate({ to })} placeholder={t("to")} ariaLabel={t("to")} min={value.from || undefined} clearLabel={t("clearDate")} />,
    },
    {
      key: "status",
      label: t("status"),
      icon: IconClipboardCheck,
      hidden: !partyScoped,
      value: value.status,
      onChange: (status) => onChange({ status }),
      options: ["", ...MKM_STATUSES].map((s) => ({ value: s, label: t(`statusOpt.${s || "all"}`) })),
    },
    party("seller", IconStore, findSellers),
    party("client", IconUser, findClients),
  ];

  return (
    <div className="mkm-filters" role="group" aria-label={t("aria")} data-ai-target="marketplace:filters" data-ai-label={t("aria")}>
      <FilterBar
        fields={fields}
        search={partyScoped ? undefined : { value: q, onChange: onQ, placeholder: t("sellersSearch"), aiTarget: "marketplace:seller-search" }}
        count={count}
        onReset={reset}
      />
      {hidden ? <p className="mkm-fnote">{t("sellersNote")}</p> : null}
    </div>
  );
}
