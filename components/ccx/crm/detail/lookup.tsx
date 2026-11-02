"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type UIEvent } from "react";
import { useTranslations } from "next-intl";
import { isAborted, logApiError } from "@/lib/http";
import { IcCheck, IcChevron, IcClose, IcRefresh, IcSearch } from "../../icons";
import { useDismiss } from "./kit";

const DEBOUNCE = 300;

export type LookupText = { placeholder: string; searchPh: string; empty: string };

export function LookupField<T extends { id: string }>({
  label,
  value,
  onChange,
  load,
  title,
  sub,
  icon,
  text,
  hint,
  clearLabel,
}: {
  label: string;
  value: T | null;
  onChange: (v: T | null) => void;
  load: (q: string, offset: number, signal: AbortSignal) => Promise<{ items: T[]; hasMore: boolean }>;
  title: (v: T) => string;
  sub?: (v: T) => string;
  icon?: ReactNode;
  text: LookupText;
  hint?: string;
  clearLabel?: string;
}) {
  const t = useTranslations("crm.picker");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "searching" | "more" | "failed">("idle");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const ctl = useRef<AbortController | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  const fetchPage = useCallback(async (query: string, offset: number) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setState(offset ? "more" : query ? "searching" : "loading");
    try {
      const r = await loader.current(query, offset, c.signal);
      if (c.signal.aborted) return;
      setItems((cur) => (offset ? [...cur, ...r.items.filter((x) => !cur.some((y) => y.id === x.id))] : r.items));
      setHasMore(r.hasMore);
      setState("idle");
    } catch (e) {
      if (isAborted(e)) return;
      logApiError("crm.lookup", e);
      setState("failed");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => void fetchPage(q.trim(), 0), q ? DEBOUNCE : 0);
    return () => window.clearTimeout(id);
  }, [open, q, fetchPage]);

  useEffect(() => () => ctl.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => input.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, box);

  const pick = (c: T) => {
    onChange(c);
    setOpen(false);
    setQ("");
    btn.current?.focus();
  };
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasMore && state === "idle" && el.scrollTop + el.clientHeight > el.scrollHeight - 60) void fetchPage(q.trim(), items.length);
  };
  const listId = `${uid}-list`;
  const labelId = `${uid}-l`;

  return (
    <div className="opx-field opx-cd-look" ref={box} data-open={open || undefined}>
      <span className="opx-cd-look__label" id={labelId}>
        {label}
      </span>
      <div className="opx-cd-look__row">
        <button
          ref={btn}
          type="button"
          className="opx-cd-look__btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={labelId}
          onClick={() => setOpen((o) => !o)}
        >
          {icon ?? <IcSearch size={16} />}
          {value ? <b>{title(value)}</b> : <span className="opx-cd-look__ph">{text.placeholder}</span>}
          <IcChevron size={16} className="opx-cd-look__cv" />
        </button>
        {value && clearLabel ? (
          <button type="button" className="opx-cd-ibtn" onClick={() => onChange(null)} aria-label={clearLabel} title={clearLabel}>
            <IcClose size={15} />
          </button>
        ) : null}
      </div>
      {hint ? <small className="opx-cd-hint">{hint}</small> : null}
      {open ? (
        <div
          className="opx-cd-look__pop"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              btn.current?.focus();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              pick(items[active]);
            }
          }}
        >
          <label className="opx-cd-look__search">
            <IcSearch size={15} />
            <input
              ref={input}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              placeholder={text.searchPh}
              aria-label={text.searchPh}
              aria-controls={listId}
              aria-activedescendant={items[active] ? `${uid}-o-${items[active].id}` : undefined}
            />
            {state === "searching" ? <span className="opx-cd-spin" aria-label={t("searching")} /> : null}
          </label>
          <div className="opx-cd-look__list" id={listId} role="listbox" aria-label={label} onScroll={onScroll}>
            {state === "loading" ? (
              [0, 1, 2].map((i) => <i key={i} className="opx-shim opx-cd-shim" style={{ height: 38 }} />)
            ) : state === "failed" ? (
              <div className="opx-cd-look__empty">
                <span>{t("failed")}</span>
                <button type="button" className="opx-pbtn opx-cd-btn-sm" onClick={() => void fetchPage(q.trim(), 0)}>
                  <IcRefresh size={14} />
                  {t("retry")}
                </button>
              </div>
            ) : !items.length && state === "idle" ? (
              <div className="opx-cd-look__empty">
                <span>{text.empty}</span>
              </div>
            ) : (
              items.map((c, i) => (
                <button
                  key={c.id}
                  id={`${uid}-o-${c.id}`}
                  type="button"
                  role="option"
                  aria-selected={value?.id === c.id}
                  data-active={i === active || undefined}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(c)}
                >
                  <span>
                    <b>{title(c)}</b>
                    {sub?.(c) ? <small>{sub(c)}</small> : null}
                  </span>
                  {value?.id === c.id ? <IcCheck size={15} /> : null}
                </button>
              ))
            )}
            {state === "more" ? <span className="opx-cd-look__more">{t("loadingMore")}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
