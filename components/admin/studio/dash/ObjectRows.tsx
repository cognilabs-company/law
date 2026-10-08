"use client";

import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import type { StudioObject } from "@/lib/services/studio";
import { StudioStatusPill, useStudioText } from "../bits";
import { IconArchive } from "./shared";
import { IconArrowRight, IconClock, IconHistory, IconPaperclip, IconUser } from "@/components/icons";

export default function ObjectRows({
  items,
  canArchive,
  archivingId,
  flashId,
  onArchive,
}: {
  items: StudioObject[];
  canArchive: boolean;
  archivingId: string;
  flashId: string;
  onArchive: (o: StudioObject) => void;
}) {
  const { t, when } = useStudioText();

  return (
    <div className="stu-ol" data-ai-id="admin.studio.list.table" data-ai-type="table" data-ai-label={t("list.title")}>
      <div className="stu-ol__hd" aria-hidden>
        <span>{t("list.col.title")}</span>
        <span>{t("list.col.status")}</span>
        <span>{t("list.col.updated")}</span>
        <span />
      </div>
      <ul className="stu-ol__list">
        {items.map((o) => {
          const href = `/admin/studio/o/${encodeURIComponent(o.id)}`;
          const title = o.title || t("list.untitled");
          const at = o.updatedAt || o.createdAt;
          const archived = o.status === "archived";
          return (
            <li
              key={o.id}
              className={`stu-orow${archived ? " is-archived" : ""}${flashId === o.id ? " is-flash" : ""}`}
              data-ai-id={aiId("admin.studio.list.item", o.id)}
              data-ai-type="list_item"
              data-ai-entity-type="studio_object"
              data-ai-entity-id={o.id}
              data-ai-label={title}
            >
              <div className="stu-orow__main">
                <Link href={href} className="stu-orow__t" tabIndex={-1}>
                  {title}
                </Link>
                <span className="stu-orow__meta">
                  {o.currentVersion ? (
                    <span>
                      <IconHistory aria-hidden />
                      {t("list.version", { v: o.currentVersion })}
                    </span>
                  ) : null}
                  {o.createdBy ? (
                    <span>
                      <IconUser aria-hidden />
                      {o.createdBy}
                    </span>
                  ) : null}
                  {o.assignedTo && o.assignedTo !== o.createdBy ? <span className="stu-orow__as">{t("list.assigned", { name: o.assignedTo })}</span> : null}
                  {o.hasFile ? (
                    <span>
                      <IconPaperclip aria-hidden />
                      {t("list.hasFile")}
                    </span>
                  ) : null}
                </span>
              </div>
              <span className="stu-orow__st">
                <StudioStatusPill status={o.status} raw={o.statusRaw} />
              </span>
              <span className="stu-orow__time">
                {at ? (
                  <>
                    <IconClock aria-hidden />
                    {when(at)}
                  </>
                ) : (
                  "—"
                )}
              </span>
              <span className="stu-orow__acts">
                <Link
                  href={href}
                  className="btn btn--soft btn--sm"
                  aria-label={t("list.openAria", { title })}
                  data-ai-id={aiId("admin.studio.list.item", o.id, "open")}
                  data-ai-type="link"
                  data-ai-label={t("actions.open")}
                >
                  {t("actions.open")}
                  <IconArrowRight aria-hidden />
                </Link>
                {canArchive && !archived ? (
                  <button
                    type="button"
                    className="stu-orow__icon"
                    onClick={() => onArchive(o)}
                    disabled={Boolean(archivingId)}
                    aria-label={t("list.archiveAria", { title })}
                    title={t("actions.archive")}
                    data-ai-id={aiId("admin.studio.list.item", o.id, "archive")}
                    data-ai-type="button"
                    data-ai-label={t("actions.archive")}
                  >
                    {archivingId === o.id ? <span className="stu-spin" aria-hidden /> : <IconArchive aria-hidden />}
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
