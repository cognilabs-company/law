"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import ServiceDocumentRequest from "./ServiceDocumentRequest";
import { clearDraft } from "./DocFill";
import { useCatalogBackHref } from "@/lib/catalogNav";
import Modal from "@/components/admin/Modal";
import { IconChevronLeft, IconClose, IconAlert } from "@/components/icons";

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
  const td = useTranslations("portal.client.documents");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [draftId, setDraftId] = useState("");
  const [exitOpen, setExitOpen] = useState(false);
  const backHref = useCatalogBackHref();

  const leave = () => (backHref ? router.push(backHref) : router.back());

  // Two different intentions, two different buttons.
  //
  // "Back" is navigation: the answers stay in localStorage and reopening the
  // document resumes them. "Exit" is the one that was missing — the client
  // who wants to abandon this document and start it clean next time. It had
  // no control at all, so the only way out kept the draft and every later
  // visit reopened a half-filled form with no way to reset it.
  function confirmExit() {
    if (draftId) clearDraft(draftId);
    setExitOpen(false);
    leave();
  }

  return (
    <div className="docbuild docbuild--full">
      <div className="docbuild__top">
        <button type="button" className="docbuild__back" onClick={leave}>
          <IconChevronLeft />
          {t("back")}
        </button>
        {title ? <b className="docbuild__title">{title}</b> : null}
        <button type="button" className="docbuild__exit" onClick={() => setExitOpen(true)}>
          <IconClose />
          {td("exit")}
        </button>
      </div>
      <ServiceDocumentRequest serviceId={serviceId} onTitle={setTitle} onDraftId={setDraftId} />

      <Modal open={exitOpen} onClose={() => setExitOpen(false)} title={td("exitTitle")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <p className="dexit__lead">
            <span className="dexit__i"><IconAlert /></span>
            {td("exitLead")}
          </p>
          <div className="dexit__btns">
            <button type="button" className="btn btn--line btn--full" onClick={() => setExitOpen(false)}>
              {td("exitStay")}
            </button>
            <button type="button" className="btn btn--danger btn--full" onClick={confirmExit}>
              <IconClose />
              {td("exitConfirm")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
