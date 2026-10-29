"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import type { ReviewSeller } from "@/lib/services/experience";

// The advocate on a queue row (backend check 2026-10-29: rows carry
// seller { id, lexgo_id, name, phone, role, account_status }): the name, the
// LexGo ID and phone under it, role and account state as words — never an id.
export default function QueueSeller({ seller, fallback }: { seller: ReviewSeller | null; fallback: string }): ReactElement {
  const t = useTranslations("callCenter.verify.seller");
  if (!seller) return <b>{fallback}</b>;
  const sub = [seller.lexgoId, seller.phone].filter(Boolean).join(" · ");
  return (
    <span className="xpr__who">
      <b>{seller.name || t("noName")}</b>
      {sub ? <small dir="ltr">{sub}</small> : null}
      <span className="vrf__stags">
        {seller.role ? <i>{t.has(`role.${seller.role}`) ? t(`role.${seller.role}`) : t("role.other")}</i> : null}
        {seller.status && seller.status !== "active" ? <i data-st={seller.status}>{t.has(`status.${seller.status}`) ? t(`status.${seller.status}`) : t("status.other")}</i> : null}
      </span>
    </span>
  );
}
