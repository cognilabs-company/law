"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import ServiceDocumentRequest from "./ServiceDocumentRequest";
import { clearDraft, hasDraftAnswers, DocChromeContext, type DocChrome } from "./DocFill";
import { useCatalogBackHref } from "@/lib/catalogNav";
import Modal from "@/components/admin/Modal";
import { IconChevronLeft, IconClose, IconAlert } from "@/components/icons";
import InstructorButton from "@/components/guide/InstructorButton";

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

  // Once the builder itself is on screen it takes over the whole page in the
  // advocate editor's frame (DocFill's workspace mode) and puts these two in
  // its own top bar; this page's bar below then steps aside (CSS, see
  // .docbuild--full:has(.deditor--fill)). Every other step — the chooser,
  // the lawyer flow, waiting, done — keeps it.
  // Back now asks first. It used to navigate on the press, which is what
  // the client reported: they pressed it, the builder went, and nothing
  // told them what had happened to what they had typed.
  const leave = useCallback(() => (backHref ? router.push(backHref) : router.back()), [backHref, router]);
  // …but only where there is something to lose. The dialog says "chiqsangiz
  // to'ldirgan ma'lumotlaringiz saqlanmaydi", and it was being raised by
  // every Back on this route — including the wait screen ("Hujjat
  // tayyorlanmoqda"), where the answers have already gone to the server and
  // the draft was cleared when they did. Warning someone about losing work
  // that is already saved is how a confirmation stops being read at all.
  //
  // The draft is the test, because the draft is the thing at stake: it
  // exists only while the builder is being filled in and DocumentRequestPanel
  // deletes it the moment the answers are submitted. So a builder with typed
  // answers asks; a builder nobody has typed in, the payment step, the wait
  // screen and a finished document all just leave.
  const askOrLeave = useCallback(() => {
    if (hasDraftAnswers(draftId)) setExitOpen(true);
    else leave();
  }, [draftId, leave]);
  // Back and Exit are the same act, so they ask the same question. They were
  // two dialogs saying two different things about the same press: Back
  // explained that the answers were in this browser and not on the server,
  // Exit said they would be gone. Whichever the client happened to press
  // decided which was true, which is no way to word a warning — and the one
  // they actually reached from the builder was the wrong one.
  const chrome = useMemo<DocChrome>(
    () => ({ onBack: askOrLeave, onExit: askOrLeave }),
    [askOrLeave],
  );

  // Leaving means leaving: the draft goes with it. That is what the dialog
  // promises — "bu hujjatni keyingi safar 0 dan boshlaysiz" — and clearing
  // it here is what makes the sentence true. Back used to keep the draft and
  // say so in a paragraph of its own, which left the builder with two exits
  // that behaved differently and a client who could not tell which they had
  // just taken.
  function confirmExit() {
    if (draftId) clearDraft(draftId);
    setExitOpen(false);
    leave();
  }

  return (
    <div className="docbuild docbuild--full">
      <div className="docbuild__top">
        <button type="button" className="docbuild__back" onClick={askOrLeave}>
          <IconChevronLeft />
          {t("back")}
        </button>
        {title ? <b className="docbuild__title">{title}</b> : null}
        <InstructorButton className="docbuild__ai" />
        <button type="button" className="docbuild__exit" onClick={askOrLeave}>
          <IconClose />
          {td("exit")}
        </button>
      </div>
      <DocChromeContext.Provider value={chrome}>
        <ServiceDocumentRequest serviceId={serviceId} onTitle={setTitle} onDraftId={setDraftId} />
      </DocChromeContext.Provider>

      {/* The one way out, whichever control was pressed. */}
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
