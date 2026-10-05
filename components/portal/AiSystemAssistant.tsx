"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { aiAssistantAsk, type AiAnswer } from "@/lib/services/backend";
import { aiPageIdFor, aiRouteFor, type AiRole } from "@/lib/aiPages";
import { errDetail, isAborted, isRouteMissing, logApiError } from "@/lib/http";
import { featureMissing } from "@/lib/endpointGate";
import { visibleTargets, type GuideRole } from "@/lib/aiGuide";
import { useGuideRunner } from "@/lib/useGuideRunner";
import { askInstructor, confirmInstructorAction, previewInstructorAction, type GuideAction, type InstructorReply } from "@/lib/services/instructor";
import { createSupportTicket, supportCategoryFor } from "@/lib/services/support";
import { errorText } from "@/lib/errorText";
import { toast } from "@/lib/toast";
import Modal from "@/components/admin/Modal";
import {
  IconSparkle, IconSend, IconClose, IconArrowRight, IconInfo,
  IconCheck, IconAlert, IconLock, IconHeadset, IconRefresh,
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
  | { kind: "guide"; id: string; reply: InstructorReply; message: string; steps: GuideAction["type"][]; state: "running" | "done" | "partial" }
  | { kind: "err"; id: string; text: string };

type Confirm = { actionType: string; message: string; text: string; busy: boolean; error: string };

const EXAMPLES: Record<GuideRole, string[]> = {
  client: ["egPlan", "egLawyer", "egDocs", "egSupport"],
  lawyer: ["egWorks", "egOrders", "egSupport"],
  advocate: ["egWorks", "egOrders", "egSupport"],
  staff: ["egQueue", "egUrgentQueue"],
};

const STEP_KEY: Partial<Record<GuideAction["type"], string>> = {
  navigate: "stepNavigate",
  scroll_to: "stepScroll",
  highlight: "stepHighlight",
  tooltip: "stepTooltip",
  focus: "stepFocus",
};

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
  guideRole,
  launcher = "auto",
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  role: AiRole;
  guideRole?: GuideRole;
  launcher?: "auto" | "always";
}) {
  const t = useTranslations("portal.aiAssistant");
  const tc = useTranslations("common");
  const gRole: GuideRole = guideRole ?? role;
  const { run } = useGuideRunner(gRole, {
    covers: () => document.querySelector(".aiasi")?.getBoundingClientRect() ?? null,
    onCovered: onClose,
  });
  const [confirm, setConfirm] = useState<Confirm | null>(null);
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

  const askConfirm = useCallback(
    async (actionType: string, message: string) => {
      let confirmText = t("confirmText");
      try {
        const p = await previewInstructorAction(actionType, message);
        confirmText = p.confirmationText || confirmText;
      } catch (e) {
        if (!isRouteMissing(e)) {
          toast(errorText(e, tc), { tone: "err" });
          return;
        }
      }
      setConfirm({ actionType, message, text: confirmText, busy: false, error: "" });
    },
    [t, tc],
  );

  const runGuide = useCallback(
    async (id: string, reply: InstructorReply, message: string) => {
      if (reply.actions.length && window.innerWidth < 900) onClose();
      const res = await run(reply.actions);
      setMsgs((m) => m.map((x) => (x.kind === "guide" && x.id === id ? { ...x, steps: res.steps, state: res.ok ? "done" : "partial" } : x)));
      if (reply.requiresConfirmation) void askConfirm(reply.confirmActionType || "start_support_ticket", message);
    },
    [run, onClose, askConfirm],
  );

  const doConfirm = useCallback(async () => {
    if (!confirm || confirm.busy) return;
    setConfirm({ ...confirm, busy: true, error: "" });
    let ticketId = "";
    let workId = "";
    let href = "";
    let target = "";
    try {
      try {
        const r = await confirmInstructorAction(confirm.actionType, confirm.message);
        ticketId = r.ticket?.id ?? "";
        workId = r.ticket?.workId ?? "";
        href = r.nextHref;
        target = r.nextTarget;
      } catch (e) {
        if (!isRouteMissing(e)) throw e;
        const tk = await createSupportTicket({
          message: confirm.message,
          category: supportCategoryFor(pathname || "/", confirm.message),
          priority: "normal",
          context: { current_path: pathname || "/", source: "ai_instructor" },
        });
        ticketId = tk.id;
        workId = tk.workId;
      }
    } catch (e) {
      setConfirm((c) => (c ? { ...c, busy: false, error: isRouteMissing(e) ? tc("featureSoon") : errorText(e, tc) } : c));
      return;
    }
    setConfirm(null);
    toast(workId ? t("ticketCreated", { id: workId }) : t("ticketCreatedPlain"), { tone: "ok" });
    const base = (href || "/portal/client/support").split("?")[0];
    await run([
      { type: "navigate", href: ticketId ? `${base}?ticket=${encodeURIComponent(ticketId)}` : base },
      ...(ticketId || target ? [{ type: "highlight" as const, target: target || `support-ticket:${ticketId}`, style: "red_pulse", durationMs: 6000 }] : []),
    ]);
  }, [confirm, pathname, run, t, tc]);

  const send = useCallback(async () => {
    const message = text.trim();
    if (!message || busy) return;
    const requestId = makeId();
    setMsgs((m) => [...m, { kind: "me", id: makeId(), text: message }]);
    setText("");
    setBusy(true);
    try {
      if (!featureMissing("instructor")) {
        const reply = await askInstructor({ message, currentPath: pathname || "/", visibleTargets: visibleTargets() });
        if (reply) {
          const id = makeId();
          setMsgs((m) => [...m, { kind: "guide", id, reply, message, steps: [], state: "running" }]);
          setBusy(false);
          await runGuide(id, reply, message);
          return;
        }
      }
      const ans = await aiAssistantAsk({ message, sessionId: session.current, requestId, page, locale });
      setMsgs((m) => [...m, { kind: "ai", id: ans.requestId || requestId, ans, rated: 0 }]);
    } catch (e) {
      if (isAborted(e)) return;
      logApiError("ai assistant", e);
      setMsgs((m) => [...m, { kind: "err", id: makeId(), text: errDetail(e) || t("failed") }]);
    } finally {
      setBusy(false);
    }
  }, [text, busy, page, locale, t, pathname, runGuide]);

  const confirmModal = (
    <Modal open={!!confirm} onClose={() => setConfirm(null)} title={t("confirmTitle")}>
      <div className="aiconfirm">
        <span className="aiconfirm__ic" aria-hidden="true">
          <IconHeadset />
        </span>
        <p>{confirm?.text}</p>
        {confirm?.error ? <p className="aiconfirm__err" role="alert">{confirm.error}</p> : null}
        <div className="aiconfirm__acts">
          <button type="button" className="btn btn--line" onClick={() => setConfirm(null)} disabled={confirm?.busy}>
            {t("confirmNo")}
          </button>
          <button type="button" className="btn btn--pri" onClick={() => void doConfirm()} disabled={confirm?.busy}>
            {t("confirmYes")}
          </button>
        </div>
      </div>
    </Modal>
  );

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
      <>
        <button type="button" className={`aiasi__launch${launcher === "always" ? " aiasi__launch--always" : ""}`} onClick={onOpen} aria-label={t("title")} title={t("title")} data-ai-id="assistant-open">
          <IconSparkle />
        </button>
        {confirmModal}
      </>
    );
  }

  return (
    <div className="aiasi" role="dialog" aria-label={t("title")}>
      {confirmModal}
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
              {EXAMPLES[gRole].map((k) => (
                <button key={k} type="button" onClick={() => setText(t(k))}>{t(k)}</button>
              ))}
            </div>
          </div>
        ) : null}

        {msgs.map((m) => {
          if (m.kind === "me") return <p className="aiasi__me" key={m.id}>{m.text}</p>;
          if (m.kind === "err") return <p className="aiasi__err" key={m.id} role="status">{m.text}</p>;
          if (m.kind === "guide") {
            const r = m.reply;
            const labels = Array.from(new Set(m.steps.map((x) => STEP_KEY[x]).filter((x): x is string => Boolean(x))));
            const visual = r.actions.some((x) => x.type !== "navigate");
            return (
              <div className="aiasi__ai aiasi__ai--guide" key={m.id}>
                <p className="aiasi__text">{r.reply || t("done")}</p>
                {m.state === "running" ? (
                  <p className="aiasi__steps aiasi__steps--busy">
                    <IconSparkle />
                    {t("showing")}
                  </p>
                ) : labels.length ? (
                  <p className="aiasi__steps">
                    {labels.map((k) => (
                      <span key={k}>
                        <IconCheck />
                        {t(k)}
                      </span>
                    ))}
                  </p>
                ) : null}
                {m.state !== "running" && (visual || r.intent === "support_guidance") ? (
                  <div className="aiasi__acts">
                    {visual ? (
                      <button type="button" className="btn btn--line btn--sm" onClick={() => void runGuide(m.id, { ...r, requiresConfirmation: false }, m.message)}>
                        <IconRefresh />
                        {t("replay")}
                      </button>
                    ) : null}
                    {r.intent === "support_guidance" ? (
                      <button type="button" className="btn btn--pri btn--sm" onClick={() => void askConfirm("start_support_ticket", m.message)}>
                        <IconHeadset />
                        {t("toOperator")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          }
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
