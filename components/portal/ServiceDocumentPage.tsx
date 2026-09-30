"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import ServiceDocumentRequest from "./ServiceDocumentRequest";
import { DocChromeContext, type DocChrome } from "./DocFill";
import { useCatalogBackHref } from "@/lib/catalogNav";
import { IconChevronLeft, IconClose } from "@/components/icons";

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
  const backHref = useCatalogBackHref();

  // Back and Exit leave, and that is the whole of it. There was a
  // "Konstruktordan chiqasizmi?" confirmation on both of them; it is gone.
  //
  // It only had something to warn about because leaving used to delete the
  // draft — the dialog promised "keyingi safar 0 dan boshlaysiz" and then
  // cleared it to make that true. Nothing needs to be true about it now:
  // the draft stays in the browser exactly as DocFill saved it, so coming
  // back resumes the document where it was left. There is no loss left to
  // confirm, and a dialog in front of a Back button that loses nothing is
  // only a second press.
  const leave = useCallback(() => (backHref ? router.push(backHref) : router.back()), [backHref, router]);
  // Once the builder itself is on screen it takes over the whole page in the
  // advocate editor's frame (DocFill's workspace mode) and puts these two in
  // its own top bar; this page's bar below then steps aside (CSS, see
  // .docbuild--full:has(.deditor--fill)). Every other step — the chooser,
  // the lawyer flow, waiting, done — keeps it.
  const chrome = useMemo<DocChrome>(() => ({ onBack: leave, onExit: leave }), [leave]);

  return (
    <div className="docbuild docbuild--full">
      <div className="docbuild__top">
        <button type="button" className="docbuild__back" onClick={leave}>
          <IconChevronLeft />
          {t("back")}
        </button>
        {title ? <b className="docbuild__title">{title}</b> : null}
        <button type="button" className="docbuild__exit" onClick={leave}>
          <IconClose />
          {td("exit")}
        </button>
      </div>
      <DocChromeContext.Provider value={chrome}>
        <ServiceDocumentRequest serviceId={serviceId} onTitle={setTitle} />
      </DocChromeContext.Provider>
    </div>
  );
}
