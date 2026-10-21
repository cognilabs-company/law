"use client";

import "./sx-home.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { useStudioAccess } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { enterStyle } from "../hooks";
import { RefreshCwIcon, ChevronRightIcon, PlusIcon, glyph } from "../icons";
import { useJourneyDefinitions } from "../journey/journeyApi";
import { stepLabel, stepTitleOf } from "../journey/steps";
import { useCreationJourneys } from "../journey/useCreationJourneys";
import { SxNote } from "../layout/Note";
import { SxPanel } from "../layout/Panel";
import { useNow } from "../live";
import { CREATE_HOME_HREF, creationJourneyHref } from "../shared/journeyLinks";
import { SxProgress } from "../shared/Progress";
import { StatusPill } from "../StatusPill";
import { useStudioLabels } from "../useStudioLabels";
import { CtorArt, HomeIcon } from "./homeIcons";
import { useMyObjects } from "./useActionItems";
import { WaitingSkeleton } from "./WaitingPanel";

const BASE = "admin.studio.home.resume";
const DRAFTS = { status: "draft", limit: 3, offset: 0 } as const;
const enc = encodeURIComponent;

export function ResumePanel(): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const acc = useStudioAccess();
  const now = useNow();
  const journeys = useCreationJourneys(DRAFTS, acc.canEdit);
  const defs = useJourneyDefinitions(acc.canEdit && journeys.items.length > 0).defs;
  const tr = (key: string) => t(key);
  const mine = useMyObjects(3);
  const jItems = acc.canEdit ? journeys.items.slice(0, 3) : [];
  const jLoading = acc.canEdit && journeys.loading;
  const jFailed = acc.canEdit && !!journeys.error && !jItems.length;
  const mFailed = !!mine.error && !mine.items.length;
  const incomplete = acc.canEdit ? (journeys.incompleteCount ?? 0) : 0;
  const loading = (jLoading && !jItems.length) || (mine.loading && !mine.items.length);
  const sources = acc.canEdit ? 2 : 1;
  const failures = (jFailed ? 1 : 0) + (mFailed ? 1 : 0);
  const retryAll = () => {
    if (jFailed) journeys.reload();
    if (mFailed) mine.reload();
  };
  const retry = (
    <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={retryAll} aiId={aiId(BASE, "retry")}>
      {t("sx.ui.retry")}
    </SxButton>
  );
  const errorNote =
    failures > 0 ? (
      <div className="sx-hpad">
        <SxNote tone="error" action={retry}>
          {t("sx.home.waiting.fail")}
        </SxNote>
      </div>
    ) : null;

  let body: ReactNode;
  if (loading) body = <WaitingSkeleton />;
  else if (failures === sources) body = errorNote;
  else if (!jItems.length && !mine.items.length && incomplete <= 0)
    body = (
      <>
        {errorNote}
        <p className="sx-hempty" role="status">
          {t("sx.home.resume.empty")}
        </p>
        {acc.canEdit ? (
          <div className="sx-hempty-act">
            <SxLinkButton variant="ghost" size="sm" icon={PlusIcon} href={CREATE_HOME_HREF} aiId={aiId(BASE, "create")}>
              {t("sx.journeyRun.title")}
            </SxLinkButton>
          </div>
        ) : null}
      </>
    );
  else
    body = (
      <>
        {errorNote}
        {jItems.length || incomplete > 0 ? (
          <ul className="sx-hlist">
            {jItems.map((j, i) => {
              const title = j.title || t("sx.ui.untitled");
              const pct = j.progress === null ? "—" : t("sx.journeyRun.percent", { n: Math.round(j.progress) });
              const meta = [t(j.type === "package" ? "sx.journeyRun.package" : "sx.journeyRun.service"), stepLabel(j.currentStep, tr, stepTitleOf(defs, j.type, j.currentStep))].filter(Boolean).join(" · ");
              return (
                <li key={j.id} className="sx-enter" style={enterStyle(Math.min(i, 12))}>
                  <Link href={creationJourneyHref(j)} className="sx-hrow" data-ai-id={aiId(BASE, "item", j.id)} data-ai-type="list_item" data-ai-label={title}>
                    <span className="sx-hrow__icon" data-kind="journey">
                      <HomeIcon name={j.type === "package" ? "packages" : "services"} size={28} />
                    </span>
                    <span className="sx-hrow__main">
                      <span className="sx-hrow__title">{title}</span>
                      <span className="sx-hrow__meta">{meta}</span>
                    </span>
                    <span className="sx-hrow__side" data-row="">
                      <SxProgress value={j.progress} label={`${title}: ${pct}`} size="sm" className="sx-hrow__bar" />
                      <span className="sx-hrow__pct sx-num">{pct}</span>
                    </span>
                    <span className="sx-hrow__caret">{glyph(ChevronRightIcon, { size: 16 })}</span>
                  </Link>
                </li>
              );
            })}
            {incomplete > 0 ? (
              <li className="sx-enter" style={enterStyle(jItems.length)}>
                <Link href={`${CREATE_HOME_HREF}#incomplete`} className="sx-hrow" data-ai-id={aiId(BASE, "incomplete")} data-ai-type="link" data-ai-label={t("sx.home.resume.incomplete", { n: incomplete })}>
                  <span className="sx-hrow__icon" data-kind="timer">
                    <HomeIcon name="incomplete" size={28} />
                  </span>
                  <span className="sx-hrow__main">
                    <span className="sx-hrow__title">{t("sx.home.resume.incomplete", { n: incomplete })}</span>
                  </span>
                  <span />
                  <span className="sx-hrow__caret">{glyph(ChevronRightIcon, { size: 16 })}</span>
                </Link>
              </li>
            ) : null}
          </ul>
        ) : null}
        {mine.items.length ? (
          <>
            <h3 className="sx-hsub">{t("sx.home.resume.mine")}</h3>
            <ul className="sx-hlist">
              {mine.items.map((o, i) => {
                const title = o.title || t("sx.ui.untitled");
                const meta = [o.code ? labels.ctorName(o.code) : "", now && (o.updatedAt || o.createdAt) ? labels.ago(o.updatedAt || o.createdAt, now) : ""].filter(Boolean).join(" · ");
                return (
                  <li key={o.id} className="sx-enter" style={enterStyle(Math.min(i + 2, 12))}>
                    <Link
                      href={`/admin/studio/o/${enc(o.id)}`}
                      className="sx-hrow"
                      data-ai-id={aiId("admin.studio.home.mine.item", o.id)}
                      data-ai-type="list_item"
                      data-ai-label={title}
                      data-ai-entity-type="studio_object"
                    >
                      <span className="sx-hrow__icon" data-kind="ctor">
                        <CtorArt code={o.code} size={28} />
                      </span>
                      <span className="sx-hrow__main">
                        <span className="sx-hrow__title">{title}</span>
                        <span className="sx-hrow__meta">{meta}</span>
                      </span>
                      <StatusPill status={o.status} size="sm" />
                      <span className="sx-hrow__caret">{glyph(ChevronRightIcon, { size: 16 })}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </>
    );

  return (
    <SxPanel as="section" flush className="sx-hpanel" title={t("sx.home.resume.title")} titleAs="h2" aiId={BASE}>
      {body}
    </SxPanel>
  );
}
