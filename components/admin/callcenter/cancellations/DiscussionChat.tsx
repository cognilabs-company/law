"use client";

import { useId, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import PersonName from "@/components/ui/PersonName";
import { SxButton, SxLinkButton } from "@/components/admin/studio/sx/Button";
import { Switch } from "@/components/admin/studio/sx/form/Switch";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { TextInput } from "@/components/admin/studio/sx/form/TextInput";
import { useAuth } from "@/lib/auth";
import { shortDateTime } from "@/lib/date";
import { errDetail, logApiError } from "@/lib/http";
import { closeCancellationChat, openCancellationChat, reviewOrderOf, type CancellationChat, type CancellationReview } from "@/lib/services/marketRuntime";
import { glyph, LockIcon, MessagesSquareIcon, PlusIcon, ShieldCheckIcon, UserCheckIcon, XIcon } from "./icons";
import { staffChatHref } from "./model";

// The optional cancellation discussion (contract 2026-10-26 §6). It is a
// separate room the operator opens only when talking is needed; the private
// client–seller service chat is never offered here (the backend answers 403
// to the call center for it). Creating it twice returns the same room;
// closing it keeps the history readable and stops every new message.

const NOTE_MAX = 500;
const TITLE_MAX = 120;

type Mode = "idle" | "form" | "closing";

export function DiscussionChat({ review, open, onChanged }: { review: CancellationReview; open: boolean; onChanged?: (chat: CancellationChat) => void }): ReactElement | null {
  const t = useTranslations("admin.callCenter.cancellations.chat");
  const locale = useLocale();
  const me = useAuth().session?.id ?? "";
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ctx = reviewOrderOf(review);
  // What this operator just did (opened or closed the room) until a fresher
  // read of the review says the same or more.
  const [mine, setChat] = useState<CancellationChat | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [withClient, setWithClient] = useState(true);
  const [withSeller, setWithSeller] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);

  // A fresher read of the review (realtime refetch) wins over our copy,
  // unless ours already says closed and the read is older.
  const incoming = review.discussion;
  const chat = !incoming ? mine : mine && mine.roomId === incoming.roomId && mine.readOnly && !incoming.readOnly ? mine : incoming;

  const clientId = review.parties.client?.id || ctx.clientUserId;
  const sellerId = review.parties.seller?.id || ctx.sellerUserId;
  const clientName = review.parties.client?.name || ctx.clientName;
  const sellerName = review.parties.seller?.name || ctx.sellerName;
  const none = !withClient && !withSeller;

  if (!chat && !open) return null;

  async function create() {
    if (busy || sending.current) return;
    if (none) {
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
      onChanged?.(c);
    } catch (e) {
      logApiError("cancellation chat open", e);
      setError(errDetail(e) || t("openError"));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function close() {
    if (!chat || busy || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const c = await closeCancellationChat(review.id, note, chat);
      setChat(c);
      setMode("idle");
      setNote("");
      onChanged?.(c);
    } catch (e) {
      logApiError("cancellation chat close", e);
      setError(errDetail(e) || t("closeError"));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const who = (id: string) => (id === me ? "me" : id === clientId ? "client" : id === sellerId ? "seller" : "other");
  const people = chat ? [...new Set([me, ...chat.participantIds].filter(Boolean))] : [];
  const nameOf = (id: string) => chat?.participants.find((p) => p.id === id)?.name || (id === clientId ? clientName : id === sellerId ? sellerName : "");
  const href = chat ? staffChatHref(chat.roomId, ctx.workId, ctx.serviceTitle) : "";

  return (
    <section className="ccx-disc" data-state={chat ? (chat.readOnly ? "closed" : "open") : "none"} aria-labelledby={`${uid}-t`}>
      <header className="ccx-disc__head">
        <span className="ccx-disc__ico" aria-hidden="true">
          {glyph(chat?.readOnly ? LockIcon : MessagesSquareIcon, { size: 18 })}
        </span>
        <div className="ccx-disc__titles">
          <h4 id={`${uid}-t`}>{chat?.title || t("title")}</h4>
          <p>{t("lead")}</p>
        </div>
        {chat ? (
          <span className="ccx-pill" data-tone={chat.readOnly ? "archived" : "approved"}>
            {chat.readOnly ? t("closed") : t("active")}
          </span>
        ) : null}
      </header>

      <p className="ccx-disc__privacy">
        {glyph(ShieldCheckIcon, { size: 14 })}
        <span>{t("privacy")}</span>
      </p>

      {chat ? (
        <>
          <div className="ccx-disc__people">
            <p className="ccx-label">{t("participants")}</p>
            <ul>
              {people.map((id) => (
                <li key={id} data-who={who(id)}>
                  {glyph(UserCheckIcon, { size: 14 })}
                  <span className="ccx-disc__name">{id === me ? t("you") : <PersonName id={id} name={nameOf(id)} />}</span>
                  <span className="ccx-chip">{t(`role.${who(id)}`)}</span>
                </li>
              ))}
            </ul>
          </div>
          {chat.readOnly ? (
            <p className="ccx-disc__closed">
              {chat.closedAt ? t("closedAt", { date: shortDateTime(chat.closedAt, locale) }) : t("closedText")}
              {chat.closeNote.trim() ? ` · ${chat.closeNote}` : ""}
            </p>
          ) : null}
          {mode === "closing" ? (
            <div className="ccx-disc__form">
              <label className="ccx-label" htmlFor={`${uid}-note`}>
                {t("closeNote")}
              </label>
              <TextArea id={`${uid}-note`} value={note} onChange={setNote} maxLength={NOTE_MAX} counter minRows={2} placeholder={t("closeNotePh")} aiId="call_center.cancellations.chat.close-note" aiLabel={t("closeNote")} />
              <p className="ccx-sub">{t("closeWarn")}</p>
              <div className="ccx-disc__acts">
                <SxButton variant="secondary" size="sm" onClick={() => setMode("idle")} disabled={busy}>
                  {t("back")}
                </SxButton>
                <SxButton variant="danger" size="sm" icon={LockIcon} busy={busy} onClick={() => void close()} aiId="call_center.cancellations.chat.close-confirm" aiLabel={t("closeConfirm")}>
                  {busy ? t("closing") : t("closeConfirm")}
                </SxButton>
              </div>
            </div>
          ) : (
            <div className="ccx-disc__acts">
              {href ? (
                <SxLinkButton variant={chat.readOnly ? "secondary" : "primary"} size="sm" icon={MessagesSquareIcon} href={href} target="_blank" aiId="call_center.cancellations.chat.open-room" aiLabel={chat.readOnly ? t("history") : t("openRoom")}>
                  {chat.readOnly ? t("history") : t("openRoom")}
                  <span className="sx-vh"> ({t("newTab")})</span>
                </SxLinkButton>
              ) : null}
              {!chat.readOnly ? (
                <SxButton variant="ghost" size="sm" icon={XIcon} onClick={() => setMode("closing")} aiId="call_center.cancellations.chat.close" aiLabel={t("close")}>
                  {t("close")}
                </SxButton>
              ) : null}
            </div>
          )}
        </>
      ) : mode === "form" ? (
        <div className="ccx-disc__form">
          <fieldset className="ccx-disc__who">
            <legend className="ccx-label">{t("whoLegend")}</legend>
            <Switch checked={withClient} onChange={setWithClient} label={clientName ? t("withClientNamed", { name: clientName }) : t("withClient")} aiId="call_center.cancellations.chat.include-client" />
            <Switch checked={withSeller} onChange={setWithSeller} label={sellerName ? t("withSellerNamed", { name: sellerName }) : t("withSeller")} disabled={!sellerId} aiId="call_center.cancellations.chat.include-seller" />
            <p className="ccx-sub">{t("operatorAlways")}</p>
          </fieldset>
          <label className="ccx-label" htmlFor={`${uid}-title`}>
            {t("titleLabel")}
          </label>
          <TextInput id={`${uid}-title`} value={title} onChange={setTitle} maxLength={TITLE_MAX} placeholder={t("defaultTitle")} aiId="call_center.cancellations.chat.title" aiLabel={t("titleLabel")} />
          <div className="ccx-disc__acts">
            <SxButton variant="secondary" size="sm" onClick={() => setMode("idle")} disabled={busy}>
              {t("back")}
            </SxButton>
            <SxButton variant="primary" size="sm" icon={PlusIcon} busy={busy} disabled={none} onClick={() => void create()} aiId="call_center.cancellations.chat.create" aiLabel={t("create")}>
              {busy ? t("creating") : t("create")}
            </SxButton>
          </div>
        </div>
      ) : (
        <div className="ccx-disc__acts">
          <SxButton variant="secondary" size="sm" icon={PlusIcon} onClick={() => setMode("form")} aiId="call_center.cancellations.chat.start" aiLabel={t("start")}>
            {t("start")}
          </SxButton>
        </div>
      )}
      {error ? (
        <p className="ccx-disc__err" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
