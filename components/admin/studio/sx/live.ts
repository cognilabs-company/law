"use client";

import { useEffect, useRef, useState } from "react";
import { onUserSocketResync, subscribeUserEvents, type UserEvent } from "@/lib/userSocket";
import { isStudioEvent } from "@/lib/services/studio";

export const JOURNEY_EVENT = "studio.journey_updated";

export function useStudioLive(onEvent: (e: UserEvent) => void, enabled = true): void {
  const ref = useRef(onEvent);
  useEffect(() => {
    ref.current = onEvent;
  });
  useEffect(() => {
    if (!enabled) return;
    const off = subscribeUserEvents((e) => {
      if (isStudioEvent(e.event)) ref.current(e);
    });
    const offSync = onUserSocketResync(() => ref.current({ event: "studio.resync" }));
    return () => {
      off();
      offSync();
    };
  }, [enabled]);
}

function dataOf(e: UserEvent): Record<string, unknown> {
  return (e.data && typeof e.data === "object" ? e.data : e) as Record<string, unknown>;
}

function dictOf(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function studioEventObjectId(e: UserEvent): string {
  const d = dataOf(e);
  const pick = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
  const obj = dictOf(d.object);
  return pick(d.object_id) || pick(d.objectId) || pick(obj.id) || pick(e.object_id);
}

export function studioEventCode(e: UserEvent): string {
  const d = dataOf(e);
  const obj = dictOf(d.object);
  const pick = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return pick(d.constructor_code) || pick(d.constructorCode) || pick(obj.constructor_code) || pick(obj.constructorCode);
}

export function studioEventJourneyId(e: UserEvent): string {
  const d = dataOf(e);
  const pick = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
  return pick(d.journey_id) || (d.journey_type !== undefined && d.journey_type !== null && d.journey_type !== "" ? pick(d.id) : "") || pick(dictOf(d.journey).id) || pick(e.journey_id);
}

export function useNow(stepMs = 30_000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, stepMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [stepMs]);
  return now;
}
