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

// The star the rating row draws is spelled out here instead of coming from
// components/icons.tsx because the animation needs pathLength: the empty star
// is a dashed outline that crawls slowly round its own edge, and without a
// normalised path length the dash pattern changes with every size the icon is
// rendered at. icons.tsx is shared by the whole app, so that attribute stays
// with the one widget that depends on it. The presentation attributes are the
// same defaults the shared icons carry, so the star still reads correctly
// anywhere the rating CSS does not reach.
export const RateStar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden="true">
    <path pathLength={360} d="M12 3.2l2.7 5.5 6 .9-4.35 4.24 1.03 5.99L12 17l-5.38 2.83 1.03-5.99L3.3 9.6l6-.9L12 3.2z" />
  </svg>
);

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
  // The five words the row puts under the stars. They are shared with the
  // urgent-advocate rating, which is why they sit in their own namespace
  // rather than being duplicated in both.
  const tr = useTranslations("portal.client.rate");
  const [stars, setStars] = useState(0);
  // The star the pointer or the keyboard is currently on, 0 for none. It is a
  // preview only: `stars` alone is what gets sent, and what aria-checked says.
  const [hover, setHover] = useState(0);
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
  // What the row should look like right now: the hovered star while the
  // pointer is on the row, otherwise the one that was picked.
  const shown = hover || stars;

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
      {/* Two classes, because they answer two different questions. `on` is
          "draw this star gold" and follows the preview, so moving across the
          row fills and empties it as you go. `set` is "this star is actually
          chosen" and only ever changes on a click — which is what makes the
          pop animation fire once, when a rating is given, and not again every
          time the pointer wanders back over the row.

          The preview is component state rather than the CSS-only row-reverse
          sibling trick the idea came from: that trick needs the stars in DOM
          order 5..1, which would hand a screen reader and the Tab key the row
          backwards. Keeping real buttons in reading order is worth one
          useState. */}
      <div
        className="drate__stars"
        role="radiogroup"
        aria-label={t("rateTitle")}
        onPointerLeave={() => setHover(0)}
        onBlur={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={t("rateN", { n })}
            className={`drate__s${n <= shown ? " on" : ""}${n <= stars ? " set" : ""}`}
            onClick={() => setStars(n)}
            onPointerEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            disabled={busy}
          >
            <RateStar />
          </button>
        ))}
      </div>
      {/* The word for the star under the pointer. aria-hidden because each
          button already announces "{n} yulduz" — this is for the eye only. */}
      <p className="drate__word" aria-hidden="true">{shown ? tr(`w${shown}`) : ""}</p>
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
