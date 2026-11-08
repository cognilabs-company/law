"use client";

import "./WcDecide.css";
import { useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import PersonName from "@/components/ui/PersonName";
import { useAuth } from "@/lib/auth";
import { shortDateTime } from "@/lib/date";
import { errDetail, isForbidden, logApiError } from "@/lib/http";
import { closeCancellationChat, openCancellationChat, reviewOrderOf, type CancellationChat, type CancellationReview } from "@/lib/services/marketRuntime";
import { staffChatHref } from "@/components/admin/callcenter/cancellations/model";
import { Field } from "../../panel/bits";
import { IcArrowRight, IcClose, IcFeedback, IcShield, IcUser } from "../../icons";
import WcSwitch from "./WcSwitch";

const NOTE_MAX = 500;
const TITLE_MAX = 120;

type Mode = "idle" | "form" | "closing";

export default function CancelChat({ review, open }: { review: CancellationReview; open: boolean }) {
  const t = useTranslations("admin.callCenter.cancellations.chat");
  const locale = useLocale();
  const me = useAuth().session?.id ?? "";
  const ctx = reviewOrderOf(review);
  const [mine, setChat] = useState<CancellationChat | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [withClient, setWithClient] = useState(true);
  const [withSeller, setWithSeller] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A 403 on open/close: this account may not run the chat — its buttons leave.
  const [denied, setDenied] = useState(false);
  const sending = useRef(false);

  const incoming = review.discussion;
  const chat = !incoming ? mine : mine && mine.roomId === incoming.roomId && mine.readOnly && !incoming.readOnly ? mine : incoming;
  const clientId = review.parties.client?.id || ctx.clientUserId;
  const sellerId = review.parties.seller?.id || ctx.sellerUserId;
  const clientName = review.parties.client?.name || ctx.clientName;
  const sellerName = review.parties.seller?.name || ctx.sellerName;
  const nobody = !withClient && !withSeller;

  if (!chat && !open) return null;

  const create = async () => {
    if (busy || sending.current) return;
    if (nobody) {
      setError(t("pickOne"));
      return;
    }
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const c = await openCancellationChat(review.id, { includeClient: withClient, includeSeller: withSeller, title: title.trim() || t("defaultTitle") });
      setChat(c);
      setMode("idle");
    } catch (e) {
      logApiError("cancellation chat open", e);
      if (isForbidden(e)) {
        setDenied(true);
        setMode("idle");
      }
      setError(errDetail(e) || t("openError"));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const close = async () => {
    if (!chat || busy || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const c = await closeCancellationChat(review.id, note, chat);
      setChat(c);
      setMode("idle");
      setNote("");
    } catch (e) {
      logApiError("cancellation chat close", e);
      if (isForbidden(e)) {
        setDenied(true);
        setMode("idle");
      }
      setError(errDetail(e) || t("closeError"));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || mode === "idle") return;
    e.preventDefault();
    e.stopPropagation();
    if (mode === "form") void create();
    else void close();
  };

  const who = (id: string) => (id === me ? "me" : id === clientId ? "client" : id === sellerId ? "seller" : "other");
  const people = chat ? [...new Set([me, ...chat.participantIds].filter(Boolean))] : [];
  const nameOf = (id: string) => chat?.participants.find((p) => p.id === id)?.name || (id === clientId ? clientName : id === sellerId ? sellerName : "");
  const href = chat ? staffChatHref(chat.roomId, ctx.workId, ctx.serviceTitle) : "";

  return (
    <section className="opx-psec opx-cx-chat" data-state={chat ? (chat.readOnly ? "closed" : "open") : "none"} onKeyDown={onKey}>
      <h3>
        <IcFeedback size={17} />
        <span>{chat?.title || t("title")}</span>
        {chat ? (
          <span className="opx-pill" data-tone={chat.readOnly ? "mute" : "ok"}>
            {chat.readOnly ? t("closed") : t("active")}
          </span>
        ) : null}
      </h3>
      <p className="opx-cx-sub">{t("lead")}</p>
      <p className="opx-cx-priv">
        <IcShield size={15} />
        <span>{t("privacy")}</span>
      </p>
      {chat ? (
        <>
          <div className="opx-cx-people">
            <small>{t("participants")}</small>
            <ul>
              {people.map((id) => (
                <li key={id} data-who={who(id)}>
                  <IcUser size={14} />
                  <span>{id === me ? t("you") : <PersonName id={id} name={nameOf(id)} />}</span>
                  <em>{t(`role.${who(id)}`)}</em>
                </li>
              ))}
            </ul>
          </div>
          {chat.readOnly ? (
            <p className="opx-cx-sub">
              {chat.closedAt ? t("closedAt", { date: shortDateTime(chat.closedAt, locale) }) : t("closedText")}
              {chat.closeNote.trim() ? ` · ${chat.closeNote}` : ""}
            </p>
          ) : null}
          {mode === "closing" ? (
            <div className="opx-cx-form">
              <Field label={t("closeNote")} value={note} onChange={setNote} max={NOTE_MAX} multiline rows={2} placeholder={t("closeNotePh")} hint={t("closeWarn")} />
              <div className="opx-cx-acts">
                <button type="button" className="opx-pbtn opx-cx-sm" onClick={() => setMode("idle")} disabled={busy}>
                  {t("back")}
                </button>
                <button type="button" className="opx-pbtn opx-pbtn--main is-danger opx-cx-sm" onClick={() => void close()} disabled={busy} aria-busy={busy}>
                  {busy ? t("closing") : t("closeConfirm")}
                </button>
              </div>
            </div>
          ) : href || (!chat.readOnly && !denied) ? (
            <div className="opx-cx-acts">
              {href ? (
                <Link className={`opx-pbtn opx-cx-sm${chat.readOnly ? "" : " opx-pbtn--blue"}`} href={href} target="_blank" rel="noopener">
                  {chat.readOnly ? t("history") : t("openRoom")}
                  <IcArrowRight size={15} />
                  <span className="sr-only"> ({t("newTab")})</span>
                </Link>
              ) : null}
              {!chat.readOnly && !denied ? (
                <button type="button" className="opx-pbtn opx-pbtn--rose opx-cx-sm" onClick={() => setMode("closing")}>
                  <IcClose size={15} />
                  {t("close")}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : mode === "form" ? (
        <div className="opx-cx-form">
          <fieldset className="opx-cx-who">
            <legend>{t("whoLegend")}</legend>
            <WcSwitch label={clientName ? t("withClientNamed", { name: clientName }) : t("withClient")} checked={withClient} onChange={setWithClient} />
            <WcSwitch label={sellerName ? t("withSellerNamed", { name: sellerName }) : t("withSeller")} checked={withSeller} onChange={setWithSeller} disabled={!sellerId} />
            <p className="opx-cx-sub">{t("operatorAlways")}</p>
          </fieldset>
          <Field label={t("titleLabel")} value={title} onChange={setTitle} max={TITLE_MAX} placeholder={t("defaultTitle")} />
          <div className="opx-cx-acts">
            <button type="button" className="opx-pbtn opx-cx-sm" onClick={() => setMode("idle")} disabled={busy}>
              {t("back")}
            </button>
            <button type="button" className="opx-pbtn opx-pbtn--blue opx-cx-sm" onClick={() => void create()} disabled={busy || nobody} aria-busy={busy}>
              {busy ? t("creating") : t("create")}
            </button>
          </div>
        </div>
      ) : denied ? null : (
        <div className="opx-cx-acts">
          <button type="button" className="opx-pbtn opx-cx-sm" onClick={() => setMode("form")}>
            <IcFeedback size={15} />
            {t("start")}
          </button>
        </div>
      )}
      {error ? (
        <p className="opx-ferr" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
