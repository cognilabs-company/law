"use client";

import { useCallback, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxEmpty } from "@/components/admin/studio/sx/layout/Empty";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import QueueHead from "@/components/admin/callcenter/QueueHead";
import { IconCircleX } from "@/components/icons";
import { humanize } from "@/lib/labels";
import type { CancellationReview } from "@/lib/services/marketRuntime";
import { RefreshCwIcon, ChevronLeftIcon, ChevronRightIcon, CircleCheckIcon, SxIconScope, CircleAlertIcon } from "./icons";
import { CCX_AI } from "./model";
import { ResolveDialog } from "./ResolveDialog";
import { ReviewItem } from "./ReviewItem";
import { useCancellationQueue } from "./useCancellationQueue";
import "./cancellations.css";

const SKELETONS = [0, 1, 2];

export default function CancellationQueue({ onCount }: { onCount?: (n: number) => void }): ReactElement | null {
  const q = useCancellationQueue(onCount);
  const t = useTranslations("admin.callCenter.cancellations");
  const [resolving, setResolving] = useState<CancellationReview | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const refreshResolving = useCallback((r: CancellationReview) => setResolving((cur) => (cur && cur.id === r.id ? r : cur)), []);

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
        icon={CircleAlertIcon}
        title={t("loadError")}
        text={t("loadErrorText")}
        action={
          <SxButton onClick={q.refresh} icon={RefreshCwIcon} aiId="call_center.cancellations.retry">
            {t("retry")}
          </SxButton>
        }
      />
    );
  } else if (!q.items.length) {
    body = (
      <>
        {q.stale ? (
          <SxNote tone="warn" role="status" action={<SxButton size="sm" onClick={q.refresh} icon={RefreshCwIcon}>{t("retry")}</SxButton>}>
            {t("refreshFailed")}
          </SxNote>
        ) : null}
        <SxEmpty icon={CircleCheckIcon} title={q.status === "open" ? t("emptyOpen") : t("emptyOther")} text={q.status === "open" ? t("emptyOpenText") : t("emptyOtherText")} />
      </>
    );
  } else {
    body = (
      <>
        {q.stale ? (
          <SxNote tone="warn" role="status" action={<SxButton size="sm" onClick={q.refresh} icon={RefreshCwIcon}>{t("retry")}</SxButton>}>
            {t("refreshFailed")}
          </SxNote>
        ) : null}
        <ul className="ccx-list" aria-busy={q.busy || undefined}>
          {q.items.map((r) => (
            <li key={r.id}>
              <ReviewItem review={r} onResolve={setResolving} onFresh={refreshResolving} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <SxIconScope>
      {/* The same head as every other queue (QueueHead); the review cards
          below keep their own component styles (.sx). */}
      <section ref={rootRef} className="ppanel esc ccx" data-ai-target="callcenter:cancellations" data-ai-id={CCX_AI} data-ai-type="section" data-ai-label={t("title")}>
        <QueueHead
          icon={IconCircleX}
          title={t("title")}
          lead={t("lead")}
          count={q.openCount}
          refreshLabel={t("refresh")}
          refreshing={q.busy}
          onRefresh={q.refresh}
          aiBase="call_center.cancellations"
          statuses={options.map((s) => ({ value: s, label: s === "open" && q.openCount !== null ? t("statusCount", { label: label(s), n: q.openCount }) : label(s) }))}
          status={q.status}
          onStatus={q.setStatus}
          statusLabel={t("filterLabel")}
        />
        <div className="sx ccx__body">
          {range ? <p className="ccx-range sx-num">{range}</p> : null}
          {body}
          {showPager ? (
            <nav className="ccx-pager" aria-label={t("pager.aria")}>
              <SxButton size="sm" icon={ChevronLeftIcon} aria-disabled={q.offset <= 0 || undefined} onClick={q.prev} aiId="call_center.cancellations.pager.prev">
                {t("pager.prev")}
              </SxButton>
              <SxButton size="sm" iconEnd={ChevronRightIcon} aria-disabled={!page.hasMore || undefined} onClick={q.next} aiId="call_center.cancellations.pager.next">
                {t("pager.next")}
              </SxButton>
            </nav>
          ) : null}
          <p className="sx-vh" role="status" aria-live="polite">
            {q.announce}
          </p>
        </div>
      </section>
      {resolving ? <ResolveDialog review={resolving} onClose={closeDialog} onResolved={() => q.refresh()} onStale={q.refresh} /> : null}
    </SxIconScope>
  );
}
