"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { aiQuotaOf } from "@/lib/http";
import { createChat, getChatMessages, listChats, postMessage, type ApiChat, type Contract, type Source } from "@/lib/api";
import { useLexAi } from "@/components/chat/useLexAi";
import AgentAnswer from "@/components/chat/AgentAnswer";
import { useContractFile } from "@/components/ContractCard";
import { IconDownload, IconExternal, IconFileText, IconPlus, IconSend, IconSparkle } from "@/components/icons";
import { App, Avatar, Btn, Sidebar, Spinner, Tool, Toolbar, useOs, type NavSection } from "../../kit/kit";
import type { NativeProps } from "../../native";
import "./client.css";

// The AI lawyer as a desktop program — the conversations in the sidebar
// (the Mac's source list, Windows' navigation pane) and the open one as a
// transcript: the client's questions in bubbles, the answers as written
// documents with their lex.uz sources and any contract made, a composer
// at the bottom. A question handed over from another window (?q=) is
// asked at once. The quota and the free-plan notes are the web chat's.

type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; contracts?: Contract[]; offline?: boolean; upgrade?: boolean; lastFree?: boolean };

const FREE_LIMIT = 5;

export default function AiChatApp({ route, onRoute, openLink }: NativeProps) {
  const t = useTranslations("chatPage");
  const os = useOs();
  const { reply } = useLexAi();
  const { session } = useAuth();
  const cid = session?.id || "";
  const [chats, setChats] = useState<ApiChat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const seeded = useRef("");
  const suggestions = t.raw("suggestions") as string[];
  const usageKey = () => {
    const d = new Date();
    return `lexgo_ai_used_${session?.id || "anon"}_${d.getFullYear()}-${d.getMonth() + 1}`;
  };
  const readUsed = () => {
    try {
      return Number(localStorage.getItem(usageKey()) || 0) || 0;
    } catch {
      return 0;
    }
  };
  const writeUsed = (n: number) => {
    try {
      localStorage.setItem(usageKey(), String(n));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (cid) listChats(cid).then(setChats).catch(() => setChats([]));
  }, [cid]);
  // A question handed over from another window, also to a window already
  // open: asked in a new conversation.
  useEffect(() => {
    const q = new URLSearchParams(route.split("?")[1] ?? "").get("q")?.trim();
    if (!q || seeded.current === route) return;
    seeded.current = route;
    const h = setTimeout(() => {
      onRoute(route.split("?")[0]);
      setActiveId("");
      setMessages([]);
      void send(q, "");
    }, 0);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);
  useEffect(() => {
    const el = scroll.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function open(id: string) {
    setActiveId(id);
    setMessages([]);
    try {
      const msgs = await getChatMessages(cid, id);
      setMessages(msgs.map((m) => ({ role: m.role, content: m.content, sources: m.sources, contracts: m.contracts })));
    } catch {
      /* offline / empty */
    }
  }
  function fresh() {
    setActiveId("");
    setMessages([]);
    requestAnimationFrame(() => field.current?.focus());
  }

  // `chat` names the conversation to post to ("" for a new one) when the
  // caller has just switched it and state has not caught up.
  async function send(raw: string, chat: string = activeId) {
    const content = raw.trim();
    if (!content || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content }]);
    setSending(true);
    try {
      let id = chat;
      if (!id) {
        const chat = await createChat(cid, content.slice(0, 48));
        id = chat.id;
        setActiveId(id);
        setChats((cs) => [{ ...chat, title: chat.title || content.slice(0, 48), lastMessage: content }, ...cs]);
      }
      const { assistant, contracts } = await postMessage(cid, id, content);
      // Free plan: the fifth answer of the month says it was the last free one.
      let lastFree = false;
      if (session && !session.permissions?.length) {
        const used = readUsed() + 1;
        writeUsed(used);
        lastFree = used === FREE_LIMIT;
      }
      setMessages((m) => [...m, { role: "assistant", content: assistant.content, sources: assistant.sources, contracts, lastFree }]);
      setChats((cs) => cs.map((c) => (c.id === id ? { ...c, lastMessage: assistant.content } : c)));
    } catch (e) {
      const quota = aiQuotaOf(e);
      if (quota) {
        if (quota.monthlyLimit) writeUsed(Math.max(readUsed(), quota.used));
        setMessages((m) => [...m, { role: "assistant", content: quota.monthlyLimit ? t("aiQuotaReached", { used: quota.used, limit: quota.monthlyLimit }) : t("aiQuotaReachedShort"), upgrade: true }]);
      } else setMessages((m) => [...m, { role: "assistant", content: reply(content).text, offline: true }]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => field.current?.focus());
    }
  }

  // A cabinet link inside an answer opens its own window, not a page over
  // the desktop.
  const keepInDesk = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href") || "";
    const m = /^\/(?:uz|ru|en)(\/portal\/.*)$/.exec(href) ?? /^(\/portal\/.*)$/.exec(href);
    if (!m) return;
    e.preventDefault();
    openLink({ appId: "", route: m[1] });
  };
  const lastQuestionBefore = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (messages[j].role === "user") return messages[j].content;
    return "";
  };
  const plan = session ? `/portal/${session.role}/subscription` : "";

  const sections: NavSection[] = [
    {
      id: "h",
      title: t("historyTitle"),
      items: chats.map((c) => ({ id: c.id, label: c.title || t("untitled") })),
    },
  ];
  const cur = chats.find((c) => c.id === activeId);

  return (
    <App
      name="caichat"
      sidebar={
        <Sidebar
          label={t("historyTitle")}
          sections={chats.length ? sections : []}
          value={activeId}
          onChange={(id) => void open(id)}
          header={
            <Btn kind={os === "win" ? "primary" : "default"} icon={<IconPlus />} onClick={fresh}>
              {t("newChat")}
            </Btn>
          }
          footer={chats.length ? undefined : <p className="dxcq-none">{t("noChats")}</p>}
        />
      }
    >
      <Toolbar title={cur?.title || t("title")} subtitle={t("subtitle")}>
        <Tool icon={<IconPlus />} label={t("newChat")} onClick={fresh} />
      </Toolbar>
      <div className="dxcq-scroll dx-scroll" ref={scroll} onClickCapture={keepInDesk}>
        {!messages.length ? (
          <div className="dxcq-hello">
            <span className="dxci-hello__ic" aria-hidden>
              <IconSparkle />
            </span>
            {session ? <small>{t("hi", { name: session.name })}</small> : null}
            <h2>{t("emptyTitle")}</h2>
            <p>{t("emptyText")}</p>
            <div className="dxcq-sugg">
              {suggestions.map((s, i) => (
                <button key={i} type="button" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="dxcq-msgs">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="dxcq-u">
                  <p>{m.content}</p>
                </div>
              ) : (
                <div key={i} className="dxcq-a">
                  <span className="dxcq-av" aria-hidden>
                    <IconSparkle />
                  </span>
                  <div className="dxcq-a__c">
                    <AgentAnswer
                      content={m.content}
                      sources={m.sources}
                      interactive={i === messages.length - 1 && !sending}
                      onAsk={(q) => void send(q)}
                      onRetry={() => {
                        const q = lastQuestionBefore(i);
                        if (q) void send(q);
                      }}
                      documentHref={session?.role === "client" ? "/portal/client/services" : undefined}
                    />
                    {m.contracts?.length ? (
                      <div className="dxcq-files">
                        {m.contracts.map((c, k) => (
                          <ContractFile key={k} c={c} />
                        ))}
                      </div>
                    ) : null}
                    {m.offline ? <p className="dxcq-note">{t("offline")}</p> : null}
                    {(m.lastFree || m.upgrade) && plan ? (
                      <div className="dxcq-plan">
                        {m.lastFree ? (
                          <span>
                            <b>{t("lastFreeTitle")}</b>
                            <small>{t("lastFreeText", { limit: FREE_LIMIT })}</small>
                          </span>
                        ) : null}
                        <Btn small kind="primary" onClick={() => openLink({ appId: "", route: plan })}>
                          {t("upgradePlan")}
                        </Btn>
                      </div>
                    ) : null}
                  </div>
                </div>
              ),
            )}
            {sending ? (
              <div className="dxcq-a">
                <span className="dxcq-av" aria-hidden>
                  <IconSparkle />
                </span>
                <span className="dxcq-typing" aria-label={t("assistant")}>
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>
      <form
        className="dxcq-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="dxcq-box">
          {session ? <Avatar name={session.name || "?"} size={26} /> : null}
          <textarea
            ref={field}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={t("inputPlaceholder")}
            aria-label={t("inputPlaceholder")}
          />
          <button type="submit" className="dxcq-send" disabled={sending || !input.trim()} aria-label={t("send")}>
            {sending ? <Spinner small /> : <IconSend />}
          </button>
        </div>
        <small>
          {t("disclaimer")} {t("piiNote")}
        </small>
      </form>
    </App>
  );
}

// A contract the AI made, as an attachment row.
function ContractFile({ c }: { c: Contract }) {
  const t = useTranslations("chatPage");
  const { ext, name, hasFile, busy, failed, deliver } = useContractFile(c);
  return (
    <div className="dxco-file dxcq-file">
      <IconFileText aria-hidden />
      <span>
        <b>{c.contractType || name}</b>
        <small>{failed ? t("fileError") : `${ext.toUpperCase()}${c.status ? ` · ${c.status}` : ""}`}</small>
      </span>
      {hasFile ? (
        <>
          <Btn small kind="plain" icon={<IconExternal />} title={t("open")} disabled={busy} onClick={() => void deliver(false)} />
          <Btn small kind="plain" icon={<IconDownload />} title={t("downloadPdf")} disabled={busy} onClick={() => void deliver(true)} />
        </>
      ) : null}
    </div>
  );
}

