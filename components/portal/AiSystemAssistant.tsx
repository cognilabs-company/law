"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { aiAssistantAsk, aiFeedback, type AiAnswer } from "@/lib/services/backend";
import { aiPageIdFor, aiRouteFor, type AiRole } from "@/lib/aiPages";
import { errDetail, isAborted, logApiError } from "@/lib/http";
import { localizeApiDetail } from "@/lib/apiMessage";
import { featureMissing } from "@/lib/endpointGate";
import { useAuth } from "@/lib/auth";
import { collectState, collectTargets } from "@/lib/guide/targets";
import { pageFor, registryTargets, stepTextKey } from "@/lib/guide/pages";
import { startTour, stopTour, tourActive } from "@/lib/guide/store";
import { onInstructorOpen, openInstructor } from "@/lib/guide/panel";
import type { GuideRole, GuideTour } from "@/lib/guide/types";
import { abortCommands, commandsRunning, normCommands, replayCommands, runCommands, supportCommand, tourFromSteps, type RunCtx } from "@/lib/ai/commands";
import { buildAiSnapshot } from "@/lib/ai/manifest";
import { noteChatActivity, setPanelEngaged } from "@/lib/ai/runtime";
import { aiSessionId, resetAiSession, setAiScope, setAiSessionId, type AiScope } from "@/lib/ai/session";
import { markAiSeen, onAiRealtime, type AiRealtimeEvent } from "@/lib/ai/realtime";
import type { AiChatResponse, AiCommand, InstructorContract } from "@/lib/ai/types";
import {
  cachedInstructorContract,
  ensureInstructorContract,
  instructorChat,
  instructorMode,
  isUnknownSession,
  normInstructorChat,
  noteInstructorV21Missing,
} from "@/lib/services/instructorV21";
import AiCommandStatus from "@/components/guide/AiCommandStatus";
import {
  INSTRUCTOR_CONTRACT,
  askInstructor,
  confirmSupportHandoff,
  confirmUnsupported,
  instructorHistory,
  instructorPath,
  instructorState,
  instructorTargets,
  newTourId,
  previewSupportHandoff,
  replyHasGuide,
  replyNeedsAssistant,
  replyOffersSupport,
  tourFromReply,
  type InstructorReply,
  type InstructorRequest,
} from "@/lib/services/instructor";
import { createSupportTicket, supportCategoryFor } from "@/lib/services/support";
import { errorText } from "@/lib/errorText";
import { toast } from "@/lib/toast";
import Modal from "@/components/admin/Modal";
import RobotAvatar from "@/components/guide/RobotAvatar";
import Typewriter from "@/components/guide/Typewriter";
import { RobotEvents } from "@/components/lexgo/robot/RobotEvents";
import {
  IconArrowRight, IconCheck, IconClose, IconHeadset, IconInfo, IconMapPin, IconRefresh, IconSend, IconSparkle, IconTarget,
} from "@/components/icons";

const MAX = 1000;
const HISTORY = 30;

type GuideMsg = { kind: "guide"; id: string; text: string; intent: string; tour: GuideTour | null; support: boolean; checklist?: string[]; needs?: string[] };
type V21Msg = { kind: "v21"; id: string; text: string; intent: string; cmds: AiCommand[]; question: string; sid: string };
type Msg =
  | { kind: "me"; id: string; text: string }
  | GuideMsg
  | V21Msg
  | { kind: "ai"; id: string; ans: AiAnswer; tour: GuideTour | null; rated: number }
  | { kind: "err"; id: string; text: string };

type V21Outcome = { kind: "ok"; res: AiChatResponse; contract: InstructorContract } | { kind: "fallback" } | { kind: "unavailable" };

const VISUAL = new Set(["navigate", "highlight", "tooltip", "scroll_to", "focus_input"]);

type Confirm = { key: string; message: string; busy: boolean; error: string; note: string; v2: boolean };

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `r-${Math.random().toString(16).slice(2)}-${Date.now().toString(36)}`;
}

function readHistory(key: string): Msg[] {
  if (!key) return [];
  try {
    const raw = sessionStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as Msg[]).slice(-HISTORY) : [];
  } catch {
    return [];
  }
}

function headerTitle(): string {
  if (typeof document === "undefined") return "";
  const el = document.querySelector('[data-ai-target="ai-help:current-page"]');
  return (el?.getAttribute("data-ai-label") || el?.textContent || "").replace(/\s+/g, " ").trim();
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
  launcher?: "auto" | "always" | "none";
}) {
  const t = useTranslations("portal.aiAssistant");
  const tg = useTranslations("guide");
  const tc = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname() || "/";
  const { session } = useAuth();
  const gRole: GuideRole = guideRole ?? role;
  const storeKey = session?.id ? `lexgo_ains_${session.id}` : "";

  const [msgs, setMsgs] = useState<Msg[]>(() => readHistory(storeKey));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [greeted, setGreeted] = useState(false);
  const sessionRef = useRef("");
  if (!sessionRef.current) sessionRef.current = makeId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const owner = session?.id || "";

  useEffect(() => {
    setAiScope(owner ? { owner, role: gRole } : null);
    return () => setAiScope(null);
  }, [owner, gRole]);

  useEffect(() => {
    setPanelEngaged(open);
    return () => setPanelEngaged(false);
  }, [open]);

  useEffect(() => {
    if (!open || !owner || instructorMode() === "v20") return;
    ensureInstructorContract(gRole).catch(() => undefined);
  }, [open, owner, gRole]);

  const page = useMemo(() => pageFor(pathname, gRole), [pathname, gRole]);

  useEffect(() => {
    if (!storeKey) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(msgs.slice(-HISTORY)));
    } catch {
      return;
    }
  }, [msgs, storeKey]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, open]);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    if (tourActive()) stopTour();
    RobotEvents.emit("greet");
    const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 120);
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".amodal")) closeRef.current();
    };
    document.addEventListener("keydown", h);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("keydown", h);
    };
  }, [open]);

  const captionFor = useCallback(
    (target: string) => {
      const key = stepTextKey(target, gRole, pathname);
      return key && tg.has(key) ? tg(key) : "";
    },
    [gRole, pathname, tg],
  );

  const pageTour = useCallback(
    (route: string, fallbackCaption: string): GuideTour => {
      const target = pageFor(route, gRole);
      const steps = target?.tour.length
        ? target.tour.map((s) => ({ target: s.target, caption: tg.has(s.text) ? tg(s.text) : fallbackCaption, focus: true }))
        : [{ target: "ai-help:current-page", caption: fallbackCaption, focus: true }];
      return { id: newTourId(), source: "page", navigate: route, steps };
    },
    [gRole, tg],
  );

  const runTour = useCallback((tour: GuideTour) => {
    closeRef.current();
    window.setTimeout(() => startTour(tour), 60);
  }, []);

  const scopeNow = (): AiScope => ({ owner, role: gRole });

  const pageDescription = () => {
    const first = page?.tour[0];
    return first && first.target === "ai-help:current-page" && tg.has(first.text) ? tg(first.text) : "";
  };

  const v21History = () => {
    const turns: { q: string; a: string }[] = [];
    let asked = "";
    for (const m of msgs) {
      if (m.kind === "me") asked = m.text;
      else if (m.kind === "guide" || m.kind === "v21") turns.push({ q: asked, a: m.text });
      else if (m.kind === "ai") turns.push({ q: asked, a: m.ans.answer });
    }
    return instructorHistory(turns);
  };

  const runCtx = (sid: string, contract: InstructorContract | null, message: string, answer: string, source: "http" | "ws"): RunCtx => ({
    scope: scopeNow(),
    sessionId: sid,
    role: gRole,
    contract,
    message,
    answer,
    source,
    captionFor,
    closePanel: () => closeRef.current(),
    handoffUi: gRole !== "staff",
    labels: {
      ticketCreated: (id: string) => t("ticketCreated", { id }),
      ticketCreatedPlain: t("ticketCreatedPlain"),
      ticketShown: t("ticketShown"),
      ticketWrite: t("ticketWrite"),
    },
  });

  const instructorV21Reply = async (message: string): Promise<V21Outcome> => {
    const mode = instructorMode();
    if (mode === "v20" || !owner) return { kind: "fallback" };
    const contract = await ensureInstructorContract(gRole);
    if (!contract) return mode === "v21" ? { kind: "unavailable" } : { kind: "fallback" };
    const scope = scopeNow();
    let sid = aiSessionId(scope);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const snapshot = buildAiSnapshot({ role: contract.role || gRole, description: pageDescription() });
        const res = await instructorChat({ ...(sid ? { session_id: sid } : {}), locale, message, ...snapshot, history: v21History() });
        if (res.sessionId) setAiSessionId(scope, res.sessionId);
        noteChatActivity();
        return { kind: "ok", res, contract };
      } catch (e) {
        if (isAborted(e)) throw e;
        if (attempt === 0 && sid && isUnknownSession(e)) {
          resetAiSession(scope);
          sid = "";
          continue;
        }
        if (noteInstructorV21Missing(e, gRole)) return mode === "v21" ? { kind: "unavailable" } : { kind: "fallback" };
        throw e;
      }
    }
    return { kind: "fallback" };
  };

  const startV21 = (res: AiChatResponse, contract: InstructorContract | null, question: string, source: "http" | "ws") => {
    const cmds = normCommands(res.rawCommands, res.responseId || makeId());
    if (res.responseId) markAiSeen(`response:${res.responseId}`);
    const sid = res.sessionId || aiSessionId(scopeNow());
    setMsgs((m) => [...m, { kind: "v21", id: makeId(), text: res.answer, intent: res.intent, cmds, question, sid }]);
    if (!cmds.length || (source === "ws" && commandsRunning())) return;
    void runCommands(cmds, runCtx(sid, contract, question, res.answer, source)).then((sum) => {
      if (sum.missing || sum.failed) openInstructor();
    });
  };

  const replayV21 = (m: V21Msg) => {
    void replayCommands(m.cmds, runCtx(m.sid, cachedInstructorContract(gRole), m.question, m.text, "http"));
  };

  const supportV21 = (m: V21Msg, base: AiCommand) => {
    void runCommands([supportCommand(base, m.question)], runCtx(m.sid || aiSessionId(scopeNow()), cachedInstructorContract(gRole), m.question, m.text, "http"));
  };

  const newChat = () => {
    abortCommands("reset");
    resetAiSession(scopeNow());
    setMsgs([]);
  };

  const runPageTour = () => {
    const fallback = tg("ui.pageFallback");
    if (page?.tour.length) {
      runTour({ ...pageTour(pathname, fallback), navigate: undefined });
      return;
    }
    const content = collectTargets(80)
      .filter((x) => !/^(nav|header|ai-help):/.test(x.id))
      .slice(0, 4)
      .map((x) => ({ target: x.id, caption: x.label ? tg("caption.generic", { label: x.label }) : fallback, focus: true }));
    runTour({ id: newTourId(), source: "page", steps: [{ target: "ai-help:current-page", caption: fallback, focus: true }, ...content] });
  };

  const buildRequest = (message: string): InstructorRequest => {
    const seen = collectTargets(200);
    const here = instructorPath(pathname, gRole);
    const { targets, visible } = instructorTargets(seen, registryTargets(gRole, pathname), pathname, gRole, (r) => (tg.has(r.text) ? tg(r.text) : ""));
    const turns: { q: string; a: string }[] = [];
    let asked = "";
    for (const m of msgs) {
      if (m.kind === "me") asked = m.text;
      else if (m.kind === "guide") turns.push({ q: asked, a: m.text });
      else if (m.kind === "ai") turns.push({ q: asked, a: m.ans.answer });
    }
    return {
      contract_version: INSTRUCTOR_CONTRACT,
      message,
      current_path: here,
      visible_targets: visible,
      locale,
      session_id: sessionRef.current,
      page: { path: here, title: headerTitle(), id: page?.id || aiPageIdFor(pathname), portal: gRole },
      targets,
      state: instructorState(collectState(), seen),
      history: instructorHistory(turns),
    };
  };

  const instructorReply = async (message: string): Promise<InstructorReply | null> => {
    if (featureMissing("instructor")) return null;
    try {
      return await askInstructor(buildRequest(message));
    } catch (e) {
      if (isAborted(e)) throw e;
      logApiError("ai instructor", e);
      return null;
    }
  };

  const send = async (raw?: string) => {
    const message = (raw ?? text).trim();
    if (!message || busy) return;
    setMsgs((m) => [...m, { kind: "me", id: makeId(), text: message }]);
    setText("");
    setBusy(true);
    RobotEvents.emit("think");
    try {
      const v21 = await instructorV21Reply(message);
      if (v21.kind === "unavailable") {
        setMsgs((m) => [...m, { kind: "err", id: makeId(), text: t("v21.errors.unavailable") }]);
        RobotEvents.emit("reactError");
        return;
      }
      if (v21.kind === "ok" && (v21.res.answer || v21.res.rawCommands.length)) {
        setBusy(false);
        RobotEvents.emit("idle");
        startV21(v21.res, v21.contract, message, "http");
        return;
      }
      const reply = v21.kind === "ok" ? null : await instructorReply(message);
      const guided = reply ? replyHasGuide(reply, gRole, pathname) : false;
      if (reply && !replyNeedsAssistant(reply, guided)) {
        const tour = guided ? tourFromReply(reply, gRole, captionFor, pathname) : null;
        const support = replyOffersSupport(reply, gRole, Boolean(tour));
        setMsgs((m) => [
          ...m,
          { kind: "guide", id: makeId(), text: reply.reply, intent: reply.intent, tour, support, checklist: reply.checklist, needs: reply.missingRequirements },
        ]);
        setBusy(false);
        if (tour && !support && !reply.checklist.length && !reply.missingRequirements.length) runTour(tour);
        else RobotEvents.emit("idle");
        return;
      }
      const ans = await aiAssistantAsk({
        message,
        sessionId: sessionRef.current,
        requestId: makeId(),
        page: { route: pathname, pageId: aiPageIdFor(pathname), title: headerTitle() || (typeof document !== "undefined" ? document.title : "") },
        locale,
      });
      const route = ans.navigation ? aiRouteFor(ans.navigation.pageId, ans.navigation.route, role) : "";
      const tour = route ? pageTour(route, ans.navigation?.title || ans.highlight || ans.answer.slice(0, 140)) : null;
      setMsgs((m) => [...m, { kind: "ai", id: ans.requestId || makeId(), ans, tour, rated: 0 }]);
      RobotEvents.emit("idle");
    } catch (e) {
      if (isAborted(e)) return;
      logApiError("ai instructor", e);
      setMsgs((m) => [...m, { kind: "err", id: makeId(), text: errDetail(e) || t("failed") }]);
      RobotEvents.emit("reactError");
    } finally {
      setBusy(false);
    }
  };

  const openRef = useRef(onOpen);
  const sendRef = useRef(send);
  const realtimeRef = useRef<(ev: AiRealtimeEvent) => void>(() => undefined);
  useEffect(() => {
    openRef.current = onOpen;
    sendRef.current = send;
    realtimeRef.current = (ev) => {
      if (ev.kind !== "response" || busy) return;
      const res = normInstructorChat(ev.data, ev.sessionId);
      if (!res.answer && !res.rawCommands.length) return;
      let question = "";
      for (const m of msgs) if (m.kind === "me") question = m.text;
      startV21(res, cachedInstructorContract(gRole), question, "ws");
    };
  });

  useEffect(() => onAiRealtime((ev) => realtimeRef.current(ev)), []);

  useEffect(
    () =>
      onInstructorOpen((d) => {
        openRef.current();
        const preset = (d.text || "").trim().slice(0, MAX);
        if (!preset) return;
        if (d.send) window.setTimeout(() => void sendRef.current(preset), 80);
        else setText(preset);
      }),
    [],
  );

  const rate = async (id: string, value: number) => {
    setMsgs((m) => m.map((x) => (x.kind === "ai" && x.id === id ? { ...x, rated: value } : x)));
    try {
      await aiFeedback(id, value, { useful: value >= 4 });
    } catch {
      return;
    }
  };

  const openHandoff = (question: string) => {
    const key = makeId();
    setConfirm({ key, message: question, busy: false, error: "", note: "", v2: false });
    previewSupportHandoff().then(
      (p) => {
        const note = localizeApiDetail(p.message);
        const shown = locale === "uz" || note !== p.message ? note : "";
        setConfirm((c) => (c && c.key === key ? { ...c, note: shown, v2: p.v2 } : c));
      },
      (e: unknown) => {
        if (!isAborted(e)) logApiError("ai instructor preview", e);
      },
    );
  };

  const doConfirm = async () => {
    if (!confirm || confirm.busy) return;
    const cur = confirm;
    setConfirm((c) => (c && c.key === cur.key ? { ...c, busy: true, error: "" } : c));
    const message = cur.message.trim();
    const category = supportCategoryFor(pathname, message);
    try {
      const viaBackend = cur.v2
        ? await confirmSupportHandoff({ message, category, priority: "normal" }).catch((e: unknown) => {
            if (confirmUnsupported(e)) return null;
            throw e;
          })
        : null;
      const tk = viaBackend
        ? viaBackend.ticket
        : await createSupportTicket({ message, category, priority: "normal", source: "ai_platform_instructor", context: { current_path: pathname } });
      setConfirm(null);
      toast(tk?.workId ? t("ticketCreated", { id: tk.workId }) : t("ticketCreatedPlain"), { tone: "ok" });
      runTour({
        id: newTourId(),
        source: "local",
        navigate: `/portal/${gRole}/support${tk?.id ? `?ticket=${encodeURIComponent(tk.id)}` : ""}`,
        steps: [
          { target: "support:chat", caption: t("ticketShown"), focus: false },
          { target: "support:message-input", caption: t("ticketWrite"), focus: true },
        ],
      });
    } catch (e) {
      setConfirm((c) => (c && c.key === cur.key ? { ...c, busy: false, error: errorText(e, tc) } : c));
    }
  };

  const lastQuestion = (id: string) => {
    const i = msgs.findIndex((m) => m.id === id);
    for (let k = i - 1; k >= 0; k--) {
      const m = msgs[k];
      if (m.kind === "me") return m.text;
    }
    return "";
  };

  const confirmModal = (
    <Modal open={!!confirm} onClose={() => setConfirm(null)} title={t("confirmTitle")}>
      <div className="aiconfirm">
        <span className="aiconfirm__ic" aria-hidden="true">
          <IconHeadset />
        </span>
        <p>{t("confirmText")}</p>
        {confirm?.note ? <p className="aiconfirm__note">{confirm.note}</p> : null}
        {confirm?.message ? <blockquote className="aiconfirm__q">{confirm.message}</blockquote> : null}
        {confirm?.error ? (
          <p className="aiconfirm__err" role="alert">
            {confirm.error}
          </p>
        ) : null}
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

  const pageTitle = open ? headerTitle() : "";

  return (
    <>
      {confirmModal}
      {!open ? (
        launcher === "none" ? null : (
        <button
          type="button"
          className={`ains__launch${launcher === "always" ? " ains__launch--always" : ""}`}
          onClick={onOpen}
          aria-label={t("open")}
          data-ai-id="dashboard.ai-instructor.open"
          data-ai-type="button"
        >
          <RobotAvatar size={34} mood="idle" />
          <span>{t("title")}</span>
        </button>
        )
      ) : (
        <div className="ains" role="dialog" aria-label={t("title")} data-ai-ignore="">
          <div className="ains__h">
            <RobotAvatar size={44} mood={busy ? "think" : "idle"} className="ains__av" />
            <div className="ains__id">
              <b>{t("title")}</b>
              <span>
                <i className="ains__dot" aria-hidden="true" />
                {t("online")} · {t("subtitle")}
              </span>
            </div>
            {msgs.length ? (
              <button type="button" className="ains__icon" onClick={newChat} aria-label={t("newChat")} title={t("newChat")}>
                <IconRefresh />
              </button>
            ) : null}
            <button type="button" className="ains__icon" onClick={onClose} aria-label={t("close")}>
              <IconClose />
            </button>
          </div>

          {pageTitle ? (
            <div className="ains__page">
              <IconMapPin />
              <span>{t("youAreOn", { page: pageTitle })}</span>
              {msgs.length ? (
                <button type="button" onClick={runPageTour}>
                  <IconSparkle />
                  {t("pageTourShort")}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="ains__body" ref={listRef}>
            {!msgs.length ? (
              <div className="ains__intro">
                <p className="ains__greet">
                  {greeted ? (
                    t("greet")
                  ) : (
                    <>
                      <Typewriter text={t("greet")} locale={locale} onDone={() => setGreeted(true)} />
                      <span className="sr-only">{t("greet")}</span>
                    </>
                  )}
                </p>
                <ul className="ains__caps">
                  {(["capShow", "capGo", "capExplain", "capOperator"] as const).map((k, i) => (
                    <li key={k} style={{ animationDelay: `${0.15 + i * 0.07}s` }}>
                      {k === "capShow" ? <IconTarget /> : k === "capGo" ? <IconArrowRight /> : k === "capExplain" ? <IconInfo /> : <IconHeadset />}
                      <span>{t(k)}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="ains__tour" onClick={runPageTour}>
                  <IconSparkle />
                  <span>
                    <b>{t("pageTour")}</b>
                    <small>{t("pageTourSub")}</small>
                  </span>
                  <IconArrowRight />
                </button>
              </div>
            ) : null}

            {msgs.map((m) => {
              if (m.kind === "me") return <p className="ains__me" key={m.id}>{m.text}</p>;
              if (m.kind === "err") return <p className="ains__err" key={m.id} role="status">{m.text}</p>;
              if (m.kind === "v21") {
                const cmds = Array.isArray(m.cmds) ? m.cmds : [];
                const steps = cmds.filter((c) => c.type === "show_steps").flatMap((c) => (Array.isArray(c.steps) ? c.steps : []));
                const stepTour = steps.some((s) => s.target);
                const handoff = gRole === "staff" ? undefined : cmds.find((c) => c.type === "support_handoff");
                const replay = cmds.some((c) => VISUAL.has(c.type));
                const intent = String(m.intent || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
                return (
                  <div className={`ains__ai ains__ai--guide${intent ? ` ains__ai--${intent}` : ""}`} key={m.id} data-intent={intent || undefined}>
                    <p className="ains__text">{m.text || t("done")}</p>
                    {steps.length ? (
                      <div className="ains__steps">
                        <p className="ains__stepsT" id={`ains-steps-${m.id}`}>
                          {t("stepsTitle")}
                        </p>
                        <ol className="ains__list" role="list" aria-labelledby={`ains-steps-${m.id}`}>
                          {steps.map((s, i) => (
                            <li key={`${i}-${s.text}`}>
                              <span className="ains__num">{i + 1}</span>
                              <span>{s.text}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    <AiCommandStatus commands={cmds} />
                    {replay || stepTour || handoff ? (
                      <div className="ains__acts">
                        {replay ? (
                          <button type="button" className="btn btn--pri btn--sm" onClick={() => replayV21({ ...m, cmds })}>
                            <IconTarget />
                            {t("showMe")}
                          </button>
                        ) : null}
                        {stepTour ? (
                          <button
                            type="button"
                            className={`btn ${replay ? "btn--line" : "btn--pri"} btn--sm`}
                            onClick={() => {
                              const tour = tourFromSteps(steps);
                              if (tour) runTour(tour);
                            }}
                          >
                            <IconSparkle />
                            {t("showMe")}
                          </button>
                        ) : null}
                        {handoff ? (
                          <button type="button" className={`btn ${replay || stepTour ? "btn--line" : "btn--pri"} btn--sm`} onClick={() => supportV21(m, handoff)}>
                            <IconHeadset />
                            {t("toOperator")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              }
              if (m.kind === "guide") {
                const tour = m.tour;
                const checklist = m.checklist ?? [];
                const needs = m.needs ?? [];
                return (
                  <div className="ains__ai ains__ai--guide" key={m.id}>
                    <p className="ains__text">{m.text || t("done")}</p>
                    {checklist.length ? (
                      <div className="ains__steps">
                        <p className="ains__stepsT" id={`ains-steps-${m.id}`}>
                          {t("stepsTitle")}
                        </p>
                        <ol className="ains__list" role="list" aria-labelledby={`ains-steps-${m.id}`}>
                          {checklist.map((s, i) => (
                            <li key={`${i}-${s}`}>
                              <span className="ains__num">{i + 1}</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {needs.length ? (
                      <div className="ains__needs">
                        <p id={`ains-needs-${m.id}`}>{t("needsTitle")}</p>
                        <ul aria-labelledby={`ains-needs-${m.id}`}>
                          {needs.map((s, i) => (
                            <li key={`${i}-${s}`}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {tour || m.support ? (
                      <div className="ains__acts">
                        {tour ? (
                          <button type="button" className="btn btn--pri btn--sm" onClick={() => runTour({ ...tour, id: newTourId() })}>
                            <IconTarget />
                            {t("showMe")}
                          </button>
                        ) : null}
                        {m.support ? (
                          <button type="button" className={`btn ${tour ? "btn--line" : "btn--pri"} btn--sm`} onClick={() => openHandoff(lastQuestion(m.id))}>
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
              return (
                <div className={`ains__ai ains__ai--${a.intent}`} key={m.id}>
                  {a.highlight ? <p className="ains__hl">{a.highlight}</p> : null}
                  <p className="ains__text">{a.answer}</p>
                  {m.tour ? (
                    <div className="ains__acts">
                      <button type="button" className="btn btn--pri btn--sm" onClick={() => m.tour && runTour({ ...m.tour, id: newTourId() })}>
                        <IconTarget />
                        {t("showMe")}
                      </button>
                    </div>
                  ) : null}
                  <div className="ains__rate">
                    {m.rated ? (
                      <span className="ains__rated">
                        <IconCheck />
                        {t("thanks")}
                      </span>
                    ) : (
                      <>
                        <span>{t("useful")}</span>
                        <button type="button" onClick={() => void rate(m.id, 5)}>
                          {t("yes")}
                        </button>
                        <button type="button" onClick={() => void rate(m.id, 2)}>
                          {t("no")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {busy ? (
              <p className="ains__wait" role="status">
                <span className="ains__dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {t("thinking")}
              </p>
            ) : null}
          </div>

          <form
            className="ains__f"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("ph")}
              aria-label={t("ph")}
              maxLength={MAX}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !text.trim()} aria-label={t("send")}>
              <IconSend />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
