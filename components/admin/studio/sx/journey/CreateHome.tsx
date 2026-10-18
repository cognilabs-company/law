"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "../sx-form.css";
import "./sx-journey.css";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { JOURNEY_STATUS, useStudioAccess, useStudioRegistry, type StudioConstructor, type StudioJourneyType } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { prefersReducedMotion } from "../hooks";
import { ArrowRightIcon, RefreshCwIcon, ChevronDownIcon, ChevronUpIcon } from "../icons";
import { SxNote } from "../layout/Note";
import { SxPage } from "../layout/Page";
import { SxPanel } from "../layout/Panel";
import { SxPager } from "../layout/Table";
import { StartJourneyFields, useStartJourney } from "../shared/StartJourney";
import { creationJourneyHref, JOURNEY_CODE } from "../shared/journeyLinks";
import { useStudioLabels } from "../useStudioLabels";
import { JourneyTable, type JourneyListKind } from "./JourneyTable";
import { useCreationJourneys } from "./useCreationJourneys";

export const JOURNEY_PAGE = 20;
const INCOMPLETE_ID = "incomplete";

type ListProps = {
  list: JourneyListKind;
  status: string;
  title: string;
  emptyText: string;
  id?: string;
  showCount?: boolean;
};

function JourneyList({ list, status, title, emptyText, id, showCount = false }: ListProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const errText = useEditorErrorText();
  const [page, setPage] = useState(0);
  const data = useCreationJourneys({ status, limit: JOURNEY_PAGE, offset: page * JOURNEY_PAGE });
  const from = page * JOURNEY_PAGE + 1;
  const to = page * JOURNEY_PAGE + data.items.length;
  const hasRows = data.items.length > 0;
  const failed = data.error && !hasRows ? errText(data.error) : null;
  const count = showCount && data.incompleteCount !== null ? data.incompleteCount : null;
  return (
    <SxPanel
      as="section"
      id={id}
      flush
      title={title}
      className="sx-jr-list"
      actions={count !== null ? <span className="sx-num sx-jr-list__count">{labels.num(count)}</span> : undefined}
    >
      <JourneyTable
        list={list}
        rows={data.items}
        caption={title}
        loading={data.loading && !hasRows}
        busy={data.loading && hasRows}
        error={
          failed ? (
            <SxNote
              tone="error"
              title={failed.title}
              action={
                <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={data.reload} aiId={`admin.studio.create.${list}.retry`}>
                  {t("sx.ui.retry")}
                </SxButton>
              }
            >
              {failed.text}
            </SxNote>
          ) : undefined
        }
        empty={<p className="sx-jr-list__empty" role="status">{emptyText}</p>}
        footer={
          data.total > JOURNEY_PAGE || page > 0 ? (
            <SxPager
              from={from}
              to={to}
              total={data.total}
              busy={data.loading}
              onPrev={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => p + 1)}
              aiId={`admin.studio.create.${list}`}
            />
          ) : undefined
        }
      />
    </SxPanel>
  );
}

function CompletedList(): ReactElement {
  const t = useTranslations("studio");
  const [open, setOpen] = useState(false);
  return (
    <div className="sx-jr-done">
      <SxButton
        variant="ghost"
        size="sm"
        iconEnd={open ? ChevronUpIcon : ChevronDownIcon}
        aria-expanded={open}
        aria-controls="sx-jr-completed"
        onClick={() => setOpen((v) => !v)}
        aiId="admin.studio.create.completed.toggle"
      >
        {t(open ? "sx.journeyRun.hideCompleted" : "sx.journeyRun.showCompleted")}
      </SxButton>
      {open ? (
        <div id="sx-jr-completed">
          <JourneyList list="completed" status={JOURNEY_STATUS.completed} title={t("sx.journeyRun.completed")} emptyText={t("sx.journeyRun.emptyCompleted")} />
        </div>
      ) : null}
    </div>
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
  const errText = useEditorErrorText();
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
        <JourneyList list="drafts" status={JOURNEY_STATUS.drafts} title={t("sx.journeyRun.drafts")} emptyText={t("sx.home.resume.empty")} />
        <JourneyList list="incomplete" id={INCOMPLETE_ID} status={JOURNEY_STATUS.incomplete} title={t("sx.journeyRun.incomplete")} emptyText={t("sx.journeyRun.emptyIncomplete")} showCount />
        <CompletedList />
      </div>
    </SxPage>
  );
}
