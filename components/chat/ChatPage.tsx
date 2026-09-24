"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getClientId } from "@/lib/client";
import { aiQuotaOf, guestLimitOf } from "@/lib/http";
import {
  listChats,
  createChat,
  getChatMessages,
  postMessage,
  isLimitError,
  type ApiChat,
  type Source,
  type Contract,
} from "@/lib/api";
import { useLexAi } from "./useLexAi";
import { useAuth } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import ContractCard from "../ContractCard";
import {
  IconStar,
  IconSend,
  IconPlus,
  IconMenu,
  IconClose,
  IconUser,
} from "../icons";

type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  contracts?: Contract[];
  offline?: boolean;
  limit?: boolean;
  upgrade?: boolean; // signed-in user's AI quota is spent → subscription CTA
  lastFree?: boolean; // this answer used the last free question of the month (T1-02)
  guestLast?: boolean; // this answer used a guest's last free question
};

export default function ChatPage({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations("chatPage");
  const { reply } = useLexAi();
  const { session } = useAuth();
  // Logged-in users get their own backend namespace; guests an id by IP.
  const cid = session?.id || getClientId();

  const [chats, setChats] = useState<ApiChat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const FREE_LIMIT = 5; // S-6: registered users get 5 free questions a month
  const usageKey = () => { const d = new Date(); return `lexgo_ai_used_${session?.id || "anon"}_${d.getFullYear()}-${d.getMonth() + 1}`; };
  const readUsed = () => { try { return Number(localStorage.getItem(usageKey()) || 0) || 0; } catch { return 0; } };
  const writeUsed = (n: number) => { try { localStorage.setItem(usageKey(), String(n)); } catch { /* ignore */ } };
  const taRef = useRef<HTMLTextAreaElement>(null);
  const seeded = useRef(false);
  const suggestions = t.raw("suggestions") as string[];

  useEffect(() => {
    if (cid) listChats(cid).then(setChats).catch(() => setChats([]));
    // Auto-send a message handed off from the finder via /chat?q=...
    if (!seeded.current) {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q && q.trim()) {
        seeded.current = true;
        window.history.replaceState(null, "", window.location.pathname);
        send(q.trim());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 184) + "px";
  }

  async function selectChat(id: string) {
    setActiveId(id);
    setSideOpen(false);
    setMessages([]);
    try {
      const msgs = await getChatMessages(cid, id);
      setMessages(
        msgs.map((m) => ({
          role: m.role,
          content: m.content,
          sources: m.sources,
          contracts: m.contracts,
        })),
      );
    } catch {
      /* offline / empty */
    }
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setSideOpen(false);
    requestAnimationFrame(() => taRef.current?.focus());
  }

  async function send(raw: string) {
    const content = raw.trim();
    if (!content || sending) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setMessages((m) => [...m, { role: "user", content }]);
    setSending(true);
    try {
      let id = activeId;
      if (!id) {
        const chat = await createChat(cid, content.slice(0, 48));
        id = chat.id;
        setActiveId(id);
        setChats((cs) => [
          { ...chat, title: chat.title || content.slice(0, 48), lastMessage: content },
          ...cs,
        ]);
      }
      const { assistant, contracts, limitStatus } = await postMessage(cid, id, content);
      // Free-plan users: mark the 5th answer of the month as the last free one
      // (the offer comes after the answer, never instead of it — S-6).
      let lastFree = false;
      if (session && !session.permissions?.length) {
        const used = readUsed() + 1;
        writeUsed(used);
        lastFree = used === FREE_LIMIT;
      }
      // A guest's answer arrives first, in full, exactly like anyone else's —
      // the registration card only ever appears under a real answer, never
      // instead of one. registerOffer is the backend's own call, not a local
      // guess: it already knows the guest's real daily/total counters.
      const guestLast = !session && !!limitStatus?.registerOffer;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: assistant.content,
          sources: assistant.sources,
          contracts,
          lastFree,
          guestLast,
        },
      ]);
      setChats((cs) =>
        cs.map((c) => (c.id === id ? { ...c, lastMessage: assistant.content } : c)),
      );
    } catch (e) {
      const quota = session ? aiQuotaOf(e) : null;
      const guestLimit = !session ? guestLimitOf(e) : null;
      if (quota) {
        if (quota.monthlyLimit) writeUsed(Math.max(readUsed(), quota.used));
        const content = quota.monthlyLimit
          ? t("aiQuotaReached", { used: quota.used, limit: quota.monthlyLimit })
          : t("aiQuotaReachedShort");
        setMessages((m) => [...m, { role: "assistant", content, upgrade: true }]);
      } else if (guestLimit) {
        // guest_daily_limit_exceeded (usable again in 24h) and
        // guest_total_limit_exceeded (spent until registering) are a closed
        // set, so the copy is chosen here: the backend's own message is
        // Uzbek-only and would reach ru/en guests untranslated.
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: t(guestLimit.code === "guest_daily_limit_exceeded" ? "guestDailyLimit" : "guestTotalLimit"),
            limit: true,
          },
        ]);
      } else if (isLimitError(e) && !session) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: t("limitReached"), limit: true },
        ]);
      } else {
        const r = reply(content);
        setMessages((m) => [
          ...m,
          { role: "assistant", content: r.text, offline: true },
        ]);
      }
    } finally {
      setSending(false);
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }

  const empty = messages.length === 0;

  return (
    <div className={`aichat ${embedded ? "aichat--embed" : "aichat--full"}`}>
      <div
        className={`aichat__scrim${sideOpen ? " on" : ""}`}
        onClick={() => setSideOpen(false)}
      />

      <aside className={`aichat__side${sideOpen ? " on" : ""}`}>
        <button className="aichat__new" type="button" onClick={newChat}>
          <IconPlus />
          {t("newChat")}
        </button>
        <div className="aichat__lbl">{t("historyTitle")}</div>
        <div className="aichat__list">
          {chats.length ? (
            chats.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`aichat__item${c.id === activeId ? " on" : ""}`}
                onClick={() => selectChat(c.id)}
              >
                <b>{c.title || t("untitled")}</b>
                {c.lastMessage ? <span>{c.lastMessage}</span> : null}
              </button>
            ))
          ) : (
            <div className="aichat__empty2">{t("noChats")}</div>
          )}
        </div>
      </aside>

      <div className="aichat__main">
        <div className="aichat__head">
          <button
            className="aichat__burger"
            type="button"
            aria-label={t("menu")}
            onClick={() => setSideOpen((v) => !v)}
          >
            {sideOpen ? <IconClose /> : <IconMenu />}
          </button>
          <span className="aibadge">
            <IconStar />
          </span>
          <div className="aichat__htitle">
            <b>{t("title")}</b>
            <span>
              <i />
              {t("subtitle")}
            </span>
          </div>
        </div>

        <div className="aichat__scroll" ref={scrollRef}>
          {empty ? (
            <div className="aichat__empty">
              <span className="aibadge">
                <IconStar />
              </span>
              {session ? (
                <p className="aichat__hi">{t("hi", { name: session.name })}</p>
              ) : null}
              <h2>{t("emptyTitle")}</h2>
              <p>{t("emptyText")}</p>
              <div className="sugg">
                {suggestions.map((s, i) => (
                  <button key={i} type="button" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="aichat__msgs">
              {messages.map((m, i) => (
                <div key={i} className={`amsg amsg--${m.role === "user" ? "u" : "a"}`}>
                  <div className="amsg__av">
                    {m.role === "user" ? (
                      <IconUser style={{ width: 17, height: 17 }} />
                    ) : (
                      <IconStar />
                    )}
                  </div>
                  <div className="amsg__c">
                    <div className="amsg__role">
                      {m.role === "user" ? t("you") : t("assistant")}
                    </div>
                    <div className="amsg__text">{m.content}</div>
                    {m.sources && m.sources.length ? (
                      <div className="amsg__sources">
                        {m.sources.map((s, j) =>
                          s.url ? (
                            <a
                              key={j}
                              className="asrc"
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {s.title || s.url}
                            </a>
                          ) : (
                            <span key={j} className="asrc">
                              {s.title || s.snippet}
                            </span>
                          ),
                        )}
                      </div>
                    ) : null}
                    {m.contracts && m.contracts.length ? (
                      <div className="amsg__files">
                        {m.contracts.map((c, k) => (
                          <ContractCard key={k} c={c} />
                        ))}
                      </div>
                    ) : null}
                    {m.offline ? (
                      <div className="aichat__offline">{t("offline")}</div>
                    ) : null}
                    {m.lastFree && session ? (
                      <div className="aichat__lastfree">
                        <b>{t("lastFreeTitle")}</b>
                        <span>{t("lastFreeText", { limit: FREE_LIMIT })}</span>
                        <Link href={`/portal/${session.role}/subscription`} className="btn btn--pri btn--sm">{t("upgradePlan")}</Link>
                      </div>
                    ) : null}
                    {m.guestLast ? (
                      <div className="aichat__lastfree">
                        <b>{t("guestLastTitle")}</b>
                        <span>{t("guestLastText")}</span>
                        <Link href="/register" className="btn btn--pri btn--sm">{t("limitLogin")}</Link>
                      </div>
                    ) : null}
                    {m.limit ? (
                      // A first-time guest has no account yet — /login sent them
                      // somewhere they can't use; register is the actual next step
                      // (T1-01 §3: this is meant to feel like "verify your phone
                      // to continue", which registration's OTP step already is).
                      <Link href="/register" className="btn btn--pri btn--sm" style={{ marginTop: 10 }}>
                        {t("limitLogin")}
                      </Link>
                    ) : null}
                    {m.upgrade && session ? (
                      <Link href={`/portal/${session.role}/subscription`} className="btn btn--pri btn--sm" style={{ marginTop: 10 }}>
                        {t("upgradePlan")}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
              {sending ? (
                <div className="amsg amsg--a">
                  <div className="amsg__av">
                    <IconStar />
                  </div>
                  <div className="amsg__c">
                    <div className="amsg__role">{t("assistant")}</div>
                    <div className="typing" style={{ marginTop: 4 }}>
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="aichat__composer">
          <div className="composer">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autosize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={t("inputPlaceholder")}
              aria-label={t("inputPlaceholder")}
            />
            <button
              className="composer__send"
              type="button"
              onClick={() => send(input)}
              disabled={sending || !input.trim()}
              aria-label={t("send")}
            >
              <IconSend />
            </button>
          </div>
          <p className="aichat__disc">{t("disclaimer")}</p>
          {/* The backend masks these before any external AI call (T0-17). */}
          <p className="aichat__disc aichat__pii">{t("piiNote")}</p>
        </div>
      </div>
    </div>
  );
}
