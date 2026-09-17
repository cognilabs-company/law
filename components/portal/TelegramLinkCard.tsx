"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { apiMe, startTelegramLink } from "@/lib/services/backend";
import { ApiError, errDetail, isProviderUnavailable, isRateLimited, retryAfterSec } from "@/lib/http";
import { fmtClock, useDeadline } from "@/lib/useOtpTimer";
import { Notice } from "@/components/admin/AdminBits";
import { IconSend, IconExternal, IconCheck, IconRefresh } from "@/components/icons";

// Telegram account link (T0-15): POST /telegram/link/start gives a one-time
// t.me deep link valid 10 minutes; pressing Start in the bot links the account.
// The linked state comes from /auth/me when it exposes telegram_chat_id.
// `relink` = issued while already linked: /auth/me says "linked" before and
// after, so such a link can't be confirmed and ends with Done or at expiry.
type ActiveLink = { uid: string; url: string; expiresMs: number; opened?: boolean; relink?: boolean };
const STORE = "lexgo_tg_link";
const POLL_MS = 5000;

// The active link survives a reload (mobile browsers may reload the tab on
// the way back from Telegram), per tab only.
function readStoredLink(): ActiveLink | null {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE) || "null");
    return v && typeof v.uid === "string" && typeof v.url === "string" && /^(https:|tg:)\/\//i.test(v.url) && typeof v.expiresMs === "number"
      ? v
      : null;
  } catch {
    return null;
  }
}
function storeLink(l: ActiveLink | null) {
  try {
    if (l) sessionStorage.setItem(STORE, JSON.stringify(l));
    else sessionStorage.removeItem(STORE);
  } catch {
    /* storage blocked */
  }
}

export default function TelegramLinkCard() {
  const t = useTranslations("portal.common.telegram");
  const tc = useTranslations("common");
  const { session, ready, update } = useAuth();
  const [stored, setStored] = useState<ActiveLink | null>(readStoredLink);
  const linked = session?.telegramLinked === true;
  // Session is null on the server and during hydration, so a restored link
  // never causes a mismatch; the uid check hides another user's link.
  const mine = stored && session && stored.uid === session.id ? stored : null;
  const left = useDeadline(mine?.expiresMs ?? 0);
  // A normal link is done once the account shows as linked (e.g. AuthProvider's
  // /auth/me after the tab reloaded); a relink link is done at expiry.
  const finished = !!mine && (mine.relink ? left === 0 : linked);
  const link = finished ? null : mine;
  const expired = !!link && left === 0;
  const [waitUntil, setWaitUntil] = useState(0); // 429 cooldown, epoch ms
  const waitLeft = useDeadline(waitUntil);
  const [canPoll, setCanPoll] = useState(true);
  const [finalFor, setFinalFor] = useState(""); // url of the link whose post-expiry check is back
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const reqRef = useRef(0); // bumped by cancel() so a late start response is ignored
  const openedRef = useRef(false);

  // Drop a stored token that must not outlive its use: finished, or left
  // behind by a signed-out or different user (only once auth has hydrated).
  const stale = finished || (ready && !!stored && (!session || stored.uid !== session.id));
  useEffect(() => {
    if (stale) storeLink(null);
  }, [stale]);

  useEffect(() => {
    openedRef.current = !!link?.opened;
  });

  function setActive(l: ActiveLink | null) {
    storeLink(l);
    setStored(l);
  }

  function startError(e: unknown): string {
    if (isRateLimited(e)) return errDetail(e) || tc("rateLimited");
    if (isProviderUnavailable(e)) return t("errUnavailable");
    if (e instanceof ApiError && (e.status === 0 || e.status === 502)) return tc("offline");
    // Refusals (e.g. already linked elsewhere) keep the server's own words.
    if (e instanceof ApiError && [400, 403, 409].includes(e.status) && errDetail(e)) return errDetail(e);
    return t("errStart");
  }

  async function generate() {
    if (busy || !session || waitLeft > 0) return;
    const req = ++reqRef.current;
    setBusy(true);
    setNote(null);
    setCanPoll(true);
    try {
      const r = await startTelegramLink();
      if (req !== reqRef.current) return; // cancelled while pending
      if (r.url) {
        // A usable link wins over a linked/already_linked flag: that's a relink.
        if (r.linked) update({ telegramLinked: true });
        setActive({ uid: session.id, url: r.url, expiresMs: r.expiresAt, relink: linked || r.linked });
      } else if (r.linked) {
        update({ telegramLinked: true });
        setActive(null);
        setNote({ ok: true, msg: t("linkedMsg") });
      } else {
        setNote({ ok: false, msg: t("errStart") });
      }
    } catch (e) {
      // Wait only as long as the server says; no hint → no local lock.
      const sec = isRateLimited(e) ? retryAfterSec(e, 0) : 0;
      if (sec > 0) setWaitUntil(Date.now() + sec * 1000);
      if (req === reqRef.current) setNote({ ok: false, msg: startError(e) });
    } finally {
      setBusy(false);
    }
  }

  // Opening or copying the link starts the /auth/me polling below.
  function markOpened() {
    if (link && !link.opened) setActive({ ...link, opened: true });
  }

  async function copy() {
    if (!link) return;
    markOpened();
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the read-only field stays selectable */
    }
  }

  function cancel() {
    reqRef.current++;
    setActive(null);
    setNote(null);
  }

  // While a (non-relink) link is shown, poll /auth/me until the webhook has
  // stored telegram_chat_id: every 5s while visible once the link was opened or
  // copied, and on every return to the tab (which also marks it opened, however
  // it was opened). Regular polling ends at expiry with one last check, so a
  // link used in its final seconds is detected before "expired" shows.
  // Stops on linked, cancel, unmount, 401, or when /auth/me has no telegram field.
  const watchUrl = link && !link.relink && !linked && canPoll ? link.url : "";
  const watchExp = link && watchUrl ? link.expiresMs : 0;
  useEffect(() => {
    if (!watchUrl) return;
    let alive = true;
    let inFlight = false; // focus + visibilitychange fire together on return
    let again = false; // the expiry check came while another check was in flight
    const check = (force = false) => {
      if (inFlight) {
        if (force) again = true;
        return;
      }
      if (!force && document.visibilityState !== "visible") return;
      inFlight = true;
      apiMe()
        .then((u) => {
          if (!alive) return;
          if (u.telegramLinked === undefined) {
            setCanPoll(false);
          } else if (u.telegramLinked) {
            update({ telegramLinked: true });
            storeLink(null);
            setStored(null);
            setNote({ ok: true, msg: t("linkedMsg") });
          }
        })
        .catch((e) => {
          if (alive && e instanceof ApiError && e.status === 401) setCanPoll(false);
        })
        .finally(() => {
          inFlight = false;
          if (!alive) return;
          if (again) {
            again = false;
            check(true);
          } else if (Date.now() >= watchExp) {
            setFinalFor(watchUrl);
          }
        });
    };
    const iv = setInterval(() => {
      if (Date.now() >= watchExp) clearInterval(iv);
      else if (openedRef.current) check();
    }, POLL_MS);
    const last = setTimeout(() => {
      if (openedRef.current) check(true);
    }, Math.max(0, watchExp - Date.now()));
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      // A link that expired unopened stays expired: no Open/Copy again. The
      // check still runs in case it was used on another device.
      setStored((p) => {
        if (!p || p.opened || p.url !== watchUrl || Date.now() >= p.expiresMs) return p;
        const n = { ...p, opened: true };
        storeLink(n);
        return n;
      });
      check();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      alive = false;
      clearInterval(iv);
      clearTimeout(last);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [watchUrl, watchExp, update, t]);

  // An opened link says "expired" only once the last /auth/me check is back.
  const showExpired = !!link && expired && (!link.opened || !canPoll || finalFor === link.url);
  const shownNote = note ?? (mine && finished && !mine.relink ? { ok: true, msg: t("linkedMsg") } : null);
  const busyOrWaiting = busy || waitLeft > 0;

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconSend /></span>{t("title")}</b>
        {linked ? <span className="tfa__on"><IconCheck />{t("linkedBadge")}</span> : null}
      </div>
      <p className="advmuted" style={{ marginBottom: 12 }}>{t("desc")}</p>

      {link ? (
        <div className="cform" style={{ maxWidth: "none" }}>
          {showExpired ? (
            <Notice ok={false} msg={t("expired")} />
          ) : (
            <>
              <p className="advmuted">{t("hint")}</p>
              <div className="tglink__acts">
                <a
                  className="btn btn--pri btn--sm"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={markOpened}
                  onAuxClick={markOpened}
                  onContextMenu={markOpened}
                >
                  <IconSend />
                  {t("open")}
                  <IconExternal />
                </a>
              </div>
              <div>
                <label htmlFor="tglink-url">{t("linkLabel")}</label>
                <div className="tglink__row">
                  <input id="tglink-url" value={link.url} readOnly onFocus={(e) => e.currentTarget.select()} onCopy={markOpened} />
                  <button className="btn btn--line btn--sm" type="button" onClick={copy}>
                    {copied ? <IconCheck /> : null}
                    {copied ? t("copied") : t("copy")}
                  </button>
                </div>
              </div>
              <p className="advmuted">{t("otherDevice")}</p>
              <p className="advmuted">
                {t("timeLeft")} <b className="tglink__timer">{fmtClock(left)}</b>
              </p>
              {link.relink ? <p className="advmuted">{t("relinkHint")}</p> : null}
              {link.opened && !link.relink && canPoll ? <p className="advmuted">{t("waiting")}</p> : null}
            </>
          )}
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <div className="tglink__acts">
            {showExpired ? (
              <button className="btn btn--pri btn--sm" type="button" onClick={generate} disabled={busyOrWaiting}>
                <IconRefresh />
                {busy ? t("generating") : t("regenerate")}
              </button>
            ) : null}
            <button className="btn btn--line btn--sm" type="button" onClick={cancel}>
              {link.relink ? t("done") : t("cancel")}
            </button>
          </div>
        </div>
      ) : linked ? (
        <>
          <div className="idv__ok">
            <span className="idv__oki"><IconSend /></span>
            <div>
              <b>{t("linked")}</b>
              <span>{t("linkedText")}</span>
            </div>
          </div>
          {shownNote ? <div style={{ marginTop: 12 }}><Notice ok={shownNote.ok} msg={shownNote.msg} /></div> : null}
          <button className="btn btn--line btn--sm" type="button" style={{ marginTop: 12 }} onClick={generate} disabled={busyOrWaiting}>
            {busy ? t("generating") : t("relink")}
          </button>
        </>
      ) : (
        <>
          {note ? <div style={{ marginBottom: 12 }}><Notice ok={note.ok} msg={note.msg} /></div> : null}
          <button className="btn btn--pri btn--sm" type="button" onClick={generate} disabled={busyOrWaiting || !session}>
            <IconSend />
            {busy ? t("generating") : t("connect")}
          </button>
        </>
      )}
    </div>
  );
}
