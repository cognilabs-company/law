"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { aiAssistantAsk, type AiAnswer } from "@/lib/services/backend";
import { aiPageIdFor, aiRouteFor, type AiRole } from "@/lib/aiPages";
import { errDetail, logApiError } from "@/lib/http";
import {
  IconSparkle, IconSend, IconClose, IconArrowRight, IconInfo,
  IconCheck, IconAlert, IconLock,
} from "@/components/icons";

// LEXGO_AI_SYSTEM_ASSISTANT_FRONTEND_BACKEND_2026-09-29.md.
//
// A navigator over LexGo, not a chatbot and not the case-analysis suite on
// the AI page. It is told which page the user is standing on, and answers
// with an intent, a sentence, and — when there is somewhere to go — a page.
//
// Two decisions worth stating.
//
// It does not auto-navigate. The MD allows it ("navigation.route avtomatik
// push qilinishi mumkin") but every answer carries a navigation, including
// the ones that are pure explanation: asking "mening hujjatlarim qayerda?"
// returns intent=read_data with a route attached. Pushing on each of those
// would move the page out from under someone who asked a question. The route
// is a button instead, and the button is the answer's own words.
//
// Nothing is sent about who the user is. No role, no permission, no user id —
// "Backend o'zi token orqali aniqlaydi". The only context is the page: its
// route, its registry id and its title.

const MAX = 1000;
// Under this the MD asks for a visibly careful answer and an invitation to
// narrow the question.
const LOW_CONFIDENCE = 0.5;

const INTENT_ICON: Record<string, typeof IconInfo> = {
  permission_denied: IconLock,
  unsupported: IconAlert,
  clarification: IconInfo,
};

type Msg =
  | { kind: "me"; id: string; text: string }
  | { kind: "ai"; id: string; ans: AiAnswer; rated: number }
  | { kind: "err"; id: string; text: string };

// A stable id per message without Date.now()/random in render.
function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `r-${Math.random().toString(16).slice(2)}-${Date.now().toString(36)}`;
}

export default function AiSystemAssistant({
  open,
  onOpen,
  onClose,
  role,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  role: AiRole;
}) {
  const t = useTranslations("portal.aiAssistant");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // One conversation per mount. The backend keys its own memory on this.
  const session = useRef("");
  if (!session.current) session.current = makeId();
  const listRef = useRef<HTMLDivElement>(null);

  // The page the question is about, recomputed as the user moves around with
  // the panel open.
  const page = useMemo(
    () => ({ route: pathname || "/", pageId: aiPageIdFor(pathname || "/"), title: typeof document !== "undefined" ? document.title : "" }),
    [pathname],
  );

  // Keep the newest answer in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  // Escape closes it, like every other overlay in the app.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  const send = useCallback(async () => {
    const message = text.trim();
    if (!message || busy) return;
    const requestId = makeId();
    setMsgs((m) => [...m, { kind: "me", id: makeId(), text: message }]);
    setText("");
    setBusy(true);
    try {
      const ans = await aiAssistantAsk({ message, sessionId: session.current, requestId, page, locale });
      setMsgs((m) => [...m, { kind: "ai", id: ans.requestId || requestId, ans, rated: 0 }]);
    } catch (e) {
      logApiError("ai assistant", e);
      setMsgs((m) => [...m, { kind: "err", id: makeId(), text: errDetail(e) || t("failed") }]);
    } finally {
      setBusy(false);
    }
  }, [text, busy, page, locale, t]);

  function go(pageId: string, rawRoute: string) {
    const to = aiRouteFor(pageId, rawRoute, role);
    if (!to) return;
    onClose();
    router.push(to as Parameters<typeof router.push>[0]);
  }

  async function rate(id: string, value: number) {
    setMsgs((m) => m.map((x) => (x.kind === "ai" && x.id === id ? { ...x, rated: value } : x)));
    try {
      const { aiFeedback } = await import("@/lib/services/backend");
      await aiFeedback(id, value, { useful: value >= 4 });
    } catch {
      // A rating that does not send is not worth a message: the answer it
      // rates is still on screen and nothing the user did has failed.
    }
  }

  if (!open) {
    return (
      <button type="button" className="aiasi__launch" onClick={onOpen} aria-label={t("title")} data-ai-id="assistant-open">
        <IconSparkle />
      </button>
    );
  }

  return (
    <div className="aiasi" role="dialog" aria-label={t("title")}>
      <div className="aiasi__h">
        <b><IconSparkle />{t("title")}</b>
        <button type="button" className="aiasi__x" onClick={onClose} aria-label={t("close")}>
          <IconClose />
        </button>
      </div>

      <div className="aiasi__body" ref={listRef}>
        {!msgs.length ? (
          <div className="aiasi__intro">
            <p>{t("intro")}</p>
            <div className="aiasi__eg">
              {["egLawyer", "egDocs", "egUrgent"].map((k) => (
                <button key={k} type="button" onClick={() => setText(t(k))}>{t(k)}</button>
              ))}
            </div>
          </div>
        ) : null}

        {msgs.map((m) => {
          if (m.kind === "me") return <p className="aiasi__me" key={m.id}>{m.text}</p>;
          if (m.kind === "err") return <p className="aiasi__err" key={m.id} role="status">{m.text}</p>;
          const a = m.ans;
          const Icon = INTENT_ICON[a.intent];
          const navTo = a.navigation ? aiRouteFor(a.navigation.pageId, a.navigation.route, role) : "";
          const low = a.confidence < LOW_CONFIDENCE;
          return (
            <div className={`aiasi__ai aiasi__ai--${a.intent}`} key={m.id}>
              {Icon ? <span className="aiasi__badge"><Icon />{t(`intent.${a.intent}`)}</span> : null}
              {/* The one sentence the backend wants emphasised. It is a
                  sentence, not an element reference — the MD's data-ai-id
                  highlight is not what the API sends today. */}
              {a.highlight ? <p className="aiasi__hl">{a.highlight}</p> : null}
              <p className="aiasi__text">{a.answer}</p>

              {low ? <p className="aiasi__low"><IconInfo />{t("lowConfidence")}</p> : null}

              {navTo ? (
                <button type="button" className="btn btn--grad btn--sm aiasi__go" onClick={() => go(a.navigation!.pageId, a.navigation!.route)}>
                  {a.navigation?.title || t("goTo")}
                  <IconArrowRight />
                </button>
              ) : null}

              {/* Extra places the answer offered, minus the one already on the
                  button above. An action whose route we cannot resolve is
                  dropped rather than rendered dead. */}
              {a.actions.filter((x) => {
                const r = aiRouteFor(x.pageId, x.route, role);
                return r && r !== navTo;
              }).map((x, i) => (
                <button key={`${x.pageId}-${i}`} type="button" className="btn btn--line btn--sm aiasi__go" onClick={() => go(x.pageId, x.route)}>
                  {x.name || x.title}
                  <IconArrowRight />
                </button>
              ))}

              {a.sources.length ? (
                <details className="aiasi__src">
                  <summary>{t("sources")}</summary>
                  <ul>
                    {a.sources.map((s, i) => <li key={`${s.pageId}-${i}`}>{s.title || s.pageId}</li>)}
                  </ul>
                </details>
              ) : null}

              <div className="aiasi__rate">
                {m.rated ? (
                  <span className="aiasi__rated"><IconCheck />{t("thanks")}</span>
                ) : (
                  <>
                    <span>{t("useful")}</span>
                    <button type="button" onClick={() => void rate(m.id, 5)} aria-label={t("yes")}>{t("yes")}</button>
                    <button type="button" onClick={() => void rate(m.id, 2)} aria-label={t("no")}>{t("no")}</button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {busy ? <p className="aiasi__wait">{t("thinking")}</p> : null}
      </div>

      <form
        className="aiasi__f"
        onSubmit={(e) => { e.preventDefault(); void send(); }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("ph")}
          aria-label={t("ph")}
          maxLength={MAX}
          disabled={busy}
          data-ai-id="assistant-input"
        />
        <button type="submit" disabled={busy || !text.trim()} aria-label={t("send")}>
          <IconSend />
        </button>
      </form>
    </div>
  );
}
