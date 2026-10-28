"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { IconCheck, IconChevronDown, IconPlus, IconRefresh, IconSearch } from "@/components/icons";
import { isAborted, logApiError } from "@/lib/http";

// One searchable, paged select for anything the backend lists: opens on
// the first page, debounces the search, drops stale answers, adds rows on
// scroll and keeps the picked value even when its page is gone. Shows
// names, never ids — the value is the whole row.

const DEBOUNCE = 300;

export type LookupPage<T> = { items: T[]; hasMore: boolean };
export type LookupText = { placeholder: string; search: string; searchPh: string; empty: string };

export function LookupPicker<T extends { id: string }>({
  value,
  onChange,
  load,
  title,
  sub,
  badge,
  icon,
  text,
  action,
  invalid,
  labelId,
  disabled,
}: {
  value: T | null;
  onChange: (v: T | null) => void;
  load: (q: string, offset: number, signal: AbortSignal) => Promise<LookupPage<T>>;
  title: (v: T) => string;
  sub?: (v: T) => string;
  badge?: (v: T) => string;
  icon?: ReactNode;
  text: LookupText;
  // A row under the list: "add a new …" or "clear".
  action?: { label: string; icon?: ReactNode; run: () => void };
  invalid?: boolean;
  labelId?: string;
  disabled?: boolean;
}): ReactElement {
  const t = useTranslations("crm.picker");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "searching" | "more" | "failed">("idle");
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const ctl = useRef<AbortController | null>(null);
  // The loader changes every render; the latest one is read when fetching.
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const [rect, setRect] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);

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

  // First page on open; a debounced search on every change.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => void fetchPage(q.trim(), 0), q ? DEBOUNCE : 0);
    return () => window.clearTimeout(id);
  }, [open, q, fetchPage]);
  useEffect(() => () => ctl.current?.abort(), []);

  // The list floats above any modal, under the trigger (or above it near the bottom).
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const up = window.innerHeight - r.bottom < 320 && r.top > 320;
      setRect({ left: r.left, top: up ? r.top : r.bottom, width: r.width, up });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => input.current?.focus(), 0);
    const away = (e: PointerEvent) => {
      const el = e.target as Node;
      if (!pop.current?.contains(el) && !btn.current?.contains(el)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", away);
    };
  }, [open]);

  const pick = (c: T) => {
    onChange(c);
    setOpen(false);
    setQ("");
    btn.current?.focus();
  };
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasMore && state === "idle" && el.scrollTop + el.clientHeight > el.scrollHeight - 60) void fetchPage(q.trim(), items.length);
  };
  const listId = `${uid}-list`;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="crm-picker"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelId}
        data-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {icon ?? <IconSearch aria-hidden="true" />}
        {value ? (
          <span className="crm-picker__v">
            <b>{title(value)}</b>
            {badge?.(value) ? <em className="crm-lxbadge">{badge(value)}</em> : null}
          </span>
        ) : (
          <span className="crm-picker__ph">{text.placeholder}</span>
        )}
        <IconChevronDown aria-hidden="true" className="crm-picker__cv" />
      </button>
      {open && rect
        ? createPortal(
            <div
              ref={pop}
              className="crm-picker__pop"
              data-up={rect.up || undefined}
              style={{ left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 300) - 8)), width: Math.max(rect.width, Math.min(300, window.innerWidth - 16)), ...(rect.up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.top + 6 }) }}
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
              <label className="crm-picker__search">
                <IconSearch aria-hidden="true" />
                <input
                  ref={input}
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setActive(0);
                  }}
                  placeholder={text.searchPh}
                  aria-label={text.search}
                  aria-controls={listId}
                  aria-activedescendant={items[active] ? `${uid}-o-${items[active].id}` : undefined}
                />
                {state === "searching" ? <span className="crm-picker__spin" aria-label={t("searching")} /> : null}
              </label>
              <div className="crm-picker__list" id={listId} role="listbox" aria-label={text.search} onScroll={onScroll}>
                {state === "loading" ? (
                  [0, 1, 2].map((i) => <span key={i} className="crm-sk" style={{ height: 40 }} />)
                ) : state === "failed" ? (
                  <div className="crm-picker__empty">
                    <span>{t("failed")}</span>
                    <button type="button" className="crm-btn crm-btn--sm" onClick={() => void fetchPage(q.trim(), 0)}>
                      <IconRefresh aria-hidden="true" />
                      {t("retry")}
                    </button>
                  </div>
                ) : !items.length && state === "idle" ? (
                  <div className="crm-picker__empty">
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
                      {badge?.(c) ? <em className="crm-lxbadge">{badge(c)}</em> : null}
                      {value?.id === c.id ? <IconCheck aria-hidden="true" /> : null}
                    </button>
                  ))
                )}
                {state === "more" ? <span className="crm-picker__more">{t("loadingMore")}</span> : null}
              </div>
              {action ? (
                <button
                  type="button"
                  className="crm-picker__new"
                  onClick={() => {
                    setOpen(false);
                    action.run();
                  }}
                >
                  {action.icon ?? <IconPlus aria-hidden="true" />}
                  {action.label}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

