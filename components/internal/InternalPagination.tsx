"use client";

import { useTranslations } from "next-intl";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import type { InternalPage } from "@/lib/services/internalHrm";

export default function InternalPagination({ page, onChange }: { page: InternalPage<unknown>; onChange: (offset: number) => void }) {
  const t = useTranslations("internal.pagination");
  const current = Math.floor(page.offset / page.limit) + 1;
  const total = Math.max(1, Math.ceil(page.total / page.limit));
  if (page.total <= page.limit && !page.hasMore) return null;
  return <div className="internal-pagination" aria-label={t("label")}>
    <button className="btn btn--line btn--sm" type="button" onClick={() => onChange(Math.max(0, page.offset - page.limit))} disabled={page.offset <= 0}><IconChevronLeft />{t("previous")}</button>
    <span>{t("page", { current, total })}</span>
    <button className="btn btn--line btn--sm" type="button" onClick={() => onChange(page.offset + page.limit)} disabled={!page.hasMore}><IconChevronRight />{t("next")}</button>
  </div>;
}
