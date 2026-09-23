"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import ServiceDocumentRequest from "./ServiceDocumentRequest";
import { IconChevronLeft } from "@/components/icons";

// A dedicated full-page builder for the service → document flow (as opposed
// to the modal used elsewhere): the questions on the left and the document
// itself on the right, filling in as you type. Same underlying flow and
// components as the modal version (ServiceDocumentRequest →
// DocumentRequestPanel → DocFill/DocPaper) — only the chrome differs.
//
// Straight into the builder, no upfront notice: it used to gate this behind
// a "filling in is free, downloading is paid" modal, but the real gate is
// DocumentRequestPanel's own pay step before a download — that's the only
// place a charge can actually happen, so an extra alert here was only ever
// in the way.
export default function ServiceDocumentPage({ serviceId }: { serviceId: string }) {
  const t = useTranslations("cta");
  const router = useRouter();
  const [title, setTitle] = useState("");

  return (
    <div className="docbuild docbuild--full">
      <div className="docbuild__top">
        {/* Real history back, not a hardcoded push to the bare catalog URL —
            the catalog page now mirrors its category/subcategory drill-down
            into its own URL (see ClientServices), so this lands the client
            back exactly where they were browsing instead of resetting them
            to the top-level "choose a category" screen every time. */}
        <button type="button" className="docbuild__back" onClick={() => router.back()}>
          <IconChevronLeft />
          {t("back")}
        </button>
        {title ? <b className="docbuild__title">{title}</b> : null}
      </div>
      <ServiceDocumentRequest serviceId={serviceId} onTitle={setTitle} />
    </div>
  );
}
