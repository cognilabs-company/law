"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createComplaint } from "@/lib/services/backend";
import { errDetail, logApiError } from "@/lib/http";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { Notice } from "@/components/admin/AdminBits";
import { IconAlert } from "@/components/icons";

// Complaining about work that has just been handed over.
//
// The rating window and this are two different things, and the client screens
// only had the first: fifteen minutes of stars and then nothing. A complaint
// is its own record (POST /complaints, read back on the client's Shikoyatlar
// page), it is not a low rating, and it must not expire with the rating
// window — so this renders on its own terms and keeps rendering after the
// fifteen minutes have run out.
//
// The five categories are the ones the complaints page already offers, in a
// different order: this button only ever appears on work an advocate has
// finished, so "Advokat/Yurist" leads rather than "Xizmat".
const CATS = ["lawyer", "service", "quality", "payment", "other"];

// POST /complaints takes category, subject, description and an optional
// case_id — there is no field for a document-request or an urgent-advokat
// record, so the only way the work reaches the operator reading the complaint
// is in the text. The reference is appended to the description rather than
// left in the subject alone, because the subject is the client's to rewrite
// and a complaint that does not say which work it is about is unactionable.
// Filed as a backend ask; when a record field ships this goes back to being
// a plain id.
function withRef(description: string, ref: string): string {
  return ref ? `${description}\n\n— ${ref}` : description;
}

export default function ComplaintBox({
  subject,
  workId = "",
  caseId = "",
  onSent,
}: {
  /** What the work is called, used to prefill the subject line. */
  subject: string;
  /** LGD-/LGT- work id, when the record carries one. */
  workId?: string;
  /** Passed straight through as case_id when the record is a case. */
  caseId?: string;
  onSent?: () => void;
}) {
  const t = useTranslations("portal.client.complaints");
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(CATS[0]);
  // Prefilled from the work, and the client's to change. Re-seeded every time
  // the dialog opens so a half-edited subject from a cancelled attempt does
  // not carry over to the next one.
  const [subj, setSubj] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  // "LGD-20260928-465EBDB0 · Ijaraga oid ariza" — one line, both facts, and
  // just the title when the backend has not given this row a work id yet.
  const ref = [workId, subject].filter(Boolean).join(" · ");

  function start() {
    setSubj(subject);
    setDesc("");
    setNote(null);
    setCat(CATS[0]);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // The description is what makes a complaint answerable; the subject is
    // prefilled and can stand on its own, so only the body is required.
    if (!desc.trim()) {
      setNote({ ok: false, msg: t("error") });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await createComplaint({
        category: cat,
        subject: subj.trim() || subject,
        description: withRef(desc.trim(), ref),
        ...(caseId ? { case_id: caseId } : {}),
      });
      setNote({ ok: true, msg: t("sent") });
      setDesc("");
      onSent?.();
      setTimeout(() => setOpen(false), 900);
    } catch (e) {
      logApiError("complaint create", e);
      setNote({ ok: false, msg: errDetail(e) || t("error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn--line btn--sm cmpl__open" onClick={start}>
        <IconAlert />
        {t("fileOne")}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("fileTitle")}>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
          {/* Says up front that this is not the rating — the two sit next to
              each other and a client who wanted to give one star should not
              end up filing a complaint by accident, or the other way round. */}
          <p className="cmpl__lead">{t("fileLead")}</p>
          {ref ? (
            <p className="cmpl__ref">
              <span>{t("ref")}</span>
              <b>{ref}</b>
            </p>
          ) : null}
          <div>
            <label>{t("catLabel")}</label>
            <Select value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c, label: t(`cat.${c}`) }))} ariaLabel={t("catLabel")} />
          </div>
          <div>
            <label>{t("subject")}</label>
            <input value={subj} onChange={(e) => setSubj(e.target.value)} placeholder={t("subjectPh")} maxLength={200} />
          </div>
          <div>
            <label>{t("desc")}</label>
            <textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("descPh")} maxLength={2000} />
          </div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
            {busy ? t("sending") : t("submit")}
          </button>
        </form>
      </Modal>
    </>
  );
}
