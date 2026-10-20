"use client";

import { useCallback, useEffect, useState } from "react";
import { isAborted } from "@/lib/http";
import { subscribeUserEvents } from "@/lib/userSocket";
import { eventKey, getGroupPromotion, promotionSessionId, promotionSignalFor, trackOnce, type GroupEvent, type GroupPromotion } from "@/lib/services/secondOpinion";

export type GroupPromotionState = {
  promo: GroupPromotion | null;
  visible: boolean;
  sessionId: string;
  dismiss: () => void;
  hide: () => void;
  track: (event: GroupEvent) => void;
  refetch: () => void;
};

type Loaded = { orderId: string; promo: GroupPromotion | null; sessionId: string };

export function useGroupPromotion(orderId: string, url: string | null, phase: string, active: boolean): GroupPromotionState {
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ orderId: "", promo: null, sessionId: "" });
  const [hidden, setHidden] = useState("");

  useEffect(() => {
    if (!active || !orderId || url === "") return;
    const ctrl = new AbortController();
    const sessionId = promotionSessionId();
    getGroupPromotion(orderId, { url, sessionId, signal: ctrl.signal })
      .then((promo) => {
        if (!ctrl.signal.aborted) setLoaded({ orderId, promo, sessionId });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && !isAborted(e)) setLoaded({ orderId, promo: null, sessionId });
      });
    return () => ctrl.abort();
  }, [orderId, url, phase, tick, active]);

  useEffect(() => {
    if (!active || !orderId) return;
    return subscribeUserEvents((ev) => {
      if (promotionSignalFor(ev, orderId)) setTick((n) => n + 1);
    });
  }, [orderId, active]);

  const promo = active && url !== "" && loaded.orderId === orderId ? loaded.promo : null;
  const hideKey = promo ? `${orderId}:${promo.placement}` : "";
  const visible = !!promo && promo.visible && hidden !== hideKey;
  const sessionId = loaded.sessionId;

  const dismiss = useCallback(() => {
    if (!promo) return;
    setHidden(`${orderId}:${promo.placement}`);
    const sid = sessionId || promotionSessionId();
    trackOnce(orderId, { event: "dismiss", placement: promo.placement, sessionId: sid, key: eventKey(orderId, promo.placement, sid, "dismiss"), url: promo.eventUrl });
  }, [orderId, promo, sessionId]);

  const hide = useCallback(() => {
    if (promo) setHidden(`${orderId}:${promo.placement}`);
  }, [orderId, promo]);

  const track = useCallback(
    (event: GroupEvent) => {
      if (!promo) return;
      const sid = sessionId || promotionSessionId();
      const extra = event === "click" ? Date.now().toString(36) : "";
      trackOnce(orderId, { event, placement: promo.placement, sessionId: sid, key: eventKey(orderId, promo.placement, sid, event, extra), url: promo.eventUrl });
    },
    [orderId, promo, sessionId],
  );

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return { promo, visible, sessionId, dismiss, hide, track, refetch };
}
