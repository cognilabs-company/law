"use client";

import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import type { StudioObject } from "@/lib/services/studio";
import { ConstructorIcon, StudioErrorNote, StudioStatusPill, useNow, useStudioText } from "../bits";
import { IconChevronRight, IconClock, IconUser } from "@/components/icons";

export default function DashMine({
  items,
  loading,
  error,
  busy,
  onRetry,
}: {
  items: StudioObject[];
  loading: boolean;
  error: unknown;
  busy: boolean;
  onRetry: () => void;
}) {
  const { t, ctorName, ago } = useStudioText();
  const now = useNow();

  return (
    <section className="stu-card stu-mine" data-ai-id="admin.studio.dash.mine" data-ai-type="section" data-ai-label={t("dash.mine.title")}>
      <div className="stu-card__h">
        <h3>
          <IconUser aria-hidden />
          {t("dash.mine.title")}
        </h3>
        <small>{t("dash.mine.hint")}</small>
      </div>
      {loading ? (
        <div className="stu-mine__sk" aria-hidden>
          <span />
          <span />
        </div>
      ) : error ? (
        <StudioErrorNote error={error} onRetry={onRetry} busy={busy} compact />
      ) : !items.length ? (
        <p className="stu-mine__none">{t("dash.mine.empty")}</p>
      ) : (
        <ul className="stu-mine__list" data-ai-id="admin.studio.dash.mine.list" data-ai-type="list" data-ai-label={t("dash.mine.title")}>
          {items.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/studio/o/${encodeURIComponent(o.id)}`}
                className="stu-mine__row"
                data-ai-id={aiId("admin.studio.dash.mine.item", o.id)}
                data-ai-type="list_item"
                data-ai-entity-type="studio_object"
                data-ai-entity-id={o.id}
                data-ai-label={o.title || t("list.untitled")}
              >
                <ConstructorIcon code={o.code} size="sm" />
                <span className="stu-mine__body">
                  <span className="stu-mine__t">{o.title || t("list.untitled")}</span>
                  <span className="stu-mine__m">
                    {ctorName(o.code)}
                    {o.updatedAt || o.createdAt ? (
                      <span>
                        <IconClock aria-hidden />
                        {ago(o.updatedAt || o.createdAt, now)}
                      </span>
                    ) : null}
                  </span>
                </span>
                <StudioStatusPill status={o.status} raw={o.statusRaw} small />
                <IconChevronRight className="stu-mine__go" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
