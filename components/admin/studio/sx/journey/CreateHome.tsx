"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "../sx-form.css";
import "./sx-journey.css";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { useRouter } from "@/i18n/navigation";
import { logApiError } from "@/lib/http";
import { useStudioAccess, useStudioRegistry, type StudioConstructor, type StudioCreationJourney, type StudioJourneyType } from "@/lib/services/studio";
import { notify } from "@/lib/toast";
import { SxButton, SxLinkButton } from "../Button";
import { prefersReducedMotion } from "../hooks";
import { ArrowRightIcon, RefreshCwIcon } from "../icons";
import { SxNote } from "../layout/Note";
import { SxPage } from "../layout/Page";
import { SxPanel } from "../layout/Panel";
import { SxPager } from "../layout/Table";
import { SxSegmented, type SxSegItem } from "../shared/Segmented";
import { StartJourneyFields, useStartJourney } from "../shared/StartJourney";
import { creationJourneyHref, JOURNEY_CODE } from "../shared/journeyLinks";
import { useStudioLabels } from "../useStudioLabels";
import { JOURNEY_STATUSES, journeyStatusOf, runJourneyAction, type JourneyAction, type JourneyStatus } from "./journeyApi";
import { useJourneyErrorText } from "./journeyErrors";
import { JourneyTable } from "./JourneyTable";
import { useCreationJourneys } from "./useCreationJourneys";

export const JOURNEY_PAGE = 20;
const INCOMPLETE_ID = "incomplete";
const DEFAULT_STATUS: JourneyStatus = "draft";
const AI = "admin.studio.create";
const LIST_AI: Readonly<Record<JourneyStatus, string>> = { draft: "drafts", completed: "completed", abandoned: "abandoned", archived: "archived" };

export function journeyStatusParam(raw: string | null | undefined): JourneyStatus {
  return journeyStatusOf(String(raw ?? "")) || DEFAULT_STATUS;
}

function writeStatus(status: JourneyStatus): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (status === DEFAULT_STATUS) url.searchParams.delete("status");
  else url.searchParams.set("status", status);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const now = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== now) window.history.replaceState(window.history.state, "", next);
}

const EMPTY_KEY: Readonly<Record<JourneyStatus, string>> = {
  draft: "sx.home.resume.empty",
  completed: "sx.journeyRun.emptyCompleted",
  abandoned: "sx.journeyRun.emptyAbandoned",
  archived: "sx.journeyRun.emptyArchived",
};

export function useJourneyActionRunner(onDone: (j: StudioCreationJourney) => void): {
  acting: string;
  error: unknown;
  clear: () => void;
  run: (j: StudioCreationJourney, action: JourneyAction) => Promise<StudioCreationJourney | null>;
} {
  const t = useTranslations("studio");
  const [acting, setActing] = useState("");
  const [error, setError] = useState<unknown>(null);
  const running = useRef(false);
  const run = async (j: StudioCreationJourney, action: JourneyAction): Promise<StudioCreationJourney | null> => {
    if (running.current) return null;
    if (action !== "restore") {
      const ok = await confirmDialog({
        title: t(`sx.journeyRun.confirm.${action}Title`, { name: j.title || t("sx.ui.untitled") }),
        text: t(`sx.journeyRun.confirm.${action}Text`),
        confirmLabel: t(`sx.journeyRun.act.${action}`),
        cancelLabel: t("sx.ui.cancel"),
        tone: action === "abandon" ? "danger" : "primary",
      });
      if (!ok) return null;
    }
    running.current = true;
    setActing(j.id);
    setError(null);
    try {
      const next = await runJourneyAction(j.id, action);
      onDone(next);
      notify.success(t(`sx.journeyRun.toast.${action}`));
      return next;
    } catch (e) {
      logApiError(`studio.journeys.${action}`, e);
      setError(e);
      return null;
    } finally {
      running.current = false;
      setActing("");
    }
  };
  return { acting, error, clear: () => setError(null), run };
}

function JourneysPanel(): ReactElement {
  const t = useTranslations("studio");
  const errText = useJourneyErrorText();
  const access = useStudioAccess();
  const params = useSearchParams();
  const [status, setStatus] = useState<JourneyStatus>(() => journeyStatusParam(params.get("status")));
  const [page, setPage] = useState(0);
  const data = useCreationJourneys({ status, limit: JOURNEY_PAGE, offset: page * JOURNEY_PAGE });
  const actions = useJourneyActionRunner(data.apply);
  const from = page * JOURNEY_PAGE + 1;
  const to = page * JOURNEY_PAGE + data.items.length;
  const hasRows = data.items.length > 0;
  const failed = data.error && !hasRows ? errText(data.error) : null;
  const actFailed = actions.error ? errText(actions.error) : null;
  const count = data.incompleteCount;
  const title = t("sx.journeyRun.listTitle");

  const pick = (next: JourneyStatus) => {
    if (next === status) return;
    setStatus(next);
    setPage(0);
    actions.clear();
    writeStatus(next);
  };

  const items: SxSegItem<JourneyStatus>[] = JOURNEY_STATUSES.map((s) => ({
    value: s,
    label: t(`sx.journeyRun.filter.${s}`),
    count: s === "draft" && count !== null ? count : undefined,
    aiId: `${AI}.status.${s}`,
  }));

  return (
    <SxPanel
      as="section"
      id={INCOMPLETE_ID}
      flush
      title={title}
      className="sx-jr-list"
      aiId={`${AI}.list`}
    >
      <div className="sx-jr-list__bar">
        <SxSegmented<JourneyStatus> items={items} value={status} onChange={pick} label={t("sx.journeyRun.filterLabel")} size="sm" aiId={`${AI}.status`} />
      </div>
      {actFailed ? (
        <div className="sx-jr-list__note">
          <SxNote tone="error" title={actFailed.title}>
            {actFailed.text}
          </SxNote>
        </div>
      ) : null}
      <JourneyTable
        rows={data.items}
        caption={`${title}: ${t(`sx.journeyRun.filter.${status}`)}`}
        loading={data.loading && !hasRows}
        busy={data.loading && hasRows}
        actingId={actions.acting}
        onAction={access.canEdit ? (j, a) => void actions.run(j, a) : undefined}
        error={
          failed ? (
            <SxNote
              tone="error"
              title={failed.title}
              action={
                <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={data.reload} aiId={`${AI}.${LIST_AI[status]}.retry`}>
                  {t("sx.ui.retry")}
                </SxButton>
              }
            >
              {failed.text}
            </SxNote>
          ) : undefined
        }
        empty={
          <p className="sx-jr-list__empty" role="status">
            {t(EMPTY_KEY[status])}
          </p>
        }
        footer={
          data.total > JOURNEY_PAGE || page > 0 ? (
            <SxPager
              from={from}
              to={to}
              total={data.total}
              busy={data.loading}
              onPrev={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => p + 1)}
              aiId={`${AI}.${LIST_AI[status]}`}
            />
          ) : undefined
        }
        aiId={`${AI}.${LIST_AI[status]}`}
      />
    </SxPanel>
  );
}

export function journeyBlockedBy(items: readonly StudioConstructor[], type: StudioJourneyType): string[] {
  const code = JOURNEY_CODE[type];
  const ctor = items.find((c) => c.code.toUpperCase() === code.toUpperCase());
  if (!ctor) return [];
  if (ctor.missingRequired.length) return [...ctor.missingRequired];
  if (ctor.availability === "blocked") return [...(ctor.navigation?.requiredBefore ?? [])];
  return [];
}

function StartPanel({ initialType }: { initialType: StudioJourneyType | null }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const blockedId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-blocked`;
  const router = useRouter();
  const errText = useJourneyErrorText();
  const starter = useStartJourney();
  const [type, setType] = useState<StudioJourneyType>(initialType ?? "service");
  const [title, setTitle] = useState("");
  const [tried, setTried] = useState(false);
  const running = useRef(false);
  const failed = starter.error ? errText(starter.error) : null;
  const blockedBy = journeyBlockedBy(reg.items, type);
  const blocked = blockedBy.length > 0;
  const nameOf = (c: string) => labels.ctorName(c, reg.items.find((x) => x.code === c)?.title);

  const start = async () => {
    if (blocked) return;
    setTried(true);
    if (!title.trim() || starter.busy || running.current) return;
    running.current = true;
    try {
      const j = await starter.start({ type, title });
      if (j) router.push(creationJourneyHref(j));
    } finally {
      running.current = false;
    }
  };

  return (
    <SxPanel as="section" title={t("sx.journeyRun.startTitle")} className="sx-jr-start" aiId="admin.studio.create.start-panel">
      <div className="sx-jr-start__form">
        <StartJourneyFields
          idPrefix="sx-cr"
          type={type}
          onTypeChange={(next) => {
            setType(next);
            starter.clear();
          }}
          showType
          title={title}
          onTitleChange={(v) => {
            setTitle(v);
            if (starter.error) starter.clear();
          }}
          error={tried && !title.trim() ? t("sx.err.required") : undefined}
          onSubmit={() => void start()}
          aiBase="admin.studio.create"
        />
        {blocked ? (
          <SxNote
            tone="warn"
            id={blockedId}
            action={
              <SxLinkButton variant="secondary" size="sm" iconEnd={ArrowRightIcon} href={`/admin/studio/c/${encodeURIComponent(blockedBy[0])}`} aiId="admin.studio.create.goto-missing">
                {t("sx.cpage.goTo", { name: nameOf(blockedBy[0]) })}
              </SxLinkButton>
            }
          >
            {t("sx.guide.blocked", { list: labels.list(blockedBy.map(nameOf)) })}
          </SxNote>
        ) : null}
        {failed ? (
          <SxNote tone="error" title={failed.title}>
            {failed.text}
          </SxNote>
        ) : null}
        <div className="sx-jr-start__actions">
          <SxButton
            variant="primary"
            busy={starter.busy}
            aria-disabled={blocked || undefined}
            aria-describedby={blocked ? blockedId : undefined}
            onClick={() => void start()}
            aiId="admin.studio.create.start"
          >
            {t("sx.journeyRun.start")}
          </SxButton>
        </div>
      </div>
    </SxPanel>
  );
}

export function CreateHome({ initialType }: { initialType: StudioJourneyType | null }): ReactElement {
  const t = useTranslations("studio");
  const access = useStudioAccess();

  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== `#${INCOMPLETE_ID}`) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(INCOMPLETE_ID)?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <SxPage title={t("sx.journeyRun.title")} section="home" crumbs={[]} lead={t("sx.journeyRun.lead")} aiId="admin.studio.create">
      <div className="sx-jr-home">
        {access.canEdit ? (
          <StartPanel initialType={initialType} />
        ) : (
          <SxNote tone="info" role="note">
            {t("sx.journeyRun.needEdit")}
          </SxNote>
        )}
        <JourneysPanel />
      </div>
    </SxPage>
  );
}
