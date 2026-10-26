"use client";

import "./remoteAssist.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CALLROOM_EVENT, CALLROOM_FLOAT_EVENT, isCallRoomMounted } from "@/lib/callEvents";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { subscribeAiRegistry } from "@/lib/ai/registry";
import { modalAiId, openModalRoot } from "@/lib/ai/dom";
import { asDict, asStr, parseServerTime, type Dict } from "@/lib/http";
import { toast } from "@/lib/toast";
import { errorText } from "@/lib/errorText";
import {
  RA_EMPTY_META,
  RA_VIEW_SCOPE,
  ackBody,
  ackRaCommand,
  clientStateBody,
  consentRemoteAssist,
  endRemoteAssist,
  getRemoteAssist,
  listPendingRemoteAssist,
  listRaCommands,
  loadRaMeta,
  mergeRaSession,
  normRaCommand,
  normRaSession,
  pauseRemoteAssist,
  publishClientState,
  raErrorCode,
  resumeRemoteAssist,
  revokeRemoteAssist,
  type RaAck,
  type RaCommand,
  type RaMeta,
  type RaSession,
  raKey,
} from "@/lib/services/remoteAssist";
import { activeRaId, markRaHandled, nextRaRevision, raHandled, rememberActiveRa } from "@/lib/remoteAssist/store";
import { raClearHighlight, raCollect, raPageOf, raPathOf, raSignature } from "@/lib/remoteAssist/registry";
import { raExecute, type RaPrompt } from "@/lib/remoteAssist/executor";
import { createRaRunner, type RaRunner } from "@/lib/remoteAssist/runner";
import { openRaSocket, type RaSocket, type RaSocketEvent } from "@/lib/remoteAssist/socket";
import { IconClose, IconEye, IconLock, IconMonitor, IconPause, IconPlay, IconPower, IconShieldCheck, IconEdit, IconCheck } from "@/components/icons";

// The client's side of remote assistance, mounted for every signed-in tab:
//  • finds a pending request (on load, on the remote_assist.requested event,
//    and while a call is open) and shows the consent sheet above any page;
//  • while active: keeps the session socket, publishes the registered
//    components on screen (no values), runs each operator command through the
//    central executor and acknowledges it exactly once;
//  • keeps the assistance bar — operator, mode, countdown, pause/resume, stop
//    access, end — above every modal and route until the session ends.

const PENDING_POLL_MS = 6000;
const SESSION_POLL_MS = 10_000;
const COMMAND_POLL_MS = 3000;
const COMMAND_POLL_SOCKET_MS = 15_000;
const PUBLISH_DEBOUNCE_MS = 450;
const CONFIRM_TIMEOUT_MS = 60_000;
const OUTSIDE_PAGE = "client.outside";

type Prompt = RaPrompt & { resolve: (ok: boolean) => void; operator: string };
type Ended = { status: string; reason: string };

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// remote_assist.requested arrives on the user socket directly or wrapped in
// notification.created.
function requestedEvent(e: Dict): boolean {
  const name = asStr(e.event);
  if (name === "remote_assist.requested") return true;
  if (name !== "notification.created") return false;
  const n = asDict(e.notification);
  const data = asDict(n.data);
  return [n.type, n.kind, data.type, data.event].some((v) => asStr(v) === "remote_assist.requested");
}

export default function RaClient({ selfId }: { selfId: string }) {
  const t = useTranslations("remoteAssist");
  const tc = useTranslations("common");
  const router = useRouter();
  const [meta, setMeta] = useState<RaMeta>(RA_EMPTY_META);
  const [pending, setPending] = useState<RaSession | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [active, setActive] = useState<RaSession | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [ended, setEnded] = useState<Ended | null>(null);
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [lastAction, setLastAction] = useState("");

  const dismissed = useRef(new Set<string>());
  const activeRef = useRef<RaSession | null>(null);
  const metaRef = useRef<RaMeta>(RA_EMPTY_META);
  const socketRef = useRef<RaSocket | null>(null);
  const sigRef = useRef("");
  const pageKeyRef = useRef("");
  const pageRevRef = useRef(0);
  const revRef = useRef(0);
  const promptRef = useRef<Prompt | null>(null);
  const publishRef = useRef<(force?: boolean) => void>(() => {});
  const execRef = useRef<(cmd: RaCommand, shown: () => Promise<void>) => Promise<RaAck>>(async () => ({ status: "rejected", failureCode: "session_not_active" }));
  const ackRef = useRef<(cmd: RaCommand, ack: RaAck) => Promise<void>>(async () => {});
  const afterRef = useRef<(cmd: RaCommand, ack: RaAck) => void>(() => {});
  // One queue per tab; it reads the live session through refs.
  const runnerRef = useRef<RaRunner | null>(null);
  useEffect(() => {
    runnerRef.current = createRaRunner({
      handled: {
        has: (id) => {
          const s = activeRef.current;
          return s ? raHandled(s.id).has(id) : true;
        },
        mark: (id) => {
          const s = activeRef.current;
          if (s) markRaHandled(s.id, id);
        },
      },
      canRun: () => Boolean(activeRef.current) && document.visibilityState === "visible",
      execute: (cmd, shown) => execRef.current(cmd, shown),
      ack: (cmd, ack) => ackRef.current(cmd, ack),
      after: (cmd, ack) => afterRef.current(cmd, ack),
    });
  }, []);

  useEffect(() => {
    activeRef.current = active;
    promptRef.current = prompt;
  }, [active, prompt]);

  useEffect(() => {
    void loadRaMeta().then((m) => {
      metaRef.current = m;
      setMeta(m);
    });
  }, []);

  // ---- ending ----

  const finish = useCallback((s: Pick<RaSession, "id" | "status" | "endReason"> | null, status: string) => {
    raClearHighlight();
    socketRef.current?.close();
    socketRef.current = null;
    runnerRef.current?.clear();
    promptRef.current?.resolve(false);
    setPrompt(null);
    rememberActiveRa("");
    sigRef.current = "";
    pageKeyRef.current = "";
    if (s) dismissed.current.add(s.id);
    setActive(null);
    setEnded({ status, reason: s?.endReason ?? "" });
  }, []);

  const apply = useCallback(
    (next: RaSession) => {
      const cur = activeRef.current;
      if (!cur || cur.id !== next.id) return;
      if (next.phase === "closed" && next.status) return finish(next, next.status);
      const merged = mergeRaSession(cur, next);
      activeRef.current = merged;
      setActive(merged);
    },
    [finish],
  );

  // ---- discovery ----

  const refreshPending = useCallback(() => {
    if (activeRef.current) return;
    listPendingRemoteAssist()
      .then((page) => {
        setPendingCount(page.count);
        const mine = page.items.find((s) => s.phase === "pending" && s.operator.id !== selfId && (!s.client.id || s.client.id === selfId) && !dismissed.current.has(s.id));
        setPending((cur) => (mine ? (cur && cur.id === mine.id ? cur : mine) : null));
      })
      .catch(() => {});
  }, [selfId]);

  // A reload during a session: pick it back up (same tab = same device id).
  useEffect(() => {
    const id = activeRaId();
    if (!id) return;
    getRemoteAssist(id)
      .then((s) => {
        if (s.phase === "active" || s.phase === "paused") {
          activeRef.current = s;
          setActive(s);
        } else rememberActiveRa("");
      })
      .catch(() => rememberActiveRa(""));
  }, []);

  useEffect(() => {
    refreshPending();
    const offEvents = subscribeUserEvents((e) => {
      if (requestedEvent(e)) refreshPending();
    });
    const offSync = onUserSocketResync(refreshPending);
    const onRoom = () => refreshPending();
    window.addEventListener(CALLROOM_EVENT, onRoom);
    // A request always belongs to a support call: look while one is open.
    const iv = setInterval(() => {
      if (document.visibilityState === "visible" && !activeRef.current && isCallRoomMounted()) refreshPending();
    }, PENDING_POLL_MS);
    return () => {
      offEvents();
      offSync();
      window.removeEventListener(CALLROOM_EVENT, onRoom);
      clearInterval(iv);
    };
  }, [refreshPending]);

  // ---- consent ----

  const requested = useMemo(() => pending?.requestedScopes ?? [], [pending]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [prevPending, setPrevPending] = useState("");
  if ((pending?.id ?? "") !== prevPending) {
    setPrevPending(pending?.id ?? "");
    setScopes(requested);
  }

  const decide = async (decision: "accept" | "deny") => {
    if (!pending || busy) return;
    setBusy(decision);
    const granted = requested.filter((s) => s === RA_VIEW_SCOPE || scopes.includes(s));
    try {
      const s = await consentRemoteAssist(pending.id, { decision, mode: pending.mode, grantedScopes: granted, consentVersion: meta.consentVersion });
      dismissed.current.add(pending.id);
      setPending(null);
      if (decision === "accept") {
        const next = mergeRaSession(pending, s.id ? s : { ...pending, status: "active", phase: "active", grantedScopes: granted });
        activeRef.current = next;
        rememberActiveRa(next.id);
        setEnded(null);
        setActive(next);
        window.dispatchEvent(new CustomEvent(CALLROOM_FLOAT_EVENT));
      }
    } catch (e) {
      if (raErrorCode(e) !== "remote_assist_consent_not_pending") toast(errorText(e, tc) || t("client.consentFailed"), { tone: "err" });
      dismissed.current.add(pending.id);
      setPending(null);
      refreshPending();
    } finally {
      setBusy("");
    }
  };

  // ---- the active session ----

  const activeId = active?.id ?? "";
  const live = active?.phase === "active";
  const operator = active?.operator.name || t("client.operator");

  const refreshSession = useCallback(() => {
    const cur = activeRef.current;
    if (!cur) return;
    getRemoteAssist(cur.id)
      .then(apply)
      .catch((e) => {
        const code = raErrorCode(e);
        if (code === "remote_assist_session_expired") finish(cur, "expired");
        else if (code === "remote_assist_device_session_mismatch") finish(cur, "revoked");
      });
  }, [apply, finish]);

  const sendAck = useCallback(async (cmd: RaCommand, ack: RaAck) => {
    const s = activeRef.current;
    if (!s) return;
    if (socketRef.current?.send("command.ack", ackBody(cmd.id, ack))) return;
    await ackRaCommand(s.id, cmd.id, ack).catch((e) => {
      if (raErrorCode(e) === "remote_assist_device_session_mismatch") finish(s, "revoked");
    });
  }, [finish]);

  // Publish what is on screen (registered components only, no values) with
  // a higher revision whenever it changes — or always, when forced.
  const publish = useCallback(
    (force = false) => {
      const s = activeRef.current;
      if (!s || s.phase !== "active") return;
      const path = raPathOf(window.location.pathname);
      const page = raPageOf(path);
      const known = metaRef.current.loaded ? new Set(metaRef.current.actions.map((a) => a.id)) : undefined;
      const elements = page ? raCollect(known).map((l) => l.def) : [];
      const pageId = page?.pageId ?? OUTSIDE_PAGE;
      const sig = raSignature(pageId, path, elements);
      if (!force && sig === sigRef.current) return;
      sigRef.current = sig;
      const rev = nextRaRevision(s.id, Math.max(revRef.current, s.clientUiRevision));
      revRef.current = rev;
      const pageKey = `${pageId}|${path}|${modalAiId(openModalRoot())}`;
      if (pageKey !== pageKeyRef.current) {
        pageKeyRef.current = pageKey;
        pageRevRef.current = rev;
      }
      const body = { pageId, route: path, uiRevision: rev, elements };
      if (socketRef.current?.send("client.state", clientStateBody(body))) return;
      publishClientState(s.id, body).catch((e) => {
        const code = raErrorCode(e);
        if (code === "remote_assist_device_session_mismatch") return finish(s, "revoked");
        if (code === "remote_assist_session_expired") return finish(s, "expired");
        if (code === "remote_assist_ui_revision_stale") {
          revRef.current += 5;
          sigRef.current = "";
          publishRef.current(true);
          return;
        }
        // Lost publish: the next change sends again.
        sigRef.current = "";
      });
    },
    [finish],
  );
  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);

  const ask = useCallback((p: RaPrompt): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        setPrompt(null);
        resolve(false);
      }, CONFIRM_TIMEOUT_MS);
      setPrompt({
        ...p,
        operator: activeRef.current?.operator.name || "",
        resolve: (ok) => {
          clearTimeout(timer);
          setPrompt(null);
          resolve(ok);
        },
      });
    });
  }, []);

  // The central executor runs each queued command (lib/remoteAssist/runner
  // marks it handled first and acks it once).
  useEffect(() => {
    execRef.current = (cmd, shown) => {
      const s = activeRef.current;
      if (!s) return Promise.resolve({ status: "rejected", failureCode: "session_not_active", result: { applied: false } });
      return raExecute(cmd, {
        meta: metaRef.current,
        mode: s.mode,
        grantedScopes: s.grantedScopes,
        live: s.phase === "active",
        deviceOk: true,
        pageRevision: pageRevRef.current,
        operator: s.operator.name || "",
        confirm: ask,
        confirmationShown: shown,
        navigate: (route) => router.push(route),
        pathname: () => window.location.pathname,
      });
    };
    ackRef.current = sendAck;
    afterRef.current = (cmd, ack) => {
      setLastAction(ack.status === "rejected" || ack.status === "cancelled" ? "" : cmd.actionId);
      publishRef.current(true);
    };
  }, [ask, router, sendAck]);

  const enqueue = useCallback((list: RaCommand[]) => runnerRef.current?.enqueue(list), []);

  const pollCommands = useCallback(() => {
    const s = activeRef.current;
    if (!s || s.phase !== "active") return;
    listRaCommands(s.id)
      .then(enqueue)
      .catch(() => {});
  }, [enqueue]);

  // The session socket.
  useEffect(() => {
    if (!activeId) return;
    const onEvent = (e: RaSocketEvent) => {
      const name = e.event;
      const sessionRaw = asDict(e.data.session ?? e.raw.session);
      if (name === "error") {
        const code = asStr(asDict(e.data.detail).code ?? e.data.code);
        const cur = activeRef.current;
        if (code === "remote_assist_device_session_mismatch" && cur) finish(cur, "revoked");
        else if (code === "remote_assist_ui_revision_stale") {
          revRef.current += 5;
          publishRef.current(true);
        } else if (code === "remote_assist_session_expired" && cur) finish(cur, "expired");
        return;
      }
      if (name === "remote_assist.command_requested") {
        const c = normRaCommand(e.data.command ?? e.data);
        if (c.id) enqueue([c]);
        return;
      }
      if (name === "remote_assist.client_state") return;
      if (name === "remote_assist.revoked" || name === "remote_assist.ended" || name === "remote_assist.expired" || name === "remote_assist.consent_denied") {
        const cur = activeRef.current;
        if (cur) finish({ ...cur, endReason: asStr(sessionRaw.end_reason) || cur.endReason }, name.split(".")[1].replace("consent_", ""));
        return;
      }
      if (sessionRaw.id) apply(normRaSession(sessionRaw));
      else if (name.startsWith("remote_assist.")) refreshSession();
    };
    const sock = openRaSocket(activeId, {
      event: onEvent,
      reconnected: () => {
        refreshSession();
        pollCommands();
        sigRef.current = "";
        publishRef.current(true);
      },
    });
    socketRef.current = sock;
    return () => {
      sock.close();
      if (socketRef.current === sock) socketRef.current = null;
    };
  }, [activeId, apply, enqueue, finish, pollCommands, refreshSession]);

  // Session + command safety nets (the socket is the main path).
  useEffect(() => {
    if (!activeId) return;
    const s1 = setInterval(refreshSession, SESSION_POLL_MS);
    // Every 3 s without a socket, every 15 s with one.
    let ticks = 0;
    const s2 = setInterval(() => {
      ticks += 1;
      if (!socketRef.current?.isOpen() || ticks % Math.round(COMMAND_POLL_SOCKET_MS / COMMAND_POLL_MS) === 0) pollCommands();
    }, COMMAND_POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(s1);
      clearInterval(s2);
      clearInterval(tick);
    };
  }, [activeId, refreshSession, pollCommands]);

  // Publish on every meaningful change while active.
  useEffect(() => {
    if (!activeId || !live) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => publishRef.current(), PUBLISH_DEBOUNCE_MS);
    };
    sigRef.current = "";
    publishRef.current(true);
    pollCommands();
    const mo = new MutationObserver((records) => {
      // The bar, the sheet and the pointer are ours, not the page.
      if (records.every((r) => (r.target as Element).closest?.("[data-ra-ignore]"))) return;
      schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", "aria-hidden", "aria-expanded", "aria-selected", "aria-checked", "aria-invalid", "aria-busy", "hidden", "open"] });
    const offReg = subscribeAiRegistry(schedule);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      sigRef.current = "";
      publishRef.current(true);
      void runnerRef.current?.drain();
    };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    window.addEventListener("popstate", schedule);
    // Next's client navigation fires no event; a cheap URL check covers it.
    let lastPath = window.location.pathname;
    const route = setInterval(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        raClearHighlight();
        schedule();
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      clearInterval(route);
      mo.disconnect();
      offReg();
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("input", schedule, true);
      document.removeEventListener("change", schedule, true);
      window.removeEventListener("popstate", schedule);
    };
  }, [activeId, live, pollCommands]);

  const control = async (what: "pause" | "resume" | "revoke" | "end") => {
    const s = activeRef.current;
    if (!s || busy) return;
    setBusy(what);
    try {
      if (what === "pause") {
        raClearHighlight();
        apply(await pauseRemoteAssist(s.id, "Client requested a pause"));
      } else if (what === "resume") {
        apply(await resumeRemoteAssist(s.id));
      } else if (what === "revoke") {
        await revokeRemoteAssist(s.id, "Client stopped access");
        finish(s, "revoked");
      } else {
        await endRemoteAssist(s.id, "Client ended the session");
        finish(s, "ended");
      }
    } catch (e) {
      const code = raErrorCode(e);
      if (code === "remote_assist_session_expired") finish(s, "expired");
      else if (code === "remote_assist_device_session_mismatch") finish(s, "revoked");
      else {
        toast(errorText(e, tc) || t("client.actionFailed"), { tone: "err" });
        refreshSession();
      }
    } finally {
      setBusy("");
    }
  };

  // Ended sessions say so for a while, then the card leaves.
  useEffect(() => {
    if (!ended) return;
    const id = setTimeout(() => setEnded(null), 12_000);
    return () => clearTimeout(id);
  }, [ended]);

  const expiresAt = active?.expiresAt ? parseServerTime(active.expiresAt) : NaN;
  const left = Number.isFinite(expiresAt) ? expiresAt - now : NaN;
  const pendingExp = pending?.expiresAt ? parseServerTime(pending.expiresAt) : NaN;
  const pendingLeft = Number.isFinite(pendingExp) ? pendingExp - now : NaN;

  // The consent countdown ticks too; an expired request leaves on its own.
  useEffect(() => {
    if (!pending) return;
    const exp = pending.expiresAt ? parseServerTime(pending.expiresAt) : NaN;
    const iv = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (Number.isFinite(exp) && exp <= at) {
        dismissed.current.add(pending.id);
        setPending(null);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [pending]);

  const modeLabel = (m: string) => (t.has(`modes.${m}.title`) ? t(`modes.${m}.title`) : m);
  const scopeLabel = (s: string) => (t.has(`scopes.${s}`) ? t(`scopes.${s}`) : s.replace(/_/g, " "));
  const actionLabel = (a: string) => (t.has(`actions.${raKey(a)}`) ? t(`actions.${raKey(a)}`) : a);
  const caps = active?.caps;
  const canPause = caps ? caps.canPause : true;
  const canResume = caps ? caps.canResume : true;
  const canEnd = caps ? caps.canEnd : true;

  return (
    <>
      {pending && !active ? (
        <div className="ra-consent" role="dialog" aria-modal="true" aria-labelledby="ra-consent-title" data-ra-ignore="" data-ai-ignore="">
          <div className="ra-consent__card">
            <div className="ra-consent__hero">
              <span className="ra-consent__ico" aria-hidden="true">
                <IconMonitor />
              </span>
              <div>
                <h2 id="ra-consent-title">{t("client.consentTitle")}</h2>
                <p>{t("client.consentLead", { name: pending.operator.name || t("client.operator") })}</p>
              </div>
            </div>

            <dl className="ra-consent__who">
              <div>
                <dt>{t("client.operatorLabel")}</dt>
                <dd>
                  <b>{pending.operator.name || t("client.operator")}</b>
                  {pending.operator.lexgoId ? <span className="ra-id">{t("client.lexgoId", { id: pending.operator.lexgoId })}</span> : null}
                </dd>
              </div>
              {pending.ticketId ? (
                <div>
                  <dt>{t("client.ticket")}</dt>
                  <dd>
                    <span className="ra-id">#{pending.ticketId.slice(0, 8)}</span>
                  </dd>
                </div>
              ) : null}
              {Number.isFinite(pendingLeft) ? (
                <div>
                  <dt>{t("client.expires")}</dt>
                  <dd>
                    <b className="ra-consent__timer">{mmss(pendingLeft)}</b>
                  </dd>
                </div>
              ) : null}
            </dl>

            {pending.reason ? (
              <blockquote className="ra-consent__reason">
                <small>{t("client.reason")}</small>
                {pending.reason}
              </blockquote>
            ) : null}

            <div className="ra-consent__mode">
              <span className="ra-mode__ico" aria-hidden="true">
                {pending.mode === "guide" ? <IconEye /> : pending.mode === "prepare" ? <IconEdit /> : <IconMonitor />}
              </span>
              <span className="ra-mode__txt">
                <small>{t("client.modeLabel")}</small>
                <b>{modeLabel(pending.mode)}</b>
                <span>{t.has(`modes.${pending.mode}.text`) ? t(`modes.${pending.mode}.text`) : ""}</span>
              </span>
            </div>

            {requested.length ? (
              <fieldset className="ra-consent__scopes">
                <legend>{t("client.scopes")}</legend>
                <p className="ra-fine">{t("client.scopesHint")}</p>
                <ul>
                  {requested.map((s) => {
                    const required = s === RA_VIEW_SCOPE;
                    const on = required || scopes.includes(s);
                    return (
                      <li key={s}>
                        <label className={`ra-switch${on ? " on" : ""}`}>
                          <span>
                            <b>{scopeLabel(s)}</b>
                            {t.has(`scopeText.${s}`) ? <small>{t(`scopeText.${s}`)}</small> : null}
                          </span>
                          {required ? (
                            <em className="ra-switch__req">{t("client.required")}</em>
                          ) : (
                            <input type="checkbox" role="switch" checked={on} onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)))} aria-label={scopeLabel(s)} />
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ) : null}

            <ul className="ra-consent__facts">
              <li>
                <IconShieldCheck aria-hidden="true" />
                {t("client.factLexgo")}
              </li>
              <li>
                <IconLock aria-hidden="true" />
                {t("client.factSecret")}
              </li>
              <li>
                <IconCheck aria-hidden="true" />
                {t("client.factConfirm")}
              </li>
              <li>
                <IconPower aria-hidden="true" />
                {t("client.factStop", { minutes: pending.durationMinutes || meta.maxMinutes })}
              </li>
            </ul>
            {pendingCount > 1 ? <p className="ra-fine">{t("client.morePending", { n: pendingCount - 1 })}</p> : null}
            <div className="ra-consent__acts">
              <button type="button" className="btn btn--line" onClick={() => void decide("deny")} disabled={Boolean(busy)} aria-busy={busy === "deny" || undefined}>
                {t("client.deny")}
              </button>
              <button type="button" className="btn btn--pri" onClick={() => void decide("accept")} disabled={Boolean(busy) || !meta.loaded} aria-busy={busy === "accept" || undefined}>
                {busy === "accept" ? t("client.accepting") : t("client.accept")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {active ? (
        <div className={`ra-bar${live ? "" : " ra-bar--paused"}`} role="region" aria-label={t("client.barLabel")} data-ra-ignore="" data-ai-ignore="">
          <span className="ra-bar__dot" aria-hidden="true" />
          <span className="ra-bar__who" role="status" aria-live="polite">
            <b>{live ? t("client.barLive") : t("client.barPaused")}</b>
            <small>
              {operator}
              {active.operator.lexgoId ? ` · ${active.operator.lexgoId}` : ""} · {modeLabel(active.mode)}
              {Number.isFinite(left) ? ` · ${t("client.left", { time: mmss(left) })}` : ""}
            </small>
          </span>
          {lastAction ? (
            <span className="ra-bar__last" title={actionLabel(lastAction)}>
              {actionLabel(lastAction)}
            </span>
          ) : null}
          <span className="ra-bar__acts">
            {live ? (
              <button type="button" onClick={() => void control("pause")} disabled={Boolean(busy) || !canPause}>
                <IconPause aria-hidden="true" />
                <span>{t("client.pause")}</span>
              </button>
            ) : (
              <button type="button" onClick={() => void control("resume")} disabled={Boolean(busy) || !canResume}>
                <IconPlay aria-hidden="true" />
                <span>{t("client.resume")}</span>
              </button>
            )}
            <button type="button" className="ra-bar__stop" onClick={() => void control("revoke")} disabled={Boolean(busy)}>
              <IconClose aria-hidden="true" />
              <span>{t("client.stop")}</span>
            </button>
            {canEnd ? (
              <button type="button" onClick={() => void control("end")} disabled={Boolean(busy)} title={t("client.end")}>
                <IconPower aria-hidden="true" />
                <span className="ra-bar__opt">{t("client.end")}</span>
              </button>
            ) : null}
          </span>
        </div>
      ) : null}

      {prompt ? (
        <div className="ra-ask" role="alertdialog" aria-modal="true" aria-labelledby="ra-ask-title" data-ra-ignore="" data-ai-ignore="">
          <b id="ra-ask-title">{t("client.askTitle", { name: prompt.operator || t("client.operator") })}</b>
          {prompt.kind === "draft" ? (
            <>
              <p>{t("client.askDraft")}</p>
              <dl className="ra-ask__rows">
                {prompt.rows.map((r, i) => (
                  <div key={i}>
                    <dt>{r.label}</dt>
                    <dd>{r.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : prompt.kind === "present" ? (
            <>
              <p>{t("client.askPresent", { label: prompt.label })}</p>
              {prompt.summary ? <p className="ra-ask__sum">{prompt.summary}</p> : null}
              <p className="ra-fine">{t("client.askPresentNote")}</p>
            </>
          ) : (
            <p>{t("client.askAction", { action: actionLabel(prompt.actionId), label: prompt.label })}</p>
          )}
          <div className="ra-ask__acts">
            <button type="button" className="btn btn--line btn--sm" onClick={() => prompt.resolve(false)}>
              {t("client.askNo")}
            </button>
            <button type="button" className="btn btn--pri btn--sm" onClick={() => prompt.resolve(true)} autoFocus>
              {prompt.kind === "present" ? t("client.askShow") : t("client.askYes")}
            </button>
          </div>
        </div>
      ) : null}

      {ended && !active ? (
        <div className="ra-ended" role="status" data-ra-ignore="" data-ai-ignore="">
          <IconPower aria-hidden="true" />
          <span>
            <b>{t.has(`client.ended.${ended.status}`) ? t(`client.ended.${ended.status}`) : t("client.ended.ended")}</b>
            <small>{t("client.endedNote")}</small>
          </span>
          <button type="button" onClick={() => setEnded(null)} aria-label={t("client.close")}>
            <IconClose />
          </button>
        </div>
      ) : null}
    </>
  );
}
