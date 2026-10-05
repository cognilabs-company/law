"use client";

import { useLocale } from "next-intl";
import { dateOnly } from "@/lib/date";
import type { ComplaintItem } from "@/lib/services/complaints";
import { IconAlert, IconChevronRight, IconClock, IconStarRate } from "@/components/icons";
import { KindBadge, StatusPill, rowDomId, useComplaintLabels } from "./bits";

export default function ComplaintRow({
  item,
  highlighted,
  onOpen,
}: {
  item: ComplaintItem;
  highlighted: boolean;
  onOpen: () => void;
}) {
  const locale = useLocale();
  const L = useComplaintLabels();
  const kindLabel = L.kind(item.kind);
  const facet = item.kind === "manual" ? (item.category ? L.category(item.category) : "") : L.source(item.source);
  const title = item.subject || facet || kindLabel;
  const line = item.description || L.hint(item);

  return (
    <button
      type="button"
      id={rowDomId(item.key)}
      className={`shk__row${highlighted ? " is-hl" : ""}`}
      onClick={onOpen}
      aria-haspopup="dialog"
    >
      <span className={`shk__ic shk__ic--${item.kind}`} aria-hidden>
        {item.kind === "quality" ? <IconStarRate /> : <IconAlert />}
      </span>
      <span className="shk__m">
        <span className="shk__top">
          <b className="shk__t">{title}</b>
          <StatusPill status={item.status} label={L.status(item.status)} />
        </span>
        <span className="shk__meta">
          <KindBadge kind={item.kind} label={kindLabel} />
          {item.workId ? <small className="wid">{item.workId}</small> : null}
          {facet && facet !== title ? <small>{facet}</small> : null}
          {item.createdAt ? (
            <small>
              <IconClock aria-hidden />
              {dateOnly(item.createdAt, locale)}
            </small>
          ) : null}
        </span>
        {line ? <span className="shk__desc">{line}</span> : null}
      </span>
      <span className="shk__go" aria-hidden>
        <IconChevronRight />
      </span>
    </button>
  );
}
