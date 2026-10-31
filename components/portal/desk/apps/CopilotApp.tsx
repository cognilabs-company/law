"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, errDetail, isCodeLike } from "@/lib/http";
import { askCopilot, executeCopilotAction, isFallback, listArtifacts, newRequestId, type Artifact, type CopilotAction, type CopilotAnswer, type CopilotEntity, type CopilotMode } from "@/lib/services/aiCopilot";
import { getWork, type WorkItem } from "@/lib/services/lawyerDesktop";
import { IconArrowRight, IconBriefcase, IconChat, IconCheck, IconFileText, IconSend, IconSparkle } from "@/components/icons";
import { App, Btn, Dialog, Empty, Loading, Seg, Sidebar, Tag, Toolbar, type NavSection } from "../kit/kit";
import "./copilot.css";

type Turn = { id: string; ask: string; answer?: CopilotAnswer; error?: string };
// What each copilot offers as a first step, by what is in focus.
const LAWYER_WORK = ["plan", "timeline", "evidence", "strategy", "redline", "meetingPrep", "clientReply", "scope", "quality", "health", "secondOpinion"];
const LAWYER_FREE = ["prioritize", "intake", "grounding", "handoff"];
const CLIENT_WORK = ["status", "meetingPrep", "explainDoc", "secondOpinion", "complaint"];
const CLIENT_FREE = ["findService", "findLawyer", "intake", "navigate"];
// A secure chat in focus (sent from the chat's own window): the backend
// reads the part of its history this person may see.
const LAWYER_CHAT = ["chatSummary", "clientReply", "intake", "translate", "meetingSummary"];
const CLIENT_CHAT = ["chatSummary", "chatNext", "meetingPrep", "complaint"];
const CHAT_TYPES = new Set(["secure_chat", "chat", "chat_room"]);

// The copilot (§ Client AI and lawyer AI) as a desktop program — like the
// Mac's and Windows' own AI assistants: what it is focused on in the
// sidebar (nothing, a chat, or one piece of work — the backend then loads
// that work's context itself; the browser sends only its id), the
// conversation with the first steps it offers, and the drafts it saved.
// Every action it proposes is a preview: saving it as a draft asks first,
// then goes through the confirmed execute call.
export default function CopilotApp({ mode, focus, onFocus, onOpenRoute }: { mode: CopilotMode; focus: CopilotEntity | null; onFocus: (e: CopilotEntity | null) => void; onOpenRoute: (route: string) => void }) {
  const t = useTranslations("portal.desk.copilot");
  const locale = useLocale();
  const lawyer = mode === "lawyer_copilot";
  const [tab, setTab] = useState<"chat" | "drafts">("chat");
  const [work, setWork] = useState<WorkItem[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ action: CopilotAction; answer: CopilotAnswer } | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Artifact[] | null>(null);
  const [err, setErr] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  // One conversation per piece of work, and one without.
  const [sessions] = useState(() => new Map<string, string>());
  const sessionFor = (key: string) => {
    if (!sessions.has(key)) sessions.set(key, newRequestId());
    return sessions.get(key)!;
  };

  useEffect(() => {
    const c = new AbortController();
    getWork({}, c.signal)
      .then((f) => !c.signal.aborted && setWork(f.items))
      .catch(() => undefined);
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (tab !== "drafts") return;
    const c = new AbortController();
    listArtifacts(focus, c.signal)
      .then((l) => !c.signal.aborted && setDrafts(l))
      .catch(() => !c.signal.aborted && setDrafts([]));
    return () => c.abort();
  }, [tab, focus]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const reason = (e: unknown) => {
    if (e instanceof ApiError) {
      const d = e.data.detail && typeof e.data.detail === "object" ? (e.data.detail as Record<string, unknown>) : {};
      const own = typeof d.message === "string" && !isCodeLike(d.message) ? d.message : "";
      return own || errDetail(e) || t("error");
    }
    return t("error");
  };
  async function ask(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    const id = newRequestId();
    setTurns((ts) => [...ts, { id, ask: m }]);
    setText("");
    setBusy(true);
    try {
      const answer = await askCopilot({ message: m, sessionId: sessionFor(focus?.id ?? "free"), mode, entity: focus, locale, page: { route: "/desktop/copilot", pageId: "desktop_copilot", title: t("title"), context: { desktop: true } } });
      setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, answer } : x)));
    } catch (e) {
      setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, error: reason(e) } : x)));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!confirm) return;
    const { action, answer } = confirm;
    setErr("");
    try {
      await executeCopilotAction({ requestId: answer.requestId, actionId: action.id, title: action.title || t("draftTitle"), content: action.content || answer.answer, entity: focus, metadata: { draft_type: action.draftType } });
      setSaved((s) => ({ ...s, [`${answer.requestId}:${action.id}`]: true }));
      setConfirm(null);
      setDrafts(null);
    } catch (e) {
      setErr(reason(e));
    }
  }

  const chat = !!focus && CHAT_TYPES.has(focus.type);
  const chips = chat ? (lawyer ? LAWYER_CHAT : CLIENT_CHAT) : focus ? (lawyer ? LAWYER_WORK : CLIENT_WORK) : lawyer ? LAWYER_FREE : CLIENT_FREE;
  const statusOf = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);
  const sections: NavSection[] = [
    { id: "f", title: t("focus"), items: [{ id: "", label: t("noFocus"), icon: <IconSparkle /> }, ...(chat && focus ? [{ id: focus.id, label: focus.title || t("chatFocus"), icon: <IconChat /> }] : [])] },
    { id: "w", title: t("works"), items: work.slice(0, 30).map((w) => ({ id: w.id, label: w.title || w.code, icon: <IconBriefcase /> })) },
  ];
  const pick = (id: string) => {
    if (!id) return onFocus(null);
    if (chat && focus?.id === id) return;
    const w = work.find((x) => x.id === id);
    if (w) onFocus({ type: w.entityType, id: w.id, title: w.title });
  };
  const focusedWork = focus && !chat ? work.find((w) => w.id === focus.id) : undefined;

  return (
    <App
      name="copilot"
      sidebar={
        <Sidebar
          label={t("title")}
          sections={sections}
          value={focus?.id ?? ""}
          onChange={pick}
          header={
            <div className="dxa2-brand">
              <i aria-hidden>
                <IconSparkle />
              </i>
              <span>
                <b>{t("title")}</b>
                <small>{lawyer ? t("lawyerMode") : t("clientMode")}</small>
              </span>
            </div>
          }
          footer={!work.length ? <p className="dxa2-none">{t("noWork")}</p> : undefined}
        />
      }
    >
      <Toolbar
        title={focus ? focus.title || focus.id : lawyer ? t("lawyerHello") : t("clientHello")}
        subtitle={chat ? t("focusedChat") : focus ? [t("focused"), focusedWork?.code, focusedWork ? statusOf(focusedWork.status) : ""].filter(Boolean).join(" · ") : t("general")}
        end={<Seg label={t("title")} small value={tab} onChange={setTab} items={(["chat", "drafts"] as const).map((x) => ({ id: x, label: t(`tab.${x}`) }))} />}
      />
      {tab === "chat" ? (
        <div className="dxa2">
          <div className="dxa2-log" ref={listRef} aria-live="polite">
            {!turns.length ? (
              <div className="dxa2-hello">
                <i aria-hidden>
                  <IconSparkle />
                </i>
                <b>{chat ? t("emptyChat") : focus ? t("emptyFocus") : t("empty")}</b>
                <small>{t("privacy")}</small>
              </div>
            ) : null}
            {turns.map((turn) => (
              <div key={turn.id} className="dxa2-turn">
                <p className="dxa2-me">{turn.ask}</p>
                {turn.error ? (
                  <p className="dxa2-err" role="alert">
                    {turn.error}
                  </p>
                ) : turn.answer ? (
                  <div className="dxa2-ai">
                    <span className="dxa2-ai__av" aria-hidden>
                      <IconSparkle />
                    </span>
                    <div className="dxa2-ai__body">
                      {turn.answer.highlight ? <p className="dxa2-hl">{turn.answer.highlight}</p> : null}
                      <p className="dxa2-text">{turn.answer.answer}</p>
                      {turn.answer.navigation ? (
                        <Btn small icon={<IconArrowRight />} onClick={() => onOpenRoute(turn.answer!.navigation!.route)}>
                          {turn.answer.navigation.title || t("open")}
                        </Btn>
                      ) : null}
                      {turn.answer.actions.map((a, i) => {
                        const done = saved[`${turn.answer!.requestId}:${a.id}`];
                        return (
                          <div key={a.id || i} className="dxa2-act">
                            <IconFileText aria-hidden />
                            <span>
                              <b>{a.title}</b>
                              <small>{t("preview")}</small>
                            </span>
                            {a.route ? (
                              <Btn small onClick={() => onOpenRoute(a.route)}>
                                {t("open")}
                              </Btn>
                            ) : null}
                            {a.id ? (
                              <Btn small kind="primary" icon={done ? <IconCheck /> : undefined} disabled={done} onClick={() => setConfirm({ action: a, answer: turn.answer! })}>
                                {done ? t("saved") : t("saveDraft")}
                              </Btn>
                            ) : null}
                          </div>
                        );
                      })}
                      {turn.answer.sources.length || turn.answer.tools.length ? (
                        <details className="dxa2-src">
                          <summary>{t("basis", { n: turn.answer.sources.length + turn.answer.tools.length })}</summary>
                          <ul>
                            {turn.answer.sources.map((s, i) => (
                              <li key={`s${i}`}>
                                {s.route ? (
                                  <button type="button" onClick={() => onOpenRoute(s.route)}>
                                    {s.title}
                                  </button>
                                ) : (
                                  s.title
                                )}
                              </li>
                            ))}
                            {turn.answer.tools.map((x, i) => (
                              <li key={`t${i}`}>
                                <code>{x.name}</code> {x.summary}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      {isFallback(turn.answer.provider) ? <small className="dxa2-fb">{t("fallback")}</small> : null}
                    </div>
                  </div>
                ) : (
                  <div className="dxa2-typing" aria-label={t("thinking")}>
                    <i />
                    <i />
                    <i />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="dxa2-chips" aria-label={t("suggest")}>
            {chips.map((c) => (
              <button key={c} type="button" disabled={busy} onClick={() => void ask(t(`ask.${c}`))}>
                {t(`chip.${c}`)}
              </button>
            ))}
          </div>
          <form
            className="dxa2-in"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
          >
            <textarea
              ref={field}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void ask(text);
                }
              }}
              placeholder={chat ? t("placeholderChat") : focus ? t("placeholderFocus") : t("placeholder")}
              aria-label={t("placeholder")}
              maxLength={4000}
            />
            <button type="submit" disabled={busy || !text.trim()} aria-label={t("send")} title={t("send")}>
              <IconSend />
            </button>
          </form>
        </div>
      ) : (
        <div className="dxa2-drafts">
          {drafts === null ? (
            <Loading label={t("loading")} />
          ) : !drafts.length ? (
            <Empty icon={<IconFileText />} title={focus ? t("noDraftsFocus") : t("noDrafts")} />
          ) : (
            drafts.map((d) => (
              <article key={d.id || d.title} className="dxa2-draft">
                <header>
                  <IconFileText aria-hidden />
                  <b>{d.title}</b>
                  {d.type ? <Tag>{t.has(`draft.${d.type}`) ? t(`draft.${d.type}`) : d.type}</Tag> : null}
                </header>
                <p>{d.content}</p>
              </article>
            ))
          )}
        </div>
      )}
      <Dialog
        open={!!confirm}
        title={t("confirmTitle")}
        width={520}
        onClose={() => (setConfirm(null), setErr(""))}
        onSubmit={() => void save()}
        actions={
          <>
            <Btn onClick={() => (setConfirm(null), setErr(""))}>{t("cancel")}</Btn>
            <Btn kind="primary" type="submit" icon={<IconCheck />}>
              {t("confirm")}
            </Btn>
          </>
        }
      >
        {confirm ? (
          <>
            <p className="dx-dlg__text">{t("confirmText", { title: confirm.action.title || t("draftTitle") })}</p>
            {focus ? <p className="dxa2-for">{t("confirmFor", { title: focus.title || focus.id })}</p> : null}
            <pre className="dxa2-pre">{(confirm.action.content || confirm.answer.answer).slice(0, 1200)}</pre>
            {err ? (
              <p className="dxa2-err" role="alert">
                {err}
              </p>
            ) : null}
          </>
        ) : null}
      </Dialog>
    </App>
  );
}
