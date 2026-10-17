"use client";

import "../sx-core.css";
import "../sx-layout.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { matchesSearch } from "@/lib/searchText";
import { listStudioObjects, loadStudioReference, type StudioReferenceItem } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { Picker } from "../form/Picker";
import { ArchiveIcon, ArrowsClockwiseIcon, EyeIcon, MagnifyingGlassIcon, PencilSimpleIcon, WarningCircleIcon, ctorGlyph } from "../icons";
import type { SxOption, SxTone } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { SxDrawer } from "../layout/Drawer";
import { SxEmpty } from "../layout/Empty";
import { SxGuideButton } from "../layout/Guide";
import { SxNote } from "../layout/Note";
import { SxOutline } from "../layout/Outline";
import { SxPanel, SxSectionHeader } from "../layout/Panel";
import { SxStatStrip, type SxStat } from "../layout/StatStrip";
import { SxPager, SxTable, type SxColumn, type SxRowAction } from "../layout/Table";
import { SxToolbar } from "../layout/Toolbar";

const AI = "admin.studio.lab.layout";
const CODE = "K12-PROMO";
const PAGE = 3;
const PLACEMENTS = ["banner", "profile_boost", "service_boost"];
const SALE = ["active", "inactive", "archived"];
const STATS: readonly { key: string; tone: SxTone; href?: string }[] = [
  { key: "draft", tone: "draft" },
  { key: "in_review", tone: "review", href: "/admin/studio/approvals" },
  { key: "approved", tone: "approved", href: "/admin/studio/approvals" },
  { key: "published", tone: "published" },
];
const VIEWS = ["data", "loading", "empty", "error"] as const;
const VIEW_KEY: Readonly<Record<View, string>> = {
  data: "sx.layout.lab.stateData",
  loading: "sx.layout.lab.stateLoading",
  empty: "sx.layout.lab.stateEmpty",
  error: "sx.layout.lab.stateError",
};
const GUIDES = ["K12-PROMO", "K03-M"];

type View = (typeof VIEWS)[number];
type Load = { state: "loading" | "ready" | "error"; items: StudioReferenceItem[] };
type Row = { id: string; code: string; title: string; placement: string; days: number | null; price: number | null; currency: string; status: string; updated: string; boost: number | null; badge: string };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function rowOf(item: StudioReferenceItem): Row {
  const r = item.raw;
  const preview = r.preview && typeof r.preview === "object" ? (r.preview as Record<string, unknown>) : {};
  return {
    id: item.value,
    code: text(r.code),
    title: text(r.title) || item.label,
    placement: text(r.placement),
    days: num(r.days),
    price: num(r.price),
    currency: text(r.currency) || "UZS",
    status: text(r.status) || "active",
    updated: text(r.updated_at),
    boost: num(r.boost_score),
    badge: text(preview.label),
  };
}

function placementRank(p: string): number {
  const i = PLACEMENTS.indexOf(p);
  return i < 0 ? PLACEMENTS.length : i;
}

export function LayoutLab(): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const [load, setLoad] = useState<Load>({ state: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  const [counts, setCounts] = useState<Readonly<Record<string, number | null>> | null>(null);
  const [view, setView] = useState<View>("data");
  const [query, setQuery] = useState("");
  const [sale, setSale] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    loadStudioReference("promotion-packages", "", 100, ac.signal).then(
      (items) => {
        if (!ac.signal.aborted) setLoad({ state: "ready", items });
      },
      () => {
        if (!ac.signal.aborted) setLoad({ state: "error", items: [] });
      },
    );
    return () => ac.abort();
  }, [attempt]);

  useEffect(() => {
    let live = true;
    void Promise.all(STATS.map((s) => listStudioObjects({ status: s.key, limit: 1 }).then((r) => r.total, () => null))).then((values) => {
      if (live) setCounts(Object.fromEntries(STATS.map((s, i) => [s.key, values[i]])));
    });
    return () => {
      live = false;
    };
  }, []);

  const retry = () => {
    setLoad({ state: "loading", items: [] });
    setAttempt((n) => n + 1);
  };
  const resetFilters = () => {
    setQuery("");
    setSale("");
    setPage(0);
  };

  const all = load.items
    .map(rowOf)
    .map((r) => ({ ...r, title: labels.promoPackage(r.code, r.title) }))
    .sort((a, b) => placementRank(a.placement) - placementRank(b.placement) || Number(a.status !== "active") - Number(b.status !== "active"));
  const filtered = all.filter((r) => (!sale || r.status === sale) && matchesSearch(`${r.title} ${r.code}`, query));
  const total = filtered.length;
  const lastPage = Math.max(0, Math.ceil(total / PAGE) - 1);
  const current = Math.min(page, lastPage);
  const rows = view === "data" && load.state === "ready" ? filtered.slice(current * PAGE, current * PAGE + PAGE) : [];
  const opened = all.find((r) => r.id === openId) ?? null;

  const field = (key: string, path?: string) => labels.field(key, { ctor: CODE, path });
  const saleText = (s: string) => labels.option(s, { ctor: CODE, field: "status" });
  const saleOptions: SxOption[] = SALE.map((s) => ({ value: s, label: saleText(s) }));

  const columns: SxColumn<Row>[] = [
    {
      key: "title",
      header: field("title"),
      primary: true,
      cell: (r) => r.title,
      sortValue: (r) => r.title,
    },
    { key: "code", header: field("code"), cell: (r) => (r.code ? <code className="sx-code">{r.code}</code> : "—"), hideBelow: "md" },
    { key: "days", header: field("days"), numeric: true, width: "120px", cell: (r) => (r.days === null ? "—" : labels.days(r.days)), sortValue: (r) => r.days },
    { key: "price", header: field("price"), numeric: true, width: "150px", cell: (r) => (r.price === null ? "—" : labels.money(r.price, r.currency)), sortValue: (r) => r.price },
    { key: "status", header: field("status"), cell: (r) => saleText(r.status), sortValue: (r) => saleText(r.status) },
    { key: "updated", header: t("sx.layout.updated"), cell: (r) => (r.updated ? labels.date(r.updated) : "—"), sortValue: (r) => r.updated || null, hideBelow: "lg" },
  ];
  const actions: SxRowAction<Row>[] = [
    { key: "view", label: t("sx.ui.view"), icon: EyeIcon, onSelect: (r) => setOpenId(r.id) },
    { key: "edit", label: t("sx.ui.edit"), icon: PencilSimpleIcon, href: () => `/admin/studio/c/${CODE}` },
    { key: "archive", label: t("sx.ui.archive"), icon: ArchiveIcon, danger: true, disabled: () => t("sx.layout.lab.noWrites") },
  ];

  const tableError =
    view === "error" || (view === "data" && load.state === "error") ? (
      <SxEmpty
        tone="error"
        icon={WarningCircleIcon}
        title={t("sx.ui.loadFail")}
        action={
          <SxButton variant="secondary" size="sm" icon={ArrowsClockwiseIcon} onClick={retry} aiId={`${AI}.retry`}>
            {t("sx.ui.retry")}
          </SxButton>
        }
      />
    ) : undefined;
  const tableEmpty = (
    <SxEmpty
      compact
      icon={MagnifyingGlassIcon}
      title={t("sx.table.noMatch")}
      action={
        query || sale ? (
          <SxButton variant="ghost" size="sm" onClick={resetFilters} aiId={`${AI}.empty-reset`}>
            {t("sx.table.reset")}
          </SxButton>
        ) : undefined
      }
    />
  );

  const stats: SxStat[] = STATS.map((s) => ({
    key: s.key,
    label: labels.status(s.key),
    value: counts ? (counts[s.key] ?? null) : null,
    tone: s.tone,
    href: s.href,
    aiId: s.href ? `${AI}.stat.${s.key}` : undefined,
  }));

  const sections = [
    { id: "sx-lab-sec-main", key: "asosiy", title: "Asosiy", state: "done" as const, body: [labels.help("code", { ctor: CODE }), labels.help("label", { ctor: CODE, path: "preview.label" })] },
    { id: "sx-lab-sec-price", key: "narx_va_hisob_kitob", title: "Narx va hisob-kitob", state: "error" as const, errors: 2, body: [labels.help("boost_score", { ctor: CODE }), labels.placementWhat("service_boost")] },
    { id: "sx-lab-sec-active", key: "faollik_va_muddat", title: "Faollik va muddat", state: "todo" as const, body: [labels.help("status", { ctor: CODE }), labels.placementWhat("profile_boost")] },
    { id: "sx-lab-sec-content", key: "kontent", title: "Kontent", body: [labels.placementWhat("banner")] },
  ];

  return (
    <div className="sx-lab-layout">
      <SxStatStrip label={t("sx.layout.lab.stats")} loading={!counts} items={stats} />

      <SxPanel
        flush
        titleAs="h3"
        title={labels.ctorName(CODE)}
        aiId={`${AI}.packages`}
        actions={
          <div className="sx-lab-layout__views" role="group" aria-label={t("sx.layout.lab.state")}>
            {VIEWS.map((v) => (
              <SxButton key={v} variant="ghost" size="sm" aria-pressed={view === v} onClick={() => setView(v)} aiId={`${AI}.view.${v}`}>
                {t(VIEW_KEY[v])}
              </SxButton>
            ))}
          </div>
        }
      >
        <div className="sx-lab-layout__bar">
          <SxToolbar
            aiId={`${AI}.toolbar`}
            search={{
              value: query,
              onChange: (v) => {
                setQuery(v);
                setPage(0);
              },
              placeholder: t("sx.layout.lab.searchPh"),
              label: t("sx.layout.lab.search"),
            }}
            count={view === "data" && load.state === "ready" ? t("sx.layout.results", { n: total }) : undefined}
            active={!!query || !!sale}
            onReset={resetFilters}
          >
            <Picker
              size="sm"
              label={field("status")}
              placeholder={field("status")}
              options={saleOptions}
              value={sale}
              onChange={(v: string) => {
                setSale(v);
                setPage(0);
              }}
              aiId={`${AI}.sale`}
            />
          </SxToolbar>
        </div>
        <SxTable
          caption={labels.ctorName(CODE)}
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          rowTitle={(r) => r.title}
          rowTone={(r) => (r.status === "active" ? undefined : "muted")}
          loading={view === "loading" || (view === "data" && load.state === "loading")}
          error={tableError}
          empty={tableEmpty}
          onRowClick={(r) => setOpenId(r.id)}
          rowActions={actions}
          groupBy={(r) => ({ key: r.placement || "other", title: r.placement ? labels.placement(r.placement) : t("sx.layout.otherGroup") })}
          footer={
            view === "data" && total > PAGE ? (
              <SxPager
                from={current * PAGE + 1}
                to={Math.min(total, current * PAGE + PAGE)}
                total={total}
                onPrev={() => setPage(Math.max(0, current - 1))}
                onNext={() => setPage(Math.min(lastPage, current + 1))}
              />
            ) : undefined
          }
          aiId={`${AI}.table`}
        />
      </SxPanel>

      <div className="sx-lab-layout__pair">
        <SxPanel titleAs="h3" title={t("sx.layout.lab.guides")} aiId={`${AI}.guides`}>
          <ul className="sx-lab-layout__guides">
            {GUIDES.map((code) => (
              <li key={code} className="sx-lab-layout__guide">
                {ctorGlyph(code, undefined, { size: 20, className: "sx-lab-layout__gicon" })}
                <div className="sx-lab-layout__gtext">
                  <p className="sx-lab-layout__gname">
                    {labels.ctorName(code)} <code className="sx-code">{code}</code>
                  </p>
                  <p className="sx-lab-layout__gwhat">
                    {labels.ctorWhat(code)} <SxGuideButton code={code} aiId={`${AI}.guide.${code.toLowerCase()}`} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SxPanel>

        <SxPanel titleAs="h3" title={t("sx.layout.lab.notes")} aiId={`${AI}.notes`}>
          <div className="sx-lab-layout__stack">
            <SxNote tone="info" title={labels.status("in_review")}>
              {labels.statusHint("in_review")}
            </SxNote>
            <SxNote
              tone="warn"
              action={
                <SxLinkButton variant="secondary" size="sm" href="/admin/studio/c/MP04" aiId={`${AI}.note.mp04`}>
                  {labels.ctorName("MP04")}
                </SxLinkButton>
              }
            >
              {t("sx.guide.blocked", { list: labels.ctorName("MP04") })}
            </SxNote>
            <SxNote
              tone="error"
              title={t("sx.ui.errorTitle")}
              action={
                <SxButton variant="ghost" size="sm" icon={ArrowsClockwiseIcon} onClick={retry} aiId={`${AI}.note.retry`}>
                  {t("sx.ui.retry")}
                </SxButton>
              }
            >
              {t("sx.ui.loadFail")}
            </SxNote>
            {dismissed ? null : (
              <SxNote tone="success" role="status" onDismiss={() => setDismissed(true)}>
                {t("sx.rail.live")}
              </SxNote>
            )}
          </div>
        </SxPanel>
      </div>

      <SxPanel titleAs="h3" title={t("sx.layout.lab.empties")} aiId={`${AI}.empties`}>
        <div className="sx-lab-layout__pair sx-lab-layout__pair--flat">
          <SxEmpty
            icon={MagnifyingGlassIcon}
            title={t("sx.table.noMatch")}
            action={
              <SxButton variant="ghost" size="sm" onClick={resetFilters} aiId={`${AI}.empty.reset`}>
                {t("sx.table.reset")}
              </SxButton>
            }
          />
          <SxEmpty
            tone="error"
            icon={WarningCircleIcon}
            title={t("sx.ui.errorTitle")}
            text={t("sx.ui.loadFail")}
            action={
              <SxButton variant="secondary" size="sm" icon={ArrowsClockwiseIcon} onClick={retry} aiId={`${AI}.empty.retry`}>
                {t("sx.ui.retry")}
              </SxButton>
            }
          />
        </div>
      </SxPanel>

      <SxPanel titleAs="h3" title={t("sx.layout.lab.outline")} aiId={`${AI}.outline`}>
        <div className="sx-lab-layout__outline">
          <SxOutline
            spy
            label={t("sx.layout.lab.sections")}
            items={sections.map((s) => ({ id: s.id, label: labels.section(s.key, s.title), state: s.state, errors: s.errors }))}
          />
          <div className="sx-lab-layout__sections">
            {sections.map((s) => (
              <section key={s.id} className="sx-lab-layout__section" aria-labelledby={s.id}>
                <SxSectionHeader as="h3" id={s.id} title={labels.section(s.key, s.title)} />
                {s.body.filter(Boolean).map((line) => (
                  <p key={line} className="sx-lab-layout__para">
                    {line}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </SxPanel>

      <SxDrawer
        open={!!opened}
        onClose={() => setOpenId("")}
        title={t("sx.layout.lab.details")}
        description={opened ? opened.title : undefined}
        aiId={`${AI}.drawer`}
        footer={
          <SxButton onClick={() => setOpenId("")} aiId={`${AI}.drawer.close`}>
            {t("sx.ui.close")}
          </SxButton>
        }
      >
        {opened ? (
          <dl className="sx-lab-layout__dl">
            <dt>{field("title")}</dt>
            <dd>{opened.title}</dd>
            <dt>{field("code")}</dt>
            <dd>{opened.code ? <code className="sx-code">{opened.code}</code> : labels.display(null)}</dd>
            <dt>{field("placement")}</dt>
            <dd>{opened.placement ? labels.placement(opened.placement) : labels.display(null)}</dd>
            <dt>{field("days")}</dt>
            <dd>{opened.days === null ? labels.display(null) : labels.days(opened.days)}</dd>
            <dt>{field("price")}</dt>
            <dd className="sx-num">{opened.price === null ? labels.display(null) : labels.money(opened.price, opened.currency)}</dd>
            <dt>{field("boost_score")}</dt>
            <dd className="sx-num">{labels.display(opened.boost)}</dd>
            <dt>{field("label", "preview.label")}</dt>
            <dd>{labels.display(opened.badge)}</dd>
            <dt>{field("status")}</dt>
            <dd>{saleText(opened.status)}</dd>
          </dl>
        ) : null}
      </SxDrawer>
    </div>
  );
}
