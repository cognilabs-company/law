"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import type { ReviewSeller } from "@/lib/services/experience";
import { initials } from "@/lib/lawyers";

// The advocate on a queue row (backend check 2026-10-29: rows carry
// seller { id, lexgo_id, name, phone, role, account_status }): the name, the
// LexGo ID and phone under it, role and account state as words — never an id.
export default function QueueSeller({ seller, fallback }: { seller: ReviewSeller | null; fallback: string }): ReactElement {
  const t = useTranslations("callCenter.verify.seller");
  if (!seller)
    return (
      <span className="xpr__who">
        <i className="xpr__av" aria-hidden="true">{initials(fallback)}</i>
        <b>{fallback}</b>
      </span>
    );
  const sub = [seller.lexgoId, seller.phone].filter(Boolean).join(" · ");
  const name = seller.name || t("noName");
  return (
    <span className="xpr__who">
      <i className="xpr__av" aria-hidden="true">{initials(name)}</i>
      <b>{name}</b>
      {sub ? <small dir="ltr">{sub}</small> : null}
      <span className="vrf__stags">
        {seller.role ? <i>{t.has(`role.${seller.role}`) ? t(`role.${seller.role}`) : t("role.other")}</i> : null}
        {seller.status && seller.status !== "active" ? <i data-st={seller.status}>{t.has(`status.${seller.status}`) ? t(`status.${seller.status}`) : t("status.other")}</i> : null}
      </span>
    </span>
  );
}
