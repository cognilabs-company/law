"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-approvals.css";
import "./sx-ap2.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import Menu from "@/components/ui/Menu";
import { useRouter } from "@/i18n/navigation";
import { aiSeg } from "@/lib/ai/ids";
import { useAuth } from "@/lib/auth";
import { logApiError } from "@/lib/http";
import { STUDIO_PERM_REASSIGN, processOverdueApprovals } from "@/lib/services/studio";
import { notify } from "@/lib/toast";
import { SxButton } from "../Button";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { RotateCcwIcon, RefreshCwIcon, TimerIcon, SearchIcon, BadgeCheckIcon, glyph, moreGlyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxPage } from "../layout/Page";
import { useStudioLabels } from "../useStudioLabels";
import { BulkBar, BulkDialog, bulkItemOf, type BulkFail, type BulkItem } from "./Bulk";
import { DoneSection } from "./DoneSection";
import type { ApprRow } from "./model";
import { NeedTabs } from "./NeedTabs";
import { QueueFilters } from "./QueueFilters";
import { QueueSection, type ApprPick } from "./QueueSection";
import { isFiltered, rowMatches, sectionRows, showDone, showWork, workRows } from "./queue";
import { ReviewDrawer, type ReviewTarget } from "./review/ReviewDrawer";
import { apprQueryString, EMPTY_APPR_QUERY, type ApprQuery } from "./urlState";
import { useApprovals } from "./useApprovals";

export type ApprovalsPageProps = { initial: ApprQuery };

type Pages = { work: number; done: number };

const FIRST_PAGES: Pages = { work: 0, done: 0 };
const NO_PICK: ReadonlySet<string> = new Set();
const NO_FAILS: ReadonlyMap<string, string> = new Map();

function writeUrl(qs: string): void {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  const now = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== now) window.history.replaceState(window.history.state, "", next);
}

const sameFilters = (a: ApprQuery, b: ApprQuery): boolean => a.status === b.status && a.ctor === b.ctor && a.group === b.group && a.need === b.need && a.q === b.q && a.mine === b.mine;

function doneRowsOf(fromLists: readonly ApprRow[], loaded: readonly ApprRow[] | null): ApprRow[] | null {
  if (!loaded) return null;
  const seen = new Set<string>();
  const out: ApprRow[] = [];
  for (const r of [...loaded, ...fromLists]) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export function ApprovalsPage({ initial }: ApprovalsPageProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const { session } = useAuth();
  const router = useRouter();
  const errorText = useEditorErrorText();
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<ApprQuery>(initial);
  const [pages, setPages] = useState<Pages>(FIRST_PAGES);
  const [doneOpen, setDoneOpen] = useState(initial.status === "published");
  const [target, setTarget] = useState<ReviewTarget | null>(initial.open ? { id: initial.open, row: null } : null);
  const [overdueBusy, setOverdueBusy] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(NO_PICK);
  const [bulk, setBulk] = useState<readonly BulkItem[] | null>(null);
  const [fails, setFails] = useState<ReadonlyMap<string, string>>(NO_FAILS);
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    if (apprQueryString(initial) !== apprQueryString(query)) {
      setQuery(initial);
      setPages(FIRST_PAGES);
      setDoneOpen(initial.status === "published");
      setTarget(initial.open ? { id: initial.open, row: null } : null);
    }
  }
  const locked = query.status === "published";
  const data = useApprovals({ ctor: query.ctor, status: query.status, q: query.q, mine: query.mine, done: doneOpen || locked });

  const qs = apprQueryString(query);
  useEffect(() => {
    writeUrl(qs);
  }, [qs]);

  const match = (r: ApprRow) => rowMatches(r, query, labels, data.served);
  const work = showWork(query);
  const doneShown = showDone(query);
  const workAll = workRows(data.rows);
  const queue = work ? workAll.filter(match) : [];
  const listDone = data.rows.filter((r) => r.section === "done");
  const doneAll = doneRowsOf(listDone, data.doneRows);
  const doneRows = doneAll ? sectionRows(doneAll, "done").filter(match) : null;
  const doneExpanded = doneShown && (doneOpen || locked);
  const filtered = isFiltered(query);
  const count = data.loading ? null : queue.length + (doneExpanded && doneRows ? doneRows.length : 0);

  const allEmpty = !data.loading && !data.error && !filtered && workAll.length === 0 && !doneExpanded;
  const workEmpty = !work || queue.length === 0;
  const doneEmpty = !doneShown || !doneExpanded || (!!doneRows && doneRows.length === 0 && !data.doneLoading);
  const filteredEmpty = !data.loading && !data.error && filtered && workEmpty && doneEmpty;

  const bulkOn = data.viewer.access.canPublish;
  const canPick = (r: ApprRow): boolean => bulkOn && r.kind === "publish" && r.section === "mine";
  const chosen = bulkOn ? queue.filter((r) => canPick(r) && picked.has(r.id)) : [];
  const pick: ApprPick | null = bulkOn
    ? {
        can: canPick,
        has: (id) => picked.has(id),
        toggle: (r) =>
          setPicked((cur) => {
            const next = new Set(cur);
            if (next.has(r.id)) next.delete(r.id);
            else next.add(r.id);
            return next;
          }),
        setMany: (ids, on) =>
          setPicked((cur) => {
            const next = new Set(cur);
            for (const id of ids) {
              if (on) next.add(id);
              else next.delete(id);
            }
            return next;
          }),
      }
    : null;

  const closeBulk = (published: readonly string[], failed: readonly BulkFail[]) => {
    setBulk(null);
    if (published.length || failed.length) setFails(new Map(failed.map((f) => [f.item.id, f.reason])));
    if (!published.length) return;
    setPicked((cur) => {
      const next = new Set(cur);
      for (const id of published) next.delete(id);
      return next;
    });
  };

  const changeFilters = (next: ApprQuery) => {
    if (!sameFilters(query, next)) setPages(FIRST_PAGES);
    setQuery(next);
  };

  const reset = () => changeFilters({ ...EMPTY_APPR_QUERY, open: query.open });

  const openRow = (row: ApprRow) => {
    if (data.limited) {
      router.push(`/admin/studio/o/${encodeURIComponent(row.id)}`);
      return;
    }
    setTarget({ id: row.id, row });
    setQuery((q) => ({ ...q, open: row.id }));
  };

  const close = () => {
    const id = target?.id ?? "";
    setTarget(null);
    setQuery((q) => ({ ...q, open: "" }));
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected && root.current?.contains(active)) return;
      const host = root.current;
      const seg = aiSeg(id);
      const btn = seg && host ? host.querySelector<HTMLElement>(`[data-ai-id$=".row.${CSS.escape(seg)}"]`) : null;
      if (btn) {
        btn.focus();
        return;
      }
      const h1 = host?.closest(".sx-page")?.querySelector<HTMLElement>("h1");
      if (!h1) return;
      if (!h1.hasAttribute("tabindex")) h1.setAttribute("tabindex", "-1");
      h1.focus();
    });
  };

  const runOverdue = async () => {
    if (overdueBusy) return;
    setOverdueBusy(true);
    try {
      await processOverdueApprovals();
      notify.success(t("sx.appr.overdue.ok"));
      data.reload();
    } catch (e) {
      logApiError("studio.sx.approvals.overdue", e);
      notify.error(errorText(e).text);
    } finally {
      setOverdueBusy(false);
    }
  };

  const canOverdue = (session?.permissions ?? []).includes(STUDIO_PERM_REASSIGN);
  const overflow = canOverdue ? (
    <Menu
      items={[{ key: "overdue", label: t("sx.appr.overdue.run"), icon: glyph(TimerIcon, { size: 16 }), onSelect: () => void runOverdue(), aiId: "admin.studio.approvals.process-overdue" }]}
      label={t("sx.ui.more")}
      className="sx-pop sx-menu"
      triggerClassName="sx-ibtn"
      icon={moreGlyph()}
      align="end"
      busy={overdueBusy}
      aiId="admin.studio.approvals.more"
    />
  ) : undefined;

  const retry = (
    <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} busy={data.fetching} onClick={data.reload} aiId="admin.studio.approvals.retry">
      {t("sx.ui.retry")}
    </SxButton>
  );

  const doneSection = doneShown ? (
    <DoneSection
      open={doneOpen || locked}
      locked={locked}
      onToggle={() => {
        setDoneOpen((v) => !v);
        setPages((p) => ({ ...p, done: 0 }));
      }}
      rows={doneRows}
      loading={data.doneLoading}
      error={data.doneError}
      onRetry={data.reload}
      page={pages.done}
      onPage={(p) => setPages((cur) => ({ ...cur, done: p }))}
      onOpen={openRow}
    />
  ) : null;

  let body: ReactElement;
  if (data.error) {
    body = (
      <SxNote tone="error" title={t("sx.ui.errorTitle")} action={retry}>
        {t("sx.ui.loadFail")}
      </SxNote>
    );
  } else if (allEmpty) {
    body = (
      <>
        <SxEmpty icon={BadgeCheckIcon} title={t("sx.appr.empty.allTitle")} text={t("sx.appr.empty.allText")} />
        {doneSection}
      </>
    );
  } else if (filteredEmpty) {
    body = (
      <>
        <SxEmpty
          compact
          icon={SearchIcon}
          title={t("sx.table.noMatch")}
          text={t("sx.appr.empty.filteredText")}
          action={
            <SxButton variant="secondary" size="sm" icon={RotateCcwIcon} onClick={reset} aiId="admin.studio.approvals.empty.reset">
              {t("sx.table.reset")}
            </SxButton>
          }
        />
        {doneExpanded ? null : doneSection}
      </>
    );
  } else {
    body = (
      <>
        {work ? (
          <QueueSection
            rows={queue}
            loading={data.loading}
            busy={data.busy}
            page={pages.work}
            onPage={(p) => setPages((cur) => ({ ...cur, work: p }))}
            openId={target?.id ?? ""}
            onOpen={openRow}
            pick={pick}
            fails={fails}
            more={
              data.hasMore || data.moreBusy
                ? { has: true, loaded: data.loaded, total: data.total, busy: data.moreBusy, error: data.moreError, onMore: data.loadMore }
                : null
            }
          />
        ) : null}
        {doneSection}
      </>
    );
  }

  const found = target ? (data.rows.find((r) => r.id === target.id) ?? doneAll?.find((r) => r.id === target.id)) : undefined;

  return (
    <SxPage title={t("sx.appr.title")} section="approvals" need="review" lead={t("sx.appr.leadNewest")} aiId="admin.studio.approvals" actions={overflow}>
      <div ref={root} className="sx-appr">
        <NeedTabs query={query} onChange={changeFilters} rows={data.rows} loading={data.loading} counts={data.hasMore ? data.counts : null} served={data.served} />
        <QueueFilters query={query} onChange={changeFilters} rows={data.rows} count={count} mineOn={!data.limited} />
        {data.partial ? (
          <SxNote tone="error" action={retry}>
            {t("sx.appr.partial")}
          </SxNote>
        ) : null}
        {data.limited ? (
          <SxNote tone="warn" title={t("sx.appr.limitedTitle")}>
            {t("sx.appr.limitedText")}
          </SxNote>
        ) : null}
        {body}
        {chosen.length ? (
          <BulkBar
            count={chosen.length}
            onPublish={() => {
              setFails(NO_FAILS);
              setBulk(chosen.map(bulkItemOf));
            }}
            onClear={() => setPicked(NO_PICK)}
          />
        ) : null}
      </div>
      <ReviewDrawer target={target ? { id: target.id, row: found ?? target.row } : null} viewer={data.viewer} onClose={close} onChanged={() => data.reload()} />
      {bulk ? <BulkDialog items={bulk} onClose={closeBulk} onFinished={data.reload} /> : null}
    </SxPage>
  );
}
