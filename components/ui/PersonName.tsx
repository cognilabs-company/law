"use client";

import "./personName.css";
import { useTranslations } from "next-intl";
import { usePerson } from "@/lib/usePerson";

// A person by name, never by id: the name the record carries, else the one
// looked up for its id, else the caller's fallback or "unknown user". The
// phone follows when asked.
export default function PersonName({ id, name = "", withPhone = false, fallback = "", className }: { id?: string | null; name?: string; withPhone?: boolean; fallback?: string; className?: string }) {
  const t = useTranslations("common.person");
  const p = usePerson(id, name);
  if (p === undefined) {
    return (
      <span className={["pname-busy", className].filter(Boolean).join(" ")} aria-busy="true">
        <span className="sr-only">{t("loading")}</span>
      </span>
    );
  }
  if (!p) return <span className={className}>{fallback || (id ? t("unknown") : t("none"))}</span>;
  const text = [p.name || p.phone, withPhone && p.name && p.phone ? p.phone : ""].filter(Boolean).join(" · ");
  return <span className={className}>{text}</span>;
}
