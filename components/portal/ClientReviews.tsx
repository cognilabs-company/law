"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { listReviewable, listMyReviews, submitReview, type ReviewTarget } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { notify } from "@/lib/toast";
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

export default function ClientReviews({ children }: { children: ReactNode }) {
  const t = useTranslations("portal.client.reviews");
  const pending = useResource(() => listReviewable(), []);
  const mine = useResource(() => listMyReviews(), []);

  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  function open(t2: ReviewTarget) {
    setTarget(t2);
    setRating(5);
    setComment("");
  }
  async function submit() {
    if (!target || busy) return;
    setBusy(true);
    const nid = `review-${target.id}`;
    try {
      await submitReview({ case_id: target.caseId, lawyer_user_id: target.lawyerUserId, rating, comment: comment.trim() || undefined });
      notify.success(t("thanks"), { id: nid });
      setTarget(null);
      void pending.refresh();
      void mine.refresh();
    } catch (e) {
      notify.error(t("sendFailed"), { id: nid, error: e });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {pending.data.length ? (
        <div className="ppanel" data-ai-target="reviews:pending">
          <div className="ppanel__h"><b>{t("pendingTitle")}</b></div>
          <p className="ppanel__note">{t("pendingLead")}</p>
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
        </div>
      ) : null}

      {children}

      {mine.data.length ? (
        <div className="ppanel" data-ai-target="reviews:mine">
          <div className="ppanel__h"><b>{t("mineTitle")}</b></div>
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
        </div>
      ) : null}

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
          <button className="btn btn--pri btn--full" type="button" onClick={submit} disabled={busy}>
            {busy ? t("sending") : <>{t("submit")}<IconCheck /></>}
          </button>
        </div>
      </Modal>
    </>
  );
}
