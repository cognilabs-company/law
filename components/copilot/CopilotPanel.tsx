"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRightIcon,
  BriefcaseIcon,
  CircleDashedIcon,
  LinkIcon,
  LockIcon,
  MessagesSquareIcon,
  ScaleIcon,
  SendHorizontalIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  SquarePenIcon,
  UnlinkIcon,
  XIcon,
} from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useLayer } from "@/lib/layers";
import { useSwipeDismiss } from "@/lib/useSwipeDismiss";
import type { Role } from "@/lib/auth";
import {
  askCopilotFull,
  askedToOpen,
  copilotEntityType,
  copilotErrorKind,
  copilotRoute,
  executeCopilotDraft,
  newCopilotId,
  sendCopilotFeedback,
  type CopilotActionPreview,
  type CopilotEntityType,
  type CopilotHighlight,
  type CopilotPanelMode,
} from "@/lib/services/copilotPanel";
import { closeCopilot, copilotDispatch, copilotSnapshot, copilotTrigger, type CopilotConv, type CopilotFeedback, type CopilotState, type CopilotTurn } from "./store";
import { copilotPrompts, PROMPT_ICONS } from "./prompts";
import CopilotTurnView, { entityLabel } from "./CopilotAnswer";
import CopilotDrafts from "./CopilotDrafts";
import { flashTarget } from "./highlight";
import "./copilot.css";

const ICON = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;
const DOCK = "(min-width: 1024px)";
const subscribeDock = (cb: () => void) => {
  const m = window.matchMedia(DOCK);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const readDock = () => window.matchMedia(DOCK).matches;
const ENTITY_ICONS: Record<CopilotEntityType, LucideIcon> = { service_order: BriefcaseIcon, legal_case: ScaleIcon, secure_chat: MessagesSquareIcon };
const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
const norm = (p: string) => p.replace(/\/+$/, "") || "/";
const samePath = (a: string, b: string) => norm(a) === norm(b);

type Props = { state: CopilotState; mode: CopilotPanelMode; role: Role };

export default function CopilotPanel({ state, mode, role }: Props) {
  const t = useTranslations("copilot");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const docked = useSyncExternalStore(subscribeDock, readDock, () => true);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLSpanElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ctl = useRef(new Map<string, AbortController>());
  const flashCtl = useRef<AbortController | null>(null);
  const pending = useRef<{ path: string; highlight: CopilotHighlight } | null>(null);
  const pathRef = useRef(pathname);
  const zRef = useRef(0);
  const [texts, setTexts] = useState<Record<string, { v: string; seq: number }>>({});
  const open = state.open;
  const conv = state.convs.find((c) => c.key === state.active) ?? null;
  const entity = conv && conv.attached ? conv.origin : null;
  const lawyer = mode === "lawyer_copilot";
  const z = useLayer(open, { kind: "overlay", el: rootRef, trigger: copilotTrigger, backdrop: scrimRef, passive: docked, onEscape: closeCopilot });
  useSwipeDismiss({ enabled: open && !docked, panel: rootRef, scroller: logRef, handles: [gripRef, headRef], canStart: () => !readDock(), onDismiss: closeCopilot });
  const entry = conv ? texts[conv.key] : undefined;
  const text = conv ? (entry && entry.seq === conv.promptSeq ? entry.v : conv.prompt) : "";
  const sending = !!conv && conv.turns.some((x) => x.status === "sending");
  const last = conv ? conv.turns[conv.turns.length - 1] : undefined;
  const reqState = !last ? "idle" : last.status === "sending" ? "sending" : last.status === "done" ? (last.reply?.limited ? "limited_fallback" : "completed") : "failed";
  const prompts = conv ? copilotPrompts(mode, conv.surface, !!entity, state.access.tools) : [];
  const typeLabel = (type: string) => (t.has(`ctx.type.${type}`) ? t(`ctx.type.${type}`) : type);
  const scrollKey = conv ? `${conv.key}|${conv.turns.length}|${last?.status ?? ""}` : "";

  useEffect(() => {
    pathRef.current = pathname;
    zRef.current = z;
  });

  useEffect(() => {
    if (open) return;
    ctl.current.forEach((c) => c.abort());
  }, [open]);

  useEffect(() => {
    const map = ctl.current;
    return () => {
      map.forEach((c) => c.abort());
      map.clear();
      flashCtl.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root || root.contains(document.activeElement)) return;
      const input = inputRef.current;
      if (readDock() && input && !input.disabled) {
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
      } else root.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, state.active]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text, state.tab, open]);

  useEffect(() => {
    const el = logRef.current;
    if (!el || !scrollKey) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lastEl = el.lastElementChild as HTMLElement | null;
    const top = scrollKey.endsWith("|done") && lastEl ? Math.max(0, lastEl.offsetTop - 12) : el.scrollHeight;
    el.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  }, [scrollKey]);

  useEffect(() => {
    const p = pending.current;
    if (!p || !samePath(p.path, pathname)) return;
    pending.current = null;
    const ac = new AbortController();
    void flashTarget(p.highlight.target, { z: zRef.current, style: p.highlight.style, wait: 8000, signal: ac.signal, avoid: readDock() ? rootRef.current : null });
    return () => ac.abort();
  }, [pathname]);

  const setText = (key: string, seq: number, v: string) => setTexts((m) => ({ ...m, [key]: { v, seq } }));

  function flash(h: CopilotHighlight) {
    flashCtl.current?.abort();
    const ac = new AbortController();
    flashCtl.current = ac;
    void flashTarget(h.target, { z: zRef.current || z, style: h.style, signal: ac.signal, wait: 2500, avoid: readDock() ? rootRef.current : null });
    if (!readDock()) closeCopilot();
  }

  function go(route: string, highlight: CopilotHighlight | null) {
    const path = route.split(/[?#]/)[0];
    if (samePath(path, pathRef.current)) {
      if (highlight) flash(highlight);
      else if (!readDock()) closeCopilot();
      return;
    }
    pending.current = highlight ? { path, highlight } : null;
    router.push(route);
    if (!readDock()) closeCopilot();
  }

  function refocus() {
    window.requestAnimationFrame(() => {
      const root = rootRef.current;
      const input = inputRef.current;
      if (!root || document.activeElement === input) return;
      if (readDock() && input && !input.disabled) input.focus({ preventScroll: true });
      else root.focus({ preventScroll: true });
    });
  }

  async function run(c: CopilotConv, turn: CopilotTurn, restore: boolean) {
    const ac = new AbortController();
    ctl.current.set(turn.id, ac);
    try {
      const reply = await askCopilotFull(
        {
          message: turn.ask,
          sessionId: c.sessionId,
          mode,
          entity: turn.entity,
          locale,
          page: {
            route: pathRef.current,
            pageId: turn.surface,
            title: turn.title || t(`surface.${turn.surface}`),
            context: { ...turn.context, panel: "ai_copilot", view: readDock() ? "side_panel" : "bottom_sheet" },
          },
        },
        ac.signal,
      );
      copilotDispatch({ type: "answer", key: c.key, turnId: turn.id, reply });
      const now = copilotSnapshot();
      if (reply.navigation && (reply.intent === "navigation" || reply.provider === "local_navigation") && askedToOpen(turn.ask) && now.open && now.active === c.key) {
        const route = copilotRoute({ route: reply.navigation.route, pageId: reply.navigation.pageId, params: reply.navigation.params }, role);
        if (route) go(route, reply.highlight);
      }
    } catch (e) {
      const kind = copilotErrorKind(e);
      if (kind === "role") copilotDispatch({ type: "denied" });
      copilotDispatch({ type: "fail", key: c.key, turnId: turn.id, error: kind });
      if (kind !== "role" && restore) {
        setTexts((m) => {
          const cur = m[c.key];
          return cur && cur.v.trim() ? m : { ...m, [c.key]: { v: turn.ask, seq: cur?.seq ?? c.promptSeq } };
        });
      }
    } finally {
      ctl.current.delete(turn.id);
    }
  }

  function send(raw: string, fromComposer = false) {
    const message = raw.trim();
    if (!conv || !message || sending || state.denied) return;
    const turn: CopilotTurn = {
      id: newCopilotId(),
      ask: message.slice(0, 4000),
      entity,
      surface: conv.surface,
      title: conv.title,
      context: conv.context,
      status: "sending",
      reply: null,
      error: null,
      actions: {},
      feedback: null,
    };
    copilotDispatch({ type: "ask", key: conv.key, turn });
    if (fromComposer) setText(conv.key, conv.promptSeq, "");
    void run(conv, turn, fromComposer);
    refocus();
  }

  function retry(turn: CopilotTurn) {
    if (!conv || sending || state.denied) return;
    copilotDispatch({ type: "retry", key: conv.key, turnId: turn.id });
    const restore = text.trim() === turn.ask;
    if (restore) setText(conv.key, conv.promptSeq, "");
    void run(conv, { ...turn, status: "sending" }, restore);
    refocus();
  }

  function cancel() {
    conv?.turns.forEach((x) => {
      if (x.status === "sending") ctl.current.get(x.id)?.abort();
    });
  }

  function newChat() {
    if (!conv) return;
    cancel();
    copilotDispatch({ type: "reset", sessionId: newCopilotId() });
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  async function save(c: CopilotConv, turn: CopilotTurn, action: CopilotActionPreview) {
    const reply = turn.reply;
    if (!reply) return;
    const at = { key: c.key, turnId: turn.id, actionId: action.id };
    copilotDispatch({ type: "action", ...at, outcome: { state: "saving", message: "" } });
    try {
      const own = action.entityId && copilotEntityType(action.entityType) ? { type: action.entityType, id: action.entityId } : turn.entity;
      const r = await executeCopilotDraft({
        requestId: reply.requestId,
        actionId: action.id,
        actionType: action.type,
        title: action.title || t("action.untitled"),
        content: action.content || reply.answer,
        entity: own,
        surface: turn.surface,
      });
      copilotDispatch({ type: "action", ...at, outcome: { state: r.status, message: r.message } });
      if (r.status === "saved") copilotDispatch({ type: "drafts" });
    } catch (e) {
      copilotDispatch({ type: "action", ...at, outcome: { state: "error", message: t(`err.${copilotErrorKind(e)}`) } });
    }
  }

  async function rate(c: CopilotConv, turn: CopilotTurn, fb: CopilotFeedback) {
    if (!turn.reply) return;
    await sendCopilotFeedback(turn.reply.requestId, fb.rating, { comment: fb.comment, ...(fb.useful === null ? {} : { useful: fb.useful }) });
    copilotDispatch({ type: "feedback", key: c.key, turnId: turn.id, feedback: fb });
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || readDock()) return;
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const end = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
      e.preventDefault();
      end.focus();
    } else if (!e.shiftKey && document.activeElement === end) {
      e.preventDefault();
      first.focus();
    }
  }

  function pickTab(tab: "chat" | "drafts", focus = false) {
    copilotDispatch({ type: "tab", tab });
    if (focus) window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.focus());
  }

  const onSave = (turn: CopilotTurn, action: CopilotActionPreview) => {
    if (conv) void save(conv, turn, action);
  };
  const onRate = (turn: CopilotTurn, fb: CopilotFeedback) => (conv ? rate(conv, turn, fb) : Promise.resolve());

  const EntityIcon = entity ? ENTITY_ICONS[entity.type] : CircleDashedIcon;
  const ctxText = entity ? entityLabel(entity, typeLabel) : "";
  const label = conv?.label ?? "";

  return (
    <>
      <div ref={scrimRef} className="cpl-scrim" data-open={open ? "" : undefined} style={{ zIndex: z }} onClick={closeCopilot} aria-hidden="true" data-ai-id="copilot.scrim" />
      <div
        ref={rootRef}
        id="lexgo-copilot"
        className={`cpl cpl--${lawyer ? "lawyer" : "client"}`}
        style={{ zIndex: z + 1 }}
        data-open={open ? "" : undefined}
        data-state={reqState}
        data-ai-id="copilot.panel"
        data-ai-ignore=""
        role={docked ? "complementary" : "dialog"}
        aria-modal={docked ? undefined : true}
        aria-label={t(lawyer ? "panelLabel.lawyer" : "panelLabel.client")}
        tabIndex={-1}
        inert={!open}
        onKeyDown={onKeyDown}
      >
        <span ref={gripRef} className="cpl-grip" aria-hidden="true" />
        <header ref={headRef} className="cpl-head">
          <div className="cpl-head__bar">
            <span className="cpl-mark" aria-hidden="true">
              <SparklesIcon {...ICON} />
            </span>
            <span className="cpl-head__id">
              <b className="cpl-badge">{t(lawyer ? "badge.lawyer" : "badge.client")}</b>
              <span>{t(lawyer ? "tagline.lawyer" : "tagline.client")}</span>
            </span>
            <button type="button" className="cpl-ib" onClick={newChat} disabled={!conv || (!conv.turns.length && !text)} aria-label={t("newChat")} title={t("newChat")} data-ai-id="copilot.new">
              <SquarePenIcon {...ICON} />
            </button>
            <button type="button" className="cpl-ib" onClick={closeCopilot} aria-label={t("close")} title={t("close")} data-ai-id="copilot.close">
              <XIcon {...ICON} />
            </button>
          </div>
          <div className={`cpl-ctx${entity ? " is-on" : ""}`}>
            <span className="cpl-ctx__ic" aria-hidden="true">
              <EntityIcon {...ICON} size={16} />
            </span>
            <span className="cpl-ctx__tx">
              <span className="cpl-ctx__row">
                {entity ? <small>{typeLabel(entity.type)}</small> : label ? <small className="cpl-ctx__none">{t("noContext")}</small> : <b className="cpl-ctx__none">{t("noContext")}</b>}
                {entity ? (
                  <button type="button" className="cpl-ctx__btn" onClick={() => copilotDispatch({ type: "detach" })} title={t("detachHint")} data-ai-id="copilot.detach">
                    <UnlinkIcon {...ICON} size={13} />
                    <span>{t("detach")}</span>
                  </button>
                ) : conv?.origin ? (
                  <button type="button" className="cpl-ctx__btn" onClick={() => copilotDispatch({ type: "attach" })} data-ai-id="copilot.attach">
                    <LinkIcon {...ICON} size={13} />
                    <span>{t("attach")}</span>
                  </button>
                ) : null}
              </span>
              {entity ? (
                <b className="cpl-ctx__title" title={ctxText}>
                  {ctxText}
                </b>
              ) : label ? (
                <b className="cpl-ctx__title" title={label}>
                  {label}
                </b>
              ) : null}
            </span>
          </div>
          <div
            className="cpl-tabs"
            role="tablist"
            aria-label={t("tabs")}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              pickTab(state.tab === "chat" ? "drafts" : "chat", true);
            }}
          >
            {(["chat", "drafts"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`cpl-tab-${tab}`}
                aria-selected={state.tab === tab}
                aria-controls="cpl-pane"
                tabIndex={state.tab === tab ? 0 : -1}
                data-tab={tab}
                className={state.tab === tab ? "is-on" : undefined}
                onClick={() => pickTab(tab)}
                data-ai-id={`copilot.tab.${tab}`}
              >
                {t(`tab.${tab}`)}
              </button>
            ))}
          </div>
        </header>
        <div id="cpl-pane" className="cpl-pane" role="tabpanel" aria-labelledby={`cpl-tab-${state.tab}`}>
          {state.tab === "drafts" ? (
            <CopilotDrafts key={`${entity ? `${entity.type}:${entity.id}` : "none"}|${state.drafts}`} entity={entity} label={ctxText} onReload={() => copilotDispatch({ type: "drafts" })} />
          ) : (
            <>
              <div ref={logRef} className="cpl-log" role="log" aria-label={t("log")} data-ai-private="">
                {conv && !conv.turns.length && !state.denied ? (
                  <div className="cpl-intro">
                    <span className="cpl-intro__mark" aria-hidden="true">
                      <SparklesIcon {...ICON} size={22} />
                    </span>
                    <h2 className="cpl-intro__t">{t(lawyer ? "intro.lawyerTitle" : "intro.clientTitle")}</h2>
                    <p className="cpl-intro__p">{entity ? t("intro.withContext") : t(lawyer ? "intro.lawyer" : "intro.client")}</p>
                    {prompts.length ? (
                      <div className="cpl-qs">
                        <p className="cpl-qs__t">{t("suggest")}</p>
                        {prompts.map((k) => {
                          const Icon = PROMPT_ICONS[k];
                          return (
                            <button key={k} type="button" className="cpl-q" onClick={() => send(t(`prompt.${k}`))} disabled={sending} data-ai-id={`copilot.prompt.${k}`}>
                              <span className="cpl-q__ic" aria-hidden="true">
                                <Icon {...ICON} size={16} />
                              </span>
                              <span className="cpl-q__tx">{t(`prompt.${k}`)}</span>
                              <ArrowUpRightIcon {...ICON} size={15} className="cpl-q__go" />
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {conv?.turns.map((turn, i) => (
                  <CopilotTurnView
                    key={turn.id}
                    turn={turn}
                    index={i}
                    role={role}
                    busy={sending || state.denied}
                    onRetry={retry}
                    onGo={go}
                    onFlash={flash}
                    onSave={onSave}
                    onRate={onRate}
                    onDrafts={() => pickTab("drafts")}
                  />
                ))}
                {state.denied ? (
                  <div className="cpl-deny" role="alert">
                    <span className="cpl-deny__ic" aria-hidden="true">
                      <LockIcon {...ICON} />
                    </span>
                    <b>{t("unavailable.title")}</b>
                    <span>{t("unavailable.text")}</span>
                  </div>
                ) : null}
              </div>
              {conv && conv.turns.length && prompts.length && !state.denied ? (
                <div className="cpl-chips" role="group" aria-label={t("suggest")}>
                  {prompts.map((k) => {
                    const Icon = PROMPT_ICONS[k];
                    return (
                      <button key={k} type="button" className="cpl-chip cpl-chip--q" onClick={() => send(t(`prompt.${k}`))} disabled={sending} data-ai-id={`copilot.prompt.${k}`}>
                        <Icon {...ICON} size={14} />
                        {t(`prompt.${k}`)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <form
                className="cpl-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(text, true);
                }}
              >
                <div className={`cpl-field${sending ? " is-busy" : ""}`}>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={text}
                    maxLength={4000}
                    readOnly={sending}
                    aria-disabled={sending || state.denied || undefined}
                    disabled={state.denied}
                    onChange={(e) => {
                      if (conv) setText(conv.key, conv.promptSeq, e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        send(text, true);
                      }
                    }}
                    placeholder={entity ? t("composer.placeholderCtx") : t("composer.placeholder")}
                    aria-label={t("composer.label")}
                    data-ai-id="copilot.input"
                  />
                  <button
                    type="button"
                    className={`cpl-send${sending ? " cpl-send--stop" : ""}`}
                    onClick={sending ? cancel : () => send(text, true)}
                    disabled={!sending && state.denied}
                    aria-disabled={!sending && !text.trim() ? true : undefined}
                    aria-label={sending ? t("cancel") : t("send")}
                    title={sending ? t("cancel") : t("send")}
                    data-ai-id={sending ? "copilot.cancel" : "copilot.send"}
                  >
                    {sending ? <SquareIcon {...ICON} size={14} /> : <SendHorizontalIcon {...ICON} />}
                  </button>
                </div>
                <p className="cpl-hint">{sending ? t("composer.busy") : t("composer.hint")}</p>
              </form>
            </>
          )}
        </div>
        <p className="cpl-foot">
          <ShieldCheckIcon {...ICON} size={13} />
          <span>{t("disclaimer")}</span>
        </p>
      </div>
    </>
  );
}
