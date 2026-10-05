"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getEditorSources,
  setEditorSource,
  uploadEditorSource,
  editorClaimNeeded,
  isDocxFile,
  type EditorSource,
  type EditorSources,
} from "@/lib/services/backend";
import { errDetail, logApiError } from "@/lib/http";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "./DataState";
import { IconFileText, IconEdit, IconSparkle, IconPaperclip, IconCheck, IconUpload, IconLock } from "@/components/icons";

// LEXGO_FRONTEND_CLIENT_WORKS_QUALITY_EDITOR_2026-09-29.md §7-8.
//
// What the editor opens on, chosen before it opens. Four kinds:
// a clean template, a blank document, the AI draft when one was ordered, and
// any DOCX the client attached. The advocate can also upload their own.
//
// Two rules from the MD, both enforced here:
//   • "Frontend available=false bo'lgan variantni disabled ko'rsatsin" — an
//     unavailable option is shown and greyed, never hidden, so the advocate
//     can see the AI draft exists and simply was not ordered.
//   • "Faqat .docx editable source sifatida qabul qilinadi" — checked in the
//     browser, so a PDF is refused before the upload rather than by a 4xx
//     after it.
//
// Changing the source closes the editor session server-side ("source o'zgarsa
// backend eski editor sessionni yopadi"), which is why onPicked() exists: the
// caller re-opens the editor rather than reusing the session it was holding.

const SOURCE_ICON: Record<string, typeof IconFileText> = {
  template: IconFileText,
  blank: IconEdit,
  ai_draft: IconSparkle,
  attachment: IconPaperclip,
};

export default function EditorSourcePicker({
  recordId,
  open,
  onClose,
  onPicked,
}: {
  recordId: string;
  open: boolean;
  onClose: () => void;
  /** The source changed: the caller must re-fetch the editor session. */
  onPicked: () => void;
}) {
  const t = useTranslations("portal.lawyer.editorSource");
  const [data, setData] = useState<EditorSources | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "claim">("loading");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const file = useRef<HTMLInputElement>(null);

  // Back to the skeleton during render rather than from inside the effect —
  // one render instead of a cascade, and the lint rule this repo enforces.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) { setState("loading"); setErr(""); }
  }

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getEditorSources(recordId)
      .then((d) => { if (alive) { setData(d); setState("ready"); } })
      .catch((e) => {
        if (!alive) return;
        // The record is still in the pool. Said in the backend's own words;
        // the workspace behind this dialog already offers the claim.
        const claim = editorClaimNeeded(e);
        if (claim) { setErr(claim.message); setState("claim"); return; }
        logApiError("editor sources", e);
        setErr(errDetail(e));
        setState("error");
      });
    return () => { alive = false; };
  }, [recordId, open]);

  async function pick(o: EditorSource) {
    if (busy || !o.available) return;
    const key = o.sourceType + (o.attachmentId || "");
    setBusy(key);
    setErr("");
    try {
      await setEditorSource(recordId, { sourceType: o.sourceType, attachmentId: o.attachmentId || undefined });
      onPicked();
      onClose();
    } catch (e) {
      logApiError("editor source", e);
      setErr(errDetail(e) || t("error"));
    } finally {
      setBusy("");
    }
  }

  async function upload(f: File) {
    if (busy) return;
    if (!isDocxFile(f)) { setErr(t("docxOnly")); return; }
    setBusy("upload");
    setErr("");
    try {
      await uploadEditorSource(recordId, f);
      onPicked();
      onClose();
    } catch (e) {
      logApiError("editor source upload", e);
      setErr(errDetail(e) || t("error"));
    } finally {
      setBusy("");
      if (file.current) file.current.value = "";
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("title")}>
      <div className="esrc">
        <p className="esrc__lead">{t("lead")}</p>

        {state === "loading" ? (
          <Skeleton rows={3} />
        ) : state === "claim" ? (
          <Notice ok={false} msg={err || t("claimFirst")} />
        ) : state === "error" ? (
          <Notice ok={false} msg={err || t("error")} />
        ) : (
          <div className="esrc__list" data-ai-target="doc-editor:sources" data-ai-label={t("title")}>
            {(data?.options ?? []).map((o) => {
              const key = o.sourceType + (o.attachmentId || "");
              const Icon = SOURCE_ICON[o.sourceType] ?? IconFileText;
              const on = data?.currentSource === o.sourceType;
              return (
                <button
                  key={key}
                  type="button"
                  className={`esrc__o${on ? " esrc__o--on" : ""}${o.available ? "" : " esrc__o--off"}`}
                  onClick={() => void pick(o)}
                  disabled={!o.available || !!busy}
                  aria-pressed={on}
                >
                  <span className="esrc__i" aria-hidden><Icon /></span>
                  <span className="esrc__m">
                    <b>{o.title || (t.has(`kind.${o.sourceType}`) ? t(`kind.${o.sourceType}`) : o.sourceType)}</b>
                    {o.note ? <small>{o.note}</small> : null}
                    {/* Why it is greyed, when the backend says. Without this an
                        unavailable AI draft looks like a broken button. */}
                    {!o.available && !o.note ? <small>{t("unavailable")}</small> : null}
                  </span>
                  {on ? <span className="esrc__on" aria-hidden><IconCheck /></span> : null}
                  {!o.available ? <span className="esrc__lock" aria-hidden><IconLock /></span> : null}
                </button>
              );
            })}

            {/* The advocate's own DOCX. Its own row rather than an option in
                the list, because it is the only one that needs a file first. */}
            <label className={`esrc__o esrc__o--up${busy === "upload" ? " esrc__o--busy" : ""}`}>
              <span className="esrc__i" aria-hidden><IconUpload /></span>
              <span className="esrc__m">
                <b>{t("kind.upload")}</b>
                <small>{t("uploadHint")}</small>
              </span>
              <input
                ref={file}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
                disabled={!!busy}
              />
            </label>
          </div>
        )}

        {err && state === "ready" ? <Notice ok={false} msg={err} /> : null}
      </div>
    </Modal>
  );
}
