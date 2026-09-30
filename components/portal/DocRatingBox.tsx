"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { rateDocumentRequest, isRatingClosed, ratingOpen, opensComplaint, type QualityComplaint, type UrgentRating } from "@/lib/services/backend";
import { errDetail, logApiError } from "@/lib/http";
import { Link } from "@/i18n/navigation";
import { IconStarRate, IconClock, IconAlert, IconArrowRight } from "@/components/icons";

// The 15-minute window the backend opens when an advocate finalises a
// document (LEXGO_FRONTEND_DOCUMENT_RATING_AND_CALENDAR_FIX). Three states
// and no more: the window is open and the client can rate, they already did,
// or it has passed and this says so.
//
// Whether the window is open is the BACKEND's answer, not a subtraction done
// here: LEXGO_RATING_COMPLAINT_WINDOW_2026-09-29.md says so in as many words
// ("Frontend o'zi vaqt hisoblab qaror qilmasin"), and ratingOpen() is now
// available && !submitted and nothing else. The clock below is drawn from the
// server's own remaining_seconds and is decoration on top of that answer. A
// late send is refused with 409 rating_window_closed, which is treated as the
// window having shut rather than as a failure.

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

// The score a client already gave, as the five stars themselves and nothing
// else — no sentence, no "N yulduz". It sits in the row's action line, so a
// finished document reads left to right as "what you can still do with it,
// and what you thought of it". The aria-label carries the number for a
// screen reader, which cannot see the fill.
export function DocRatedStars({ value }: { value: number }) {
  const tr = useTranslations("portal.client.rate");
  if (!value) return null;
  return (
    <span className="drated" role="img" aria-label={tr("rateGiven", { n: value })} title={tr("rateGiven", { n: value })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= value ? "on" : ""} aria-hidden>
          <RateStar />
        </i>
      ))}
    </span>
  );
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
  // The five words the row puts under the stars. They are shared with the
  // urgent-advocate rating, which is why they sit in their own namespace
  // rather than being duplicated in both.
  const tr = useTranslations("portal.client.rate");
  const [stars, setStars] = useState(0);
  // The star the pointer or the keyboard is currently on, 0 for none. It is a
  // preview only: `stars` alone is what gets sent, and what aria-checked says.
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  // LEXGO_FRONTEND_CLIENT_WORKS_QUALITY_EDITOR_2026-09-29.md §4: at one or
  // two stars the backend opens a quality complaint of its own, and the
  // rating body carries the text for it. Asked for HERE, while the client
  // still has the work in front of them — after the send there is nothing
  // left to attach it to.
  const [complaint, setComplaint] = useState("");
  // What the send opened, when it opened one. Shown instead of the plain
  // thank-you, because "your complaint reached the call centre" is the one
  // fact a client who just gave one star is waiting for.
  const [qc, setQc] = useState<QualityComplaint | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [closed, setClosed] = useState(false);
  const [err, setErr] = useState("");
  // Ticks the countdown. setState from a timer callback, never during the
  // effect body.
  const [now, setNow] = useState(() => Date.now());

  // LEXGO_RATING_COMPLAINT_WINDOW_2026-09-29.md gives the window its own
  // countdown, `remaining_seconds`, and that is what the clock is built on:
  // it is the server's own number and survives a browser clock that is a few
  // minutes out, which deadline_at alone did not. The absolute deadline is
  // the fallback for an endpoint that still only sends that.
  const [mounted] = useState(() => Date.now());
  const endsAt = useMemo(() => {
    if (rating.remainingSeconds > 0) return mounted + rating.remainingSeconds * 1000;
    const d = rating.deadlineAt ? Date.parse(rating.deadlineAt) : NaN;
    return Number.isNaN(d) ? 0 : d;
  }, [rating.remainingSeconds, rating.deadlineAt, mounted]);
  const timed = endsAt > 0;
  const left = timed ? endsAt - now : Infinity;
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
    // Two different answers. A rating that opened a complaint says so and
    // points at it; an ordinary rating just thanks them.
    if (qc) {
      return (
        <div className="drate drate--qc" role="status">
          <b><IconAlert />{tr("complaintSent")}</b>
          {qc.workId ? <em className="drate__qcid">{qc.workId}</em> : null}
          <Link href="/portal/client/complaints" className="drate__qclink">
            {tr("complaintOpen")}
            <IconArrowRight />
          </Link>
        </div>
      );
    }
    // An ordinary rating renders nothing here any more. "Bahoyingiz uchun
    // rahmat · 2 yulduz" was a paragraph of its own above the buttons,
    // saying in words what the score already says: the client knows they
    // rated it, and the only fact worth keeping is how many stars. That is
    // drawn by DocRatedStars instead, on the same line as the actions —
    // see the row in ClientDocumentRequests.
    return null;
  }
  // Closed by the clock, by a 409, or because the backend says so.
  // Shut. The MD asks for this to be said rather than to vanish — "15
  // daqiqa tugasa: baholash tugmalari yo'qolsin; shikoyat inputi yo'qolsin;
  // 'Baholash muddati tugagan' yozuvi chiqsin" — but only where there was a
  // window to miss: a document that never opened one has nothing to report.
  const shut = closed || !ratingOpen(rating) || left <= 0;
  if (shut) {
    const hadWindow = closed || rating.available || !!rating.deadlineAt || rating.closedReason === "expired";
    if (!hadWindow) return null;
    return (
      <p className="drate drate--shut" role="status">
        <IconClock />
        {t("rateClosed")}
      </p>
    );
  }

  async function send() {
    if (!stars || busy) return;
    setBusy(true);
    setErr("");
    try {
      setQc(await rateDocumentRequest(id, stars, comment.trim(), complaint));
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
      {/* One or two stars means the backend will open a quality complaint on
          this send, so the form says so and asks what to put in it. It does
          not gate the send — a client who wants to give one star and write
          nothing still can, and the complaint is opened either way. */}
      {opensComplaint(stars) ? (
        <div className="drate__low">
          <b><IconAlert />{tr("lowTitle")}</b>
          <textarea
            className="drate__lowt"
            rows={2}
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder={tr("lowPh")}
            aria-label={tr("lowTitle")}
            maxLength={2000}
            disabled={busy}
          />
          <small>{tr("lowHint")}</small>
        </div>
      ) : null}
      {err ? <p className="drate__err" role="status">{err}</p> : null}
      <button type="button" className="btn btn--grad btn--sm" onClick={() => void send()} disabled={!stars || busy}>
        {busy ? t("rateSending") : t("rateSubmit")}
      </button>
    </div>
  );
}
