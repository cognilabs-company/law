"use client";

import { Fragment, useId, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxEmpty } from "@/components/admin/studio/sx/layout/Empty";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { humanize } from "@/lib/labels";
import type { CancellationReview } from "@/lib/services/marketRuntime";
import { ArrowsClockwiseIcon, CaretLeftIcon, CaretRightIcon, CheckCircleIcon, SxIconScope, WarningCircleIcon } from "./icons";
import { CCX_AI } from "./model";
import { ResolveDialog } from "./ResolveDialog";
import { ReviewItem } from "./ReviewItem";
import { useCancellationQueue } from "./useCancellationQueue";
import "./cancellations.css";

const SKELETONS = [0, 1, 2];

export default function CancellationQueue({ onCount }: { onCount?: (n: number) => void }): ReactElement | null {
  const q = useCancellationQueue(onCount);
  const t = useTranslations("admin.callCenter.cancellations");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [resolving, setResolving] = useState<CancellationReview | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  if (q.state === "forbidden") return null;

  const closeDialog = () => {
    setResolving(null);
    window.setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return;
      const root = rootRef.current;
      (root?.querySelector<HTMLElement>('[data-ai-id$=".resolve"]') ?? root?.querySelector<HTMLElement>('[data-ai-id="call_center.cancellations.refresh"]'))?.focus();
    }, 0);
  };

  const label = (s: string) => (s ? (t.has(`status.${s}`) ? t(`status.${s}`) : humanize(s)) : t("statusAll"));
  const options = [...q.statuses, ""];
  const { page } = q;
  const showPager = q.state === "ready" && (q.offset > 0 || page.hasMore);
  const range = q.state === "ready" && q.items.length ? (page.total !== null ? t("pager.rangeTotal", { from: page.from, to: page.to, total: page.total }) : t("pager.range", { from: page.from, to: page.to })) : "";

  const refresh = (
    <SxButton variant="ghost" size="sm" icon={ArrowsClockwiseIcon} busy={q.busy} aria-label={t("refresh")} aiId="call_center.cancellations.refresh" className="ccx-refresh" onClick={q.refresh}>
      {t("refresh")}
    </SxButton>
  );

  let body: ReactElement;
  if (q.state === "loading") {
    body = (
      <>
        <ul className="ccx-list" aria-hidden="true">
          {SKELETONS.map((i) => (
            <li key={i} className="sx-sk ccx-sk" />
          ))}
        </ul>
        <p className="sx-vh" role="status">
          {t("loading")}
        </p>
      </>
    );
  } else if (q.state === "error") {
    body = (
      <SxEmpty
        tone="error"
        icon={WarningCircleIcon}
        title={t("loadError")}
        text={t("loadErrorText")}
        action={
          <SxButton onClick={q.refresh} icon={ArrowsClockwiseIcon} aiId="call_center.cancellations.retry">
            {t("retry")}
          </SxButton>
        }
      />
    );
  } else if (!q.items.length) {
    body = (
      <>
        {q.stale ? (
          <SxNote tone="warn" role="status" action={<SxButton size="sm" onClick={q.refresh} icon={ArrowsClockwiseIcon}>{t("retry")}</SxButton>}>
            {t("refreshFailed")}
          </SxNote>
        ) : null}
        <SxEmpty icon={CheckCircleIcon} title={q.status === "open" ? t("emptyOpen") : t("emptyOther")} text={q.status === "open" ? t("emptyOpenText") : t("emptyOtherText")} />
      </>
    );
  } else {
    body = (
      <>
        {q.stale ? (
          <SxNote tone="warn" role="status" action={<SxButton size="sm" onClick={q.refresh} icon={ArrowsClockwiseIcon}>{t("retry")}</SxButton>}>
            {t("refreshFailed")}
          </SxNote>
        ) : null}
        <ul className="ccx-list" aria-busy={q.busy || undefined}>
          {q.items.map((r) => (
            <li key={r.id}>
              <ReviewItem review={r} onResolve={setResolving} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <SxIconScope>
      <div ref={rootRef} className="sx ccx" data-ai-target="callcenter:cancellations">
        <SxPanel title={t("title")} lead={t("lead")} aiId={CCX_AI} actions={refresh}>
          <div className="ccx-bar">
            <div className="ccx-seg" role="radiogroup" aria-label={t("filterLabel")} data-ai-id="call_center.cancellations.filters.status" data-ai-type="radiogroup" data-ai-label={t("filterLabel")}>
              {options.map((s, i) => {
                const id = `${uid}-st${i}`;
                const text = s === "open" && q.openCount !== null ? t("statusCount", { label: label(s), n: q.openCount }) : label(s);
                return (
                  <Fragment key={s || "all"}>
                    <input type="radio" className="sx-vh" id={id} name={`${uid}-status`} value={s} checked={q.status === s} onChange={() => q.setStatus(s)} />
                    <label htmlFor={id}>{text}</label>
                  </Fragment>
                );
              })}
            </div>
            {range ? <p className="ccx-range sx-num">{range}</p> : null}
          </div>
          {body}
          {showPager ? (
            <nav className="ccx-pager" aria-label={t("pager.aria")}>
              <SxButton size="sm" icon={CaretLeftIcon} aria-disabled={q.offset <= 0 || undefined} onClick={q.prev} aiId="call_center.cancellations.pager.prev">
                {t("pager.prev")}
              </SxButton>
              <SxButton size="sm" iconEnd={CaretRightIcon} aria-disabled={!page.hasMore || undefined} onClick={q.next} aiId="call_center.cancellations.pager.next">
                {t("pager.next")}
              </SxButton>
            </nav>
          ) : null}
          <p className="sx-vh" role="status" aria-live="polite">
            {q.announce}
          </p>
        </SxPanel>
      </div>
      {resolving ? <ResolveDialog review={resolving} onClose={closeDialog} onResolved={() => q.refresh()} onStale={q.refresh} /> : null}
    </SxIconScope>
  );
}
