"use client";

import { useLocale, useTranslations } from "next-intl";
import { dateOnly } from "@/lib/date";
import { isOpaqueRef, type ComplaintItem } from "@/lib/services/complaints";
import { IconCalendar, IconChevronRight } from "@/components/icons";
import { CategoryTile, QualityBadge, StatusPill, rowDomId, useComplaintLabels } from "./bits";

export default function ComplaintRow({
  item,
  highlighted,
  onOpen,
}: {
  item: ComplaintItem;
  highlighted: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("portal.client.complaints");
  const locale = useLocale();
  const L = useComplaintLabels();
  const quality = item.kind === "quality";
  const facet = quality ? L.source(item.source) : item.category ? L.category(item.category) : "";
  const title = item.subject || facet || L.kind(item.kind);
  const line = item.description || L.hint(item);
  const ref = quality ? "" : item.relatedRef;

  return (
    <button
      type="button"
      id={rowDomId(item.key)}
      className={`shk__row${highlighted ? " is-hl" : ""}`}
      onClick={onOpen}
      aria-haspopup="dialog"
    >
      <CategoryTile item={item} />
      <span className="shk__m">
        <span className="shk__top">
          <b className="shk__t">{title}</b>
          <StatusPill status={item.status} label={L.tag(item.status)} />
        </span>
        <span className="shk__meta">
          {quality ? <QualityBadge label={t("filter.quality")} /> : null}
          {facet && facet !== title ? <span>{facet}</span> : null}
          {item.workId ? <span className="wid">{item.workId}</span> : null}
          {ref ? <span>{isOpaqueRef(ref) ? t("row.workLinked") : t("row.work", { id: ref })}</span> : null}
          {item.createdAt ? (
            <span>
              <IconCalendar aria-hidden />
              {dateOnly(item.createdAt, locale)}
            </span>
          ) : null}
        </span>
        {line ? <span className="shk__desc">{line}</span> : null}
      </span>
      <IconChevronRight className="shk__go" aria-hidden />
    </button>
  );
}
