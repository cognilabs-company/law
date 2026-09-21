"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useLexAi } from "./useLexAi";
import { useAuth } from "@/lib/auth";
import { getClientId } from "@/lib/client";
import { aiQuotaOf } from "@/lib/http";
import { noteGuestQuestion } from "@/lib/guestQuota";
import {
  createChat,
  postMessage,
  isLimitError,
  type Source,
  type Contract,
} from "@/lib/api";
import ContractCard from "../ContractCard";
import { IconSend, IconStar, IconClose, IconArrowRight } from "../icons";

type Msg = {
  role: "a" | "u";
  content: string;
  meta?: string;
  area?: string | null;
  sources?: Source[];
  contracts?: Contract[];
  limit?: boolean;
  upgrade?: boolean; // signed-in user's AI quota is spent → subscription CTA
  guestLast?: boolean; // this answer used a guest's last free question
};

export default function ChatWidget({
  variant,
  onClose,
}: {
  variant: "phone" | "dock";
  onClose?: () => void;
}) {
  const t = useTranslations("chat");
  const { reply } = useLexAi();
  const { session } = useAuth();
  const router = useRouter();
  const cid = session?.id || getClientId();

  const quick = t.raw("quick") as string[];
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "a", content: t("greeting"), meta: t("greetingNote") },
  ]);
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  const chatId = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing]);

  function goLawyers(area: string) {
    onClose?.();
    router.push(`/lawyers?area=${encodeURIComponent(area)}`);
  }

  async function ask(raw: string) {
    const content = (raw || "").trim();
    if (typing || !content) return;
    setValue("");
    setMsgs((m) => [...m, { role: "u", content }]);
    setTyping(true);
    try {
      let id = chatId.current;
      if (!id) {
        const chat = await createChat(cid, content.slice(0, 48));
        id = chat.id;
        chatId.current = id;
      }
      const { assistant, contracts } = await postMessage(cid, id, content);
      setTyping(false);
      // A guest's answer arrives first, in full, exactly like anyone else's —
      // the registration card only ever appears under a real answer, never
      // instead of one.
      const guestLast = !session && noteGuestQuestion();
      setMsgs((m) => [
        ...m,
        {
          role: "a",
          content: assistant.content,
          sources: assistant.sources,
          contracts,
          guestLast,
        },
      ]);
    } catch (e) {
      setTyping(false);
      const quota = session ? aiQuotaOf(e) : null;
      if (quota) {
        const text = quota.monthlyLimit
          ? t("aiQuotaReached", { used: quota.used, limit: quota.monthlyLimit })
          : t("aiQuotaReachedShort");
        setMsgs((m) => [...m, { role: "a", content: text, upgrade: true }]);
      } else if (isLimitError(e) && !session) {
        setMsgs((m) => [...m, { role: "a", content: t("limitReached"), limit: true }]);
      } else {
        const r = reply(content);
        setMsgs((m) => [
          ...m,
          { role: "a", content: r.text, meta: r.meta, area: r.area },
        ]);
      }
    }
  }

  return (
    <>
      {variant === "phone" ? (
        <div className="phone__hd">
          <b>{t("title")}</b>
          <p>{t("online")}</p>
        </div>
      ) : (
        <div className="dock__h">
          <span className="dock__av">
            <IconStar />
          </span>
          <span className="dock__t">
            <b>{t("title")}</b>
            <span>
              <i />
              {t("online")}
            </span>
          </span>
          <Link
            href="/chat"
            className="dock__x"
            aria-label={t("openFull")}
            onClick={onClose}
            style={{ marginLeft: "auto" }}
          >
            <IconArrowRight style={{ width: 15, height: 15 }} />
          </Link>
          <button
            className="dock__x"
            type="button"
            aria-label={t("closeLabel")}
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
      )}

      <div className="chat" ref={bodyRef}>
        {msgs.map((m, i) => (
          <div key={i} className={`msg msg--${m.role}`}>
            {m.content}
            {m.meta ? <small>{m.meta}</small> : null}
            {m.sources && m.sources.length ? (
              <div className="amsg__sources">
                {m.sources.map((s, j) => (
                  <span key={j} className="asrc">
                    {s.title || s.snippet || s.url}
                  </span>
                ))}
              </div>
            ) : null}
            {m.contracts && m.contracts.length ? (
              <div className="amsg__files">
                {m.contracts.map((c, j) => (
                  <ContractCard key={j} c={c} />
                ))}
              </div>
            ) : null}
            {m.area ? (
              <button
                className="cact"
                type="button"
                onClick={() => goLawyers(m.area as string)}
              >
                {t("seeLawyer")}
              </button>
            ) : null}
            {m.limit ? (
              // A first-time guest has no account yet — /login sent them
              // somewhere they can't use; register is the actual next step.
              <Link href="/register" className="cact" onClick={onClose}>
                {t("limitLogin")}
              </Link>
            ) : null}
            {m.guestLast ? (
              <div className="aichat__lastfree">
                <b>{t("guestLastTitle")}</b>
                <span>{t("guestLastText")}</span>
                <Link href="/register" className="cact" onClick={onClose}>
                  {t("limitLogin")}
                </Link>
              </div>
            ) : null}
            {m.upgrade && session ? (
              <Link href={`/portal/${session.role}/subscription`} className="cact" onClick={onClose}>
                {t("upgradePlan")}
              </Link>
            ) : null}
          </div>
        ))}
        {typing ? (
          <div className="typing">
            <i />
            <i />
            <i />
          </div>
        ) : null}
      </div>

      <div className="qr">
        {quick.map((q, i) => (
          <button key={i} type="button" onClick={() => ask(q)}>
            {q}
          </button>
        ))}
      </div>

      <div className="cbar">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ask(value);
            }
          }}
          placeholder={t("inputPlaceholder")}
          aria-label={t("inputPlaceholder")}
        />
        <button
          type="button"
          onClick={() => ask(value)}
          disabled={typing}
          aria-label={t("title")}
        >
          <IconSend />
        </button>
      </div>
    </>
  );
}
