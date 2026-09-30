"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import Select from "@/components/Select";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import DatePicker from "@/components/DatePicker";
import { listAdminMarketplaceSellers, MKM_STATUSES } from "@/lib/services/adminMarketplace";
import { searchUsers } from "@/lib/services/backend";
import { todayIso } from "@/lib/services/dash";
import { dayBefore } from "@/lib/demoStats";
import { IconClose, IconRefresh, IconSearch } from "@/components/icons";

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
}: {
  tab: MkmTab;
  value: MkmFilters;
  onChange: (patch: Partial<MkmFilters>) => void;
  q: string;
  onQ: (v: string) => void;
  onReset: () => void;
}) {
  const t = useTranslations("admin.marketplace.filter");
  const tu = useTranslations("admin.userSelect");
  const seen = useRef(new Map<string, SearchOption>());

  const remember = (rows: SearchOption[]) => {
    for (const r of rows) seen.current.set(r.value, r);
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
    const o = seen.current.get(id);
    return { id, label: o?.label ?? "—", sub: o?.sub ?? "" };
  };

  function preset(key: Exclude<Preset, "">) {
    if (value.preset === key) {
      onChange({ from: "", to: "", preset: "" });
      return;
    }
    onChange({ ...presetRange(key), preset: key });
  }

  const partyScoped = tab !== "sellers";
  const hidden = !partyScoped && !!(value.status || value.seller || value.client);
  const active = filtersActive(value) || (!partyScoped && !!q.trim());

  return (
    <div className="mkm-fbar" role="group" aria-label={t("aria")}>
      <div className="mkm-fbar__top">
        <div className="mkm-presets" role="group" aria-label={t("presetsAria")}>
          {PRESETS.map((p) => (
            <button key={p.key} type="button" className="mkm-preset" aria-pressed={value.preset === p.key} onClick={() => preset(p.key)}>
              {t(`presets.${p.key}`)}
            </button>
          ))}
        </div>
        <div className="mkm-dates">
          <span className="mkm-date">
            <DatePicker value={value.from} onChange={(from) => onChange({ from, preset: "" })} placeholder={t("from")} ariaLabel={t("from")} max={value.to || undefined} clearLabel={t("clearDate")} />
          </span>
          <span className="mkm-dates__sep" aria-hidden>
            –
          </span>
          <span className="mkm-date">
            <DatePicker value={value.to} onChange={(to) => onChange({ to, preset: "" })} placeholder={t("to")} ariaLabel={t("to")} min={value.from || undefined} clearLabel={t("clearDate")} />
          </span>
        </div>
        {active ? (
          <button type="button" className="mkm-reset" onClick={onReset}>
            <IconRefresh aria-hidden />
            {t("reset")}
          </button>
        ) : null}
      </div>

      {partyScoped ? (
        <div className="mkm-fbar__grid">
          <div className="mkm-f">
            <Select
              value={value.status}
              onChange={(status) => onChange({ status })}
              ariaLabel={t("status")}
              options={["", ...MKM_STATUSES].map((s) => ({ value: s, label: t(`statusOpt.${s || "all"}`) }))}
            />
          </div>
          <div className="mkm-f">
            <SearchSelect
              single
              value={value.seller ? [value.seller.id] : []}
              onChange={(ids) => onChange({ seller: pickOf(ids) })}
              options={value.seller ? [{ value: value.seller.id, label: value.seller.label, sub: value.seller.sub }] : []}
              onSearch={findSellers}
              placeholder={t("sellerPh")}
              searchPlaceholder={tu("searchPh")}
              emptyText={tu("empty")}
              ariaLabel={t("seller")}
              removeLabel={tu("clear")}
            />
          </div>
          <div className="mkm-f">
            <SearchSelect
              single
              value={value.client ? [value.client.id] : []}
              onChange={(ids) => onChange({ client: pickOf(ids) })}
              options={value.client ? [{ value: value.client.id, label: value.client.label, sub: value.client.sub }] : []}
              onSearch={findClients}
              placeholder={t("clientPh")}
              searchPlaceholder={tu("searchPh")}
              emptyText={tu("empty")}
              ariaLabel={t("client")}
              removeLabel={tu("clear")}
            />
          </div>
        </div>
      ) : (
        <label className="mkm-search">
          <IconSearch aria-hidden />
          <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={t("sellersSearch")} aria-label={t("sellersSearch")} />
          {q ? (
            <button type="button" className="mkm-search__x" onClick={() => onQ("")} aria-label={t("clearSearch")}>
              <IconClose aria-hidden />
            </button>
          ) : null}
        </label>
      )}

      {hidden ? <p className="mkm-fnote">{t("sellersNote")}</p> : null}
    </div>
  );
}
