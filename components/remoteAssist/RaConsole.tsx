"use client";

import "./remoteAssist.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { toast } from "@/lib/toast";
import { errorText } from "@/lib/errorText";
import { timeOnly } from "@/lib/date";
import { asDict, asNum, asStr, parseServerTime, ApiError, type Dict } from "@/lib/http";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import {
  RA_EMPTY_META,
  RA_PERSONAL_SCOPE,
  endRemoteAssist,
  getRemoteAssist,
  listRaCommands,
  loadRaMeta,
  mergeRaSession,
  normRaCommand,
  normRaElement,
  normRaSession,
  raAudit,
  raElementActions,
  raErrorCode,
  raErrorDetail,
  raGrantedActions,
  raIdempotencyKey,
  raBestMode,
  raModeScopes,
  requestRemoteAssist,
  sendRaCommand,
  type RaAudit,
  type RaCommand,
  type RaElement,
  type RaMeta,
  type RaSession,
  raKey,
} from "@/lib/services/remoteAssist";
import { closeRaConsole, patchRaConsole, type RaConsoleState } from "@/lib/remoteAssist/store";
import { useRaLink } from "@/lib/remoteAssist/callLink";
import { raWireAllowed, type RaShareState } from "@/lib/remoteAssist/marks";
import { CALLROOM_EVENT, CALLROOM_FLOAT_EVENT } from "@/lib/callEvents";
import { RaScreen } from "./RaScreen";
import { RaPagePicker } from "./RaPagePicker";
import { openRaSocket, type RaSocketEvent } from "@/lib/remoteAssist/socket";
import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCircleX,
  IconClock,
  IconEdit,
  IconEye,
  IconFileText,
  IconHistory,
  IconInfo,
  IconLayers,
  IconList,
  IconLock,
  IconMinus,
  IconMonitor,
  IconPause,
  IconPower,
  IconRefresh,
  IconSearch,
  IconSend,
  IconShieldCheck,
  IconTarget,
  IconUser,
} from "@/components/icons";

// The operator's remote-assistance console: a floating window that stays on
// screen across pages (the operator moves to the call room right after
// starting the call). Request → wait for consent → a structured mirror of the
// client's registered components → semantic commands → history and audit.
// No pixels, no selectors, no typed URLs: only what the client published and
// what the backend's meta and session capabilities allow.

const POLL_MS = 5000;

type Tab = "pages" | "elements" | "commands" | "audit";
type Mirror = { pageId: string; route: string; revision: number; elements: RaElement[] };
type Intent = { key: string; actionId: string; componentId: string; payload: Dict; pageId: string; revision: number };

const ACTION_ICON: Record<string, ComponentType> = {
  "element.highlight": IconTarget,
  "element.tooltip": IconInfo,
  "page.scroll_to": IconChevronDown,
  "element.focus": IconEdit,
  "form.set_value": IconEdit,
  "form.select_option": IconList,
  "form.toggle": IconCheck,
  "modal.open": IconLayers,
  "step.next": IconChevronRight,
  "step.back": IconChevronLeft,
  "draft.prepare": IconFileText,
  "confirmation.present": IconShieldCheck,
  "editor.open": IconFileText,
  "editor.highlight": IconTarget,
};

// Actions that need something typed first.
const INPUT_ACTIONS = new Set(["form.set_value", "form.select_option", "draft.prepare", "element.tooltip"]);

const TONE: Record<string, "ok" | "warn" | "bad" | "muted"> = {
  executed: "ok",
  confirmed: "ok",
  pending: "muted",
  sent: "muted",
  delivered: "muted",
  confirmation_required: "warn",
  rejected: "bad",
  cancelled: "bad",
  expired: "bad",
};

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const groupOf = (id: string) => id.split(".").slice(0, 2).join(".");

function mirrorOf(s: RaSession | null): Mirror | null {
  if (!s || (!s.currentPageId && !s.manifest.length)) return null;
  return { pageId: s.currentPageId, route: s.currentRoute, revision: s.clientUiRevision, elements: s.manifest };
}

export default function RaConsole({ state }: { state: RaConsoleState }) {
  const t = useTranslations("remoteAssist");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [meta, setMeta] = useState<RaMeta>(RA_EMPTY_META);
  const [session, setSession] = useState<RaSession | null>(null);
  const [mirror, setMirror] = useState<Mirror | null>(null);
  const [commands, setCommands] = useState<RaCommand[]>([]);
  const [audit, setAudit] = useState<RaAudit[] | null>(null);
  const [tab, setTab] = useState<Tab>("pages");
  // v2: the client's shared tab in the open call, and how the console sits.
  const link = useRaLink();
  const [clientShare, setClientShare] = useState<RaShareState | null>(null);
  const [big, setBig] = useState(false);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [loadErr, setLoadErr] = useState(false);
  // request form
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(20);
  const [formErr, setFormErr] = useState<{ text: string; twoFactor?: boolean } | null>(null);
  // screen tab
  const [q, setQ] = useState("");
  const [inputFor, setInputFor] = useState<{ id: string; action: string } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [retry, setRetry] = useState<Intent | null>(null);
  // Components the backend called secret: never offered again this session.
  const [blocked, setBlocked] = useState<string[]>([]);
  // 429: no command (or request) before the backend's retry_after_seconds.
  const [coolUntil, setCoolUntil] = useState(0);
  const sid = state.sessionId;
  const sidRef = useRef(sid);
  useEffect(() => {
    sidRef.current = sid;
  }, [sid]);

  useEffect(() => {
    void loadRaMeta().then((m) => {
      setMeta(m);
      setMinutes((cur) => Math.min(cur, m.maxMinutes));
    });
  }, []);

  const modes = useMemo(() => meta.modes.filter((m) => meta.capabilities[m.key] !== false), [meta]);
  const [prevMode, setPrevMode] = useState("");
  // One click asks for the most capable mode the backend offers, with all
  // of its scopes; "Change mode" is there for a guide-only session.
  const best = useMemo(() => raBestMode(meta), [meta]);
  if (!mode && best) setMode(best);
  if (mode !== prevMode) {
    setPrevMode(mode);
    setScopes(raModeScopes(meta, mode));
  }

  const sessionRef = useRef<RaSession | null>(null);
  useEffect(() => {
    sessionRef.current = null;
  }, [sid]);
  const takeSession = useCallback((s: RaSession) => {
    const next = mergeRaSession(sessionRef.current, s);
    sessionRef.current = next;
    setSession(next);
    const fresh = mirrorOf(next);
    if (fresh) setMirror((m) => (!m || fresh.revision >= m.revision ? fresh : m));
  }, []);

  const refresh = useCallback(() => {
    const id = sidRef.current;
    if (!id) return;
    getRemoteAssist(id)
      .then((s) => {
        if (sidRef.current !== id || !s.id) return;
        setLoadErr(false);
        takeSession(s);
      })
      .catch(() => setLoadErr(true));
    listRaCommands(id)
      .then((list) => {
        if (sidRef.current === id) setCommands(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      })
      .catch(() => {});
  }, [takeSession]);

  const [prevSid, setPrevSid] = useState(sid);
  if (prevSid !== sid) {
    setPrevSid(sid);
    setSession(null);
    setMirror(null);
    setCommands([]);
    setAudit(null);
    setRetry(null);
    setTab("pages");
    setClientShare(null);
  }

  const phase = session?.phase ?? (sid ? "loading" : "none");
  const open = phase === "pending" || phase === "active" || phase === "paused" || phase === "loading";

  // Socket first, polling as the safety net.
  useEffect(() => {
    if (!sid || !open) return;
    refresh();
    const onEvent = (e: RaSocketEvent) => {
      if (e.event === "error") return;
      if (e.event === "remote_assist.client_state") {
        const d = e.data;
        const rev = asNum(d.ui_revision);
        if (rev) {
          setMirror((m) => (m && m.revision > rev ? m : { pageId: asStr(d.page_id), route: asStr(d.route), revision: rev, elements: (Array.isArray(d.elements) ? d.elements : []).map(normRaElement).filter((x) => x.componentId) }));
          return;
        }
      }
      if (e.event.startsWith("remote_assist.command_")) {
        const c = normRaCommand(e.data.command ?? e.data);
        if (c.id) setCommands((cur) => [c, ...cur.filter((x) => x.id !== c.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }
      const raw = asDict(e.data.session ?? e.raw.session);
      if (raw.id) takeSession(normRaSession(raw));
      else refresh();
    };
    const sock = openRaSocket(sid, { event: onEvent, reconnected: refresh });
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => {
      sock.close();
      clearInterval(iv);
    };
  }, [sid, open, refresh, takeSession]);

  useEffect(() => {
    if (!open && !coolUntil) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [open, coolUntil]);

  useEffect(() => {
    if (tab !== "audit" || !sid) return;
    const c = new AbortController();
    raAudit(sid, c.signal)
      .then(setAudit)
      .catch(() => setAudit([]));
    return () => c.abort();
  }, [tab, sid, commands.length, session?.status]);

  const modeLabel = (m: string) => (t.has(`modes.${m}.title`) ? t(`modes.${m}.title`) : m);
  const scopeLabel = (s: string) => (t.has(`scopes.${s}`) ? t(`scopes.${s}`) : s.replace(/_/g, " "));
  const actionLabel = (a: string) => (t.has(`actions.${raKey(a)}`) ? t(`actions.${raKey(a)}`) : a);
  const statusLabel = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s.replace(/_/g, " "));
  const cmdLabel = (s: string) => (t.has(`cmd.${s}`) ? t(`cmd.${s}`) : s.replace(/_/g, " "));
  const failLabel = (s: string) => (t.has(`fail.${s}`) ? t(`fail.${s}`) : s.replace(/^remote_assist_/, "").replace(/_/g, " "));
  const pageLabel = (p: string) => (t.has(`pages.${raKey(p)}`) ? t(`pages.${raKey(p)}`) : p);
  const cooling = coolUntil > now;
  const holdOff = useCallback((e: unknown) => {
    if (raErrorCode(e) !== "remote_assist_rate_limit") return;
    const at = Date.now();
    setNow(at);
    setCoolUntil(at + Math.max(1, asNum(raErrorDetail(e).retry_after_seconds, 10)) * 1000);
  }, []);
  const codeText = (e: unknown) => {
    const code = raErrorCode(e);
    if (code === "remote_assist_rate_limit") return t("errors.remote_assist_rate_limit", { n: asNum(raErrorDetail(e).retry_after_seconds, 10) });
    if (code && t.has(`errors.${code}`)) return t(`errors.${code}`);
    return errorText(e, tc) || t("op.commandFailed");
  };

  // ---- request ----

  const submit = async () => {
    if (busy || !mode) return;
    const why = reason.trim().length >= 3 ? reason.trim() : t("op.reasonDefault");
    if (!state.callId) return setFormErr({ text: t("op.needCall") });
    setFormErr(null);
    setBusy("request");
    try {
      const s = await requestRemoteAssist(state.ticketId, { callId: state.callId, mode, scopes, reason: why, durationMinutes: minutes });
      if (!s.id) throw new Error("no session");
      patchRaConsole({ sessionId: s.id, open: true });
      takeSession(s);
    } catch (e) {
      const code = raErrorCode(e);
      const existing = asStr(raErrorDetail(e).session_id);
      holdOff(e);
      if (code === "remote_assist_session_already_active" && existing) {
        patchRaConsole({ sessionId: existing, open: true });
        toast(t("errors.remote_assist_session_already_active"), { tone: "info" });
      } else setFormErr({ text: codeText(e), twoFactor: code === "remote_assist_two_factor_required" });
    } finally {
      setBusy("");
    }
  };

  // ---- commands ----

  const granted = useMemo(() => (session ? raGrantedActions(meta, session.mode, session.grantedScopes) : new Set<string>()), [meta, session]);
  const canCommand = phase === "active" && session?.caps?.canCommand === true && Boolean(mirror) && !cooling;
  const canDraw = phase === "active" && session?.caps?.canCommand === true && !cooling;
  const clientId = session?.client.id ?? "";
  const operatorId = session?.operator.id ?? "";

  // The client's share state (surface, hidden) comes over the call's data channel.
  useEffect(() => {
    if (!link || !clientId) return;
    return link.onWire((msg, from) => {
      if (msg.t === "share" && raWireAllowed(msg, from, { operator: operatorId || link.self(), client: clientId })) setClientShare(msg.state);
    });
  }, [link, clientId, operatorId]);

  // Once the session is live, fold this side's call window too, so the
  // client's picture has room.
  // The console shows the client's screen itself, so the call room behind it
  // would only repeat it full size: fold it when the session goes live, when
  // the client starts sharing, and whenever a call room (re)mounts.
  const isLive = phase === "active";
  const clientSharing = !!clientShare?.on;
  useEffect(() => {
    if (!isLive) return;
    // A next tick: a mounting room announces itself before it listens.
    let timer = 0;
    const fold = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => window.dispatchEvent(new CustomEvent(CALLROOM_FLOAT_EVENT)), 0);
    };
    fold();
    window.addEventListener(CALLROOM_EVENT, fold);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(CALLROOM_EVENT, fold);
    };
  }, [isLive, clientSharing]);

  const dispatch = async (intent: Intent) => {
    if (!session || busy) return;
    setBusy(`${intent.actionId}:${intent.componentId}`);
    try {
      const c = await sendRaCommand(session.id, {
        idempotencyKey: intent.key,
        actionId: intent.actionId,
        pageId: intent.pageId,
        componentId: intent.componentId,
        payload: intent.payload,
        expectedUiRevision: intent.revision,
      });
      setRetry(null);
      setCommands((cur) => [{ ...c, actionId: c.actionId || intent.actionId, componentId: c.componentId || intent.componentId, createdAt: c.createdAt || new Date().toISOString() }, ...cur.filter((x) => x.id !== c.id)]);
      setInputFor(null);
      setInputValue("");
    } catch (e) {
      const code = raErrorCode(e);
      if (e instanceof ApiError && e.status === 0) {
        // Same intent, same key: "retry" can't create a second command.
        setRetry(intent);
        toast(t("op.networkRetry"), { tone: "err" });
      } else {
        setRetry(null);
        holdOff(e);
        if (code === "remote_assist_secret_component_blocked" && intent.componentId) setBlocked((cur) => [...cur, intent.componentId]);
        if (code === "remote_assist_ui_revision_conflict" || code === "remote_assist_command_expired") refresh();
        toast(codeText(e), { tone: "err" });
      }
    } finally {
      setBusy("");
    }
  };

  const send = (actionId: string, el: RaElement | null, payload: Dict = {}) => {
    if (!mirror) return;
    void dispatch({ key: raIdempotencyKey(actionId), actionId, componentId: el?.componentId ?? "", payload, pageId: mirror.pageId, revision: mirror.revision || 1 });
  };

  const end = async () => {
    if (!session || busy) return;
    const ok = await confirmDialog({ title: t("op.endTitle"), text: t("op.endText"), confirmLabel: t("op.end"), tone: "danger" });
    if (!ok) return;
    setBusy("end");
    try {
      takeSession(await endRemoteAssist(session.id, "Operator ended the session"));
      refresh();
    } catch (e) {
      toast(codeText(e), { tone: "err" });
      refresh();
    } finally {
      setBusy("");
    }
  };

  const close = async () => {
    if (session && session.phase !== "closed") {
      const ok = await confirmDialog({ title: t("op.closeTitle"), text: t("op.closeText"), confirmLabel: t("op.end"), tone: "danger" });
      if (!ok) return;
      try {
        await endRemoteAssist(session.id, "Operator closed the console");
      } catch {
        /* the console closes anyway; the backend expires it */
      }
    }
    closeRaConsole();
  };

  const restart = () => {
    patchRaConsole({ sessionId: "" });
    sessionRef.current = null;
    setSession(null);
    setMirror(null);
  };

  const groups = useMemo(() => {
    const list = (mirror?.elements ?? []).filter((e) => e.sensitivity !== "secret" && !blocked.includes(e.componentId));
    const needle = q.trim().toLowerCase();
    const shown = needle ? list.filter((e) => e.label.toLowerCase().includes(needle) || e.componentId.toLowerCase().includes(needle)) : list;
    const map = new Map<string, RaElement[]>();
    for (const e of shown) {
      const g = groupOf(e.componentId);
      map.set(g, [...(map.get(g) ?? []), e]);
    }
    return [...map.entries()];
  }, [mirror, q, blocked]);

  const expires = session?.expiresAt ? parseServerTime(session.expiresAt) : NaN;
  const left = Number.isFinite(expires) ? expires - now : NaN;
  const seenAt = session?.lastClientSeenAt ? parseServerTime(session.lastClientSeenAt) : NaN;
  const seen = Number.isFinite(seenAt) ? Math.max(0, Math.round((now - seenAt) / 1000)) : null;
  const who = state.clientName || session?.client.name || t("op.client");
  const tone = phase === "active" ? "live" : phase === "paused" || phase === "pending" ? "wait" : phase === "closed" ? "off" : "idle";
  const canRequest = meta.loaded && meta.capabilities.request !== false;

  if (!state.open) {
    return (
      <button type="button" className={`ra-pill ra-pill--${tone}`} onClick={() => patchRaConsole({ open: true })} data-ra-ignore="" data-ai-ignore="" aria-label={t("op.expand")}>
        <span className="ra-pill__dot" aria-hidden="true" />
        <IconMonitor aria-hidden="true" />
        <span>
          <b>{t("title")}</b>
          <small>{phase === "none" ? who : statusLabel(session?.status || phase)}</small>
        </span>
      </button>
    );
  }

  return (
    <section className={`ra-con${phase === "active" || phase === "paused" ? " ra-con--wide" : ""}${big ? " ra-con--big" : ""}`} aria-label={t("title")} data-ra-ignore="" data-ai-ignore="">
      <header className="ra-con__head">
        <span className={`ra-con__ico ra-con__ico--${tone}`} aria-hidden="true">
          <IconMonitor />
        </span>
        <span className="ra-con__ttl">
          <b>{t("title")}</b>
          <small>
            <IconUser aria-hidden="true" /> {who}
            {session?.client.lexgoId ? ` · ${session.client.lexgoId}` : ""}
            {state.workId ? ` · ${state.workId}` : ""}
          </small>
        </span>
        {session && phase !== "closed" ? <span className={`ra-tag ra-tag--${tone}`}>{statusLabel(session.status || phase)}</span> : null}
        {phase === "active" || phase === "paused" ? (
          <button type="button" className="ra-con__btn" onClick={() => setBig((v) => !v)} title={big ? t("op.fit") : t("op.expandView")} aria-label={big ? t("op.fit") : t("op.expandView")} aria-pressed={big}>
            {big ? <IconMinus /> : <IconMonitor />}
          </button>
        ) : null}
        <button type="button" className="ra-con__btn" onClick={() => patchRaConsole({ open: false })} title={t("op.fold")} aria-label={t("op.fold")}>
          <IconMinus />
        </button>
        <button type="button" className="ra-con__btn" onClick={() => void close()} title={t("op.close")} aria-label={t("op.close")}>
          <IconCircleX />
        </button>
      </header>

      {phase === "none" ? (
        <div className="ra-con__body">
          {!meta.loaded ? (
            <div className="ra-con__center">
              <span className="ra-spin" aria-label={t("op.loading")} />
            </div>
          ) : !canRequest ? (
            <div className="ra-note ra-note--warn">
              <IconLock aria-hidden="true" />
              <span>{t("errors.remote_assist_permission_required")}</span>
            </div>
          ) : (
            <>
              {!state.callId ? (
                <div className="ra-note ra-note--warn">
                  <IconClock aria-hidden="true" />
                  <span>{t("op.needCall")}</span>
                </div>
              ) : (
                <div className="ra-note">
                  <IconCheck aria-hidden="true" />
                  <span>{t("op.callReady")}</span>
                </div>
              )}
              <div className="ra-req">
                <span className="ra-req__ico" aria-hidden="true">
                  {mode === "guide" ? <IconEye /> : <IconMonitor />}
                </span>
                <span className="ra-req__txt">
                  <b>{modeLabel(mode)}</b>
                  <small>{t.has(`modes.${mode}.op`) ? t(`modes.${mode}.op`) : ""} · {t("op.minutes", { n: minutes })}</small>
                </span>
                <button type="button" className="ra-linkbtn" onClick={() => setCustom((v) => !v)} aria-expanded={custom}>
                  {custom ? t("op.hideOptions") : t("op.changeMode")}
                </button>
              </div>
              {custom ? (
                <div className="ra-opts">
                  <div className="ra-modes" role="radiogroup" aria-label={t("op.mode")}>
                    {modes.map((m) => (
                      <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} className={`ra-mode ra-mode--btn${mode === m.key ? " on" : ""}`} onClick={() => setMode(m.key)}>
                        <span className="ra-mode__ico" aria-hidden="true">
                          {m.key === "guide" ? <IconEye /> : m.key === "prepare" ? <IconFileText /> : <IconMonitor />}
                        </span>
                        <span className="ra-mode__txt">
                          <b>{modeLabel(m.key)}</b>
                          <small>{t.has(`modes.${m.key}.op`) ? t(`modes.${m.key}.op`) : ""}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                  <label className="ra-field">
                    <span>{t("op.reason")}</span>
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder={t("op.reasonDefault")} />
                  </label>
                  <label className="ra-field ra-field--row">
                    <span>{t("op.duration")}</span>
                    <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                      {[5, 10, 15, 20, 30]
                        .filter((m) => m <= meta.maxMinutes)
                        .map((m) => (
                          <option key={m} value={m}>
                            {t("op.minutes", { n: m })}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              ) : null}
              {cooling ? (
                <div className="ra-note ra-note--warn" role="status">
                  <IconClock aria-hidden="true" />
                  <span>{t("op.cooling", { n: Math.ceil((coolUntil - now) / 1000) })}</span>
                </div>
              ) : null}
              {formErr ? (
                <p className="ra-err" role="alert">
                  {formErr.text}
                  {formErr.twoFactor ? (
                    <>
                      {" "}
                      <Link href="/admin/profile">{t("op.setup2fa")}</Link>
                    </>
                  ) : null}
                </p>
              ) : null}
              <button type="button" className="btn btn--pri ra-con__cta" onClick={() => void submit()} disabled={busy === "request" || !state.callId || !mode || cooling} aria-busy={busy === "request" || undefined}>
                <IconSend aria-hidden="true" />
                {busy === "request" ? t("op.requesting") : t("op.request")}
              </button>
              <p className="ra-fine">{t("op.privacy")}</p>
            </>
          )}
        </div>
      ) : phase === "loading" ? (
        <div className="ra-con__body ra-con__center">
          {loadErr ? (
            <>
              <p>{t("op.loadFailed")}</p>
              <button type="button" className="btn btn--line btn--sm" onClick={restart}>
                {t("op.newRequest")}
              </button>
            </>
          ) : (
            <span className="ra-spin" aria-label={t("op.loading")} />
          )}
        </div>
      ) : phase === "pending" && session ? (
        <div className="ra-con__body ra-con__center">
          <span className="ra-wait" aria-hidden="true">
            <IconMonitor />
          </span>
          <b>{t("op.waiting", { name: who })}</b>
          <p>{t("op.waitingText")}</p>
          <dl className="ra-kv">
            <div>
              <dt>{t("op.mode")}</dt>
              <dd>{modeLabel(session.mode)}</dd>
            </div>
            {session.durationMinutes ? (
              <div>
                <dt>{t("op.duration")}</dt>
                <dd>{t("op.minutes", { n: session.durationMinutes })}</dd>
              </div>
            ) : null}
            {Number.isFinite(left) ? (
              <div>
                <dt>{t("op.expires")}</dt>
                <dd>{mmss(left)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="ra-chips ra-chips--center">
            {session.requestedScopes.map((s) => (
              <span key={s} className="ra-tag ra-tag--line">
                {scopeLabel(s)}
              </span>
            ))}
          </div>
          {session.caps?.canEnd !== false ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => void end()} disabled={Boolean(busy)}>
              {t("op.cancelRequest")}
            </button>
          ) : null}
        </div>
      ) : (phase === "active" || phase === "paused") && session ? (
        <div className="ra-con__split">
          <RaScreen
            link={link}
            clientId={clientId}
            share={clientShare}
            canDraw={canDraw}
            pageTitle={mirror ? pageLabel(mirror.pageId) : t("op.waitingScreen")}
            route={mirror?.route ?? ""}
          />
          <div className="ra-con__side">
          <div className="ra-con__strip">
            <span className="ra-tag ra-tag--soft">{modeLabel(session.mode)}</span>
            {/* The granted list in full on hover; the count keeps the strip short. */}
            <span className="ra-tag ra-tag--line" title={session.grantedScopes.map(scopeLabel).join(", ")}>
              {t("op.scopesN", { n: session.grantedScopes.length })}
            </span>
            {session.grantedScopes.includes(RA_PERSONAL_SCOPE) ? <span className="ra-tag ra-tag--wait">{scopeLabel(RA_PERSONAL_SCOPE)}</span> : null}
            {Number.isFinite(left) ? (
              <span className="ra-con__left">
                <IconClock aria-hidden="true" /> {mmss(left)}
              </span>
            ) : null}
          </div>
          {phase === "paused" ? (
            <div className="ra-note ra-note--warn ra-con__pad">
              <IconPause aria-hidden="true" />
              <span>{t("op.pausedNote")}</span>
            </div>
          ) : !session.caps?.canCommand ? (
            <div className="ra-note ra-note--warn ra-con__pad">
              <IconLock aria-hidden="true" />
              <span>{t("op.noCommand")}</span>
            </div>
          ) : null}
          {cooling ? (
            <div className="ra-note ra-note--warn ra-con__pad" role="status">
              <IconClock aria-hidden="true" />
              <span>{t("op.cooling", { n: Math.ceil((coolUntil - now) / 1000) })}</span>
            </div>
          ) : null}
          {retry ? (
            <div className="ra-note ra-note--warn ra-con__pad">
              <IconRefresh aria-hidden="true" />
              <span>{t("op.retryText", { action: actionLabel(retry.actionId) })}</span>
              <button type="button" className="btn btn--line btn--sm" onClick={() => void dispatch(retry)} disabled={Boolean(busy)}>
                {t("op.retry")}
              </button>
            </div>
          ) : null}
          <div className="ra-tabs" role="tablist">
            {(["pages", "elements", "commands", "audit"] as Tab[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                {k === "pages" ? <IconLayers aria-hidden="true" /> : k === "elements" ? <IconTarget aria-hidden="true" /> : k === "commands" ? <IconList aria-hidden="true" /> : <IconHistory aria-hidden="true" />}
                {t(`op.tab.${k}`)}
                {k === "commands" && commands.length ? <em>{commands.length}</em> : null}
              </button>
            ))}
          </div>

          {tab === "pages" ? (
            <div className="ra-con__body ra-con__body--list">
              <RaPagePicker currentPageId={mirror?.pageId ?? ""} currentRoute={mirror?.route ?? ""} disabled={!canCommand || !granted.has("route.navigate") || Boolean(busy)} busyRoute="" onOpen={(route) => send("route.navigate", null, { route })} />
            </div>
          ) : tab === "elements" ? (
            <div className="ra-con__body ra-con__body--list">
              {mirror ? (
                <>
                  <div className="ra-page">
                    <span className="ra-page__route">
                      <b>{pageLabel(mirror.pageId)}</b>
                      <small title={mirror.route}>{mirror.route}</small>
                    </span>
                    <small>
                      {t("op.revision", { n: mirror.revision })}
                      {seen !== null ? ` · ${seen < 5 ? t("op.justNow") : t("op.secondsAgo", { n: seen })}` : ""}
                    </small>
                  </div>
                  {mirror.pageId === "client.outside" ? (
                    <div className="ra-note ra-note--warn">
                      <IconInfo aria-hidden="true" />
                      <span>{t("op.outside")}</span>
                    </div>
                  ) : null}
                  <div className="ra-row">
                    <span className="ra-search">
                      <IconSearch aria-hidden="true" />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("op.searchPh")} aria-label={t("op.search")} />
                    </span>
                  </div>
                  {groups.map(([g, els]) => (
                    <div key={g} className="ra-group">
                      <h4>{g.replace(/[._-]+/g, " ")}</h4>
                      <ul className="ra-els">
                        {els.map((el) => {
                          const acts = raElementActions(el, granted, session.grantedScopes);
                          const blocked = el.actions.length > 0 && !acts.length;
                          return (
                            <li key={el.componentId} className={`ra-el${el.state === "disabled" || el.state === "hidden" ? " ra-el--off" : ""}`}>
                              <span className="ra-el__main">
                                <span className="ra-el__lbl">{el.label || <i>{t("op.noLabel")}</i>}</span>
                                <small>
                                  <code>{el.componentId}</code>
                                  {el.sensitivity !== "normal" ? <span className={`ra-sens ra-sens--${el.sensitivity}`}>{t(`sens.${el.sensitivity}`)}</span> : null}
                                  {el.state !== "ready" ? <span className="ra-sens">{t.has(`state.${el.state}`) ? t(`state.${el.state}`) : el.state}</span> : null}
                                  {blocked && el.sensitivity === "personal" ? <span className="ra-sens ra-sens--personal">{t("op.needPersonal")}</span> : null}
                                </small>
                              </span>
                              <span className="ra-el__acts">
                                {acts.map((a) => {
                                  const Ico = ACTION_ICON[a] ?? IconArrowRight;
                                  const typed = INPUT_ACTIONS.has(a);
                                  const on = inputFor?.id === el.componentId && inputFor.action === a;
                                  return (
                                    <button
                                      key={a}
                                      type="button"
                                      className={`ra-act${on ? " on" : ""}${a === "confirmation.present" || a === "draft.prepare" ? " ra-act--confirm" : ""}`}
                                      disabled={!canCommand || Boolean(busy)}
                                      title={actionLabel(a)}
                                      aria-label={`${actionLabel(a)}: ${el.label || el.componentId}`}
                                      onClick={() => {
                                        if (typed) {
                                          setInputFor(on ? null : { id: el.componentId, action: a });
                                          setInputValue("");
                                          return;
                                        }
                                        send(a, el);
                                      }}
                                    >
                                      <Ico />
                                    </button>
                                  );
                                })}
                              </span>
                              {inputFor?.id === el.componentId ? (
                                <form
                                  className="ra-fill"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const v = inputValue.trim();
                                    if (!v) return;
                                    send(inputFor.action, el, inputFor.action === "element.tooltip" ? { text: v } : { value: inputValue });
                                  }}
                                >
                                  <input
                                    autoFocus
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    maxLength={inputFor.action === "element.tooltip" ? 300 : 2000}
                                    placeholder={t.has(`op.ph.${raKey(inputFor.action)}`) ? t(`op.ph.${raKey(inputFor.action)}`) : ""}
                                    aria-label={actionLabel(inputFor.action)}
                                  />
                                  <button type="submit" className="btn btn--pri btn--sm" disabled={Boolean(busy) || !inputValue.trim()}>
                                    {t("op.send")}
                                  </button>
                                </form>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  {!groups.length ? <p className="ra-empty">{q ? t("op.noMatch") : t("op.noElements")}</p> : null}
                </>
              ) : (
                <div className="ra-con__center">
                  <span className="ra-spin" aria-hidden="true" />
                  <p>{t("op.waitingScreen")}</p>
                </div>
              )}
            </div>
          ) : tab === "commands" ? (
            <div className="ra-con__body ra-con__body--list">
              <ul className="ra-cmds">
                {commands.map((c) => {
                  const label = mirror?.elements.find((e) => e.componentId === c.componentId)?.label || c.componentId || asStr(c.payload.route);
                  return (
                    <li key={c.id} className="ra-cmd">
                      <span className={`ra-cmd__dot ra-cmd__dot--${TONE[c.status] ?? "muted"}`} aria-hidden="true" />
                      <span className="ra-cmd__main">
                        <b>
                          {actionLabel(c.actionId)}
                          {label ? ` · ${label}` : ""}
                        </b>
                        <small>
                          {cmdLabel(c.status)}
                          {c.failureCode ? ` · ${failLabel(c.failureCode)}` : ""}
                          {c.createdAt ? ` · ${timeOnly(c.createdAt, locale)}` : ""}
                        </small>
                      </span>
                    </li>
                  );
                })}
                {!commands.length ? <li className="ra-empty">{t("op.noCommands")}</li> : null}
              </ul>
            </div>
          ) : (
            <div className="ra-con__body ra-con__body--list">
              <RaAuditList audit={audit} />
            </div>
          )}

          <footer className="ra-con__foot">
            <button type="button" className="btn btn--line btn--sm" onClick={refresh} disabled={Boolean(busy)}>
              <IconRefresh aria-hidden="true" />
              {t("op.refresh")}
            </button>
            {session.caps?.canEnd !== false ? (
              <button type="button" className="btn btn--sm ra-con__end" onClick={() => void end()} disabled={Boolean(busy)}>
                <IconPower aria-hidden="true" />
                {t("op.end")}
              </button>
            ) : null}
          </footer>
          </div>
        </div>
      ) : session ? (
        <div className="ra-con__body ra-con__center">
          <span className="ra-wait ra-wait--off" aria-hidden="true">
            <IconPower />
          </span>
          <b>{statusLabel(session.status || "ended")}</b>
          <p>{t.has(`op.closed.${session.status}`) ? t(`op.closed.${session.status}`) : t("op.closed.default")}</p>
          {session.endReason ? <small className="ra-fine">{session.endReason}</small> : null}
          <div className="ra-row ra-row--center">
            <button type="button" className="btn btn--line btn--sm" onClick={() => setTab("audit")}>
              <IconHistory aria-hidden="true" />
              {t("op.tab.audit")}
            </button>
            <button type="button" className="btn btn--line btn--sm" onClick={() => closeRaConsole()}>
              {t("op.close")}
            </button>
            <button type="button" className="btn btn--pri btn--sm" onClick={restart}>
              {t("op.newRequest")}
            </button>
          </div>
          {tab === "audit" ? <RaAuditList audit={audit} /> : null}
        </div>
      ) : null}
    </section>
  );
}

// The audit trail as the backend wrote it: chronological, untouched — the
// hashes are shown, never recomputed.
export function RaAuditList({ audit }: { audit: RaAudit[] | null }) {
  const t = useTranslations("remoteAssist");
  const locale = useLocale();
  if (audit === null)
    return (
      <div className="ra-con__center">
        <span className="ra-spin" aria-label={t("op.loading")} />
      </div>
    );
  if (!audit.length) return <p className="ra-empty">{t("op.noAudit")}</p>;
  return (
    <ol className="ra-audit">
      {audit.map((a, i) => {
        const meta = Object.entries(a.metadata)
          .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
          .slice(0, 6);
        return (
          <li key={a.id || i}>
            <time dateTime={a.createdAt}>{a.createdAt ? timeOnly(a.createdAt, locale) : ""}</time>
            <span>
              <b>{t.has(`audit.${raKey(a.eventType)}`) ? t(`audit.${raKey(a.eventType)}`) : a.eventType.replace(/^remote_assist\./, "").replace(/[._]/g, " ")}</b>
              {a.actor.name || a.actor.role ? (
                <small>
                  {a.actor.name}
                  {a.actor.role ? ` · ${a.actor.role}` : ""}
                </small>
              ) : null}
              {meta.length ? (
                <span className="ra-audit__meta">
                  {meta.map(([k, v]) => (
                    <span key={k}>
                      {k.replace(/_/g, " ")}: <code>{String(v).slice(0, 60)}</code>
                    </span>
                  ))}
                </span>
              ) : null}
              {a.eventHash ? (
                <small className="ra-audit__hash" title={`${a.previousHash} → ${a.eventHash}`}>
                  #{a.eventHash.slice(0, 12)}
                </small>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
