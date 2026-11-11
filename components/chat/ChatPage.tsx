"use client";

import "./lexai.css";
import "./aiPage1920.css";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUpRight, BookOpenCheck, Check, Clock3, Copy, Lock, MessageSquare, MessageSquarePlus, PanelLeft, RefreshCw, Search, SearchX, ShieldCheck, Sparkles, X } from "lucide-react";
import { getClientId } from "@/lib/client";
import { ApiError, aiQuotaOf, guestLimitOf } from "@/lib/http";
import { takeAsk } from "@/lib/askHandoff";
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
import { useAiReveal } from "@/lib/guide/targets";
import { Link } from "@/i18n/navigation";
import { localDay } from "@/lib/date";
import ContractCard from "../ContractCard";
import AgentAnswer from "./AgentAnswer";
import AgentThinking from "./AgentThinking";
import { mdPlain } from "@/lib/agentAnswer";

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

type Load = "loading" | "ready" | "error";
// Each starter question carries the dashboard's picture of its area (the
// "Huquqiy yo'nalishlar" cards, public/img/category): questioning, a lease,
// unpaid wages, a company.
const SUGGESTION_ART = ["Jinoyat_ishlari", "Kochmas_mulk", "Mehnat_huquqi", "Biznes_va_soliq"];
const plateStyle = (name: string) => ({ "--img": `url(/img/category/${name}.webp)` }) as CSSProperties;
// A black line drawing (public/img/xizmatlar), shown in a white circle.
const artStyle = (name: string) => ({ "--art": `url(/img/xizmatlar/${name}.webp)` }) as CSSProperties;
// A history row shows the first words of the last message, cut at a word —
// the row wraps rather than hiding the rest behind an ellipsis.
function excerpt(s: string, max = 72): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}
// What the assistant does, as three short promises under the greeting.
const CAPABILITIES = [
  ["cites", BookOpenCheck],
  ["private", Lock],
  ["always", Clock3],
] as const;
const DAY = 86_400_000;

// History grouped the way every assistant does it: today, yesterday, this
// week, earlier. A chat the backend sent without a date goes to "earlier".
function groupOf(iso: string | undefined): "today" | "yesterday" | "week" | "older" {
  if (!iso) return "older";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "older";
  const now = new Date();
  if (localDay(d) === localDay(now)) return "today";
  if (localDay(d) === localDay(new Date(now.getTime() - DAY))) return "yesterday";
  return now.getTime() - d.getTime() < 7 * DAY ? "week" : "older";
}

// The way on when the free questions or the plan's limit run out: the
// dashboard's navy banner, with the "needs a plan" drawing in a white circle.
// The class it always had (aichat__lastfree) stays on it.
function Offer({ title, text, href, cta }: { title: string; text: string; href: string; cta: string }) {
  return (
    <div className="aichat__lastfree lxai__offer">
      <span className="lxai__offer-art" style={artStyle("Oldindan_xarid")} aria-hidden />
      <div className="lxai__offer-t">
        <b>{title}</b>
        <span>{text}</span>
      </div>
      <Link href={href} className="btn btn--sm lxai__offer-cta">
        {cta}
        <ArrowRight aria-hidden />
      </Link>
    </div>
  );
}

export default function ChatPage({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations("chatPage");
  const tx = useTranslations("lxAi");
  const { reply } = useLexAi();
  const { session } = useAuth();
  // Logged-in users get their own backend namespace; guests an id by IP.
  const cid = session?.id || getClientId();

  const [chats, setChats] = useState<ApiChat[]>([]);
  const [chatsLoad, setChatsLoad] = useState<Load>("loading");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [msgsLoad, setMsgsLoad] = useState<Load>("ready");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  // The history drawer (a phone, or a laptop window beside the portal's
  // sidebar): Escape closes it, focus moves to its X when opened from the
  // burger and back to the burger when it closes.
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeSide = () => {
    setSideOpen(false);
    burgerRef.current?.focus();
  };
  useEffect(() => {
    if (!sideOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setSideOpen(false);
      burgerRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sideOpen]);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(-1);
  const [away, setAway] = useState(false);
  useAiReveal("ai-chat:history", () => setSideOpen(true));

  const scrollRef = useRef<HTMLDivElement>(null);
  const FREE_LIMIT = 5; // S-6: registered users get 5 free questions a month
  const usageKey = () => { const d = new Date(); return `lexgo_ai_used_${session?.id || "anon"}_${d.getFullYear()}-${d.getMonth() + 1}`; };
  const readUsed = () => { try { return Number(localStorage.getItem(usageKey()) || 0) || 0; } catch { return 0; } };
  const writeUsed = (n: number) => { try { localStorage.setItem(usageKey(), String(n)); } catch { /* ignore */ } };
  const taRef = useRef<HTMLTextAreaElement>(null);
  const seeded = useRef(false);
  const opening = useRef("");
  const suggestions = t.raw("suggestions") as string[];

  function fetchChats() {
    if (!cid) return;
    listChats(cid)
      .then((cs) => {
        setChats(cs);
        setChatsLoad("ready");
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) {
          setChats([]);
          setChatsLoad("ready");
        } else setChatsLoad("error");
      });
  }
  function loadChats() {
    setChatsLoad("loading");
    fetchChats();
  }

  useEffect(() => {
    fetchChats();
    // Auto-send a message handed off from the finder via /chat?q=...
    if (!seeded.current) {
      const q0 = new URLSearchParams(window.location.search).get("q") || takeAsk();
      if (q0 && q0.trim()) {
        seeded.current = true;
        window.history.replaceState(null, "", window.location.pathname);
        send(q0.trim());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the conversation down while the reader is at the bottom; someone
  // reading an earlier answer is left where they are, with a way back.
  const atBottom = useRef(true);
  // Jumps, not smooth scrolls: a smooth scroll fires scroll events on its way
  // down, which read as the reader leaving the bottom. The answer also keeps
  // growing after it lands (sources open, cards load), so the bottom is held
  // while the content resizes.
  useEffect(() => {
    const el = scrollRef.current;
    // The welcome screen reads from the top; only a conversation is pinned.
    if (el && atBottom.current && (messages.length || sending)) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);
  const hasMsgs = messages.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    const inner = el?.firstElementChild;
    if (!hasMsgs || !el || !inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(inner);
    ro.observe(el);
    return () => ro.disconnect();
  }, [msgsLoad, hasMsgs]);
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottom.current = bottom;
    if (bottom === away) setAway(!bottom);
  }
  function toBottom() {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = true;
    setAway(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  async function selectChat(id: string) {
    if (sending) return;
    setActiveId(id);
    setSideOpen(false);
    setMessages([]);
    setMsgsLoad("loading");
    opening.current = id;
    atBottom.current = true;
    try {
      const msgs = await getChatMessages(cid, id);
      if (opening.current !== id) return;
      setMessages(
        msgs.map((m) => ({
          role: m.role,
          content: m.content,
          sources: m.sources,
          contracts: m.contracts,
        })),
      );
      setMsgsLoad("ready");
    } catch {
      if (opening.current === id) setMsgsLoad("error");
    }
  }

  function newChat() {
    opening.current = "";
    setActiveId(null);
    setMessages([]);
    setMsgsLoad("ready");
    setSideOpen(false);
    requestAnimationFrame(() => taRef.current?.focus());
  }

  async function send(raw: string) {
    const content = raw.trim();
    if (!content || sending) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    atBottom.current = true;
    setMessages((m) => [...m, { role: "user", content }]);
    setSending(true);
    try {
      let id = activeId;
      if (!id) {
        const chat = await createChat(cid, content.slice(0, 48));
        id = chat.id;
        opening.current = id;
        setActiveId(id);
        setChats((cs) => [
          { ...chat, title: chat.title || content.slice(0, 48), lastMessage: content, updatedAt: chat.updatedAt || new Date().toISOString() },
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
      // The conversation just answered moves to the top of the history.
      setChats((cs) => {
        const cur = cs.find((c) => c.id === id);
        if (!cur) return cs;
        return [{ ...cur, lastMessage: assistant.content, updatedAt: new Date().toISOString() }, ...cs.filter((c) => c.id !== id)];
      });
    } catch (e) {
      const quota = session ? aiQuotaOf(e) : null;
      const guestLimit = !session ? guestLimitOf(e) : null;
      if (quota) {
        if (quota.monthlyLimit) writeUsed(Math.max(readUsed(), quota.used));
        const text = quota.monthlyLimit
          ? t("aiQuotaReached", { used: quota.used, limit: quota.monthlyLimit })
          : t("aiQuotaReachedShort");
        setMessages((m) => [...m, { role: "assistant", content: text, upgrade: true }]);
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

  async function copyAnswer(i: number) {
    try {
      await navigator.clipboard.writeText(mdPlain(messages[i].content));
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? -1 : c)), 1600);
    } catch {
      /* clipboard refused */
    }
  }

  const empty = messages.length === 0 && msgsLoad === "ready";
  const lastQuestionBefore = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (messages[j].role === "user") return messages[j].content;
    return "";
  };
  const active = chats.find((c) => c.id === activeId);
  const needle = q.trim().toLowerCase();
  const shown = needle ? chats.filter((c) => [c.title, c.lastMessage].some((v) => (v || "").toLowerCase().includes(needle))) : chats;
  const groups = useMemo(() => {
    const order = ["today", "yesterday", "week", "older"] as const;
    const by = new Map<string, ApiChat[]>();
    for (const c of shown) {
      const g = groupOf(c.updatedAt);
      by.set(g, [...(by.get(g) ?? []), c]);
    }
    // Without any dates there is nothing to group by: one plain list.
    if (!shown.some((c) => c.updatedAt)) return [{ key: "", items: shown }];
    return order.filter((k) => by.has(k)).map((k) => ({ key: k, items: by.get(k)! }));
  }, [shown]);

  return (
    <div className={`lxai ${embedded ? "lxai--embed" : "lxai--full"}`}>
      <div className={`lxai__scrim${sideOpen ? " on" : ""}`} onClick={() => setSideOpen(false)} aria-hidden />

      <aside className={`lxai__side${sideOpen ? " on" : ""}`} data-ai-target={sideOpen ? "ai-chat:history" : undefined} data-ai-label={t("historyTitle")}>
        <div className="lxai__brand">
          <span className="lxai__mark" aria-hidden>
            <Sparkles />
          </span>
          <b>{t("title")}</b>
          <button ref={closeRef} type="button" className="lxai__ib lxai__close" onClick={closeSide} aria-label={t("menu")}>
            <X aria-hidden />
          </button>
        </div>
        <button className="lxai__new" type="button" onClick={newChat}>
          <MessageSquarePlus aria-hidden />
          {t("newChat")}
        </button>
        {chats.length > 3 ? (
          <label className="lxai__search">
            <Search aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
            {q ? (
              <button type="button" onClick={() => setQ("")} aria-label={t("clear")}>
                <X aria-hidden />
              </button>
            ) : null}
          </label>
        ) : null}
        <nav className="lxai__list" aria-label={t("historyTitle")}>
          {chatsLoad === "loading" && !chats.length ? (
            <div className="lxai__sk" aria-busy="true" aria-label={t("loadingChats")}>
              {[70, 52, 84, 46, 64].map((w, i) => (
                <span key={i} style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : chatsLoad === "error" && !chats.length ? (
            <div className="lxai__side-state cx-empty" role="alert">
              <span className="cx-empty__ic lxai__state-ic--err" aria-hidden>
                <AlertTriangle />
              </span>
              <p>{t("chatsError")}</p>
              <button type="button" className="lxai__ghost btn btn--line btn--sm" onClick={loadChats}>
                <RefreshCw aria-hidden />
                {t("retry")}
              </button>
            </div>
          ) : !chats.length ? (
            <div className="lxai__side-state cx-empty">
              <span className="cx-empty__ic" aria-hidden>
                <MessageSquare />
              </span>
              <p>{t("noChats")}</p>
            </div>
          ) : !shown.length ? (
            <div className="lxai__side-state cx-empty">
              <span className="cx-empty__ic" aria-hidden>
                <SearchX />
              </span>
              <p>{t("noMatch")}</p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key || "all"} className="lxai__group">
                {g.key ? <p className="lxai__lbl">{t(`groups.${g.key}`)}</p> : <p className="lxai__lbl">{t("historyTitle")}</p>}
                {g.items.map((c) => (
                  <button key={c.id} type="button" className={`lxai__item${c.id === activeId ? " on" : ""}`} onClick={() => selectChat(c.id)} aria-current={c.id === activeId ? "true" : undefined}>
                    <span className="lxai__item-ic" aria-hidden>
                      <MessageSquare />
                    </span>
                    <span className="lxai__item-t">
                      <b>{c.title || t("untitled")}</b>
                      {c.lastMessage ? <span>{excerpt(mdPlain(c.lastMessage))}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </nav>
        <p className="lxai__privacy">
          <ShieldCheck aria-hidden />
          {t("piiShort")}
        </p>
      </aside>

      <section className="lxai__main">
        <header className="lxai__head">
          <button
            ref={burgerRef}
            className="lxai__ib lxai__burger"
            type="button"
            aria-label={t("menu")}
            aria-expanded={sideOpen}
            onClick={() => {
              setSideOpen(true);
              requestAnimationFrame(() => closeRef.current?.focus());
            }}
          >
            <PanelLeft aria-hidden />
          </button>
          <div className="lxai__htitle">
            <b>{active?.title || (activeId ? t("untitled") : t("newChat"))}</b>
            <span>
              <i aria-hidden />
              {t("subtitle")}
            </span>
          </div>
          <span className="lxai__badge" aria-hidden>
            <Sparkles />
            {t("badge")}
          </span>
          {activeId ? (
            <button className="lxai__ib" type="button" onClick={newChat} aria-label={t("newChat")} title={t("newChat")}>
              <MessageSquarePlus aria-hidden />
            </button>
          ) : null}
        </header>

        <div className="lxai__scroll" ref={scrollRef} onScroll={onScroll}>
          {msgsLoad === "loading" ? (
            <div className="lxai__msgs" aria-busy="true">
              <span className="lxai__skq" />
              <div className="lxai__ska">
                <span style={{ width: "92%" }} />
                <span style={{ width: "86%" }} />
                <span style={{ width: "64%" }} />
              </div>
            </div>
          ) : msgsLoad === "error" ? (
            <div className="lxai__fail cx-empty" role="alert">
              <span className="cx-empty__ic lxai__state-ic--err" aria-hidden>
                <AlertTriangle />
              </span>
              <b>{t("loadError")}</b>
              <button type="button" className="lxai__ghost btn btn--line btn--sm" onClick={() => activeId && selectChat(activeId)}>
                <RefreshCw aria-hidden />
                {t("retry")}
              </button>
            </div>
          ) : empty ? (
            <div className="lxai__empty">
              {/* The dashboard's own Tezkor Himoya AI drawing, in a white circle. */}
              <span className="lxai__art" style={artStyle("suniy-intelekt")} aria-hidden />
              {session ? <p className="lxai__hi">{t("hi", { name: session.name })}</p> : null}
              <h2>{t("emptyTitle")}</h2>
              <p>{t("emptyText")}</p>
              <ul className="lxai__caps">
                {CAPABILITIES.map(([k, I]) => (
                  <li key={k}>
                    <I aria-hidden />
                    {t(`caps.${k}`)}
                  </li>
                ))}
              </ul>
              <div className="lxai__sugg" data-ai-target="ai-chat:suggestions">
                {suggestions.map((s, i) => (
                  <button key={i} type="button" onClick={() => send(s)} style={{ animationDelay: `${120 + i * 70}ms` }}>
                    <span className="lxai__sugg-art" style={plateStyle(SUGGESTION_ART[i % SUGGESTION_ART.length])} aria-hidden />
                    <span className="lxai__sugg-t">{s}</span>
                    <span className="lxai__sugg-arr" aria-hidden>
                      <ArrowUpRight />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="lxai__msgs">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="lxai__q">
                    <div>{m.content}</div>
                  </div>
                ) : (m.upgrade && session) || m.limit ? (
                  // Not an answer but the limit notice: the banner alone, with
                  // no "AI-generated" mark and no copy button.
                  <article key={i} className="lxai__a">
                    <span className="lxai__mark lxai__mark--sm" aria-hidden>
                      <Sparkles />
                    </span>
                    <div className="lxai__ac lxai__ac--sys">
                      {m.limit ? (
                        // A first-time guest has no account yet — /login sent them
                        // somewhere they can't use; register is the actual next step
                        // (T1-01 §3: this is meant to feel like "verify your phone
                        // to continue", which registration's OTP step already is).
                        <Offer title={t("guestLastTitle")} text={m.content} href="/register" cta={t("limitLogin")} />
                      ) : (
                        <Offer title={tx("quotaTitle")} text={m.content} href={`/portal/${session?.role}/subscription`} cta={t("upgradePlan")} />
                      )}
                    </div>
                  </article>
                ) : (
                  <article key={i} className="lxai__a">
                    <span className="lxai__mark lxai__mark--sm" aria-hidden>
                      <Sparkles />
                    </span>
                    <div className="lxai__ac">
                      <AgentAnswer
                        content={m.content}
                        sources={m.sources}
                        interactive={i === messages.length - 1 && !sending}
                        onAsk={send}
                        onRetry={() => {
                          const qq = lastQuestionBefore(i);
                          if (qq) send(qq);
                        }}
                        documentHref={session?.role === "client" ? "/portal/client/services" : "/services"}
                      />
                      {m.contracts && m.contracts.length ? (
                        <div className="amsg__files">
                          {m.contracts.map((c, k) => (
                            <ContractCard key={k} c={c} />
                          ))}
                        </div>
                      ) : null}
                      {m.offline ? <div className="lxai__offline">{t("offline")}</div> : null}
                      {m.lastFree && session ? (
                        <Offer
                          title={t("lastFreeTitle")}
                          text={t("lastFreeText", { limit: FREE_LIMIT })}
                          href={`/portal/${session.role}/subscription`}
                          cta={t("upgradePlan")}
                        />
                      ) : null}
                      {m.guestLast ? <Offer title={t("guestLastTitle")} text={t("guestLastText")} href="/register" cta={t("limitLogin")} /> : null}
                      {!m.limit && !m.upgrade ? (
                        <div className="lxai__tools">
                          <button type="button" onClick={() => void copyAnswer(i)} aria-label={t("copy")} title={t("copy")}>
                            {copied === i ? <Check aria-hidden /> : <Copy aria-hidden />}
                            <span>{copied === i ? t("copied") : t("copy")}</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ),
              )}
              {sending ? (
                <article className="lxai__a" aria-live="polite">
                  <span className="lxai__mark lxai__mark--sm lxai__mark--busy" aria-hidden>
                    <Sparkles />
                  </span>
                  <div className="lxai__ac">
                    <AgentThinking />
                  </div>
                </article>
              ) : null}
            </div>
          )}
        </div>
        {away ? (
          <button type="button" className="lxai__down" onClick={toBottom} aria-label={t("toBottom")} title={t("toBottom")}>
            <ArrowDown aria-hidden />
          </button>
        ) : null}

        <div className="lxai__composer">
          <div className="lxai__box" data-ai-target="ai-chat:input" data-ai-label={t("inputPlaceholder")}>
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autosize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={t("inputPlaceholder")}
              aria-label={t("inputPlaceholder")}
            />
            {/* The dashboard's dark "Javob olish" button; on a narrow screen
                only its arrow. */}
            <button className="lxai__send" type="button" onClick={() => send(input)} disabled={sending || !input.trim()} aria-label={t("send")} title={t("send")}>
              <span className="lxai__send-t">{t("send")}</span>
              <ArrowRight aria-hidden />
            </button>
          </div>
          {/* One line under the box: the caveat, then the keys. */}
          <p className="lxai__disc">
            <span>{t("disclaimer")}</span>
            <span className="lxai__keys" aria-hidden>
              <kbd>Enter</kbd> {t("keys.send")} · <kbd>Shift</kbd>+<kbd>Enter</kbd> {t("keys.newline")}
            </span>
          </p>
          {/* The backend masks these before any external AI call (T0-17). */}
          <p className="lxai__disc lxai__pii">{t("piiNote")}</p>
        </div>
      </section>
    </div>
  );
}
