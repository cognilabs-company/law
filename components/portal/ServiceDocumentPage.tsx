"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import ServiceDocumentRequest from "./ServiceDocumentRequest";
import Modal from "@/components/admin/Modal";
import { IconChevronLeft, IconInfo } from "@/components/icons";

// A dedicated full-page builder for the service → document flow (as opposed
// to the modal used elsewhere): the questions on the left and the document
// itself on the right, filling in as you type. Same underlying flow and
// components as the modal version (ServiceDocumentRequest →
// DocumentRequestPanel → DocFill/DocPaper) — only the chrome differs.
export default function ServiceDocumentPage({ serviceId }: { serviceId: string }) {
  const t = useTranslations("cta");
  const td = useTranslations("portal.client.documents");
  const router = useRouter();
  const [title, setTitle] = useState("");
  // Upfront disclosure, shown once on entering the flow: filling in and
  // previewing is free, but generating/downloading the final file is paid
  // (the same gate DocumentRequestPanel enforces later) — so this isn't a
  // surprise only after the questionnaire is done.
  const [ack, setAck] = useState(false);

  return (
    <div className="docbuild docbuild--full">
      <div className="docbuild__top">
        <button type="button" className="docbuild__back" onClick={() => router.push("/portal/client/services")}>
          <IconChevronLeft />
          {t("back")}
        </button>
        {title ? <b className="docbuild__title">{title}</b> : null}
      </div>
      {/* The builder mounts immediately (not gated behind `ack`) so the notice
          overlays it rather than replacing it — the document is visible,
          slightly blurred, right behind the alert (Modal's own scrim already
          does backdrop-filter:blur), instead of a blank page until acked. */}
      <div className={ack ? undefined : "docbuild__veil"} aria-hidden={!ack}>
        <ServiceDocumentRequest serviceId={serviceId} onTitle={setTitle} />
      </div>
      <Modal open={!ack} onClose={() => setAck(true)} title={td("priceNoticeTitle")}>
        <div className="docnotice">
          <span className="docnotice__ico"><IconInfo /></span>
          <p>{td("priceNoticeBody")}</p>
          <button type="button" className="btn btn--grad btn--full" onClick={() => setAck(true)}>
            {td("priceNoticeOk")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
