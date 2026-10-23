"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, isAborted } from "@/lib/http";
import { onUserSocketResync, subscribeUserEvents, subscribeUserSocketState, userSocketState } from "@/lib/userSocket";
import { createAgentJob, getAgentJob, isTerminal, normAgentError, type AgentInput, type AgentJob } from "@/lib/services/studioAgent";

// One Studio AI agent job, kept alive across refreshes (§4, §10): its id is
// stored the moment the backend accepts it, the detail endpoint is the
// canonical state, the shared user socket moves it along, and a 5-second
// poll stands in only while that socket is down. Nothing here ever submits
// a job on its own.

const PREFIX = "lexgo:studio-agent:";
const RECENT_MAX = 8;
const POLL_MS = 5000;

export type AgentRef = { id: string; at: string; codes: string[]; drafts: number };
type Refs = { current: string; recent: AgentRef[] };
const EMPTY: Refs = { current: "", recent: [] };

// A per-user store over localStorage: job ids only — never the prompt or
// any generated content (§21).
const cache = new Map<string, Refs>();
const listeners = new Set<() => void>();

function read(user: string): Refs {
  const hit = cache.get(user);
  if (hit) return hit;
  let out = EMPTY;
  try {
    const raw = localStorage.getItem(PREFIX + user);
    const d = raw ? (JSON.parse(raw) as Partial<Refs>) : null;
    if (d && typeof d === "object")
      out = {
        current: typeof d.current === "string" ? d.current : "",
        recent: Array.isArray(d.recent) ? d.recent.filter((r): r is AgentRef => !!r && typeof r.id === "string").slice(0, RECENT_MAX) : [],
      };
  } catch {
    out = EMPTY;
  }
  cache.set(user, out);
  return out;
}

function write(user: string, next: Refs) {
  cache.set(user, next);
  try {
    localStorage.setItem(PREFIX + user, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the job still runs; only a refresh
    // would lose its id.
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith(PREFIX)) {
      cache.delete(e.key.slice(PREFIX.length));
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export type AgentPhase = "idle" | "loading" | "ready" | "missing" | "forbidden" | "error";
export type AgentConn = "online" | "connecting" | "offline";

type Loaded = { id: string; job: AgentJob | null; phase: AgentPhase; error: unknown };

export function useAgentJob(user: string) {
  const refs = useSyncExternalStore(
    subscribe,
    () => (user ? read(user) : EMPTY),
    () => EMPTY,
  );
  const conn = useSyncExternalStore(subscribeUserSocketState, userSocketState, () => "offline" as const) as AgentConn;
  const id = refs.current;
  const [loaded, setLoaded] = useState<Loaded>({ id: "", job: null, phase: "idle", error: null });
  const seq = useRef(0);

  const fetchJob = useCallback(
    async (jobId: string) => {
      if (!jobId) return;
      const n = ++seq.current;
      try {
        const job = await getAgentJob(jobId);
        if (n !== seq.current) return;
        setLoaded({ id: jobId, job, phase: "ready", error: null });
      } catch (e) {
        if (n !== seq.current || isAborted(e)) return;
        if (e instanceof ApiError && e.status === 404) {
          // §13: forget only the job this user cannot read.
          const cur = read(user);
          write(user, { current: cur.current === jobId ? "" : cur.current, recent: cur.recent.filter((r) => r.id !== jobId) });
          setLoaded({ id: jobId, job: null, phase: "missing", error: e });
          return;
        }
        setLoaded((s) => ({ id: jobId, job: s.id === jobId ? s.job : null, phase: e instanceof ApiError && e.status === 403 ? "forbidden" : "error", error: e }));
      }
    },
    [user],
  );

  // The canonical state, once per job shown.
  useEffect(() => {
    if (!id) return;
    void Promise.resolve().then(() => fetchJob(id));
  }, [id, fetchJob]);

  const view: Loaded = !id ? { id: "", job: null, phase: loaded.phase === "missing" ? "missing" : "idle", error: loaded.error } : loaded.id === id ? loaded : { id, job: null, phase: "loading", error: null };
  const terminal = !!view.job && isTerminal(String(view.job.status));

  // Live events for this job only (§10.5–7).
  const stageRef = useRef({ stage: "", saved: -1 });
  useEffect(() => {
    if (!id) return;
    return subscribeUserEvents((e) => {
      if (typeof e.event !== "string" || !e.event.startsWith("studio.ai_agent.")) return;
      if (e.job_id !== id) return;
      if (e.event === "studio.ai_agent.progress") {
        const stage = typeof e.stage === "string" ? e.stage : "";
        const saved = typeof e.saved_count === "number" ? e.saved_count : -1;
        const pct = typeof e.progress_percent === "number" ? e.progress_percent : null;
        setLoaded((s) =>
          s.id === id && s.job
            ? { ...s, job: { ...s.job, status: s.job.status === "queued" ? "running" : s.job.status, stage: stage || s.job.stage, progress: pct ?? s.job.progress, savedCount: saved >= 0 ? saved : s.job.savedCount } }
            : s,
        );
        const prev = stageRef.current;
        stageRef.current = { stage, saved };
        if (stage !== prev.stage || saved !== prev.saved) void fetchJob(id);
        return;
      }
      // completed / partial_failed / failed: apply what the event says, then
      // read the job for its drafts and summary.
      const status = e.event.slice("studio.ai_agent.".length);
      setLoaded((s) =>
        s.id === id && s.job
          ? { ...s, job: { ...s.job, status, stage: status, progress: typeof e.progress_percent === "number" ? e.progress_percent : s.job.progress, error: normAgentError(e.error) ?? s.job.error } }
          : s,
      );
      void fetchJob(id);
    });
  }, [id, fetchJob]);

  // One reconciling read after every reconnect (§10.8).
  useEffect(() => {
    if (!id) return;
    return onUserSocketResync(() => void fetchJob(id));
  }, [id, fetchJob]);

  // REST fallback only while the socket is down and the job still runs (§10.10–11).
  const polling = !!id && conn !== "online" && !terminal && view.phase !== "missing" && view.phase !== "forbidden";
  useEffect(() => {
    if (!polling) return;
    const h = setInterval(() => void fetchJob(id), POLL_MS);
    return () => clearInterval(h);
  }, [polling, id, fetchJob]);

  const [submitting, setSubmitting] = useState(false);
  const start = useCallback(
    async (input: AgentInput): Promise<{ ok: true } | { ok: false; error: unknown }> => {
      if (submitting) return { ok: false, error: null };
      setSubmitting(true);
      try {
        const job = await createAgentJob(input);
        // Stored before anything renders it (§10.3).
        const cur = read(user);
        const ref: AgentRef = { id: job.id, at: job.requestedAt || new Date().toISOString(), codes: job.constructorCodes.length ? job.constructorCodes : input.constructorCodes, drafts: job.targetDrafts || input.drafts };
        write(user, { current: job.id, recent: [ref, ...cur.recent.filter((r) => r.id !== job.id)].slice(0, RECENT_MAX) });
        setLoaded({ id: job.id, job, phase: "ready", error: null });
        stageRef.current = { stage: job.stage, saved: -1 };
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e };
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, user],
  );

  const open = useCallback(
    (jobId: string) => {
      const cur = read(user);
      write(user, { ...cur, current: jobId });
    },
    [user],
  );
  const close = useCallback(() => {
    const cur = read(user);
    write(user, { ...cur, current: "" });
  }, [user]);

  return {
    id,
    job: view.job,
    phase: view.phase,
    error: view.error,
    conn,
    polling,
    terminal,
    recent: refs.recent,
    submitting,
    start,
    open,
    close,
    refresh: () => void fetchJob(id),
  };
}
