"use client";

import "./personName.css";
import "./staffPerson.css";
import { useTranslations } from "next-intl";
import { initials } from "@/lib/lawyers";
import { useStaffName } from "@/lib/useStaffName";
import { IconUser } from "@/components/icons";

// A staff member (a reviewer, a publisher) by name with an initials avatar:
// the name the record carries, else the one looked up for its id, else the
// neutral `fallback` ("Reviewer", "Admin") — never the id itself.
export default function StaffPerson({ id, name = "", fallback, className }: { id?: string | null; name?: string; fallback: string; className?: string }) {
  const t = useTranslations("common.person");
  const shown = useStaffName(id, name);
  if (shown === undefined) {
    return (
      <span className={["pname-busy", className].filter(Boolean).join(" ")} aria-busy="true">
        <span className="sr-only">{t("loading")}</span>
      </span>
    );
  }
  return (
    <span className={["staffp", className].filter(Boolean).join(" ")} data-anon={shown ? undefined : ""}>
      <span className="staffp__av" aria-hidden="true">
        {shown ? initials(shown) : <IconUser />}
      </span>
      <span className="staffp__n">{shown || fallback}</span>
    </span>
  );
}
