"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, asDict, asStr, backendOrigin } from "@/lib/http";
import { getToken } from "@/lib/client";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  addItem,
  deviceKey,
  getActivity,
  getBootstrap,
  getItems,
  getWidgets,
  goOffline,
  heartbeat,
  normPrefs,
  removeItem,
  savePrefs,
  saveWindows,
  setDeskRole,
  type Activity,
  type Bootstrap,
  type DeskItem,
  type DeskPrefs,
  type ItemInput,
  type PrefsInput,
  type SavedWindow,
  type Widget,
  type WindowInput,
} from "@/lib/services/lawyerDesktop";

type Status = "loading" | "ready" | "off";
const errData = (e: unknown) => (e instanceof ApiError ? asDict(e.data.detail ?? e.data) : {});

// The desktop's link to the backend (§4–§17): one bootstrap per shell load,
// the widgets and the activity center, a presence heartbeat every 30 s while
// the desktop is visible, the desktop socket (preferences, pinned and recent
// items synced from other devices) and the module socket (anything that may
// change a badge refreshes the feeds, debounced). Preferences and windows
// are saved with the backend's revision, and a conflict takes the server's
// copy. If the backend refuses (no desktop for this account) everything
// here stays quiet and the desktop works from this browser alone.
export function useDeskBackend(role: string, activeApp: () => { appId: string; entityType?: string; entityId?: string; busy?: boolean }) {
  const [status, setStatus] = useState<Status>("loading");
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [prefs, setPrefs] = useState<DeskPrefs | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [pinned, setPinned] = useState<DeskItem[]>([]);
  const [recent, setRecent] = useState<DeskItem[]>([]);
  const [notice, setNotice] = useState("");
  const [device, setDevice] = useState("");
  const appRef = useRef(activeApp);
  const revs = useRef(new Map<string, number>());
  useEffect(() => {
    appRef.current = activeApp;
  });

  const refreshFeeds = useCallback(() => {
    getWidgets().then(setWidgets).catch(() => undefined);
    getActivity().then(setActivity).catch(() => undefined);
  }, []);
  const refreshItems = useCallback(() => {
    getItems("pinned").then(setPinned).catch(() => undefined);
    getItems("recent").then(setRecent).catch(() => undefined);
  }, []);

  // Bootstrap, once, from this role's desktop.
  useEffect(() => {
    setDeskRole(role);
    const c = new AbortController();
    const dev = deviceKey();
    const h = setTimeout(() => setDevice(dev), 0);
    getBootstrap(dev, c.signal)
      .then((b) => {
        if (c.signal.aborted) return;
        for (const w of b.windows) revs.current.set(w.key, w.revision);
        setBoot(b);
        setPrefs(b.prefs);
        setPinned(b.pinned);
        setRecent(b.recent);
        setStatus("ready");
        refreshFeeds();
      })
      .catch(() => !c.signal.aborted && setStatus("off"));
    return () => {
      clearTimeout(h);
      c.abort();
    };
  }, [refreshFeeds, role]);

  const ready = status === "ready";

  // Presence: every heartbeat interval while the desktop is in view; offline
  // when the page goes away (best effort, the backend expires it at 90 s).
  useEffect(() => {
    if (!ready || !device) return;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      const a = appRef.current();
      heartbeat({ device_key: device, status: a.busy ? "in_call" : a.appId === "editor" ? "editing" : "online", active_app_id: a.appId || undefined, entity_type: a.entityType, entity_id: a.entityId }).catch(() => undefined);
    };
    beat();
    const every = (boot?.heartbeatSeconds ?? 30) * 1000;
    const h = setInterval(beat, every);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(h);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [ready, device, boot?.heartbeatSeconds]);

  // The desktop socket, reconnecting with a backoff capped at 30 s; after a
  // reconnect the feeds are read again.
  useEffect(() => {
    if (!ready || !boot) return;
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let opened = false;
    let stop = false;
    const open = () => {
      const token = getToken();
      if (stop || !token) return;
      const path = boot.wsPath.startsWith("/") ? boot.wsPath : `/${boot.wsPath}`;
      try {
        ws = new WebSocket(`${backendOrigin("ws")}${path.replace("{access_token}", encodeURIComponent(token))}`);
      } catch {
        return schedule();
      }
      ws.onopen = () => {
        if (opened) {
          refreshFeeds();
          refreshItems();
        }
        opened = true;
        retry = 0;
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
      };
      ws.onmessage = (m) => {
        let d: Record<string, unknown>;
        try {
          d = asDict(JSON.parse(String(m.data)));
        } catch {
          return;
        }
        const name = asStr(d.event ?? d.type);
        const data = asDict(d.data ?? d.payload);
        if (name === "desktop.preferences.updated") setPrefs(normPrefs(asDict(data.preferences ?? data)));
        else if (name === "desktop.pinned.updated" || name === "desktop.recent.updated") refreshItems();
      };
      ws.onclose = () => {
        if (ping) clearInterval(ping);
        schedule();
      };
    };
    const schedule = () => {
      if (stop) return;
      timer = setTimeout(open, Math.min(30_000, 1000 * 2 ** retry++));
    };
    open();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      if (ping) clearInterval(ping);
      ws?.close();
    };
  }, [ready, boot, refreshFeeds, refreshItems]);

  // The modules' own events (chat, notifications, orders, calls) may change
  // a badge or an activity row: read the feeds again, at most every 2 s.
  useEffect(() => {
    if (!ready) return;
    let h: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeUserEvents(() => {
      if (h) return;
      h = setTimeout(() => {
        h = undefined;
        refreshFeeds();
      }, 2000);
    });
    return () => {
      off();
      if (h) clearTimeout(h);
    };
  }, [ready, refreshFeeds]);

  // Preferences: saved with the version they were read at; a newer copy
  // from another device wins and is said so.
  const updatePrefs = useCallback(
    async (patch: Omit<PrefsInput, "expected_layout_version">, conflictText: string) => {
      if (!ready || !prefs) return;
      setPrefs({ ...prefs, ...(patch.theme ? { theme: patch.theme } : {}), ...(patch.focus_mode !== undefined ? { focusMode: patch.focus_mode } : {}), ...(patch.settings ? { settings: patch.settings } : {}) });
      try {
        setPrefs(await savePrefs({ ...patch, expected_layout_version: prefs.version }));
      } catch (e) {
        const cur = errData(e).current;
        if (e instanceof ApiError && e.status === 409 && cur) {
          setPrefs(normPrefs(cur));
          setNotice(conflictText);
        }
      }
    },
    [ready, prefs],
  );

  // Windows: the batch for this device, each record with the revision the
  // backend last gave it; on a revision conflict the server's record is
  // taken and the change sent once more.
  const syncWindows = useCallback(
    async (records: Omit<WindowInput, "revision">[]) => {
      if (!ready || !device || !records.length) return;
      const withRev = () => records.map((r) => ({ ...r, revision: revs.current.get(r.window_key) ?? 0 }));
      const keep = (saved: SavedWindow[]) => saved.forEach((w) => revs.current.set(w.key, w.revision));
      try {
        keep(await saveWindows(device, withRev()));
      } catch (e) {
        const win = errData(e).window;
        if (e instanceof ApiError && e.status === 409 && win) {
          const w = asDict(win);
          revs.current.set(asStr(w.window_key), Number(w.revision) || 0);
          keep(await saveWindows(device, withRev()).catch(() => []));
        }
      }
    },
    [ready, device],
  );

  const pin = useCallback((item: ItemInput) => addItem("pinned", item).then(refreshItems).catch(() => undefined), [refreshItems]);
  const unpin = useCallback((id: string) => removeItem(id).then(refreshItems).catch(() => undefined), [refreshItems]);
  const opened = useCallback((item: ItemInput) => addItem("recent", item).then(refreshItems).catch(() => undefined), [refreshItems]);
  const signOut = useCallback(() => {
    if (device) goOffline(device).catch(() => undefined);
  }, [device]);

  const clearNotice = useCallback(() => setNotice(""), []);

  return { status, boot, prefs, widgets, activity, pinned, recent, notice, clearNotice, refreshFeeds, updatePrefs, syncWindows, pin, unpin, opened, signOut };
}
