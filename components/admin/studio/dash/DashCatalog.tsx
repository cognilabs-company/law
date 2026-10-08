"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import FilterBar from "@/components/filters/FilterBar";
import { aiId } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";
import { isApprovalFree, type StudioConstructor } from "@/lib/services/studio";
import { ctorMeta, ctorOrder, STUDIO_GROUPS } from "@/lib/studio/constructors";
import { ConstructorIcon, StudioCodeChip, StudioEmpty, useStudioText } from "../bits";
import { IconBolt, IconChevronRight, IconFolder, IconGrid, IconLayers, IconRefresh, IconSearch } from "@/components/icons";

export default function DashCatalog({
  items,
  perCode,
  canSync,
  onSync,
}: {
  items: StudioConstructor[];
  perCode: Record<string, number> | null;
  canSync: boolean;
  onSync: () => void;
}) {
  const { t, ctorName, ctorDesc, group: groupLabel, num } = useStudioText();
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState("");
  useAiField("admin.studio.dash.catalog.search.input", { get: () => q, set: setQ });

  if (!items.length) {
    return (
      <StudioEmpty icon={IconLayers} title={t("dash.catalog.emptyTitle")} text={canSync ? t("dash.catalog.emptyAdmin") : t("dash.catalog.emptyText")}>
        {canSync ? (
          <button type="button" className="btn btn--pri btn--sm" onClick={onSync} data-ai-id="admin.studio.dash.catalog.sync" data-ai-type="button" data-ai-label={t("dash.sync.cta")}>
            <IconRefresh aria-hidden />
            {t("dash.sync.cta")}
          </button>
        ) : null}
      </StudioEmpty>
    );
  }

  const sorted = [...items].sort((a, b) => ctorOrder(a.code) - ctorOrder(b.code) || a.code.localeCompare(b.code));
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = sorted.filter((c) => {
    if (grp && ctorMeta(c.code).group !== grp) return false;
    if (!terms.length) return true;
    const hay = [c.code, c.title, c.runtimeTarget, ctorName(c.code, c.title), ctorDesc(c.code)].join(" ").toLowerCase();
    return terms.every((w) => hay.includes(w));
  });
  const groups = STUDIO_GROUPS.map((g) => ({ g, list: shown.filter((c) => ctorMeta(c.code).group === g) })).filter((x) => x.list.length);
  const grpOpts = [
    { value: "", label: t("common.all") },
    ...STUDIO_GROUPS.map((g) => ({ value: g, label: `${groupLabel(g)} (${num(sorted.filter((c) => ctorMeta(c.code).group === g).length)})` })),
  ];

  return (
    <section className="stu-cat" data-ai-id="admin.studio.dash.catalog" data-ai-type="section" data-ai-label={t("dash.catalog.title")}>
      <div className="stu-cat__top">
        <div className="stu-cat__head">
          <h3>{t("dash.catalog.title")}</h3>
          <p>{t("dash.catalog.lead", { n: num(items.length) })}</p>
        </div>
      </div>
      <FilterBar
        className="uf--tray"
        fields={[
          { key: "group", label: t("dash.catalog.group"), icon: IconFolder, value: grp, empty: "", onChange: setGrp, options: grpOpts, aiId: "admin.studio.dash.catalog.filters.group" },
        ]}
        search={{
          value: q,
          onChange: setQ,
          placeholder: t("dash.catalog.searchPh"),
          label: t("common.search"),
          aiId: "admin.studio.dash.catalog.search.input",
        }}
        count={shown.length}
        aiId="admin.studio.dash.catalog.filters"
        aiLabel={t("dash.catalog.title")}
      />
      {!groups.length ? (
        <StudioEmpty icon={IconSearch} title={t("dash.catalog.noResults")} text={t("dash.catalog.noResultsText")}>
          <button
            type="button"
            className="btn btn--line btn--sm"
            onClick={() => {
              setQ("");
              setGrp("");
            }}
            data-ai-id="admin.studio.dash.catalog.reset"
            data-ai-type="button"
            data-ai-label={t("dash.catalog.reset")}
          >
            {t("dash.catalog.reset")}
          </button>
        </StudioEmpty>
      ) : (
        groups.map(({ g, list }) => (
          <div key={g} className="stu-cat__grp">
            <h4 className="stu-cat__gh">
              <span className={`stu-cat__dot stu-cat__dot--${g}`} aria-hidden />
              {groupLabel(g)}
              <small>{num(list.length)}</small>
            </h4>
            <ul className="stu-cat__grid">
              {list.map((c) => {
                const name = ctorName(c.code, c.title);
                const desc = ctorDesc(c.code) || (c.title && c.title !== name ? c.title : "");
                const free = isApprovalFree(c.code, c);
                const n = perCode ? perCode[c.code] ?? 0 : null;
                return (
                  <li key={c.code}>
                    <Link
                      href={`/admin/studio/c/${encodeURIComponent(c.code)}`}
                      className="stu-cat__card"
                      data-ai-id={aiId("admin.studio.dash.ctor", c.code)}
                      data-ai-type="card"
                      data-ai-entity-type="studio_constructor"
                      data-ai-entity-id={c.code}
                      data-ai-label={name}
                    >
                      <span className="stu-cat__row">
                        <ConstructorIcon code={c.code} />
                        <span className="stu-cat__name">
                          <b>{name}</b>
                          <StudioCodeChip code={c.code} />
                        </span>
                        <IconChevronRight className="stu-cat__go" aria-hidden />
                      </span>
                      {desc ? <span className="stu-cat__desc">{desc}</span> : null}
                      <span className="stu-cat__foot">
                        {free ? (
                          <span className="stu-cat__badge stu-cat__badge--free">
                            <IconBolt aria-hidden />
                            {t("dash.catalog.free")}
                          </span>
                        ) : null}
                        {n !== null ? (
                          <span className={`stu-cat__badge${n ? " stu-cat__badge--n" : ""}`}>
                            <IconGrid aria-hidden />
                            {n ? t("dash.catalog.count", { n: num(n) }) : t("dash.catalog.none")}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
