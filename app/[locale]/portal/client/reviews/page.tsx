"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { listReviewable, listMyReviews, submitReview, type ReviewTarget } from "@/lib/services/backend";
import { contactBlockedOf } from "@/lib/http";
import { useResource } from "@/lib/useResource";
import { useReload, Notice } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import { IconStar, IconCheck } from "@/components/icons";

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div className={`stars${onChange ? " stars--input" : ""}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`stars__s${n <= value ? " on" : ""}`}
          onClick={onChange ? () => onChange(n) : undefined}
          disabled={!onChange}
          aria-label={`${n}`}
        >
          <IconStar />
        </button>
      ))}
    </div>
  );
}

export default function ClientReviews() {
  const t = useTranslations("portal.client.reviews");
  const tcb = useTranslations("common");
  const [key, reload] = useReload();
  const pending = useResource(() => listReviewable(), [key]);
  const mine = useResource(() => listMyReviews(), [key]);

  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  function open(t2: ReviewTarget) {
    setTarget(t2);
    setRating(5);
    setComment("");
    setNote(null);
  }
  async function submit() {
    if (!target || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await submitReview({ case_id: target.caseId, lawyer_user_id: target.lawyerUserId, rating, comment: comment.trim() || undefined });
      setNote({ ok: true, msg: t("thanks") });
      setTimeout(() => {
        setTarget(null);
        reload();
      }, 900);
    } catch (e) {
      setNote({ ok: false, msg: contactBlockedOf(e) ? tcb("contactBlocked") : t("error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="ppanel" data-ai-target="reviews:pending">
        <div className="ppanel__h"><b>{t("pendingTitle")}</b></div>
        <p className="ppanel__note">{t("pendingLead")}</p>
        {pending.status === "loading" ? (
          <Skeleton rows={2} />
        ) : !pending.data.length ? (
          <EmptyState icon={<IconStar />} title={t("noPending")} text={t("noPendingText")} />
        ) : (
          <div className="alist">
            {pending.data.map((it) => (
              <div className="aitem" key={it.id}>
                <span className="aitem__n"><IconStar /></span>
                <div className="aitem__m">
                  <b>{it.lawyerName || "—"}</b>
                  <span className="aitem__meta">{it.service}</span>
                </div>
                <button className="btn btn--pri btn--sm" type="button" onClick={() => open(it)}>{t("rate")}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ppanel" data-ai-target="reviews:mine">
        <div className="ppanel__h"><b>{t("mineTitle")}</b></div>
        {mine.status === "loading" ? (
          <Skeleton rows={2} />
        ) : !mine.data.length ? (
          <EmptyState icon={<IconStar />} title={t("noMine")} text={t("noMineText")} />
        ) : (
          <div className="alist">
            {mine.data.map((rv) => (
              <div className="rvw" key={rv.id}>
                <div className="rvw__top">
                  <b>{rv.lawyerName || "—"}</b>
                  <Stars value={rv.rating} />
                </div>
                {rv.comment ? <p className="rvw__c">{rv.comment}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!target} onClose={() => setTarget(null)} title={t("modalTitle")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <p className="advmuted" style={{ margin: 0 }}>{target?.lawyerName} · {target?.service}</p>
          <div>
            <label>{t("ratingLabel")}</label>
            <Stars value={rating} onChange={setRating} />
          </div>
          <div>
            <label>{t("commentLabel")}</label>
            <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("commentPh")} />
          </div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--pri btn--full" type="button" onClick={submit} disabled={busy}>
            {busy ? t("sending") : <>{t("submit")}<IconCheck /></>}
          </button>
        </div>
      </Modal>
    </>
  );
}
