"use client";

import { useCallback, useEffect, useRef } from "react";
import { http } from "@/lib/http";

export type PromoEventType = "impression" | "search_appearance" | "profile_click" | "contact_request";

type QueuedEvent = { body: Record<string, unknown>; attempts: number };

const SESSION_KEY = "lexgo_promo_session";
const ATTRIBUTION_KEY = "lexgo_promo_attribution";
const RETRY_MS = [1500, 4000, 9000];
const MAX_META_BYTES = 4096;

let memorySession = "";
const sent = new Set<string>();
const queue: QueuedEvent[] = [];
let flushing = false;

export function newIdempotencyKey(): string {
  return randomId();
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function promoSessionKey(): string {
  if (memorySession) return memorySession;
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      memorySession = stored;
      return stored;
    }
    memorySession = randomId();
    window.sessionStorage.setItem(SESSION_KEY, memorySession);
  } catch {
    memorySession = memorySession || randomId();
  }
  return memorySession;
}

function safeMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (/phone|name|message|text|email|referral/i.test(key)) continue;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) clean[key] = value;
  }
  return JSON.stringify(clean).length > MAX_META_BYTES ? {} : clean;
}

function retryable(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return typeof status !== "number" || status >= 500 || status === 408 || status === 429;
}

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (queue.length) {
      const item = queue[0];
      try {
        await http("/promotions/events", { method: "POST", body: JSON.stringify(item.body) });
        queue.shift();
      } catch (error) {
        queue.shift();
        if (retryable(error) && item.attempts < RETRY_MS.length) {
          const wait = RETRY_MS[item.attempts];
          item.attempts += 1;
          window.setTimeout(() => {
            queue.push(item);
            void flush();
          }, wait);
        }
      }
    }
  } finally {
    flushing = false;
  }
}

export function trackPromoEvent(promotionId: string, type: PromoEventType, source: string, opts: { metadata?: Record<string, unknown>; dedupe?: string } = {}): void {
  if (typeof window === "undefined" || !promotionId) return;
  const session = promoSessionKey();
  const key = [type, promotionId, session, opts.dedupe ?? ""].join(":").slice(0, 190);
  if (sent.has(key)) return;
  sent.add(key);
  queue.push({
    attempts: 0,
    body: { promotion_id: promotionId, event_type: type, source, session_key: session, idempotency_key: key, metadata: safeMetadata(opts.metadata) },
  });
  void flush();
}

type Attribution = Record<string, { promotionId: string; source: string; at: number }>;

function readAttribution(): Attribution {
  try {
    return JSON.parse(window.sessionStorage.getItem(ATTRIBUTION_KEY) || "{}") as Attribution;
  } catch {
    return {};
  }
}

export function rememberPromoClick(sellerUserId: string, promotionId: string, source: string): void {
  if (typeof window === "undefined" || !sellerUserId || !promotionId) return;
  try {
    const all = readAttribution();
    all[sellerUserId] = { promotionId, source, at: Date.now() };
    window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(all));
  } catch {
    return;
  }
}

export function trackPromoContact(sellerUserId: string, action: string): void {
  if (typeof window === "undefined" || !sellerUserId) return;
  const hit = readAttribution()[sellerUserId];
  if (!hit || Date.now() - hit.at > 6 * 60 * 60 * 1000) return;
  trackPromoEvent(hit.promotionId, "contact_request", hit.source, { metadata: { action }, dedupe: action });
}

export function promoClick(promotionId: string, sellerUserId: string, source: string, position: number): void {
  trackPromoEvent(promotionId, "profile_click", source, { metadata: { position }, dedupe: `${source}:${position}` });
  rememberPromoClick(sellerUserId, promotionId, source);
}

export function usePromoImpression(promotionId: string, source: string, position: number) {
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);
  return useCallback(
    (node: Element | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node || !promotionId || typeof IntersectionObserver === "undefined") return;
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
            trackPromoEvent(promotionId, "impression", source, { metadata: { position }, dedupe: `${source}:${position}` });
            io.disconnect();
          }
        },
        { threshold: [0.5] },
      );
      io.observe(node);
      observer.current = io;
    },
    [promotionId, source, position],
  );
}

export function useSearchAppearances(promotionIds: string[], source: string, searchKey: string): void {
  const joined = promotionIds.join(",");
  useEffect(() => {
    if (!searchKey || !joined) return;
    joined.split(",").forEach((id, index) => trackPromoEvent(id, "search_appearance", source, { metadata: { position: index + 1 }, dedupe: searchKey.slice(0, 80) }));
  }, [joined, source, searchKey]);
}
