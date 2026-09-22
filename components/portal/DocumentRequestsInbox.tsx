"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  listMyLawyerDocumentRequests,
  fulfillLawyerDocumentRequest,
  type LawyerDocumentRequest,
} from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { statusLabel } from "@/lib/labels";
import { shortDateTime } from "@/lib/date";
import { IconFileText, IconUser, IconCheck } from "@/components/icons";

// LEXGO_SERVICE_DOCUMENT_ASSIST_FLOW.md §5: the queue of client "prepare
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
                  {r.clientName || r.request.title || t("title")}
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
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [done, setDone] = useState(false);

  const [prevId, setPrevId] = useState(target?.id);
  if (target?.id !== prevId) {
    setPrevId(target?.id);
    setContent("");
    setNotes("");
    setNote(null);
    setDone(false);
  }

  async function fulfill() {
    if (!target || busy || !content.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      await fulfillLawyerDocumentRequest(target.id, { content: content.trim(), notes: notes.trim() || undefined });
      setDone(true);
      onDone();
    } catch {
      setNote({ ok: false, msg: t("fulfillError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} title={target?.clientName || target?.request.title || t("title")} wide>
      {target ? (
        <div className="cform" style={{ maxWidth: "none" }}>
          <div>
            <label>{t("need")}</label>
            <p className="advmuted" style={{ margin: 0 }}>{target.need || "—"}</p>
          </div>
          {done ? (
            <p className="cform__ok">
              <IconCheck style={{ width: 16, height: 16 }} /> {t("fulfilled")}
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="fulfill-content">{t("contentLabel")}</label>
                <textarea id="fulfill-content" rows={10} value={content} onChange={(e) => setContent(e.target.value)} />
              </div>
              <div>
                <label htmlFor="fulfill-notes">{t("notesLabel")}</label>
                <textarea id="fulfill-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
              <button className="btn btn--grad btn--full btn--lg" type="button" onClick={fulfill} disabled={busy || !content.trim()}>
                {busy ? t("processingShort") : t("fulfillSubmit")}
              </button>
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
