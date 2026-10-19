"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import ServiceDocumentRequest from "@/components/portal/ServiceDocumentRequest";
import { DocChromeContext, clearDraft, hasDraftAnswers, type DocChrome } from "@/components/portal/DocFill";
import { IconClose, IconEye } from "@/components/icons";
import { App, Btn, Dialog, Tool, Toolbar } from "../../kit/kit";
import DeskFill from "./DeskFill";

// The document builder as a desktop program: the window's own toolbar (back,
// the document's name, a look at the template, close) around the builder.
// Its fill screen is drawn natively (DeskFill, a skin over DocFill); the
// steps around it — choosing how to fill, the payment, the finished file —
// are the web's, on the desktop's tokens. Leaving with answers typed asks
// first, as on the web.

export default function DocBuilder({ serviceId, lawyer, back, preview }: { serviceId: string; lawyer: boolean; back: () => void; preview: () => void }) {
  const td = useTranslations("portal.client.documents");
  const t = useTranslations("portal.client.services");
  const d = useTranslations("portal.desk.client");
  const [title, setTitle] = useState("");
  const [draftId, setDraftId] = useState("");
  const [exit, setExit] = useState(false);
  const ask = useCallback(() => (hasDraftAnswers(draftId) ? setExit(true) : back()), [draftId, back]);
  const chrome = useMemo<DocChrome>(() => ({ onBack: ask, onExit: ask, fillSkin: DeskFill }), [ask]);
  return (
    <App name="cbuilder">
      <Toolbar title={title || t("docViewTitle")} back={{ label: d("back"), onClick: ask }}>
        {lawyer ? null : <Tool icon={<IconEye />} label={t("viewDoc")} onClick={preview} />}
        <Tool icon={<IconClose />} label={td("exit")} onClick={ask} />
      </Toolbar>
      <div className="dxcb dx-scroll">
        <DocChromeContext.Provider value={chrome}>
          <ServiceDocumentRequest serviceId={serviceId} initialMode={lawyer ? "lawyer" : undefined} onTitle={setTitle} onDraftId={setDraftId} />
        </DocChromeContext.Provider>
      </div>
      <Dialog
        open={exit}
        title={td("exitTitle")}
        onClose={() => setExit(false)}
        actions={
          <>
            <Btn onClick={() => setExit(false)}>{td("exitStay")}</Btn>
            <Btn kind="danger" icon={<IconClose />} onClick={() => (draftId && clearDraft(draftId), setExit(false), back())}>
              {td("exitConfirm")}
            </Btn>
          </>
        }
      >
        <p className="dx-dlg__text">{td("exitLead")}</p>
      </Dialog>
    </App>
  );
}
