"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { rateDocumentRequest, isRatingClosed, ratingOpen, type UrgentRating } from "@/lib/services/backend";
import { errDetail, logApiError } from "@/lib/http";
import { IconStarRate, IconClock, IconCheck } from "@/components/icons";

// The 15-minute window the backend opens when an advocate finalises a
// document (LEXGO_FRONTEND_DOCUMENT_RATING_AND_CALENDAR_FIX). Three states
// and no more: the window is open and the client can rate, they already did,
// or it has passed and this renders nothing at all.
//
// The countdown is computed from rating_deadline_at rather than counted down
// from fifteen, so a page left open overnight shows the truth and a clock
// that is a minute out does not hand out a window that has closed. When it
// reaches zero the block closes itself, which is what the MD asks for — and
// the backend answers 409 for a late submit anyway, which is treated as the
// window having closed rather than as a failure.

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function DocRatingBox({
  id,
  rating,
  onRated,
}: {
  id: string;
  rating: UrgentRating;
  onRated?: () => void;
}) {
  const t = useTranslations("portal.client.documentRequests");
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [closed, setClosed] = useState(false);
  const [err, setErr] = useState("");
  // Ticks the countdown. setState from a timer callback, never during the
  // effect body.
  const [now, setNow] = useState(() => Date.now());

  const deadline = rating.deadlineAt ? Date.parse(rating.deadlineAt) : NaN;
  const timed = !Number.isNaN(deadline);
  const left = timed ? deadline - now : Infinity;

  useEffect(() => {
    if (!timed) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [timed]);

  const submitted = done || rating.submitted;
  if (submitted) {
    return (
      <p className="drate drate__done">
        <IconCheck />
        {t("rateThanks")}
        {rating.value ? <em>{t("rateGiven", { n: rating.value })}</em> : null}
      </p>
    );
  }
  // Closed by the clock, by a 409, or because the backend says so.
  if (closed || !ratingOpen(rating) || left <= 0) return null;

  async function send() {
    if (!stars || busy) return;
    setBusy(true);
    setErr("");
    try {
      await rateDocumentRequest(id, stars, comment.trim());
      setDone(true);
      onRated?.();
    } catch (e) {
      // Already rated, or the fifteen minutes are up — an answer, not a fault.
      if (isRatingClosed(e)) { setClosed(true); return; }
      logApiError("document rating", e);
      setErr(errDetail(e) || t("rateError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drate">
      <div className="drate__h">
        <b><IconStarRate />{t("rateTitle")}</b>
        {timed ? <span className="drate__left"><IconClock />{t("rateLeft", { time: clock(left) })}</span> : null}
      </div>
      <div className="drate__stars" role="radiogroup" aria-label={t("rateTitle")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={t("rateN", { n })}
            className={`drate__s${n <= stars ? " on" : ""}`}
            onClick={() => setStars(n)}
            disabled={busy}
          >
            <IconStarRate />
          </button>
        ))}
      </div>
      <input
        className="drate__c"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t("rateCommentPh")}
        aria-label={t("rateCommentPh")}
        maxLength={500}
        disabled={busy}
      />
      {err ? <p className="drate__err" role="status">{err}</p> : null}
      <button type="button" className="btn btn--grad btn--sm" onClick={() => void send()} disabled={!stars || busy}>
        {busy ? t("rateSending") : t("rateSubmit")}
      </button>
    </div>
  );
}
