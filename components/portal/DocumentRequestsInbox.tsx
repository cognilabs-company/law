"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  listMyLawyerDocumentRequests,
  fulfillLawyerDocumentRequestFile,
  getServiceTemplateSourceFile,
  type LawyerDocumentRequest,
} from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { fetchAndDeliver } from "@/lib/download";
import { useResource } from "@/lib/useResource";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { statusLabel } from "@/lib/labels";
import { shortDateTime } from "@/lib/date";
import { IconFileText, IconUser, IconPhone, IconCheck, IconEye, IconDownload } from "@/components/icons";

// LEXGO_LAWYER_DOCUMENT_FILE_FLOW_FRONTEND.md: the queue of client "prepare
// with a lawyer" document requests assigned to this account. Not role-gated
// to "lawyer" on the backend (owner / documents.manage / call-center can all
// see and fulfill), so this same component is mounted under both
// /portal/lawyer and /portal/advocate — see SellerCases.tsx for the same
// ns-prop sharing convention this follows.
export default function DocumentRequestsInbox({ ns }: { ns: string }) {
  const t = useTranslations(ns);
  const tcm = useTranslations("portal.common");
  const locale = useLocale();
  const [reloadKey, setReloadKey] = useState(0);
  const rows = useResource<LawyerDocumentRequest>(listMyLawyerDocumentRequests, [reloadKey]);
  const [target, setTarget] = useState<LawyerDocumentRequest | null>(null);

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{rows.data.length}</span>
      </div>
      {rows.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !rows.data.length ? (
        <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="pcards">
          {rows.data.map((r) => (
            <button className="pcase pcase--btn" key={r.id} type="button" onClick={() => setTarget(r)}>
              <div className="pcase__h">
                <span className="pcase__client">
                  <IconUser />
                  {r.clientName || r.title || t("title")}
                </span>
                <span className="advmuted">{statusLabel(tcm, r.status || r.request.status)}</span>
              </div>
              {r.need ? <p>{r.need}</p> : null}
              {r.createdAt ? (
                <small>{shortDateTime(r.createdAt, locale)}</small>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <FulfillModal ns={ns} target={target} onClose={() => setTarget(null)} onDone={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}

type FulfillResult = Awaited<ReturnType<typeof fulfillLawyerDocumentRequestFile>>;

function FulfillModal({
  ns,
  target,
  onClose,
  onDone,
}: {
  ns: string;
  target: LawyerDocumentRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations(ns);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [done, setDone] = useState<FulfillResult | null>(null);
  const [tplBusy, setTplBusy] = useState<"view" | "download" | "">("");

  const [prevId, setPrevId] = useState(target?.id);
  if (target?.id !== prevId) {
    setPrevId(target?.id);
    setFile(null);
    setNotes("");
    setNote(null);
    setDone(null);
    setTplBusy("");
  }

  function pickFile(f: File | null) {
    setNote(null);
    if (f && !/\.docx$/i.test(f.name)) {
      setFile(null);
      setNote({ ok: false, msg: t("invalidFileType") });
      return;
    }
    setFile(f);
  }

  // The template is fetched through the authed proxy like every other file
  // in this app (never a plain link) — clean-source-file, already blank in
  // place of {{field}} markers per LEXGO_CLEAN_TEMPLATE_DOWNLOAD_FRONTEND.md,
  // is what template_file.download_url/inline_url already point at.
  async function openTemplate(mode: "view" | "download") {
    const tpl = target?.templateFile;
    if (!tpl?.hasFile || tplBusy) return;
    setTplBusy(mode);
    const url = mode === "view" ? tpl.inlineUrl || tpl.downloadUrl : tpl.downloadUrl || tpl.inlineUrl;
    const ok = await fetchAndDeliver(() => getServiceTemplateSourceFile(url), tpl.fileName || "shablon.docx", mode === "download");
    if (!ok) setNote({ ok: false, msg: t("templateError") });
    setTplBusy("");
  }

  async function openResult() {
    if (!done?.file) return;
    const url = done.file.inlineUrl || done.file.downloadUrl;
    await fetchAndDeliver(() => getServiceTemplateSourceFile(url), done.file?.fileName || "hujjat.docx", false);
  }

  async function submit() {
    if (!target || !file || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await fulfillLawyerDocumentRequestFile(target.fulfillFileUrl, file, notes.trim() || undefined);
      setDone(result);
      onDone();
    } catch (e) {
      setNote({ ok: false, msg: e instanceof ApiError && e.detail ? e.detail : t("fulfillError") });
    } finally {
      setBusy(false);
    }
  }

  const answerEntries = target ? Object.entries(target.answers).filter(([, v]) => v != null && v !== "") : [];

  return (
    <Modal open={!!target} onClose={onClose} title={target?.clientName || target?.title || t("title")} wide>
      {target ? (
        <div className="cform" style={{ maxWidth: "none" }}>
          {target.clientPhone ? (
            <p className="advmuted" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <IconPhone style={{ width: 14, height: 14 }} />
              {target.clientPhone}
            </p>
          ) : null}
          <div>
            <label>{t("need")}</label>
            <p className="advmuted" style={{ margin: 0 }}>{target.need || "—"}</p>
          </div>

          {answerEntries.length ? (
            <div>
              <label>{t("answersLabel")}</label>
              <div className="oquote">
                {answerEntries.map(([k, v]) => (
                  <div className="oquote__row" key={k}>
                    <span>{humanizeSlug(k)}</span>
                    <b>{String(v)}</b>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label>{t("templateLabel")}</label>
            {target.templateFile?.hasFile ? (
              <div className="chiprow" style={{ margin: "4px 0 0" }}>
                <button type="button" className="btn btn--line btn--sm" disabled={!!tplBusy} onClick={() => openTemplate("view")}>
                  <IconEye /> {tplBusy === "view" ? t("processingShort") : t("viewTemplate")}
                </button>
                <button type="button" className="btn btn--line btn--sm" disabled={!!tplBusy} onClick={() => openTemplate("download")}>
                  <IconDownload /> {tplBusy === "download" ? t("processingShort") : t("downloadTemplate")}
                </button>
              </div>
            ) : (
              <p className="advmuted">{t("noTemplate")}</p>
            )}
          </div>

          {done ? (
            <>
              <p className="cform__ok">
                <IconCheck style={{ width: 16, height: 16 }} /> {t("fulfilled")}
              </p>
              {done.file ? (
                <button type="button" className="btn btn--line btn--full" onClick={openResult}>
                  <IconDownload /> {t("viewResult")}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <div>
                <label htmlFor="fulfill-file">{t("fileLabel")}</label>
                <input id="fulfill-file" type="file" accept=".docx" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              </div>
              <div>
                <label htmlFor="fulfill-notes">{t("notesLabel")}</label>
                <textarea id="fulfill-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
              <button className="btn btn--grad btn--full btn--lg" type="button" onClick={submit} disabled={busy || !file}>
                {busy ? t("processingShort") : t("fulfillSubmit")}
              </button>
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
