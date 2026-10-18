"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/lib/http";
import { askCopilot, executeCopilotAction, isFallback, listArtifacts, newRequestId, type Artifact, type CopilotAction, type CopilotAnswer, type CopilotEntity, type CopilotMode } from "@/lib/services/aiCopilot";
import { getWork, type WorkItem } from "@/lib/services/lawyerDesktop";
import { IconArrowRight, IconCheck, IconClose, IconFileText, IconSend, IconSparkle } from "@/components/icons";

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

// The copilot (§ Client AI and lawyer AI) as a desktop app: a chat with the
// mode the backend gave this role, focused on one piece of work when one is
// picked — the backend then loads that work's context itself; the browser
// sends only its id. The first steps it offers depend on the role and on
// whether something is in focus. Every action it proposes is a preview:
// saving it as a draft asks first, then goes through the confirmed execute
// call; the saved drafts of the work in focus are a tab of their own.
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

  const reason = (e: unknown) => {
    if (e instanceof ApiError) {
      const d = e.data.detail && typeof e.data.detail === "object" ? (e.data.detail as Record<string, unknown>) : {};
      return String(d.message ?? e.detail ?? "") || t("error");
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
      const answer = await askCopilot({
        message: m,
        sessionId: sessionFor(focus?.id ?? "free"),
        mode,
        entity: focus,
        locale,
        page: { route: "/desktop/copilot", pageId: "desktop_copilot", title: t("title"), context: { desktop: true } },
      });
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
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(text);
  };

  return (
    <div className="wd-cop">
      <aside className="wd-cop__side">
        <div className="wd-cop__brand">
          <i aria-hidden>
            <IconSparkle />
          </i>
          <span>
            <b>{t("title")}</b>
            <small>{lawyer ? t("lawyerMode") : t("clientMode")}</small>
          </span>
        </div>
        <p className="wd-cop__h">{t("focus")}</p>
        <button type="button" className={`wd-cop__ctx${!focus ? " is-on" : ""}`} onClick={() => onFocus(null)}>
          <b>{t("noFocus")}</b>
          <small>{t("noFocusHint")}</small>
        </button>
        <ul className="wd-cop__work" aria-label={t("works")}>
          {chat && focus ? (
            <li>
              <button type="button" className="wd-cop__ctx is-on" aria-pressed>
                <b>{focus.title || t("chatFocus")}</b>
                <small>{t("chatFocus")}</small>
              </button>
            </li>
          ) : null}
          {work.slice(0, 30).map((w) => (
            <li key={w.id}>
              <button type="button" className={`wd-cop__ctx${focus?.id === w.id ? " is-on" : ""}`} aria-pressed={focus?.id === w.id} onClick={() => onFocus({ type: w.entityType, id: w.id, title: w.title })}>
                <b>{w.title || w.code}</b>
                <small>{[w.code, t.has(`status.${w.status}`) ? t(`status.${w.status}`) : w.status].filter(Boolean).join(" · ")}</small>
              </button>
            </li>
          ))}
          {!work.length ? <li className="wd-cop__none">{t("noWork")}</li> : null}
        </ul>
      </aside>

      <section className="wd-cop__main">
        <header className="wd-cop__top">
          <div className="wd-cop__now">
            <small>{chat ? t("focusedChat") : focus ? t("focused") : t("general")}</small>
            <b>{focus ? focus.title || focus.id : lawyer ? t("lawyerHello") : t("clientHello")}</b>
          </div>
          <div className="wd-cop__tabs" role="tablist">
            {(["chat", "drafts"] as const).map((x) => (
              <button key={x} type="button" role="tab" aria-selected={tab === x} className={tab === x ? "is-on" : ""} onClick={() => setTab(x)}>
                {t(`tab.${x}`)}
              </button>
            ))}
          </div>
        </header>

        {tab === "chat" ? (
          <>
            <div className="wd-cop__list" ref={listRef} aria-live="polite">
              {!turns.length ? (
                <div className="wd-cop__empty">
                  <i aria-hidden>
                    <IconSparkle />
                  </i>
                  <b>{chat ? t("emptyChat") : focus ? t("emptyFocus") : t("empty")}</b>
                  <small>{t("privacy")}</small>
                </div>
              ) : null}
              {turns.map((turn) => (
                <div key={turn.id} className="wd-cop__turn">
                  <p className="wd-cop__me">{turn.ask}</p>
                  {turn.error ? (
                    <p className="wd-cop__err" role="alert">{turn.error}</p>
                  ) : turn.answer ? (
                    <div className="wd-cop__ai">
                      {turn.answer.highlight ? <p className="wd-cop__hl">{turn.answer.highlight}</p> : null}
                      <p className="wd-cop__text">{turn.answer.answer}</p>
                      {turn.answer.navigation ? (
                        <button type="button" className="wd-cop__nav" onClick={() => onOpenRoute(turn.answer!.navigation!.route)}>
                          <IconArrowRight aria-hidden />
                          {turn.answer.navigation.title || t("open")}
                        </button>
                      ) : null}
                      {turn.answer.actions.length ? (
                        <div className="wd-cop__acts">
                          {turn.answer.actions.map((a, i) => {
                            const done = saved[`${turn.answer!.requestId}:${a.id}`];
                            return (
                              <div key={a.id || i} className="wd-cop__act">
                                <span>
                                  <IconFileText aria-hidden />
                                  <b>{a.title}</b>
                                  <small>{t("preview")}</small>
                                </span>
                                {a.route ? (
                                  <button type="button" className="btn btn--line btn--sm" onClick={() => onOpenRoute(a.route)}>
                                    {t("open")}
                                  </button>
                                ) : null}
                                {a.id ? (
                                  <button type="button" className="btn btn--pri btn--sm" disabled={done} onClick={() => setConfirm({ action: a, answer: turn.answer! })}>
                                    {done ? <IconCheck aria-hidden /> : null}
                                    {done ? t("saved") : t("saveDraft")}
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      {turn.answer.sources.length || turn.answer.tools.length ? (
                        <details className="wd-cop__src">
                          <summary>{t("basis", { n: turn.answer.sources.length + turn.answer.tools.length })}</summary>
                          <ul>
                            {turn.answer.sources.map((s, i) => (
                              <li key={`s${i}`}>{s.route ? <button type="button" onClick={() => onOpenRoute(s.route)}>{s.title}</button> : s.title}</li>
                            ))}
                            {turn.answer.tools.map((x, i) => (
                              <li key={`t${i}`}>
                                <code>{x.name}</code> {x.summary}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      {isFallback(turn.answer.provider) ? <small className="wd-cop__fb">{t("fallback")}</small> : null}
                    </div>
                  ) : (
                    <div className="wd-cop__typing" aria-label={t("thinking")}>
                      <i />
                      <i />
                      <i />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="wd-cop__chips" aria-label={t("suggest")}>
              {chips.map((c) => (
                <button key={c} type="button" disabled={busy} onClick={() => void ask(t(`ask.${c}`))}>
                  {t(`chip.${c}`)}
                </button>
              ))}
            </div>
            <form className="wd-cop__in" onSubmit={submit}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(text);
                  }
                }}
                placeholder={chat ? t("placeholderChat") : focus ? t("placeholderFocus") : t("placeholder")}
                aria-label={t("placeholder")}
                rows={2}
                maxLength={4000}
              />
              <button type="submit" disabled={busy || !text.trim()} aria-label={t("send")}>
                <IconSend />
              </button>
            </form>
          </>
        ) : (
          <div className="wd-cop__drafts">
            {drafts === null ? <p className="wd-cop__none">{t("loading")}</p> : null}
            {drafts && !drafts.length ? <p className="wd-cop__none">{focus ? t("noDraftsFocus") : t("noDrafts")}</p> : null}
            {(drafts ?? []).map((d) => (
              <article key={d.id || d.title} className="wd-cop__draft">
                <header>
                  <b>{d.title}</b>
                  {d.type ? <small>{t.has(`draft.${d.type}`) ? t(`draft.${d.type}`) : d.type}</small> : null}
                </header>
                <p>{d.content}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {confirm ? (
        <div className="wd-cop__confirm" role="dialog" aria-modal="true" aria-label={t("confirmTitle")} onKeyDown={(e) => e.key === "Escape" && setConfirm(null)}>
          <div>
            <header>
              <b>{t("confirmTitle")}</b>
              <button type="button" onClick={() => setConfirm(null)} aria-label={t("cancel")}>
                <IconClose />
              </button>
            </header>
            <p>{t("confirmText", { title: confirm.action.title || t("draftTitle") })}</p>
            {focus ? <p className="wd-cop__for">{t("confirmFor", { title: focus.title || focus.id })}</p> : null}
            <pre>{(confirm.action.content || confirm.answer.answer).slice(0, 1200)}</pre>
            {err ? <p className="wd-cop__err" role="alert">{err}</p> : null}
            <footer>
              <button type="button" className="btn btn--line btn--sm" onClick={() => setConfirm(null)}>
                {t("cancel")}
              </button>
              <button type="button" className="btn btn--pri btn--sm" autoFocus onClick={() => void save()}>
                <IconCheck aria-hidden />
                {t("confirm")}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
