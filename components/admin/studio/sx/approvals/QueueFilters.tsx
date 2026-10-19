"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-approvals.css";
import "./sx-ap3.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { studioCtorRank, useStudioRegistry } from "@/lib/services/studio";
import { Picker } from "../form/Picker";
import { groupOfCode } from "../home/groupModel";
import { GROUP_ICON, UserCheckIcon, ctorIcon, glyph } from "../icons";
import { SxToolbar } from "../layout/Toolbar";
import type { SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import type { ApprRow } from "./model";
import { isFiltered } from "./queue";
import { APPR_Q_MAX, APPR_STATUS_VALUES, EMPTY_APPR_QUERY, type ApprQuery, type ApprStatus } from "./urlState";

export type QueueFiltersProps = { query: ApprQuery; onChange: (next: ApprQuery) => void; rows: readonly ApprRow[]; count: number | null; mineOn?: boolean };

const asStatus = (v: string): ApprStatus => ((APPR_STATUS_VALUES as readonly string[]).includes(v) ? (v as ApprStatus) : "");

export function QueueFilters({ query, onChange, rows, count, mineOn = true }: QueueFiltersProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const all: SxOption = { value: "", label: t("sx.appr.filter.all") };
  const groupOf = (code: string) => groupOfCode(code, reg.groups, reg.items);

  const groups = [...reg.groups].sort((a, b) => a.order - b.order);
  const groupOpts: SxOption[] = [all, ...groups.map((g) => ({ value: g.key, label: labels.groupName(g.key, g.title), icon: GROUP_ICON[g.key] }))];
  if (query.group && !groups.some((g) => g.key === query.group)) groupOpts.push({ value: query.group, label: labels.groupName(query.group) });

  const codes = new Set<string>();
  for (const c of reg.items) if (c.approvalRequired && c.code) codes.add(c.code);
  for (const r of rows) if (r.code) codes.add(r.code);
  if (query.ctor) codes.add(query.ctor);
  const ctorOpts: SxOption[] = [
    all,
    ...[...codes]
      .filter((code) => !query.group || code === query.ctor || groupOf(code) === query.group)
      .sort((a, b) => studioCtorRank(a) - studioCtorRank(b) || a.localeCompare(b))
      .map((code) => {
        const ctor = reg.items.find((c) => c.code === code);
        const gk = groupOf(code);
        const g = gk ? reg.groups.find((x) => x.key === gk) : undefined;
        return { value: code, label: labels.ctorName(code, ctor?.title), icon: ctorIcon(code, gk), group: gk ? labels.groupName(gk, g?.title) : undefined };
      }),
  ];

  const statusOpts: SxOption[] = [all, ...APPR_STATUS_VALUES.map((v) => ({ value: v, label: labels.status(v) }))];

  const setGroup = (v: string) => {
    const keep = !query.ctor || !v || groupOf(query.ctor) === v;
    onChange({ ...query, group: v, ctor: keep ? query.ctor : "" });
  };

  return (
    <SxToolbar
      aiId="admin.studio.approvals.filters"
      search={{
        value: query.q,
        onChange: (v) => onChange({ ...query, q: v.slice(0, APPR_Q_MAX) }),
        placeholder: t("sx.appr.filter.searchPh"),
        label: t("sx.appr.filter.searchLabel"),
        aiId: "admin.studio.approvals.search.input",
      }}
      count={count === null ? undefined : t("sx.appr.count", { n: count })}
      active={isFiltered(query)}
      onReset={() => onChange({ ...EMPTY_APPR_QUERY, open: query.open })}
    >
      <Picker
        size="sm"
        label={t("sx.appr.filter.group")}
        placeholder={t("sx.appr.filter.group")}
        options={groupOpts}
        value={query.group}
        onChange={setGroup}
        searchable={false}
        aiId="admin.studio.approvals.filters.group"
      />
      <Picker
        size="sm"
        label={t("sx.appr.filter.ctor")}
        placeholder={t("sx.appr.filter.ctor")}
        options={ctorOpts}
        value={query.ctor}
        onChange={(v) => onChange({ ...query, ctor: v })}
        searchable
        aiId="admin.studio.approvals.filters.constructor"
      />
      <Picker
        size="sm"
        label={t("sx.appr.filter.status")}
        placeholder={t("sx.appr.filter.status")}
        options={statusOpts}
        value={query.status}
        onChange={(v) => onChange({ ...query, status: asStatus(v) })}
        searchable={false}
        aiId="admin.studio.approvals.filters.status"
      />
      {mineOn || query.mine ? (
        <button
          type="button"
          className="sx-ap3-mine"
          aria-pressed={query.mine}
          onClick={() => onChange({ ...query, mine: !query.mine })}
          data-ai-id="admin.studio.approvals.filters.mine"
          data-ai-type="toggle"
          data-ai-label={t("sx.ap3.mine")}
        >
          {glyph(UserCheckIcon, { size: 15 })}
          <span>{t("sx.ap3.mine")}</span>
        </button>
      ) : null}
    </SxToolbar>
  );
}
