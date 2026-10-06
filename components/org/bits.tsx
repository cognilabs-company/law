"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import type { OrgWorkItem } from "@/lib/services/orgOwner";
import { IconArrowRight, IconBuilding, IconLock } from "@/components/icons";
import { aiId } from "@/lib/ai/ids";

export function statusLabel(t: (k: string) => string, has: (k: string) => boolean, s: string) {
  return has(`statuses.${s}`) ? t(`statuses.${s}`) : s || "—";
}

export function kindHref(kind: string): string {
  const k = kind.toLowerCase();
  if (k.includes("urgent")) return "/portal/advocate/urgent";
  if (k.includes("case")) return "/portal/advocate/cases";
  if (k.includes("document")) return "/portal/advocate/document-requests";
  return "/portal/advocate/marketplace-orders";
}

export function WorkRow({ item, onOpen }: { item: OrgWorkItem; onOpen: () => void }) {
  const t = useTranslations("orgOwner");
  const locale = useLocale();
  const wid = item.workId || item.id;
  const kind = t.has(`kinds.${item.kind}`) ? t(`kinds.${item.kind}`) : item.kind;
  return (
    <button
      type="button"
      className="owork"
      onClick={onOpen}
      data-ai-id={wid ? aiId("works.item", wid) : undefined}
      data-ai-type="list_item"
      data-ai-entity-type="work"
      data-ai-entity-id={item.id || undefined}
      data-ai-label={[kind, item.workId, statusLabel(t, t.has, item.status)].filter(Boolean).join(" · ")}
      data-ai-private
    >
      <span className="owork__id">{item.workId || item.id.slice(0, 8)}</span>
      <span className="owork__t">
        <b>{item.title || t("untitled")}</b>
        <small>{[item.memberName, item.clientName].filter(Boolean).join(" → ") || "—"}</small>
      </span>
      <span className={`ostatus ostatus--${item.status}`}>{statusLabel(t, t.has, item.status)}</span>
      <time dateTime={item.updatedAt}>{item.updatedAt ? shortDateTime(item.updatedAt, locale) : ""}</time>
    </button>
  );
}

export function WorkDetail({ item, onClose }: { item: OrgWorkItem | null; onClose: () => void }) {
  const t = useTranslations("orgOwner");
  const locale = useLocale();
  const rows: [string, string][] = item
    ? [
        [t("col.workId"), item.workId || item.id],
        [t("col.kind"), t.has(`kinds.${item.kind}`) ? t(`kinds.${item.kind}`) : item.kind || "—"],
        [t("col.status"), statusLabel(t, t.has, item.status)],
        [t("col.member"), item.memberName || "—"],
        [t("col.client"), item.clientName || "—"],
        [t("col.amount"), item.amount ? fmtUzs(item.amount) : "—"],
        [t("col.created"), item.createdAt ? shortDateTime(item.createdAt, locale) : "—"],
        [t("col.updated"), item.updatedAt ? shortDateTime(item.updatedAt, locale) : "—"],
      ]
    : [];
  return (
    <Modal open={!!item} onClose={onClose} title={item?.title || t("untitled")}>
      {item ? (
        <div className="odetail" data-ai-id="organization.work-detail-modal" data-ai-type="modal" data-ai-label={t.has(`kinds.${item.kind}`) ? t(`kinds.${item.kind}`) : t("activeTitle")} data-ai-private>
          <dl>
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <Link href={kindHref(item.kind)} className="btn btn--line btn--sm" onClick={onClose}>
            {t("openSection")}
            <IconArrowRight />
          </Link>
        </div>
      ) : null}
    </Modal>
  );
}

export function OrgBlocked({ kind }: { kind: "forbidden" | "soon" }) {
  const t = useTranslations("orgOwner");
  const tc = useTranslations("common");
  return (
    <div className="supsoon">
      <span className="supsoon__ic">{kind === "forbidden" ? <IconLock /> : <IconBuilding />}</span>
      <b>{t("title")}</b>
      <p>{kind === "forbidden" ? tc("forbidden") : tc("featureSoon")}</p>
      <Link href="/portal/advocate/organization" className="btn btn--line btn--sm">
        {t("allOrgs")}
      </Link>
    </div>
  );
}
