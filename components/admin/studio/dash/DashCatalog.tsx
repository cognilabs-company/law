"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import FilterBar from "@/components/filters/FilterBar";
import { aiId } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";
import { isApprovalFree, type StudioConstructor, type StudioGroup } from "@/lib/services/studio";
import { ctorMeta, ctorOrder } from "@/lib/studio/constructors";
import { ConstructorIcon, StudioEmpty } from "../bits";
import { useStudioHuman } from "../human";
import { RiskBadge } from "../guide";
import { CtorState } from "../GroupFlow";
import { IconBolt, IconChevronRight, IconFolder, IconGrid, IconLayers, IconMapPin, IconRefresh, IconSearch, IconShieldCheck } from "@/components/icons";

// A constructor's group as the backend arranges the work (navigation), the
// frontend's own grouping only for an older backend that sends none.
const groupOf = (c: StudioConstructor) => (c.navigation?.groupKey ? { key: c.navigation.groupKey, title: c.navigation.groupTitle, order: c.navigation.groupOrder } : { key: ctorMeta(c.code).group, title: "", order: 100 });

export default function DashCatalog({
  items,
  groups: backendGroups = [],
  perCode,
  canSync,
  onSync,
}: {
  items: StudioConstructor[];
  groups?: StudioGroup[];
  perCode: Record<string, number> | null;
  canSync: boolean;
  onSync: () => void;
}) {
  const { t, ctorName, ctorDesc, group: groupLabel, num, groupTitle, what, surface } = useStudioHuman();
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

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (c: StudioConstructor) => {
    if (!terms.length) return true;
    const hay = [c.code, c.title, ctorName(c.code, c.title), what(c), ...c.experience.whereUsed.map((w) => `${surface(w).title} ${surface(w).what}`)].join(" ").toLowerCase();
    return terms.every((w) => hay.includes(w));
  };
  // The backend's groups and their order as given (§3–4); the frontend's
  // own grouping only for an older backend that sends none.
  let all: { g: { key: string; title: string }; list: StudioConstructor[] }[];
  if (backendGroups.length) {
    all = backendGroups.map((bg) => ({ g: { key: bg.key, title: groupTitle(bg.key, bg.title) }, list: bg.codes.map((c) => items.find((x) => x.code === c)).filter((x): x is StudioConstructor => Boolean(x)) }));
  } else {
    const sorted = [...items].sort((a, b) => groupOf(a).order - groupOf(b).order || (a.navigation?.step ?? 99) - (b.navigation?.step ?? 99) || ctorOrder(a.code) - ctorOrder(b.code) || a.code.localeCompare(b.code));
    all = [];
    for (const c of sorted) {
      const g = groupOf(c);
      let row = all.find((x) => x.g.key === g.key);
      if (!row) all.push((row = { g: { key: g.key, title: g.title || groupLabel(g.key) }, list: [] }));
      row.list.push(c);
    }
  }
  const groups = all.filter((x) => !grp || x.g.key === grp).map((x) => ({ g: x.g, list: x.list.filter(matches) })).filter((x) => x.list.length);
  const shown = groups.flatMap((x) => x.list);
  const grpOpts = [{ value: "", label: t("common.all") }, ...all.map((x) => ({ value: x.g.key, label: `${x.g.title} (${num(x.list.length)})` }))];

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
          <div key={g.key} className="stu-cat__grp">
            <h4 className="stu-cat__gh">
              <span className={`stu-cat__dot stu-cat__dot--${g.key}`} aria-hidden />
              {g.title}
              <small>{num(list.length)}</small>
            </h4>
            <ul className="stu-cat__grid">
              {list.map((c) => {
                const name = ctorName(c.code, c.title);
                const desc = what(c) || ctorDesc(c.code);
                const free = isApprovalFree(c.code, c);
                const where = c.experience.whereUsed;
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
                        {c.navigation?.step ? <span className="stu-cat__step" title={t("flow.stepOf", { n: c.navigation.step, of: c.navigation.steps })}>{c.navigation.step}</span> : null}
                        <ConstructorIcon code={c.code} />
                        <span className="stu-cat__name">
                          <b>{name}</b>
                        </span>
                        <IconChevronRight className="stu-cat__go" aria-hidden />
                      </span>
                      {desc ? <span className="stu-cat__desc">{desc}</span> : null}
                      {where.length ? (
                        <span className="stu-cat__where">
                          {where.slice(0, 2).map((w) => (
                            <span key={`${w.key}-${w.route}`} title={surface(w).what}>
                              <IconMapPin aria-hidden />
                              <b>{surface(w).title}</b>
                              {surface(w).what ? <small>{surface(w).what}</small> : null}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      <span className="stu-cat__foot">
                        <RiskBadge risk={c.experience.risk} compact />
                        <CtorState ctor={c} />
                        {!free ? (
                          <span className="stu-cat__badge">
                            <IconShieldCheck aria-hidden />
                            {t("ux.approvalShort")}
                          </span>
                        ) : null}
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
