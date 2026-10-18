"use client";

import "../sx-tones.css";
import "./sx-home.css";
import "./sx-group.css";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ListOrderedIcon, TableIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { aiId } from "@/lib/ai/ids";
import { useStudioAccess, useStudioRegistry } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { ArrowRightIcon, RefreshCwIcon, CircleCheckIcon, CircleDashedIcon, FilesIcon, LayersIcon, LockIcon, SearchIcon, ctorGlyph, ctorIcon, glyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxPage } from "../layout/Page";
import { SxPanel } from "../layout/Panel";
import { SxTable, type SxColumn } from "../layout/Table";
import { SxToolbar } from "../layout/Toolbar";
import { SxRing } from "../shared/Ring";
import { SxSegmented } from "../shared/Segmented";
import { StartJourneyButton } from "../shared/StartJourney";
import { groupHue } from "../tones";
import { useStudioLabels, type StudioLabels } from "../useStudioLabels";
import { pctOf } from "./GroupCard";
import { groupNext, groupProgress, groupSteps, type GroupStepRow } from "./groupModel";
import { GroupTile } from "./GroupTile";
import { HealthCard, QuickLinks } from "./group/SidePanels";
import { BlockedLine, StepTimeline } from "./group/StepTimeline";
import { groupQueryOf, matchesGroupQuery, stateCounts, writeGroupQuery, type GroupFilter, type GroupQuery, type GroupView } from "./group/urlState";
import { ctorRecords, sumRecords, useStudioSummary } from "./summary";
import { useActionItems } from "./useActionItems";
import { WaitingPanel } from "./WaitingPanel";

export type GroupNeed = "" | "returned" | "review" | "publish";

const enc = encodeURIComponent;

function StateCell({ row, labels, group }: { row: GroupStepRow; labels: StudioLabels; group: string }) {
  const t = useTranslations("studio");
  if (row.state === "done")
    return (
      <span className="sx-gstate" data-state="done">
        {glyph(CircleCheckIcon, { size: 16 })}
        <span>{t("sx.guide.done")}</span>
      </span>
    );
  if (row.state === "next")
    return (
      <span className="sx-gstate" data-state="next">
        {glyph(ArrowRightIcon, { size: 16 })}
        <span>{t("sx.gpage.state.next")}</span>
      </span>
    );
  if (row.state === "blocked") return <BlockedLine row={row} labels={labels} group={group} />;
  return (
    <span className="sx-gstate" data-state="open">
      {glyph(CircleDashedIcon, { size: 16 })}
      <span>{t("sx.guide.notDone")}</span>
    </span>
  );
}

export function GroupPage({ groupKey, need }: { groupKey: string; need: GroupNeed }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const acc = useStudioAccess();
  const reg = useStudioRegistry();
  const actions = useActionItems();
  const summary = useStudioSummary();
  const params = useSearchParams();
  const [query, setQuery] = useState<GroupQuery>(() => groupQueryOf(params));
  const g = reg.groups.find((x) => x.key === groupKey) ?? null;
  const loaded = reg.items.length > 0 || reg.groups.length > 0;
  const loading = !g && reg.avail === "on" && !loaded && !reg.error;
  const failed = !g && !loaded && !!reg.error;
  const missing = !g && loaded;
  const hue = g ? groupHue(g.key, g.order) : groupHue(groupKey, 1);
  const rows = g ? groupSteps(g, reg.items) : [];
  const { done, total } = groupProgress(rows);
  const pct = pctOf(done, total);
  const next = g ? groupNext(g, rows) : null;
  const nextName = next ? labels.ctorName(next.code, next.ctor?.title) : "";
  const counts = g ? actions.byGroup[g.key] : undefined;
  const hasItems = !!counts && counts.returned + counts.review + counts.publish > 0;
  const name = g ? labels.groupName(g.key, g.title) : "";
  const tally = stateCounts(rows);
  const records = sumRecords(rows, summary.data);
  const recordsOf = (r: GroupStepRow) => ctorRecords(r.code, r.ctor, summary.data);
  const searchText = (r: GroupStepRow) => [labels.ctorName(r.code, r.ctor?.title), r.code, labels.ctorWhat(r.code, { description: r.ctor?.description })].join(" ");
  const shown = rows.filter((r) => matchesGroupQuery(r, query, searchText));
  const filtered = !!query.f || !!query.q.trim();

  const segBox = useRef<HTMLDivElement>(null);
  const hasGroup = !!g;

  useEffect(() => {
    writeGroupQuery(query);
  }, [query, params]);

  useEffect(() => {
    const seg = segBox.current?.querySelector<HTMLElement>(".sx-seg");
    const on = seg?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!seg || !on || seg.scrollWidth <= seg.clientWidth) return;
    seg.scrollLeft = Math.max(0, on.offsetLeft - (seg.clientWidth - on.offsetWidth) / 2);
  }, [query.f, hasGroup]);

  const title = g ? name : missing ? t("sx.gpage.missingTitle") : failed ? t("sx.ui.studio") : "";

  const columns: readonly SxColumn<GroupStepRow>[] = [
    { key: "step", header: t("sx.gpage.col.step"), width: "64px", numeric: true, cell: (r) => <span className="sx-gstep-num">{labels.num(r.step)}</span> },
    {
      key: "ctor",
      header: t("sx.gpage.col.ctor"),
      primary: true,
      cell: (r) => {
        const what = labels.ctorWhat(r.code);
        return (
          <span className="sx-gstep" data-ai-id={aiId("admin.studio.flow.step", r.code)} data-ai-type="list_item" data-ai-label={labels.ctorName(r.code, r.ctor?.title)}>
            <span className="sx-gstep__tile sx-sq">{ctorGlyph(r.code, g?.key, { size: 18 })}</span>
            <span className="sx-gstep__text">
              <span className="sx-gstep__name">{labels.ctorName(r.code, r.ctor?.title)}</span>
              {what ? (
                <span className="sx-gstep__what" title={what}>
                  {what}
                </span>
              ) : null}
            </span>
          </span>
        );
      },
    },
    { key: "state", header: t("sx.gpage.col.state"), cell: (r) => <StateCell row={r} labels={labels} group={g?.key ?? ""} /> },
    {
      key: "records",
      header: t("sx.gpage.col.records"),
      numeric: true,
      hideBelow: "md",
      cell: (r) => {
        const n = recordsOf(r);
        return n === null ? "—" : labels.num(n);
      },
    },
  ];

  const headActions =
    g && g.key === "services_packages" && acc.canEdit ? (
      <>
        <StartJourneyButton type="service" variant="primary" label={t("sx.journeyRun.newService")} aiId="admin.studio.group.new-service" />
        <StartJourneyButton type="package" variant="secondary" label={t("sx.journeyRun.newPackage")} aiId="admin.studio.group.new-package" />
      </>
    ) : undefined;

  let below: ReactNode;
  if (loading)
    below = (
      <div className="sx-gprog" aria-hidden="true">
        <span className="sx-sk sx-gprog__sk" />
      </div>
    );
  else if (g && acc.any)
    below = (
      <div className="sx-gp-hero" data-hue={hue}>
        <div className="sx-gp-hero__prog">
          <SxRing value={pct} size={80} stroke={7} label={t("sx.home.card.progressLabel", { name, done, total })} className="sx-gp-hero__ring">
            <span className="sx-gp-hero__pct">{t("sx.journeyRun.percent", { n: pct })}</span>
          </SxRing>
          <div className="sx-gp-hero__ptext">
            <span className="sx-gprog__count sx-num">{t("sx.home.card.progress", { done, total })}</span>
            <ul className="sx-gp-hero__chips">
              <li className="sx-gp-chip">
                {glyph(LayersIcon, { size: 14 })}
                <span className="sx-num">{t("sx.hm.card.ctors", { n: total })}</span>
              </li>
              {records !== null ? (
                <li className="sx-gp-chip">
                  {glyph(FilesIcon, { size: 14 })}
                  <span className="sx-num">{t("sx.hm.card.records", { n: records })}</span>
                </li>
              ) : null}
              {tally.blocked > 0 ? (
                <li className="sx-gp-chip" data-kind="blocked">
                  {glyph(LockIcon, { size: 14 })}
                  <span className="sx-num">{t("sx.hm.chip.blocked", { n: tally.blocked })}</span>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
        <div className="sx-gp-hero__next">
          {next ? (
            <SxLinkButton variant="primary" size="sm" icon={ctorIcon(next.code, g.key)} iconEnd={ArrowRightIcon} href={`/admin/studio/c/${enc(next.code)}`} aiId="admin.studio.group.next" aiLabel={t("sx.gp.next", { name: nextName })}>
              <span className="sx-gp-hero__nextt">{t("sx.gp.next", { name: nextName })}</span>
            </SxLinkButton>
          ) : (
            <span className="sx-gp-hero__done">
              {glyph(CircleCheckIcon, { size: 16 })}
              <span>{t("sx.home.card.allDone")}</span>
            </span>
          )}
        </div>
      </div>
    );

  const filterItems: { value: GroupFilter; label: string; count: number; icon: typeof LayersIcon; aiId: string }[] = [
    { value: "", label: t("sx.gp.f.all"), count: rows.length, icon: LayersIcon, aiId: "admin.studio.group.filter.all" },
    { value: "done", label: t("sx.gp.f.done"), count: tally.done, icon: CircleCheckIcon, aiId: "admin.studio.group.filter.done" },
    { value: "next", label: t("sx.gp.f.next"), count: tally.next, icon: ArrowRightIcon, aiId: "admin.studio.group.filter.next" },
    { value: "open", label: t("sx.gp.f.open"), count: tally.open, icon: CircleDashedIcon, aiId: "admin.studio.group.filter.open" },
    { value: "blocked", label: t("sx.gp.f.blocked"), count: tally.blocked, icon: LockIcon, aiId: "admin.studio.group.filter.blocked" },
  ];
  const segItems = filterItems.map((f) => ({ ...f, value: (f.value || "all") as "all" | Exclude<GroupFilter, "">, disabled: f.value !== "" && f.count === 0 && query.f !== f.value }));
  const viewItems: { value: GroupView; label: string; icon: typeof LayersIcon; aiId: string }[] = [
    { value: "steps", label: t("sx.gp.view.steps"), icon: ListOrderedIcon, aiId: "admin.studio.group.view.steps" },
    { value: "table", label: t("sx.gp.view.table"), icon: TableIcon, aiId: "admin.studio.group.view.table" },
  ];
  const reset = () => setQuery((q) => ({ ...q, f: "", q: "" }));

  let body: ReactNode;
  if (failed)
    body = (
      <SxNote
        tone="error"
        title={t("sx.ui.errorTitle")}
        action={
          <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={() => void reg.reload()} aiId="admin.studio.group.retry">
            {t("sx.ui.retry")}
          </SxButton>
        }
      >
        {t("sx.ui.loadFail")}
      </SxNote>
    );
  else if (missing)
    body = (
      <SxEmpty
        icon={SearchIcon}
        title={t("sx.gpage.missingTitle")}
        text={t("sx.gpage.missingText")}
        action={
          <SxLinkButton variant="secondary" href="/admin/studio" aiId="admin.studio.group.missing.back">
            {t("sx.editor.toHome")}
          </SxLinkButton>
        }
      />
    );
  else {
    const waiting =
      g && (hasItems || need) ? (
        <WaitingPanel
          data={actions}
          scope={{ group: g.key, need: need || undefined }}
          aiId="admin.studio.group.waiting"
          headerAction={
            need ? (
              <SxLinkButton variant="ghost" size="sm" href={`/admin/studio/g/${enc(g.key)}`} aiId="admin.studio.group.waiting.need-all">
                {t("sx.gpage.needAll")}
              </SxLinkButton>
            ) : undefined
          }
        />
      ) : null;
    const list = !shown.length && filtered ? (
      <SxEmpty
        icon={SearchIcon}
        title={t("sx.gp.noMatch")}
        text={t("sx.gp.noMatchText")}
        action={
          <SxButton variant="secondary" size="sm" onClick={reset} aiId="admin.studio.group.filter.clear">
            {t("sx.table.reset")}
          </SxButton>
        }
      />
    ) : query.view === "table" ? (
      <SxPanel flush title={t("sx.gpage.steps")} titleAs="h2" className="sx-gp-tablepanel">
        <SxTable
          rows={shown}
          columns={columns}
          rowKey={(r) => r.code}
          caption={t("sx.gpage.steps")}
          loading={loading}
          stacked="auto"
          rowHref={(r) => `/admin/studio/c/${enc(r.code)}`}
          rowTitle={(r) => labels.ctorName(r.code, r.ctor?.title)}
          aiId="admin.studio.group.steps"
        />
      </SxPanel>
    ) : g ? (
      <StepTimeline rows={shown} group={g.key} labels={labels} recordsOf={recordsOf} canEdit={acc.canEdit} label={t("sx.gpage.steps")} />
    ) : null;
    body = (
      <div className="sx-gpage__grid" data-wait={waiting ? "" : undefined}>
        {waiting ? <div className="sx-gpage__wait">{waiting}</div> : null}
        <div className="sx-gpage__main">
          {g ? (
            <div className="sx-gp-bar">
              <SxToolbar
                search={{ value: query.q, onChange: (v) => setQuery((q) => ({ ...q, q: v })), placeholder: t("sx.gp.searchPh"), label: t("sx.gp.searchLabel"), aiId: "admin.studio.group.search" }}
                count={filtered ? t("sx.gp.shown", { n: shown.length, total: rows.length }) : undefined}
                active={filtered}
                onReset={reset}
                end={<SxSegmented items={viewItems} value={query.view} onChange={(v) => setQuery((q) => ({ ...q, view: v }))} label={t("sx.gp.view.label")} size="sm" aiId="admin.studio.group.view" />}
                aiId="admin.studio.group.toolbar"
              />
              <div className="sx-gp-bar__seg" ref={segBox}>
                <SxSegmented items={segItems} value={query.f || "all"} onChange={(v) => setQuery((q) => ({ ...q, f: v === "all" ? "" : v }))} label={t("sx.gp.f.label")} size="sm" aiId="admin.studio.group.filter" />
              </div>
            </div>
          ) : null}
          {list}
        </div>
        {g ? (
          <aside className="sx-gpage__side" aria-label={t("sx.gp.side")}>
            <QuickLinks groupKey={g.key} name={name} />
            <HealthCard groupKey={g.key} health={{ done, total, blocked: tally.blocked, counts: counts ?? null, loading: actions.loading }} />
          </aside>
        ) : null}
      </div>
    );
  }

  return (
    <SxPage
      title={title}
      section="home"
      crumbs={[]}
      lead={g ? labels.groupWhat(g.key, g.description) : undefined}
      icon={
        g ? (
          <span data-hue={hue} className="sx-head__tile">
            <span className="sx-gp-glow" />
            <GroupTile groupKey={g.key} order={g.order} size="xl" />
          </span>
        ) : undefined
      }
      actions={headActions}
      below={below}
      aiId="admin.studio.group"
    >
      <>
        <div data-hue={hue} className="sx-gpage">
          {body}
        </div>
      </>
    </SxPage>
  );
}

