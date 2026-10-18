"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError, isAborted, logApiError } from "@/lib/http";
import { listCancellationReviews, type CancellationReview, type ReviewList } from "@/lib/services/marketRuntime";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { useAiSelection } from "@/lib/ai/registry";
import { CCX_PAGE, isReviewQueueEvent, reviewPageOf, reviewStatusesOf, type QueuePage } from "./model";

export type QueueState = "loading" | "ready" | "error" | "forbidden";

export type CancellationQueueModel = {
  state: QueueState;
  status: string;
  setStatus: (status: string) => void;
  statuses: string[];
  items: CancellationReview[];
  offset: number;
  page: QueuePage;
  next: () => void;
  prev: () => void;
  refresh: () => void;
  busy: boolean;
  stale: boolean;
  error: unknown;
  openCount: number | null;
  announce: string;
};

const EMPTY_PAGE: QueuePage = { total: null, hasMore: false, from: 0, to: 0 };
const OPEN_LIMIT = 100;
const KICK_MS = 300;

const isAuthError = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403);

function mergeStatuses(prev: string[], next: string[]): string[] {
  const all = [...new Set([...prev, ...next])];
  return all.includes("open") ? ["open", ...all.filter((s) => s !== "open")] : all;
}

export function useCancellationQueue(onCount?: (n: number) => void): CancellationQueueModel {
  const t = useTranslations("admin.callCenter.cancellations");
  const [status, setStatusValue] = useState("open");
  const [offset, setOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [items, setItems] = useState<CancellationReview[]>([]);
  const [page, setPage] = useState<QueuePage>(EMPTY_PAGE);
  const [statuses, setStatuses] = useState<string[]>(() => reviewStatusesOf(null));
  const [state, setState] = useState<QueueState>("loading");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const why = useRef<"user" | "event">("user");
  const shown = useRef(false);
  const forbidden = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const main = listCancellationReviews({ status, limit: CCX_PAGE, offset }, ctrl.signal);
    const side: Promise<PromiseSettledResult<ReviewList> | null> =
      status === "open" ? Promise.resolve(null) : Promise.allSettled([listCancellationReviews({ status: "open", limit: OPEN_LIMIT, offset: 0 }, ctrl.signal)]).then((r) => r[0]);
    Promise.all([main, side]).then(
      ([list, open]) => {
        if (ctrl.signal.aborted) return;
        if (open && open.status === "rejected" && isAuthError(open.reason)) {
          shown.current = false;
          forbidden.current = true;
          setBusy(false);
          setState("forbidden");
          return;
        }
        const p = reviewPageOf(list, CCX_PAGE, offset);
        shown.current = true;
        setItems(list.items);
        setPage(p);
        setStatuses((prev) => mergeStatuses(prev, reviewStatusesOf(list)));
        setState("ready");
        setBusy(false);
        setStale(false);
        setError(undefined);
        if (status === "open") {
          const countMore = offset === 0 && p.total === null && p.hasMore;
          if (!countMore) setOpenCount((prev) => (offset === 0 ? (p.total ?? list.items.length) : (p.total ?? prev)));
          if (countMore) {
            listCancellationReviews({ status: "open", limit: OPEN_LIMIT, offset: 0 }, ctrl.signal).then(
              (o) => {
                if (!ctrl.signal.aborted) setOpenCount("total" in o.raw ? o.total : o.items.length);
              },
              () => {
                if (!ctrl.signal.aborted) setOpenCount((prev) => prev ?? list.items.length);
              },
            );
          }
        } else if (open && open.status === "fulfilled") {
          const o = open.value;
          setOpenCount("total" in o.raw ? o.total : o.items.length);
        }
        setAnnounce(why.current === "event" ? t("updated") : "");
        why.current = "user";
      },
      (e: unknown) => {
        if (ctrl.signal.aborted || isAborted(e)) return;
        setBusy(false);
        why.current = "user";
        if (isAuthError(e)) {
          shown.current = false;
          forbidden.current = true;
          setState("forbidden");
          return;
        }
        logApiError("cancellation reviews", e);
        if (shown.current) {
          setState("ready");
          setStale(true);
          return;
        }
        setError(e);
        setState("error");
      },
    );
    return () => ctrl.abort();
  }, [status, offset, reloadKey, t]);

  useEffect(() => {
    let timer = 0;
    const kick = () => {
      if (forbidden.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        why.current = "event";
        setReloadKey((k) => k + 1);
      }, KICK_MS);
    };
    const offEvents = subscribeUserEvents((ev) => {
      if (isReviewQueueEvent(ev)) kick();
    });
    const offResync = onUserSocketResync(kick);
    return () => {
      window.clearTimeout(timer);
      offEvents();
      offResync();
    };
  }, []);

  const countRef = useRef(onCount);
  useEffect(() => {
    countRef.current = onCount;
  });
  useEffect(() => {
    if (openCount !== null) countRef.current?.(openCount);
  }, [openCount]);

  useAiSelection("cancellations_status", status);

  const setStatus = useCallback(
    (s: string) => {
      if (s === status) return;
      setStatusValue(s);
      setOffset(0);
      setBusy(true);
    },
    [status],
  );

  const next = useCallback(() => {
    if (!page.hasMore) return;
    setOffset((o) => o + CCX_PAGE);
    setBusy(true);
  }, [page.hasMore]);

  const prev = useCallback(() => {
    if (offset <= 0) return;
    setOffset((o) => Math.max(0, o - CCX_PAGE));
    setBusy(true);
  }, [offset]);

  const refresh = useCallback(() => {
    why.current = "user";
    setBusy(true);
    setState((s) => (s === "error" ? "loading" : s));
    setReloadKey((k) => k + 1);
  }, []);

  return { state, status, setStatus, statuses, items, offset, page, next, prev, refresh, busy, stale, error, openCount, announce };
}
