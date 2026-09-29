"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createComplaint } from "@/lib/services/backend";
import { errDetail, logApiError } from "@/lib/http";
import Select from "@/components/Select";
import { Link } from "@/i18n/navigation";
import { IconAlert, IconCheck, IconArrowRight, IconClose } from "@/components/icons";

// Complaining about work that is over.
//
// This is the SECOND way to complain and the lesser one. The first is the
// rating: LEXGO_FRONTEND_CLIENT_WORKS_QUALITY_EDITOR_2026-09-29.md §4 puts a
// `complaint` field on POST /document-requests/{id}/rating and has the
// backend open a quality complaint by itself at one or two stars — that one
// arrives at the call-centre attached to the work, with the advocate, the
// document and the review beside it. Use it wherever a rating window is open.
//
// This one exists for the rest: work whose fifteen minutes have run out, and
// work that was cancelled and never had a window at all — 27 of this client's
// 41 Tezkor records, which had no route to a complaint before. POST
// /complaints takes no record id (a complaint made there comes back with
// document_request_id and lawyer_request_id both null, checked against
// production), so the work travels in the text and an operator has to read
// for it. That is the compromise, and it is why the rating path is preferred.
//
// It is NOT a dialog. It used to open a <Modal>, which on the Tezkor detail —
// itself a modal — nested one inside the other: closing the inner one set
// document.body.style.overflow back to "" while the outer was still open, so
// the page scrolled behind it, and one Escape was ambiguous between the two.
// An inline disclosure has none of that, and it leaves the answer on screen
// instead of the dialog vanishing on a timer, which is what the send used to
// do — successfully, and with nothing to show for it.
const CATS = ["lawyer", "service", "quality", "payment", "other"];

export default function ComplaintBox({
  subject,
  workId = "",
  caseId = "",
  onSent,
}: {
  /** What the work is called; becomes the complaint's subject. */
  subject: string;
  /** LGD-/LGT- work id, when the record carries one. */
  workId?: string;
  /** Passed through as case_id when the record is a case. */
  caseId?: string;
  onSent?: () => void;
}) {
  const t = useTranslations("portal.client.complaints");
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(CATS[0]);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  // "LGD-20260928-465EBDB0 · Ijaraga oid ariza" — one line, both facts, and
  // just the title when the row has no work id yet.
  const ref = [workId, subject].filter(Boolean).join(" · ");

  // The answer stays. A complaint the client cannot see land is a complaint
  // they send twice.
  if (sent) {
    return (
      <div className="cmpl cmpl--done" role="status">
        <b><IconCheck />{t("sent")}</b>
        <Link href="/portal/client/complaints" className="cmpl__link">
          {t("title")}
          <IconArrowRight />
        </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="cmpl__open"
        aria-expanded={false}
        onClick={() => { setErr(""); setDesc(""); setCat(CATS[0]); setOpen(true); }}
      >
        <IconAlert />
        {t("fileOne")}
      </button>
    );
  }

  async function send() {
    if (busy) return;
    // The description is what makes a complaint answerable, and the only
    // field the client has to write: the subject comes from the work.
    if (!desc.trim()) { setErr(t("descRequired")); return; }
    setBusy(true);
    setErr("");
    try {
      await createComplaint({
        category: cat,
        subject: subject || t("fileTitle"),
        description: ref ? `${desc.trim()}\n\n— ${ref}` : desc.trim(),
        ...(caseId ? { case_id: caseId } : {}),
      });
      setSent(true);
      onSent?.();
    } catch (e) {
      logApiError("complaint create", e);
      setErr(errDetail(e) || t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cmpl">
      <div className="cmpl__h">
        <b><IconAlert />{t("fileTitle")}</b>
        <button type="button" className="cmpl__x" onClick={() => setOpen(false)} aria-label={t("cancel")}>
          <IconClose />
        </button>
      </div>
      {/* Says this is not the rating. The two sit near each other and a client
          who wanted to give one star should not file a complaint by accident,
          or the other way round. */}
      <p className="cmpl__lead">{t("fileLead")}</p>
      {ref ? (
        <p className="cmpl__ref">
          <span>{t("ref")}</span>
          <b>{ref}</b>
        </p>
      ) : null}
      <Select
        value={cat}
        onChange={setCat}
        options={CATS.map((c) => ({ value: c, label: t(`cat.${c}`) }))}
        ariaLabel={t("catLabel")}
      />
      <textarea
        className="cmpl__t"
        rows={3}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder={t("descPh")}
        aria-label={t("desc")}
        maxLength={2000}
        disabled={busy}
      />
      {err ? <p className="cmpl__err" role="status">{err}</p> : null}
      <div className="cmpl__acts">
        <button type="button" className="btn btn--pri btn--sm" onClick={() => void send()} disabled={busy}>
          {busy ? t("sending") : t("submit")}
        </button>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setOpen(false)} disabled={busy}>
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
