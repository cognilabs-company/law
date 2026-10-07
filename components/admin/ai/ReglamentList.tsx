"use client";

import FilterBar from "@/components/filters/FilterBar";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { aiId } from "@/lib/ai/ids";
import { isForbidden } from "@/lib/http";
import { REGLAMENT_CATEGORIES, REGLAMENT_STATUSES, type Reglament } from "@/lib/services/aiReglaments";
import { CategoryChip, LoadFailed, MissingState, ReglamentGlyph, StatusPill, VersionBadge, useRgl } from "./bits";
import { IconCircleCheck, IconClock, IconEdit, IconFileText, IconHistory, IconPaperclip, IconPlus, IconSearch, IconTag, IconUpload } from "@/components/icons";

export type Phase = "loading" | "ready" | "missing" | "error";

const keyOf = (r: Reglament) => r.id || r.title;

export default function ReglamentList({
  phase,
  items,
  error,
  busy,
  q,
  onQ,
  cat,
  onCat,
  st,
  onSt,
  canCreate,
  canUpload,
  canEdit,
  editBusy,
  flashId,
  onOpen,
  onEdit,
  onCreate,
  onUpload,
  onRetry,
}: {
  phase: Phase;
  items: Reglament[];
  error: unknown;
  busy: boolean;
  q: string;
  onQ: (v: string) => void;
  cat: string;
  onCat: (v: string) => void;
  st: string;
  onSt: (v: string) => void;
  canCreate: boolean;
  canUpload: boolean;
  canEdit: boolean;
  editBusy: string;
  flashId: string;
  onOpen: (r: Reglament) => void;
  onEdit: (r: Reglament) => void;
  onCreate: () => void;
  onUpload: () => void;
  onRetry: () => void;
}) {
  const { t, cat: catLabel, status: statusLabel, when, num } = useRgl();

  if (phase === "loading") return <Skeleton rows={4} />;
  if (phase === "missing") return <MissingState onRecheck={onRetry} busy={busy} />;
  if (phase === "error") return <LoadFailed forbidden={isForbidden(error)} onRetry={onRetry} busy={busy} />;

  if (!items.length) {
    return (
      <div className="rgl-first">
        <span className="rgl-first__ico" aria-hidden>
          <IconFileText />
        </span>
        <b>{t("empty.list")}</b>
        <p>{t("empty.listText")}</p>
        {canCreate || canUpload ? (
          <div className="rgl-first__acts">
            {canUpload ? (
              <button type="button" className="btn btn--line btn--sm" onClick={onUpload}>
                <IconUpload aria-hidden />
                {t("uploadCta")}
              </button>
            ) : null}
            {canCreate ? (
              <button type="button" className="btn btn--pri btn--sm" onClick={onCreate}>
                <IconPlus aria-hidden />
                {t("newCta")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const present = [...new Set(items.map((r) => r.category).filter(Boolean))];
  if (cat && !present.includes(cat)) present.push(cat);
  const presets = REGLAMENT_CATEGORIES as readonly string[];
  present.sort((a, b) => {
    const ia = presets.indexOf(a);
    const ib = presets.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return catLabel(a).localeCompare(catLabel(b));
  });
  const catOpts = [
    { value: "", label: t("filter.all") },
    ...present.map((c) => ({ value: c, label: `${catLabel(c)} (${num(items.filter((r) => r.category === c).length)})` })),
  ];
  const stOpts = [
    { value: "", label: t("filter.all") },
    ...REGLAMENT_STATUSES.map((s) => ({ value: s, label: `${statusLabel(s)} (${num(items.filter((r) => r.status === s).length)})` })),
  ];
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((r) => {
    if (cat && r.category !== cat) return false;
    if (st && r.status !== st) return false;
    if (!terms.length) return true;
    const hay = [r.title, r.category, catLabel(r.category), r.version, r.fileName, r.content].join(" ").toLowerCase();
    return terms.every((w) => hay.includes(w));
  });

  return (
    <>
      <FilterBar
        className="uf--tray rglf"
        fields={[
          { key: "category", label: t("filter.category"), icon: IconTag, value: cat, empty: "", onChange: onCat, options: catOpts, aiId: "admin.ai-reglaments.filters.category" },
          { key: "status", label: t("filter.status"), icon: IconCircleCheck, value: st, empty: "", onChange: onSt, options: stOpts, aiId: "admin.ai-reglaments.filters.status" },
        ]}
        search={{ value: q, onChange: onQ, placeholder: t("filter.searchPh"), label: t("filter.search"), aiId: "admin.ai-reglaments.search.input", aiTarget: "ai-reglaments:search" }}
        count={shown.length}
        aiId="admin.ai-reglaments.filters"
        aiTarget="ai-reglaments:filters"
        aiLabel={t("filter.title")}
      />

      {!shown.length ? (
        <EmptyState icon={<IconSearch />} title={t("empty.noResults")} text={t("empty.noResultsText")} />
      ) : (
        <ul className="rgl-rows" data-ai-id="admin.ai-reglaments.list" data-ai-type="list" data-ai-target="ai-reglaments:list" data-ai-label={t("list.title")}>
          {shown.map((r) => {
            const fromFile = Boolean(r.fileName) || r.source === "upload" || r.source === "file";
            const k = keyOf(r);
            return (
              <li
                key={k}
                className={`rgl-row${flashId && flashId === r.id ? " is-new" : ""}`}
                data-ai-id={aiId("admin.ai-reglaments.item", k)}
                data-ai-type="list_item"
                data-ai-entity-type="ai_support_reglament"
                data-ai-entity-id={r.id || undefined}
                data-ai-label={r.title}
              >
                <button type="button" className="rgl-row__main" onClick={() => onOpen(r)} data-ai-id={aiId("admin.ai-reglaments.item", k, "open")}>
                  <ReglamentGlyph status={r.status} />
                  <span className="rgl-row__body">
                    <span className="rgl-row__t">{r.title}</span>
                    <span className="rgl-row__meta">
                      <CategoryChip category={r.category} />
                      {r.updatedAt ? (
                        <span>
                          <IconClock aria-hidden />
                          {t("row.updated", { date: when(r.updatedAt) })}
                        </span>
                      ) : null}
                      {r.versions.length > 1 ? (
                        <span>
                          <IconHistory aria-hidden />
                          {t("row.versions", { n: r.versions.length })}
                        </span>
                      ) : null}
                      {fromFile ? (
                        <span>
                          <IconPaperclip aria-hidden />
                          {t("row.fromFile")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="rgl-row__side">
                    <VersionBadge version={r.version} />
                    <StatusPill status={r.status} raw={r.statusRaw} />
                  </span>
                </button>
                {canEdit && r.id ? (
                  <span className="rgl-row__acts">
                    <button
                      type="button"
                      className="aitem__act"
                      onClick={() => onEdit(r)}
                      disabled={Boolean(editBusy)}
                      aria-label={t("row.edit", { title: r.title })}
                      title={t("row.editShort")}
                      data-ai-id={aiId("admin.ai-reglaments.item", k, "edit")}
                    >
                      {editBusy === r.id ? <span className="rgl-spin" aria-hidden /> : <IconEdit aria-hidden />}
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
