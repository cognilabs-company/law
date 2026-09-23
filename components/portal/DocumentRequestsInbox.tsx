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
import DocTemplateViewer from "./DocTemplateViewer";
import { statusLabel } from "@/lib/labels";
import { shortDateTime } from "@/lib/date";
import { IconFileText, IconUser, IconPhone, IconCheck, IconEye, IconDownload, IconUpload } from "@/components/icons";

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
  const [dlBusy, setDlBusy] = useState(false);
  // Which file the inline-preview modal is showing, if any — the template
  // (client's blank clean-source-file) or the advocate's own just-uploaded
  // result. Never a browser tab (see DocTemplateViewer's own comment: a
  // browser can't render DOCX, so opening one in a new tab just flashed a
  // blank tab and silently forced a download instead of showing anything).
  const [preview, setPreview] = useState<"template" | "result" | "">("");

  const [prevId, setPrevId] = useState(target?.id);
  if (target?.id !== prevId) {
    setPrevId(target?.id);
    setFile(null);
    setNotes("");
    setNote(null);
    setDone(null);
    setPreview("");
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
  async function downloadTemplate() {
    const tpl = target?.templateFile;
    if (!tpl?.hasFile || dlBusy) return;
    setDlBusy(true);
    const ok = await fetchAndDeliver(() => getServiceTemplateSourceFile(tpl.downloadUrl || tpl.inlineUrl), tpl.fileName || "shablon.docx", true);
    if (!ok) setNote({ ok: false, msg: t("templateError") });
    setDlBusy(false);
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
  const tpl = target?.templateFile;

  return (
    <Modal open={!!target} onClose={onClose} title={target?.clientName || target?.title || t("title")} wide>
      {target ? (
        <div className="cform docassist" style={{ maxWidth: "none" }}>
          {target.clientPhone ? (
            <p className="advmuted" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <IconPhone style={{ width: 14, height: 14 }} />
              {target.clientPhone}
            </p>
          ) : null}

          <section className="docassist__sec">
            <label>{t("need")}</label>
            <p style={{ margin: 0, fontSize: ".92rem" }}>{target.need || "—"}</p>
            {answerEntries.length ? (
              <div className="oquote" style={{ marginTop: 4 }}>
                {answerEntries.map(([k, v]) => (
                  <div className="oquote__row" key={k}>
                    <span>{humanizeSlug(k)}</span>
                    <b>{String(v)}</b>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="docassist__sec">
            <label>{t("templateLabel")}</label>
            {tpl?.hasFile ? (
              <div className="chiprow" style={{ margin: "4px 0 0" }}>
                <button type="button" className="btn btn--line btn--sm" onClick={() => setPreview("template")}>
                  <IconEye /> {t("viewTemplate")}
                </button>
                <button type="button" className="btn btn--line btn--sm" disabled={dlBusy} onClick={downloadTemplate}>
                  <IconDownload /> {dlBusy ? t("processingShort") : t("downloadTemplate")}
                </button>
              </div>
            ) : (
              <p className="advmuted">{t("noTemplate")}</p>
            )}
          </section>

          {done ? (
            <section className="docassist__sec">
              <p className="cform__ok" style={{ margin: 0 }}>
                <IconCheck style={{ width: 16, height: 16 }} /> {t("fulfilled")}
              </p>
              {done.file ? (
                <button type="button" className="btn btn--line btn--full" style={{ marginTop: 10 }} onClick={() => setPreview("result")}>
                  <IconEye /> {t("viewResult")}
                </button>
              ) : null}
            </section>
          ) : (
            <section className="docassist__sec">
              <label>{t("fileLabel")}</label>
              <FilePicker id="fulfill-file" file={file} onPick={pickFile} placeholder={t("filePlaceholder")} chooseLabel={t("chooseFile")} />
              <label htmlFor="fulfill-notes" style={{ marginTop: 4 }}>{t("notesLabel")}</label>
              <textarea id="fulfill-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
              <button className="btn btn--grad btn--full btn--lg" type="button" onClick={submit} disabled={busy || !file}>
                {busy ? t("processingShort") : t("fulfillSubmit")}
              </button>
            </section>
          )}
        </div>
      ) : null}

      <DocTemplateViewer
        open={preview === "template"}
        onClose={() => setPreview("")}
        title={tpl?.fileName || t("templateLabel")}
        fetchBlob={tpl?.hasFile ? () => getServiceTemplateSourceFile(tpl.downloadUrl || tpl.inlineUrl) : null}
        fileName={tpl?.fileName || "shablon.docx"}
      />
      <DocTemplateViewer
        open={preview === "result"}
        onClose={() => setPreview("")}
        title={done?.file?.fileName || t("viewResult")}
        fetchBlob={done?.file ? () => getServiceTemplateSourceFile(done.file!.inlineUrl || done.file!.downloadUrl) : null}
        fileName={done?.file?.fileName || "hujjat.docx"}
      />
    </Modal>
  );
}

// The native <input type=file> renders per the OS/browser's own locale (a
// Russian-Windows Chrome shows "Обзор…"/"Файл не выбран" — this app has no
// control over that text at all, and no amount of CSS reaches it) — hidden
// and driven by a real button + our own filename text instead, the standard
// way to get a fully themeable file picker.
function FilePicker({
  id,
  file,
  onPick,
  placeholder,
  chooseLabel,
}: {
  id: string;
  file: File | null;
  onPick: (f: File | null) => void;
  placeholder: string;
  chooseLabel: string;
}) {
  return (
    <label htmlFor={id} className="filepick">
      <input id={id} type="file" accept=".docx" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <span className="filepick__btn">
        <IconUpload />
        {chooseLabel}
      </span>
      <span className={`filepick__name${file ? "" : " advmuted"}`}>{file ? file.name : placeholder}</span>
    </label>
  );
}
