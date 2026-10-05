"use client";

import { useTranslations } from "next-intl";
import { contactBlockedOf } from "@/lib/http";
import { IconLock } from "@/components/icons";

export default function ContactBlockedNote({ error }: { error: unknown }) {
  const t = useTranslations("common");
  const blocked = contactBlockedOf(error);
  if (!blocked) return null;
  return (
    <p className="cblock" role="alert">
      <IconLock />
      <span>
        <b>{t("contactBlocked")}</b>
        {blocked.filteredPreview ? <em>{blocked.filteredPreview}</em> : null}
      </span>
    </p>
  );
}
