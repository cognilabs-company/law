"use client";

import { useEffect, useState } from "react";
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
type ActiveLink = { uid: string; url: string; expiresMs: number; opened?: boolean };
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
  const { session, update } = useAuth();
  const [stored, setStored] = useState<ActiveLink | null>(readStoredLink);
  // Session is null on the server and during hydration, so a restored link
  // never causes a mismatch; the uid check hides another user's link.
  const link = stored && session && stored.uid === session.id ? stored : null;
  const left = useDeadline(link?.expiresMs ?? 0);
  const expired = !!link && left === 0;
  const [waitUntil, setWaitUntil] = useState(0); // 429 cooldown, epoch ms
  const waitLeft = useDeadline(waitUntil);
  const [canPoll, setCanPoll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const linked = session?.telegramLinked === true;

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
    setBusy(true);
    setNote(null);
    setCanPoll(true);
    try {
      const r = await startTelegramLink();
      if (r.linked) {
        update({ telegramLinked: true });
        setActive(null);
        setNote({ ok: true, msg: t("linkedMsg") });
      } else if (!r.url) {
        setNote({ ok: false, msg: t("errStart") });
      } else {
        setActive({ uid: session.id, url: r.url, expiresMs: r.expiresAt });
      }
    } catch (e) {
      // Wait only as long as the server says; no hint → no local lock.
      const sec = isRateLimited(e) ? retryAfterSec(e, 0) : 0;
      if (sec > 0) setWaitUntil(Date.now() + sec * 1000);
      setNote({ ok: false, msg: startError(e) });
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
    setActive(null);
    setNote(null);
  }

  // After the link is opened/copied, poll /auth/me until the webhook has stored
  // telegram_chat_id: every 5s while visible, plus on focus/return to the tab.
  // Stops on linked, expiry, unmount, 401, or when /auth/me has no telegram field.
  // Depends on `expired` (not the ticking seconds) so the interval isn't reset.
  useEffect(() => {
    if (!link?.opened || linked || !canPoll || expired) return;
    let alive = true;
    let inFlight = false; // focus + visibilitychange fire together on return
    const check = () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      apiMe()
        .finally(() => {
          inFlight = false;
        })
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
        });
    };
    const iv = setInterval(check, POLL_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [link?.opened, linked, canPoll, expired, update, t]);

  const busyOrWaiting = busy || waitLeft > 0;

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        {linked ? <span className="tfa__on"><IconCheck />{t("linkedBadge")}</span> : null}
      </div>
      <p className="advmuted" style={{ marginBottom: 12 }}>{t("desc")}</p>

      {link ? (
        <div className="cform" style={{ maxWidth: "none" }}>
          {expired ? (
            <Notice ok={false} msg={t("expired")} />
          ) : (
            <>
              <p className="advmuted">{t("hint")}</p>
              <div className="tglink__acts">
                <a className="btn btn--pri btn--sm" href={link.url} target="_blank" rel="noopener noreferrer" onClick={markOpened}>
                  <IconSend />
                  {t("open")}
                  <IconExternal />
                </a>
              </div>
              <div>
                <label htmlFor="tglink-url">{t("linkLabel")}</label>
                <div className="tglink__row">
                  <input id="tglink-url" value={link.url} readOnly onFocus={(e) => e.currentTarget.select()} />
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
              {link.opened && !linked && canPoll ? <p className="advmuted">{t("waiting")}</p> : null}
            </>
          )}
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <div className="tglink__acts">
            {expired ? (
              <button className="btn btn--pri btn--sm" type="button" onClick={generate} disabled={busyOrWaiting}>
                <IconRefresh />
                {busy ? t("generating") : t("regenerate")}
              </button>
            ) : null}
            <button className="btn btn--line btn--sm" type="button" onClick={cancel}>
              {t("cancel")}
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
          {note ? <div style={{ marginTop: 12 }}><Notice ok={note.ok} msg={note.msg} /></div> : null}
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
