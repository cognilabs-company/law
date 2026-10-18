"use client";

import "./sx-home.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { useStudioAccess } from "@/lib/services/studio";
import { approvalsHref } from "../approvals/urlState";
import { SxButton, SxLinkButton } from "../Button";
import { RefreshCwIcon, ChevronRightIcon, glyph } from "../icons";
import { SxNote } from "../layout/Note";
import { SxPanel } from "../layout/Panel";
import { useNow } from "../live";
import { useStudioLabels } from "../useStudioLabels";
import { NEED_ICON } from "./GroupCard";
import type { GroupNeed } from "./GroupPage";
import type { ActionItem, ActionItems, ActionKind } from "./useActionItems";

export type WaitingScope = { group?: string; need?: GroupNeed };

const enc = encodeURIComponent;
const SK_ROWS = [0, 1, 2];

export function filterActionItems(items: readonly ActionItem[], scope?: WaitingScope): ActionItem[] {
  return items.filter((it) => (!scope?.group || it.group === scope.group) && (!scope?.need || it.kind === scope.need));
}

export function WaitingSkeleton(): ReactElement {
  return (
    <div aria-hidden="true">
      {SK_ROWS.map((i) => (
        <div key={i} className="sx-hrow-sk">
          <span className="sx-sk" />
          <span className="sx-hrow-sk__lines">
            <span className="sx-sk" />
            <span className="sx-sk" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function WaitingPanel({ data, scope, max, aiId, headerAction }: { data: ActionItems; scope?: WaitingScope; max?: number; aiId: string; headerAction?: ReactNode }): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const acc = useStudioAccess();
  const now = useNow();
  const rows = filterActionItems(data.items, scope);
  const shown = max && max > 0 ? rows.slice(0, max) : rows;
  const more = rows.length - shown.length;
  const allowed: ActionKind[] = [acc.canEdit ? "returned" : null, acc.canReview ? "review" : null, acc.canPublish ? "publish" : null].filter((k): k is ActionKind => !!k);
  const relevant = scope?.need ? allowed.filter((k) => k === scope.need) : allowed;
  const failed = relevant.filter((k) => data.errors[k] !== undefined);
  const allFailed = !data.loading && relevant.length > 0 && failed.length === relevant.length;
  const someFailed = !data.loading && failed.length > 0 && !allFailed;
  const toApprovals = acc.canReview && rows.length > 0;
  const retry = (
    <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={data.reload} aiId={aiIdOf(aiId, "retry")}>
      {t("sx.ui.retry")}
    </SxButton>
  );

  let body: ReactNode;
  if (data.loading) body = <WaitingSkeleton />;
  else if (allFailed)
    body = (
      <div className="sx-hpad">
        <SxNote tone="error" action={retry}>
          {t("sx.home.waiting.fail")}
        </SxNote>
      </div>
    );
  else if (!rows.length)
    body = (
      <>
        {someFailed ? (
          <div className="sx-hpad">
            <SxNote tone="error" action={retry}>
              {t("sx.home.waiting.fail")}
            </SxNote>
          </div>
        ) : null}
        <p className="sx-hempty" role="status">
          {t("sx.home.waiting.empty")}
        </p>
      </>
    );
  else
    body = (
      <>
        {someFailed ? (
          <div className="sx-hpad">
            <SxNote tone="error" action={retry}>
              {t("sx.home.waiting.fail")}
            </SxNote>
          </div>
        ) : null}
        <ul className="sx-hlist">
          {shown.map((it) => {
            const title = it.title || t("sx.ui.untitled");
            const meta = [t(`sx.home.waiting.${it.kind}`), it.code ? labels.ctorName(it.code) : "", now && it.at ? labels.ago(it.at, now) : ""].filter(Boolean).join(" · ");
            return (
              <li key={`${it.kind}-${it.id}`}>
                <Link
                  href={`/admin/studio/o/${enc(it.id)}`}
                  className="sx-hrow"
                  data-ai-id={aiIdOf(aiId, "item", it.id)}
                  data-ai-type="list_item"
                  data-ai-label={title}
                  data-ai-entity-type="studio_object"
                >
                  <span className="sx-hrow__icon" data-kind={it.kind}>
                    {glyph(NEED_ICON[it.kind], { size: 16 })}
                  </span>
                  <span className="sx-hrow__main">
                    <span className="sx-hrow__title">{title}</span>
                    <span className="sx-hrow__meta">{meta}</span>
                  </span>
                  <span />
                  <span className="sx-hrow__caret">{glyph(ChevronRightIcon, { size: 16 })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {more > 0 || toApprovals ? (
          <div className="sx-hfoot">
            {more > 0 ? <span className="sx-hfoot__more">{t("sx.home.waiting.more", { n: more })}</span> : null}
            {toApprovals ? (
              <SxLinkButton variant="ghost" size="sm" href={approvalsHref({ group: scope?.group, need: scope?.need })} iconEnd={ChevronRightIcon} aiId={aiIdOf(aiId, "approvals")}>
                {t("sx.home.waiting.approvals")}
              </SxLinkButton>
            ) : null}
          </div>
        ) : null}
      </>
    );

  return (
    <SxPanel
      as="section"
      flush
      className="sx-hpanel"
      title={t("sx.home.waiting.title")}
      titleAs="h2"
      aiId={aiId}
      actions={
        headerAction || rows.length > 0 ? (
          <>
            {rows.length > 0 && !data.loading ? (
              <span className="sx-hcount sx-num" aria-hidden="true">
                {labels.num(rows.length)}
              </span>
            ) : null}
            {headerAction}
          </>
        ) : undefined
      }
    >
      {body}
    </SxPanel>
  );
}
