"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export const PAGE_STEP = 20;

export type ListPagerBind = {
  count: number;
  total: number;
  step: number;
  next: number;
  onMore: () => void;
  onLess: () => void;
};

export type ListPagerProps = {
  count: number;
  total: number;
  step?: number;
  next?: number;
  onMore: () => void;
  onLess?: () => void;
  less?: boolean;
  loading?: boolean;
  label?: string;
  className?: string;
  aiId?: string;
};

export type Paged<T> = {
  visible: T[];
  count: number;
  total: number;
  rest: number;
  next: number;
  step: number;
  more: () => void;
  less: () => void;
  reset: () => void;
  revealIndex: (index: number, forKey?: unknown) => void;
  reveal: (pick: (item: T, index: number) => boolean, forKey?: unknown) => boolean;
  bind: ListPagerBind;
};

type PageState = { key: unknown; n: number };

export function usePaged<T>(items: readonly T[], step: number = PAGE_STEP, key?: unknown): Paged<T> {
  const size = Math.max(1, Math.floor(step) || PAGE_STEP);
  const k = key === undefined ? items : key;
  const [st, setSt] = useState<PageState>(() => ({ key: k, n: size }));
  const n = Object.is(st.key, k) ? Math.max(st.n, size) : size;
  const visible = items.slice(0, n);
  const total = items.length;
  const count = visible.length;
  const rest = Math.max(0, total - count);
  const next = Math.min(size, rest);

  const grow = (want: number, forKey: unknown) =>
    setSt((s) => {
      const cur = Object.is(s.key, forKey) ? Math.max(s.n, size) : size;
      if (cur >= want) return Object.is(s.key, forKey) ? s : { key: forKey, n: cur };
      return { key: forKey, n: want };
    });
  const more = () =>
    setSt((s) => {
      const cur = Object.is(s.key, k) ? Math.max(s.n, size) : size;
      return { key: k, n: Math.min(cur, Math.max(total, size)) + size };
    });
  const less = () => setSt({ key: k, n: size });
  const reset = less;
  const revealIndex = (index: number, forKey?: unknown) => {
    if (!(index >= 0)) return;
    grow(Math.ceil((index + 1) / size) * size, forKey === undefined ? k : forKey);
  };
  const reveal = (pick: (item: T, index: number) => boolean, forKey?: unknown) => {
    const at = items.findIndex(pick);
    if (at < 0) return false;
    revealIndex(at, forKey);
    return true;
  };

  return {
    visible,
    count,
    total,
    rest,
    next,
    step: size,
    more,
    less,
    reset,
    revealIndex,
    reveal,
    bind: { count, total, step: size, next, onMore: more, onLess: less },
  };
}

export default function ListPager({ count, total, step = PAGE_STEP, next, onMore, onLess, less = false, loading = false, label, className, aiId }: ListPagerProps) {
  const t = useTranslations("common.pager");
  const rootRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const lessRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLParagraphElement>(null);
  const pending = useRef<"" | "more" | "less">("");
  const rest = Math.max(0, total - count);
  const add = Math.max(0, Math.min(next ?? step, rest));
  const canLess = less && Boolean(onLess) && count > step;

  useEffect(() => {
    const want = pending.current;
    if (!want || loading) return;
    pending.current = "";
    if (want === "more") {
      if (moreRef.current) return;
      (lessRef.current ?? endRef.current)?.focus({ preventScroll: true });
      return;
    }
    (moreRef.current ?? lessRef.current ?? endRef.current)?.focus({ preventScroll: true });
    rootRef.current?.scrollIntoView({ block: "nearest" });
  }, [count, total, loading]);

  if (rest <= 0 && count <= step) return null;

  return (
    <div ref={rootRef} className={className ? `lpager ${className}` : "lpager"}>
      {rest > 0 ? (
        <button
          ref={moreRef}
          type="button"
          className="btn btn--line lpager__more"
          aria-disabled={loading || undefined}
          aria-busy={loading || undefined}
          data-ai-id={aiId}
          onClick={() => {
            if (loading) return;
            pending.current = "more";
            onMore();
          }}
        >
          {loading ? <span className="lpager__spin" aria-hidden="true" /> : null}
          <span className="lpager__t">{label ?? t("more", { n: add })}</span>
          <span className="lpager__n" aria-hidden="true">
            {t("count", { shown: count, total })}
          </span>
        </button>
      ) : (
        <p ref={endRef} className="lpager__end" tabIndex={-1}>
          {t("all", { total })}
        </p>
      )}
      {canLess ? (
        <button
          ref={lessRef}
          type="button"
          className="btn btn--ghost btn--sm lpager__less"
          onClick={() => {
            pending.current = "less";
            onLess?.();
          }}
        >
          {t("less")}
        </button>
      ) : null}
      <span className="sr-only" role="status">
        {loading ? t("loading") : t("status", { shown: count, total })}
      </span>
    </div>
  );
}
