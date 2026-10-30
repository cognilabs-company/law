"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { onUserSocketResync, sendUserEvent, subscribeUserEvents, subscribeUserSocketState, userSocketState } from "@/lib/userSocket";
import type { MapRealtime } from "@/lib/services/sellersMap";

// Realtime markers while the map page is open (contract "Realtime map
// updates"): subscribe on the signed-in user socket, refetch the viewport
// (debounced) on every seller_location_updated, resync after a reconnect,
// unsubscribe on leave. Guests get no updates: the socket is never open.
export type MapLive = "off" | "connecting" | "live" | "reconnecting";

export function useMapRealtime(rt: MapRealtime | null, enabled: boolean, debounceMs: number, onRefresh: () => void): MapLive {
  const [subscribed, setSubscribed] = useState(false);
  const [sock, setSock] = useState(userSocketState);
  const [dropped, setDropped] = useState(false);
  const refresh = useEffectEvent(() => onRefresh());

  useEffect(() => {
    if (!rt || !enabled) return;
    let timer = 0;
    let alive = true;
    const subscribe = () => sendUserEvent({ event: rt.subscribe });
    const offState = subscribeUserSocketState((s) => {
      if (!alive) return;
      setSock(s);
      if (s === "online") subscribe();
      else {
        setSubscribed(false);
        if (s === "offline") setDropped(true);
      }
    });
    const offEvents = subscribeUserEvents((e) => {
      if (e.event === rt.subscribed) {
        setSubscribed(true);
        setDropped(false);
      } else if (e.event === rt.update) {
        window.clearTimeout(timer);
        timer = window.setTimeout(refresh, Math.max(150, debounceMs));
      }
    });
    // After a drop the missed events are gone: read the viewport once.
    const offResync = onUserSocketResync(() => {
      window.clearTimeout(timer);
      refresh();
    });
    subscribe();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      offState();
      offEvents();
      offResync();
      sendUserEvent({ event: rt.unsubscribe });
      setSubscribed(false);
    };
  }, [rt, enabled, debounceMs]);

  if (!rt || !enabled) return "off";
  if (subscribed && sock === "online") return "live";
  if (dropped) return "reconnecting";
  return "connecting";
}
