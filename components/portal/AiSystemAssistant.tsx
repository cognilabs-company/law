"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
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
import {
  abortCommands,
  canReplay,
  commandsKnown,
  commandsRunning,
  hasStepTour,
  normCommand,
  normCommands,
  replayCommands,
  runCommands,
  supportCommand,
  tourFromSteps,
  type RunCtx,
} from "@/lib/ai/commands";
import { buildAiSnapshot } from "@/lib/ai/manifest";
import { crossPageTargets } from "@/lib/ai/destinations";
import { selfHelpAsked } from "@/lib/ai/self";
import { noteChatActivity, setPanelEngaged } from "@/lib/ai/runtime";
import { aiSessionId, resetAiSession, setAiScope, setAiSessionId, type AiScope } from "@/lib/ai/session";
import { aiResponseKey, markAiSeen, onAiRealtime, type AiRealtimeEvent } from "@/lib/ai/realtime";
import type { AiChatResponse, AiCommand, AiSupportFallback, InstructorContract } from "@/lib/ai/types";
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
import { RobotEvents } from "@/components/lexgo/robot/RobotEvents";
import {
  IconAlert,
  IconBell,
  IconBolt,
  IconBriefcase,
  IconCalendar,
  IconCard,
  IconChartBar,
  IconChat,
  IconCheck,
  IconChevronRight,
  IconClipboardList,
  IconClose,
  IconFileText,
  IconFlag,
  IconGem,
  IconGift,
  IconGraduation,
  IconHeadset,
  IconHelpCircle,
  IconMegaphone,
  IconPackage,
  IconPhone,
  IconRefresh,
  IconScale,
  IconSend,
  IconShieldCheck,
  IconSparkle,
  IconStarRate,
  IconTarget,
  IconUsers,
  IconVideo,
} from "@/components/icons";

const MAX = 1000;
const HISTORY = 30;

type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

const SVG_BASE = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const IconCompass = (p: SVGProps<SVGSVGElement>) => (
  <svg {...SVG_BASE} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1z" />
  </svg>
);

const IconChatPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...SVG_BASE} {...p}>
    <path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z" />
    <path d="M12 8.5v6M9 11.5h6" />
  </svg>
);

const ROLE_SUGGEST: Record<GuideRole, string[]> = {
  client: ["suggest.client.plan", "suggest.client.lawyer", "suggest.client.document", "suggest.client.operator"],
  lawyer: ["suggest.seller.works", "suggest.seller.orders", "suggest.seller.profile"],
  advocate: ["suggest.seller.works", "suggest.seller.orders", "suggest.seller.profile"],
  staff: ["suggest.staff.queue", "suggest.staff.urgent"],
};

type SuggestGlyph =
  | "bolt"
  | "flag"
  | "star"
  | "chart"
  | "megaphone"
  | "bell"
  | "gem"
  | "package"
  | "gift"
  | "phone"
  | "video"
  | "spark"
  | "chat"
  | "headset"
  | "card"
  | "shield"
  | "academy"
  | "calendar"
  | "users"
  | "file"
  | "scale"
  | "case"
  | "help";

const SUGGEST_GLYPHS: Record<SuggestGlyph, Glyph> = {
  bolt: IconBolt,
  flag: IconFlag,
  star: IconStarRate,
  chart: IconChartBar,
  megaphone: IconMegaphone,
  bell: IconBell,
  gem: IconGem,
  package: IconPackage,
  gift: IconGift,
  phone: IconPhone,
  video: IconVideo,
  spark: IconSparkle,
  chat: IconChat,
  headset: IconHeadset,
  card: IconCard,
  shield: IconShieldCheck,
  academy: IconGraduation,
  calendar: IconCalendar,
  users: IconUsers,
  file: IconFileText,
  scale: IconScale,
  case: IconBriefcase,
  help: IconHelpCircle,
};

const SUGGEST_RULES: [RegExp, SuggestGlyph][] = [
  [/urgent|sos/, "bolt"],
  [/complaint|unhappy/, "flag"],
  [/review/, "star"],
  [/stats|metrics|channel|ltv|revenue|topoperator|missedcalls|atrisk|paidtoday|workload/, "chart"],
  [/promotion|^adadd$|^adstop$/, "megaphone"],
  [/notif|readall/, "bell"],
  [/plan/, "gem"],
  [/package/, "package"],
  [/gift|referral/, "gift"],
  [/calllog/, "phone"],
  [/meeting/, "video"],
  [/^ai|caseai|intake|chronology/, "spark"],
  [/chat|message/, "chat"],
  [/operator|queue|reply/, "headset"],
  [/pay|refund|receipt|fee|invoice|price|safedeal/, "card"],
  [/identity|twofactor|telegram|verify|profile|consent|role|audit|policy|terms|otp|sms|conflict/, "shield"],
  [/academy/, "academy"],
  [/deadline|hearing|holiday|vacation/, "calendar"],
  [/^org|member|client|b2b|lead/, "users"],
  [/doc|template|folder|file|upload|claimrequest|legalaid/, "file"],
  [/lawyer|match|sellerapprove/, "scale"],
  [/order|work|case|task|service/, "case"],
];

function suggestGlyph(key: string): SuggestGlyph {
  const [group = "", name = ""] = key.replace(/^suggest\./, "").toLowerCase().split(".");
  if (group === "complaints") return "flag";
  for (const [re, glyph] of SUGGEST_RULES) if (re.test(name)) return glyph;
  return "help";
}

function AiWho({ label }: { label: string }) {
  return (
    <p className="ains__who">
      <RobotAvatar size={20} mood="idle" />
      <span>{label}</span>
    </p>
  );
}

function StepList({ id, title, steps, action }: { id: string; title: string; steps: string[]; action?: ReactNode }) {
  const total = steps.length;
  return (
    <div className="ains__steps">
      <div className="ains__stepsH">
        <p className="ains__stepsT" id={id}>
          {title}
        </p>
        {action}
      </div>
      <ol className="ains__list" role="list" aria-labelledby={id}>
        {steps.map((s, i) => (
          <li key={`${i}-${s}`}>
            <span className="ains__num" aria-hidden="true">
              {i + 1}/{total}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NeedList({ id, title, items }: { id: string; title: string; items: string[] }) {
  return (
    <div className="ains__needs">
      <p id={id}>
        <IconClipboardList aria-hidden="true" />
        {title}
      </p>
      <ul aria-labelledby={id}>
        {items.map((s, i) => (
          <li key={`${i}-${s}`}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

type GuideMsg = { kind: "guide"; id: string; text: string; intent: string; tour: GuideTour | null; support: boolean; checklist?: string[]; needs?: string[] };
type V21Msg = {
  kind: "v21";
  id: string;
  text: string;
  intent: string;
  cmds: AiCommand[];
  question: string;
  sid: string;
  steps?: string[];
  needs?: string[];
  fallback?: AiSupportFallback | null;
  offerSupport?: boolean;
};
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
  const tp = useTranslations("portal.aiAssistant.panel");
  const tg = useTranslations("guide");
  const tc = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname() || "/";
  const { session } = useAuth();
  const gRole: GuideRole = guideRole ?? role;
  const storeKey = session?.id ? `lexgo_ains_${session.id}` : "";
  const uid = useId().replace(/:/g, "");

  const [msgs, setMsgs] = useState<Msg[]>(() => readHistory(storeKey));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const sessionRef = useRef("");
  if (!sessionRef.current) sessionRef.current = makeId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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

  const suggestions = useMemo(() => {
    const out: { key: string; text: string; glyph: SuggestGlyph }[] = [];
    for (const key of [...(page?.suggestions ?? []), ...ROLE_SUGGEST[gRole]]) {
      if (out.length >= 4) break;
      if (out.some((s) => s.key === key) || !tg.has(key)) continue;
      out.push({ key, text: tg(key), glyph: suggestGlyph(key) });
    }
    return out;
  }, [page, gRole, tg]);

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
    const id = window.setTimeout(() => {
      const wide = window.matchMedia("(min-width: 901px)").matches;
      (wide ? inputRef.current : panelRef.current)?.focus({ preventScroll: true });
    }, 120);
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
      actionDone: (action: string, workId: string) => {
        const text = t.has(`v21.done.${action}`) ? t(`v21.done.${action}`) : t("v21.done.generic");
        return workId ? `${text} · ${workId}` : text;
      },
    },
  });

  const declaredTargets = (contract: InstructorContract, visible: string[], selfHelp: boolean) =>
    crossPageTargets({
      role: gRole,
      path: pathname,
      allowed: contract.allowedRoutes,
      exclude: visible,
      selfHelp,
      labels: {
        dest: (key) => (t.has(`v21.targets.${key}`) ? t(`v21.targets.${key}`) : ""),
        tour: (key) => (tg.has(key) ? tg(key) : ""),
      },
    });

  const instructorV21Reply = async (message: string): Promise<V21Outcome> => {
    const mode = instructorMode();
    if (mode === "v20" || !owner) return { kind: "fallback" };
    const contract = await ensureInstructorContract(gRole);
    if (!contract) return mode === "v21" ? { kind: "unavailable" } : { kind: "fallback" };
    const scope = scopeNow();
    const selfHelp = selfHelpAsked(message);
    let sid = aiSessionId(scope);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const snapshot = buildAiSnapshot({ role: contract.role || gRole, description: pageDescription(), selfHelp });
        const targets = declaredTargets(contract, snapshot.runtime_state.visible_ai_ids, selfHelp);
        const res = await instructorChat({ ...(sid ? { session_id: sid } : {}), locale, message, ...snapshot, targets, history: v21History() });
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
    markAiSeen(aiResponseKey(res.responseId, res.rawCommands, res.answer));
    const sid = res.sessionId || aiSessionId(scopeNow());
    const guiding = cmds.some((c) => VISUAL.has(c.type) || c.type === "preview_action" || c.type === "confirm_required");
    const fallback = res.supportFallback;
    const offerSupport = gRole !== "staff" && (res.intent === "support_guidance" || (Boolean(fallback?.available) && !guiding && !res.steps.length));
    setMsgs((m) => [
      ...m,
      { kind: "v21", id: makeId(), text: res.answer, intent: res.intent, cmds, question, sid, steps: res.steps, needs: res.missingRequirements, fallback, offerSupport },
    ]);
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
    const { targets, visible } = instructorTargets(seen, registryTargets(gRole, pathname), pathname, gRole, (r) => (tg.has(r.text) ? tg(r.text) : ""), message, t("v21.targets.launcher"));
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

  const wsStash = useRef<{ res: AiChatResponse; at: number } | null>(null);

  const takeStash = () => {
    const v = wsStash.current;
    wsStash.current = null;
    return v;
  };

  const send = async (raw?: string) => {
    const message = (raw ?? text).trim();
    if (!message || busy) return;
    const sentAt = Date.now();
    takeStash();
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
        const tour = guided ? tourFromReply(reply, gRole, captionFor, pathname, message) : null;
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
      const late = takeStash();
      if (late && late.at >= sentAt) {
        RobotEvents.emit("idle");
        startV21(late.res, cachedInstructorContract(gRole), message, "ws");
        return;
      }
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
      if (ev.kind !== "response") return;
      const res = normInstructorChat(ev.data, ev.sessionId);
      if (!res.answer && !res.rawCommands.length) return;
      if (busy) {
        wsStash.current = { res, at: Date.now() };
        return;
      }
      if (commandsKnown(res.rawCommands)) return;
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
      <div className="aiconfirm" data-ai-ignore="" aria-busy={confirm?.busy || undefined}>
        <div className="aiconfirm__top">
          <span className="aiconfirm__ic" aria-hidden="true">
            <IconHeadset />
          </span>
          <p className="aiconfirm__what">{t("confirmText")}</p>
        </div>
        {confirm?.message ? <blockquote className="aiconfirm__q">{confirm.message}</blockquote> : null}
        {confirm?.note ? <p className="aiconfirm__note">{confirm.note}</p> : null}
        {confirm?.error ? (
          <p className="aiconfirm__err" role="alert">
            <IconAlert aria-hidden="true" />
            <span>{confirm.error}</span>
          </p>
        ) : null}
        <div className="aiconfirm__acts">
          <button type="button" className="btn btn--line" onClick={() => setConfirm(null)} disabled={confirm?.busy}>
            {t("confirmNo")}
          </button>
          <button type="button" className="btn btn--pri" onClick={() => void doConfirm()} disabled={confirm?.busy} aria-busy={confirm?.busy || undefined}>
            {confirm?.busy ? <span className="aiconfirm__spin" aria-hidden="true" /> : <IconHeadset aria-hidden="true" />}
            {confirm?.busy ? t("v21.confirm.busy") : t("confirmYes")}
          </button>
        </div>
      </div>
    </Modal>
  );

  const supportHref = gRole === "staff" ? "" : `/portal/${gRole}/support`;
  const lastId = msgs.length ? msgs[msgs.length - 1].id : "";

  return (
    <>
      {confirmModal}
      {!open ? (
        launcher === "none" ? null : (
          <button
            type="button"
            className={`ains__launch${launcher === "always" ? " ains__launch--always" : ""}`}
            onClick={onOpen}
            aria-label={tp("open")}
            title={tp("fullName")}
            data-ai-id="dashboard.ai-instructor.open"
            data-ai-type="button"
          >
            <RobotAvatar size={34} mood="idle" />
            <span className="ains__launchT">{tp("fullName")}</span>
          </button>
        )
      ) : (
        <div className="ains" role="dialog" aria-label={tp("fullName")} data-ai-ignore="" ref={panelRef} tabIndex={-1}>
          <div className="ains__h">
            <RobotAvatar size={38} mood={busy ? "think" : "idle"} className="ains__av" />
            <div className="ains__id">
              <b>
                {tp("name")}
                <span className="ains__badge">{tp("badge")}</span>
              </b>
              <span>
                <i className="ains__dot" aria-hidden="true" />
                {tp("tagline")}
              </span>
            </div>
            {msgs.length ? (
              <button type="button" className="ains__icon" onClick={newChat} aria-label={t("newChat")} title={t("newChat")}>
                <IconChatPlus aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" className="ains__icon" onClick={onClose} aria-label={t("close")} title={t("close")}>
              <IconClose aria-hidden="true" />
            </button>
          </div>

          <div className="ains__body" ref={listRef}>
            {!msgs.length ? (
              <div className="ains__intro">
                <p className="ains__hello">{tp("hello")}</p>
                <p className="ains__lead">{tp("lead")}</p>
                {gRole === "client" ? (
                  <p className="ains__advice">
                    <IconScale aria-hidden="true" />
                    <span>{tp("noAdvice")}</span>
                  </p>
                ) : null}
                {suggestions.length ? (
                  <div className="ains__sugg" role="group" aria-labelledby={`${uid}-try`}>
                    <p className="ains__suggT" id={`${uid}-try`}>
                      {tp("try")}
                    </p>
                    {suggestions.map((s) => {
                      const Icon = SUGGEST_GLYPHS[s.glyph];
                      return (
                        <button key={s.key} type="button" className="ains__q" onClick={() => void send(s.text)} disabled={busy}>
                          <span className="ains__qi" aria-hidden="true">
                            <Icon />
                          </span>
                          <span className="ains__qt">{s.text}</span>
                          <IconChevronRight className="ains__qa" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <button type="button" className="ains__tour" onClick={runPageTour}>
                  <IconCompass aria-hidden="true" />
                  <span>{tp("tour")}</span>
                </button>
              </div>
            ) : null}

            {msgs.map((m) => {
              if (m.kind === "me") return <p className="ains__me" key={m.id}>{m.text}</p>;
              if (m.kind === "err") {
                const again = m.id === lastId && !busy ? lastQuestion(m.id) : "";
                return (
                  <div className="ains__err" key={m.id} role="status">
                    <IconAlert aria-hidden="true" />
                    <span>{m.text}</span>
                    {again ? (
                      <button type="button" onClick={() => void send(again)}>
                        <IconRefresh aria-hidden="true" />
                        {tp("retry")}
                      </button>
                    ) : null}
                  </div>
                );
              }
              if (m.kind === "v21") {
                const cmds = Array.isArray(m.cmds) ? m.cmds : [];
                const steps = cmds.filter((c) => c.type === "show_steps").flatMap((c) => (Array.isArray(c.steps) ? c.steps : []));
                const stepTexts = steps.length ? steps.map((s) => s.text).filter(Boolean) : Array.isArray(m.steps) ? m.steps : [];
                const needs = Array.isArray(m.needs) ? m.needs : [];
                const stepTour = hasStepTour(steps, m.question);
                const fallbackHandoff = m.offerSupport ? normCommand({ id: `${m.id}:support`, type: "support_handoff", text: m.fallback?.reason ?? "" }, 0, m.id) : null;
                const handoff = gRole === "staff" ? undefined : (cmds.find((c) => c.type === "support_handoff") ?? fallbackHandoff ?? undefined);
                const replay = canReplay(cmds, gRole, m.question);
                const intent = String(m.intent || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
                const walk = stepTour
                  ? () => {
                      const tour = tourFromSteps(steps, m.question);
                      if (tour) runTour(tour);
                    }
                  : null;
                const show = replay ? () => replayV21({ ...m, cmds }) : walk;
                return (
                  <div className={`ains__ai ains__ai--guide${intent ? ` ains__ai--${intent}` : ""}`} key={m.id} data-intent={intent || undefined}>
                    <AiWho label={tp("aiLabel")} />
                    <p className="ains__text">{m.text || t("done")}</p>
                    {stepTexts.length ? (
                      <StepList
                        id={`ains-steps-${m.id}`}
                        title={t("stepsTitle")}
                        steps={stepTexts}
                        action={
                          replay && walk ? (
                            <button type="button" className="ains__walk" onClick={walk}>
                              <IconSparkle aria-hidden="true" />
                              {tp("walk")}
                            </button>
                          ) : null
                        }
                      />
                    ) : null}
                    {needs.length ? <NeedList id={`ains-needs-${m.id}`} title={t("needsTitle")} items={needs} /> : null}
                    <AiCommandStatus commands={cmds} />
                    {show || handoff ? (
                      <div className="ains__acts">
                        {show ? (
                          <button type="button" className="btn btn--pri btn--sm" onClick={show}>
                            <IconTarget aria-hidden="true" />
                            {tp("show")}
                          </button>
                        ) : null}
                        {handoff ? (
                          <button type="button" className={`btn ${show ? "btn--line" : "btn--pri"} btn--sm`} onClick={() => supportV21(m, handoff)}>
                            <IconHeadset aria-hidden="true" />
                            {tp("operator")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              }
              if (m.kind === "guide") {
                const tour = m.tour;
                const checklist = Array.isArray(m.checklist) ? m.checklist : [];
                const needs = Array.isArray(m.needs) ? m.needs : [];
                return (
                  <div className="ains__ai ains__ai--guide" key={m.id}>
                    <AiWho label={tp("aiLabel")} />
                    <p className="ains__text">{m.text || t("done")}</p>
                    {checklist.length ? <StepList id={`ains-steps-${m.id}`} title={t("stepsTitle")} steps={checklist} /> : null}
                    {needs.length ? <NeedList id={`ains-needs-${m.id}`} title={t("needsTitle")} items={needs} /> : null}
                    {tour || m.support ? (
                      <div className="ains__acts">
                        {tour ? (
                          <button type="button" className="btn btn--pri btn--sm" onClick={() => runTour({ ...tour, id: newTourId() })}>
                            <IconTarget aria-hidden="true" />
                            {tp("show")}
                          </button>
                        ) : null}
                        {m.support ? (
                          <button type="button" className={`btn ${tour ? "btn--line" : "btn--pri"} btn--sm`} onClick={() => openHandoff(lastQuestion(m.id))}>
                            <IconHeadset aria-hidden="true" />
                            {tp("operator")}
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
                  <AiWho label={tp("aiLabel")} />
                  {a.highlight ? <p className="ains__hl">{a.highlight}</p> : null}
                  <p className="ains__text">{a.answer}</p>
                  {m.tour ? (
                    <div className="ains__acts">
                      <button type="button" className="btn btn--pri btn--sm" onClick={() => m.tour && runTour({ ...m.tour, id: newTourId() })}>
                        <IconTarget aria-hidden="true" />
                        {tp("show")}
                      </button>
                    </div>
                  ) : null}
                  <div className="ains__rate">
                    {m.rated ? (
                      <span className="ains__rated">
                        <IconCheck aria-hidden="true" />
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

          <div className="ains__foot">
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
                enterKeyHint="send"
              />
              <button type="submit" disabled={busy || !text.trim()} aria-label={t("send")} title={t("send")}>
                <IconSend aria-hidden="true" />
              </button>
            </form>
            <p className="ains__note">
              <span>{tp("disclaimer")}</span>
              {supportHref ? (
                <Link href={supportHref} onClick={onClose}>
                  <IconHeadset aria-hidden="true" />
                  {tp("writeOperator")}
                </Link>
              ) : null}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
