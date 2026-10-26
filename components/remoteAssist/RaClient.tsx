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
  raConsentScopes,
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
import { useRaLink } from "@/lib/remoteAssist/callLink";
import { raWireAllowed, type RaShareState } from "@/lib/remoteAssist/marks";
import { raScreenFacts, raShareHidden } from "@/lib/remoteAssist/privacy";
import { raOtherTab } from "@/lib/remoteAssist/tabHandle";
import { raProbeAt } from "@/lib/remoteAssist/probe";
import { RaMarkLayer, useMarks } from "./RaMarks";
import { createRaRunner, type RaRunner } from "@/lib/remoteAssist/runner";
import { openRaSocket, type RaSocket, type RaSocketEvent } from "@/lib/remoteAssist/socket";
import { IconCheck, IconClock, IconClose, IconEdit, IconEye, IconEyeOff, IconLock, IconMonitor, IconPause, IconPlay, IconPower } from "@/components/icons";

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

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "L";

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

  // The open support call (v2 screen share and marks ride it).
  const link = useRaLink();
  const linkRef = useRef(link);
  useEffect(() => {
    activeRef.current = active;
    promptRef.current = prompt;
    linkRef.current = link;
  }, [active, prompt, link]);

  useEffect(() => {
    void loadRaMeta().then((m) => {
      metaRef.current = m;
      setMeta(m);
    });
  }, []);

  // ---- ending ----

  const finish = useCallback((s: Pick<RaSession, "id" | "status" | "endReason"> | null, status: string) => {
    raClearHighlight();
    // The screen share ends with the session.
    void linkRef.current?.stopShare().catch(() => {});
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

  // One "Allow" grants exactly what the operator asked for (v2: no toggles).
  const requested = useMemo(() => pending?.requestedScopes ?? [], [pending]);

  const decide = async (decision: "accept" | "deny") => {
    if (!pending || busy) return;
    setBusy(decision);
    const granted = raConsentScopes(requested, decision);
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
        // The one follow-up step: the browser asks which tab to show.
        void startShare();
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

  // ---- the screen share (v2) ----
  // The client's LexGo tab as a ScreenShare track in the open support call.
  // Muted on sensitive pages and while a secret field shows; never sent to
  // the remote-assistance API.

  const [share, setShare] = useState<RaShareState>({ on: false, hidden: false, surface: "" });
  const [shareErr, setShareErr] = useState<"" | "denied" | "nocall" | "wrongtab">("");
  const [askedShare, setAskedShare] = useState(false);
  const [barOpen, setBarOpen] = useState(true);
  const { marks, add: addMark, clear: clearMarks } = useMarks();
  const shareRef = useRef(share);
  useEffect(() => {
    shareRef.current = share;
  }, [share]);

  const tellShare = useCallback((next: RaShareState) => {
    linkRef.current?.send({ t: "share", state: next });
  }, []);

  const startShare = async () => {
    const l = linkRef.current;
    if (!l) {
      setShareErr("nocall");
      return;
    }
    setShareErr("");
    try {
      const surface = await l.startShare();
      // Only this tab: another tab (say, the operator's own, in the same
      // browser) would show the operator their own page inside itself.
      const tab = l.localShare().tab;
      if (raOtherTab(tab)) {
        await l.stopShare().catch(() => {});
        setShareErr("wrongtab");
        tellShare({ on: false, hidden: false, surface: "" });
        return;
      }
      const next: RaShareState = { on: true, hidden: false, surface, ...(tab ? { tab } : {}) };
      setShare(next);
      setAskedShare(false);
      tellShare(next);
    } catch {
      setShareErr("denied");
      tellShare({ on: false, hidden: false, surface: "" });
    }
  };

  const stopShare = async () => {
    await linkRef.current?.stopShare().catch(() => {});
    const next = { on: false, hidden: false, surface: "" };
    setShare(next);
    clearMarks();
    tellShare(next);
  };

  // Marks and requests from the session's operator only.
  const activeOperator = active?.operator.id ?? "";
  const shareSid = active?.id ?? "";
  useEffect(() => {
    if (!link || !shareSid) return;
    return link.onWire((msg, from) => {
      if (!raWireAllowed(msg, from, { operator: activeOperator, client: selfId })) return;
      if (msg.t === "mark") {
        // Drawn on this page only when it is this tab that is shared.
        if (shareRef.current.on && shareRef.current.surface === "browser" && activeRef.current?.phase === "active") addMark(msg.mark);
      } else if (msg.t === "clear") clearMarks();
      else if (msg.t === "ask-share") setAskedShare(true);
      else if (msg.t === "probe") {
        // The operator clicked the picture of this tab: say what is there
        // (a safe route or a registered component — never a value).
        const cur = shareRef.current;
        if (!cur.on || cur.hidden || cur.surface !== "browser" || activeRef.current?.phase !== "active") return;
        linkRef.current?.send({ t: "probe-hit", id: msg.id, ...raProbeAt(msg.x, msg.y) });
      }
    });
  }, [link, shareSid, activeOperator, selfId, addMark, clearMarks]);

  // The browser's own "Stop sharing" ends the share too.
  useEffect(() => {
    if (!link) return;
    return link.onChange(() => {
      const ls = link.localShare();
      const cur = shareRef.current;
      if (cur.on && !ls.on) {
        const next = { on: false, hidden: false, surface: "" };
        setShare(next);
        tellShare(next);
      }
    });
  }, [link, tellShare]);

  // Privacy: hide the picture on sensitive pages, near secret fields and
  // while the session is paused.
  useEffect(() => {
    if (!share.on || !shareSid) return;
    const check = () => {
      const hidden = raShareHidden(window.location.pathname, window.location.search, raScreenFacts()) || activeRef.current?.phase !== "active";
      if (hidden === shareRef.current.hidden) return;
      void linkRef.current?.setShareHidden(hidden).catch(() => {});
      const next = { ...shareRef.current, hidden };
      setShare(next);
      tellShare(next);
    };
    check();
    const iv = setInterval(check, 400);
    document.addEventListener("focusin", check, true);
    document.addEventListener("focusout", check, true);
    return () => {
      clearInterval(iv);
      document.removeEventListener("focusin", check, true);
      document.removeEventListener("focusout", check, true);
    };
  }, [share.on, shareSid, tellShare]);

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

  const actionLabel = (a: string) => (t.has(`actions.${raKey(a)}`) ? t(`actions.${raKey(a)}`) : a);
  const caps = active?.caps;
  const canPause = caps ? caps.canPause : true;
  const canResume = caps ? caps.canResume : true;
  const canEnd = caps ? caps.canEnd : true;

  return (
    <>
      {pending && !active ? (
        <div className="ra-consent" role="dialog" aria-modal="true" aria-labelledby="ra-consent-title" aria-describedby="ra-consent-lead" data-ra-ignore="" data-ai-ignore="">
          <div className="ra-consent__card">
            <div className="ra-consent__hero">
              <span className="ra-avatar" aria-hidden="true">
                {initialsOf(pending.operator.name || t("client.operator"))}
                <i />
              </span>
              <div className="ra-consent__who">
                <b>{pending.operator.name || t("client.operator")}</b>
                <small>
                  {t("client.fromSupport")}
                  {pending.operator.lexgoId ? ` · ${t("client.lexgoId", { id: pending.operator.lexgoId })}` : ""}
                </small>
              </div>
              {Number.isFinite(pendingLeft) ? (
                <span className="ra-consent__timer" aria-label={t("client.expires")}>
                  <IconClock aria-hidden="true" />
                  {mmss(pendingLeft)}
                </span>
              ) : null}
            </div>
            <h2 id="ra-consent-title">{t("client.consentTitle")}</h2>
            <p id="ra-consent-lead" className="ra-consent__lead">
              {t("client.consentLead", { name: pending.operator.name || t("client.operator") })}
            </p>
            {pending.reason ? <p className="ra-consent__reason">«{pending.reason}»</p> : null}
            <ul className="ra-consent__can" aria-label={t("client.canTitle")}>
              <li>
                <span aria-hidden="true">
                  <IconEye />
                </span>
                {t("client.canSee")}
              </li>
              <li>
                <span aria-hidden="true">
                  <IconEdit />
                </span>
                {t("client.canDraw")}
              </li>
              <li>
                <span aria-hidden="true">
                  <IconMonitor />
                </span>
                {t("client.canOpen")}
              </li>
              {pending.mode !== "guide" ? (
                <li>
                  <span aria-hidden="true">
                    <IconCheck />
                  </span>
                  {t("client.canFill")}
                </li>
              ) : null}
            </ul>
            <p className="ra-consent__safe">
              <IconLock aria-hidden="true" />
              <span>{t("client.safe")}</span>
            </p>
            {pendingCount > 1 ? <p className="ra-fine">{t("client.morePending", { n: pendingCount - 1 })}</p> : null}
            <div className="ra-consent__acts">
              <button type="button" className="btn btn--line" onClick={() => void decide("deny")} disabled={Boolean(busy)} aria-busy={busy === "deny" || undefined}>
                {t("client.deny")}
              </button>
              <button type="button" className="btn btn--pri" onClick={() => void decide("accept")} disabled={Boolean(busy) || !meta.loaded} aria-busy={busy === "accept" || undefined} autoFocus>
                {busy === "accept" ? t("client.accepting") : t("client.accept")}
              </button>
            </div>
            <p className="ra-fine">{t("client.afterAllow")}</p>
          </div>
        </div>
      ) : null}

      {active && marks.length ? <RaMarkLayer marks={marks} fixed /> : null}

      {active ? (
        <div className={`ra-bar${live ? "" : " ra-bar--paused"}${barOpen ? "" : " ra-bar--min"}`} role="region" aria-label={t("client.barLabel")} data-ra-ignore="" data-ai-ignore="">
          <button type="button" className="ra-bar__fold" onClick={() => setBarOpen((v) => !v)} aria-expanded={barOpen} aria-label={barOpen ? t("client.fold") : t("client.unfold")}>
            <span className="ra-bar__dot" aria-hidden="true" />
          </button>
          <span className="ra-bar__who" role="status" aria-live="polite">
            <b>{live ? t("client.barLive", { name: operator }) : t("client.barPaused")}</b>
            <small>
              {share.on ? (share.hidden ? t("client.shareHidden") : t("client.shareOn")) : t("client.shareOff")}
              {Number.isFinite(left) ? ` · ${t("client.left", { time: mmss(left) })}` : ""}
            </small>
          </span>
          {barOpen ? (
            <span className="ra-bar__acts">
              {share.on ? (
                <button type="button" onClick={() => void stopShare()} title={t("client.stopShare")} aria-label={t("client.stopShare")}>
                  <IconEyeOff aria-hidden="true" />
                  <span>{t("client.stopShare")}</span>
                </button>
              ) : link ? (
                <button type="button" className={`ra-bar__share${askedShare ? " ra-bar__share--ask" : ""}`} onClick={() => void startShare()} aria-label={askedShare ? t("client.shareAsked") : t("client.share")}>
                  <IconMonitor aria-hidden="true" />
                  <span>{askedShare ? t("client.shareAsked") : t("client.share")}</span>
                </button>
              ) : null}
              {live ? (
                <button type="button" onClick={() => void control("pause")} disabled={Boolean(busy) || !canPause} aria-label={t("client.pause")}>
                  <IconPause aria-hidden="true" />
                  <span>{t("client.pause")}</span>
                </button>
              ) : (
                <button type="button" onClick={() => void control("resume")} disabled={Boolean(busy) || !canResume} aria-label={t("client.resume")}>
                  <IconPlay aria-hidden="true" />
                  <span>{t("client.resume")}</span>
                </button>
              )}
              <button type="button" className="ra-bar__stop" onClick={() => void control("revoke")} disabled={Boolean(busy)} aria-label={t("client.stop")}>
                <IconClose aria-hidden="true" />
                <span>{t("client.stop")}</span>
              </button>
              {canEnd ? (
                <button type="button" onClick={() => void control("end")} disabled={Boolean(busy)} title={t("client.end")} aria-label={t("client.end")}>
                  <IconPower aria-hidden="true" />
                </button>
              ) : null}
            </span>
          ) : null}
          {barOpen && (shareErr || lastAction) ? (
            <span className="ra-bar__note" role="status">
              {shareErr === "denied" ? t("client.shareDenied") : shareErr === "nocall" ? t("client.shareNoCall") : shareErr === "wrongtab" ? t("client.shareWrongTab") : actionLabel(lastAction)}
            </span>
          ) : null}
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
