"use client";

import "./sx-svc-dlg.css";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { listStudioRecords, useStudioAccess, type StudioCreationJourney, type StudioRecord, type StudioRecordQuery } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { recordHref } from "../ctorpage/RecordTable";
import { SxDialog } from "../editor/SxDialog";
import { TextInput } from "../form/TextInput";
import { enterStyle } from "../hooks";
import { ArrowRightIcon, EyeIcon, PencilIcon, RefreshCwIcon, SearchIcon } from "../icons";
import { stepLabel, stepTitleOf } from "../journey/steps";
import { useJourneyDefinitions } from "../journey/journeyApi";
import { useCreationJourneys } from "../journey/useCreationJourneys";
import { SxNote } from "../layout/Note";
import { useNow } from "../live";
import { SxSegmented } from "../shared/Segmented";
import { CREATE_HOME_HREF, creationJourneyHref, journeyObjectId } from "../shared/journeyLinks";
import { SxProgress } from "../shared/Progress";
import { StatusPill } from "../StatusPill";
import { useStudioLabels } from "../useStudioLabels";
import { HomeIcon } from "./homeIcons";

// The services behind the two home cards. "All" is every K02 record, live
// and in Studio, each with its status and a way to open it. "Incomplete" is
// what was started and not finished: Studio drafts of a service and creation
// journeys left part-way — the two halves the summary's incomplete_count is
// made of — each with a way to carry on from where it stopped.

export type ServicesView = "all" | "incomplete";

const CODE = "K02";
const PAGE = 20;
const BASE = "admin.studio.home.services";
const enc = encodeURIComponent;
const JOURNEYS = { status: "draft", type: "service", limit: 50 } as const;

type Page = { key: string; items: StudioRecord[]; total: number; error: unknown };

// One page of records for a query; more appended on request. The first page
// is keyed by its query, so a new query shows its own loading state.
function useRecords(enabled: boolean, q: StudioRecordQuery, nonce: number) {
  const key = JSON.stringify([q.q ?? "", q.status ?? "", q.source ?? "", nonce]);
  const [page, setPage] = useState<Page | null>(null);
  const [more, setMore] = useState<{ key: string; busy: boolean; error: unknown }>({ key: "", busy: false, error: null });
  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    listStudioRecords(CODE, { ...q, limit: PAGE, offset: 0 }, ac.signal)
      .then((r) => setPage({ key, items: r.items, total: r.total, error: null }))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        logApiError("studio.home.services", e);
        setPage({ key, items: [], total: 0, error: e });
      });
    return () => ac.abort();
    // `key` stands for q and nonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  const cur = page && page.key === key ? page : null;
  const loadMore = async () => {
    if (!cur || (more.key === key && more.busy)) return;
    setMore({ key, busy: true, error: null });
    try {
      const r = await listStudioRecords(CODE, { ...q, limit: PAGE, offset: cur.items.length });
      setPage((p) => (p && p.key === key ? { ...p, items: [...p.items, ...r.items.filter((x) => !p.items.some((y) => y.id === x.id))], total: r.total } : p));
      setMore({ key, busy: false, error: null });
    } catch (e) {
      logApiError("studio.home.services.more", e);
      setMore({ key, busy: false, error: e });
    }
  };
  return { cur, loading: enabled && !cur, loadMore, moreBusy: more.key === key && more.busy, moreError: more.key === key ? more.error : null };
}

// A record that is still a Studio draft is carried on; anything else is
// opened to look at.
const EDITABLE = new Set(["draft", "returned", "changes_requested", "rejected"]);
function actionOf(r: StudioRecord): { kind: "edit" | "view"; href: string } {
  const editable = r.source === "studio" && EDITABLE.has(r.status) && !!r.studioObjectId;
  if (editable) return { kind: "edit", href: `/admin/studio/o/${enc(r.studioObjectId)}` };
  const href = recordHref(CODE, r.actions.view) || (r.studioObjectId ? `/admin/studio/o/${enc(r.studioObjectId)}` : "");
  return { kind: "view", href };
}

export type IncompleteRow =
  | { kind: "journey"; id: string; at: number; j: StudioCreationJourney }
  | { kind: "record"; id: string; at: number; r: StudioRecord };

const timeOf = (iso: string): number => {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
};

// The unfinished services this user can carry on: their creation journeys
// left part-way and the Studio drafts of a service. A draft that a journey
// is building is the journey's — shown once, resumed through the journey.
// The home card counts these same rows, so its number is what the list holds.
export type IncompleteServices = { rows: IncompleteRow[]; drafts: number; journeys: number; loading: boolean; error: boolean; reload: () => void };
export function useIncompleteServices(enabled: boolean): IncompleteServices {
  const acc = useStudioAccess();
  const [nonce, setNonce] = useState(0);
  const drafts = useRecords(enabled, { status: "draft", source: "studio" }, nonce);
  const journeys = useCreationJourneys(JOURNEYS, enabled && acc.canEdit);
  const rows: IncompleteRow[] = useMemo(() => {
    const jItems = acc.canEdit ? journeys.items : [];
    const owned = new Set(jItems.map(journeyObjectId).filter(Boolean));
    const list: IncompleteRow[] = [
      ...jItems.map((j) => ({ kind: "journey" as const, id: `j-${j.id}`, at: timeOf(j.updatedAt || j.createdAt), j })),
      ...(drafts.cur?.items ?? []).filter((r) => !owned.has(r.studioObjectId)).map((r) => ({ kind: "record" as const, id: `r-${r.id}`, at: timeOf(r.updatedAt), r })),
    ];
    return list.sort((a, b) => b.at - a.at);
  }, [acc.canEdit, journeys.items, drafts.cur]);
  const reload = () => {
    setNonce((n) => n + 1);
    journeys.reload();
  };
  return {
    rows,
    drafts: rows.filter((r) => r.kind === "record").length,
    journeys: rows.filter((r) => r.kind === "journey").length,
    loading: drafts.loading || (acc.canEdit && journeys.loading && !journeys.items.length),
    error: !!drafts.cur?.error && (!acc.canEdit || !!journeys.error),
    reload,
  };
}

export function ServicesDialog({
  open,
  view,
  onView,
  onClose,
  incomplete: inc,
  allHref,
}: {
  open: boolean;
  view: ServicesView;
  onView: (v: ServicesView) => void;
  onClose: () => void;
  incomplete: IncompleteServices;
  allHref: string;
}): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const acc = useStudioAccess();
  const now = useNow();
  const [q, setQ] = useState("");
  const [qLive, setQLive] = useState("");
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const h = setTimeout(() => setQ(qLive.trim()), 300);
    return () => clearTimeout(h);
  }, [qLive]);

  const all = useRecords(open && view === "all", { q, source: "" }, nonce);
  const incomplete = inc.rows;
  const defs = useJourneyDefinitions(open && view === "incomplete" && inc.journeys > 0).defs;
  const tr = (key: string) => t(key);

  const fmt = (n: number) => labels.num(n);
  const ago = (iso: string) => (iso && now ? t("sx.mon.ago", { v: labels.ago(iso, now) }) : "");
  const isAll = view === "all";
  const loading = isAll ? all.loading : inc.loading;
  const failed = isAll ? !!all.cur?.error : inc.error;
  const retry = () => (isAll ? setNonce((n) => n + 1) : inc.reload());
  const allRows = all.cur?.items ?? [];
  const hasMore = isAll && !!all.cur && allRows.length < all.cur.total;

  const rowAction = (kind: "edit" | "view", href: string, name: string, id: string) =>
    href ? (
      <SxLinkButton
        variant={kind === "edit" ? "primary" : "secondary"}
        size="sm"
        icon={kind === "edit" ? PencilIcon : EyeIcon}
        href={href}
        aiId={aiId(BASE, view, id, kind)}
        aiLabel={t(kind === "edit" ? "sx.hm.svc.continueOf" : "sx.hm.svc.viewOf", { name })}
      >
        {t(kind === "edit" ? "sx.hm.svc.continue" : "sx.hm.svc.view")}
        <span className="sx-vh">: {name}</span>
      </SxLinkButton>
    ) : null;

  let body: ReactElement;
  if (failed)
    body = (
      <SxNote
        tone="error"
        title={t("sx.ui.errorTitle")}
        action={
          <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={retry} aiId={aiId(BASE, "retry")}>
            {t("sx.ui.retry")}
          </SxButton>
        }
      >
        {t("sx.ui.loadFail")}
      </SxNote>
    );
  else if (loading)
    body = (
      <ul className="sx-svl" aria-busy="true" aria-label={t("sx.ui.loading")}>
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="sx-svl__row" data-sk="">
            <span className="sx-sk sx-svl__sk-ic" />
            <span className="sx-svl__main">
              <span className="sx-sk sx-svl__sk-t" style={{ width: `${54 + ((i * 13) % 30)}%` }} />
              <span className="sx-sk sx-svl__sk-m" />
            </span>
          </li>
        ))}
      </ul>
    );
  else if (isAll && !allRows.length)
    body = <p className="sx-svl__empty">{q ? t("sx.hm.svc.noMatch") : t("sx.hm.svc.emptyAll")}</p>;
  else if (!isAll && !incomplete.length)
    body = (
      <div className="sx-svl__done">
        <HomeIcon name="services" size={44} />
        <b>{t("sx.hm.svc.emptyIncomplete")}</b>
        <span>{t("sx.hm.svc.emptyIncompleteText")}</span>
      </div>
    );
  else if (isAll)
    body = (
      <>
        <ul className="sx-svl" aria-label={t("sx.hm.svc.allTitle")}>
          {allRows.map((r, i) => {
            const name = r.title || t("sx.ui.untitled");
            const act = actionOf(r);
            const meta = [r.source === "runtime" ? t("sx.hm.svc.live") : t("sx.hm.svc.inStudio"), r.version, ago(r.updatedAt), r.owner].filter(Boolean).join(" · ");
            return (
              <li key={r.id} className="sx-svl__row sx-enter" style={enterStyle(Math.min(i, 10))} data-ai-id={aiId(BASE, "all", r.id)} data-ai-type="list_item" data-ai-label={name}>
                <span className="sx-svl__ic" data-kind={act.kind} aria-hidden="true">
                  <HomeIcon name="services" size={26} />
                </span>
                <span className="sx-svl__main">
                  <span className="sx-svl__t">{name}</span>
                  <span className="sx-svl__m sx-num">{meta}</span>
                </span>
                <StatusPill status={r.status} source={r.source} size="sm" className="sx-svl__pill" />
                <span className="sx-svl__act">{rowAction(act.kind, act.href, name, r.id)}</span>
              </li>
            );
          })}
        </ul>
        {hasMore ? (
          <div className="sx-svl__more">
            <SxButton variant="ghost" size="sm" busy={all.moreBusy} onClick={() => void all.loadMore()} aiId={aiId(BASE, "more")}>
              {t("sx.hm.svc.more", { n: fmt((all.cur?.total ?? 0) - allRows.length) })}
            </SxButton>
            {all.moreError ? <span className="sx-svl__err">{t("sx.ui.loadFail")}</span> : null}
          </div>
        ) : null}
      </>
    );
  else
    body = (
      <ul className="sx-svl" aria-label={t("sx.hm.svc.incompleteTitle")}>
        {incomplete.map((row, i) => {
          if (row.kind === "journey") {
            const j = row.j;
            const name = j.title || t("sx.ui.untitled");
            const pct = j.progress === null ? "" : t("sx.journeyRun.percent", { n: Math.round(j.progress) });
            const step = stepLabel(j.currentStep, tr, stepTitleOf(defs, j.type, j.currentStep));
            const meta = [t("sx.hm.svc.wizard"), step, ago(j.updatedAt || j.createdAt)].filter(Boolean).join(" · ");
            return (
              <li key={row.id} className="sx-svl__row sx-enter" style={enterStyle(Math.min(i, 10))} data-ai-id={aiId(BASE, "incomplete", j.id)} data-ai-type="list_item" data-ai-label={name}>
                <span className="sx-svl__ic" data-kind="journey" aria-hidden="true">
                  <HomeIcon name="incomplete" size={26} />
                </span>
                <span className="sx-svl__main">
                  <span className="sx-svl__t">{name}</span>
                  <span className="sx-svl__m sx-num">{meta}</span>
                </span>
                {j.progress !== null ? (
                  <span className="sx-svl__prog">
                    <SxProgress value={j.progress} label={`${name}: ${pct}`} size="sm" />
                    <span className="sx-num">{pct}</span>
                  </span>
                ) : (
                  <span />
                )}
                <span className="sx-svl__act">{rowAction("edit", creationJourneyHref(j), name, j.id)}</span>
              </li>
            );
          }
          const r = row.r;
          const name = r.title || t("sx.ui.untitled");
          const act = actionOf(r);
          const meta = [t("sx.hm.svc.draft"), ago(r.updatedAt), r.owner].filter(Boolean).join(" · ");
          return (
            <li key={row.id} className="sx-svl__row sx-enter" style={enterStyle(Math.min(i, 10))} data-ai-id={aiId(BASE, "incomplete", r.id)} data-ai-type="list_item" data-ai-label={name}>
              <span className="sx-svl__ic" data-kind="edit" aria-hidden="true">
                <HomeIcon name="services" size={26} />
              </span>
              <span className="sx-svl__main">
                <span className="sx-svl__t">{name}</span>
                <span className="sx-svl__m sx-num">{meta}</span>
              </span>
              <StatusPill status={r.status} source={r.source} size="sm" className="sx-svl__pill" />
              <span className="sx-svl__act">{rowAction(act.kind, act.href, name, r.id)}</span>
            </li>
          );
        })}
      </ul>
    );

  const footer = (
    <>
      {isAll ? (
        allHref ? (
          <SxLinkButton variant="ghost" size="sm" iconEnd={ArrowRightIcon} href={allHref} aiId={aiId(BASE, "list")}>
            {t("sx.hm.svc.openList")}
          </SxLinkButton>
        ) : null
      ) : acc.canEdit ? (
        <SxLinkButton variant="ghost" size="sm" iconEnd={ArrowRightIcon} href={`${CREATE_HOME_HREF}#incomplete`} aiId={aiId(BASE, "wizards")}>
          {t("sx.hm.svc.openWizards")}
        </SxLinkButton>
      ) : null}
      <SxButton variant="secondary" size="sm" onClick={onClose} aiId={aiId(BASE, "close")}>
        {t("sx.ui.close")}
      </SxButton>
    </>
  );

  return (
    <SxDialog open={open} onClose={onClose} title={t(isAll ? "sx.hm.svc.allTitle" : "sx.hm.svc.incompleteTitle")} description={t(isAll ? "sx.hm.svc.allLead" : "sx.hm.svc.incompleteLead")} footer={footer} aiId={BASE}>
      <div className="sx-svd">
        <SxSegmented<ServicesView>
          items={[
            { value: "all", label: t("sx.hm.svc.tabAll"), count: all.cur?.total, aiId: aiId(BASE, "tab", "all") },
            { value: "incomplete", label: t("sx.hm.svc.tabIncomplete"), count: inc.loading ? undefined : incomplete.length, aiId: aiId(BASE, "tab", "incomplete") },
          ]}
          value={view}
          onChange={onView}
          label={t("sx.hm.svc.tabs")}
          size="sm"
          stretch
          aiId={aiId(BASE, "tabs")}
        />
        {isAll ? (
          <TextInput
            value={qLive}
            onChange={setQLive}
            leading={SearchIcon}
            size="sm"
            type="search"
            placeholder={t("sx.hm.svc.search")}
            aria-label={t("sx.hm.svc.search")}
            aiId={aiId(BASE, "search")}
          />
        ) : null}
        <div className="sx-svd__body">{body}</div>
      </div>
    </SxDialog>
  );
}
