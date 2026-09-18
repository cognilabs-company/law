"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconSearch, IconClose, IconCheck } from "./icons";

export type SearchOption = { value: string; label: string; sub?: string };

// Multi-select dropdown with a built-in search bar. Filters a static `options`
// list client-side, or — when `onSearch` is given — queries the server
// (debounced) so any user can be found. Selected chips keep their labels via a
// small cache even when they drop out of the current results.
export default function SearchSelect({
  value,
  onChange,
  options = [],
  onSearch,
  placeholder,
  searchPlaceholder,
  emptyText,
  ariaLabel,
  removeLabel,
  single,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options?: SearchOption[];
  onSearch?: (q: string) => Promise<SearchOption[]>;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  ariaLabel: string;
  removeLabel?: string;
  // One value at a time: picking an option replaces it and closes the menu
  // (a plain label + clear button instead of removable chips).
  single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  // Labels of server results, so selected chips keep them after the results change.
  const [remoteLabels, setRemoteLabels] = useState<Map<string, string>>(new Map());
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest onSearch without making it an effect dependency — parents
  // often pass a fresh inline function each render, which would otherwise
  // re-trigger the search loop on every parent re-render (e.g. a roster poll).
  const searchRef = useRef(onSearch);
  useEffect(() => {
    searchRef.current = onSearch;
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Debounced server search when onSearch is provided. Depends only on the
  // query + whether search mode is on, never on the callback identity.
  const hasSearch = !!onSearch;
  function changeQuery(next: string) {
    setQ(next);
    if (!hasSearch) return;
    if (!next.trim()) { setRemote([]); setLoading(false); }
    else setLoading(true);
  }
  useEffect(() => {
    if (!hasSearch) return;
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) return;
    timer.current = setTimeout(async () => {
      try {
        const res = (await searchRef.current?.(q)) ?? [];
        setRemoteLabels((prev) => {
          const next = new Map(prev);
          res.forEach((o) => next.set(o.value, o.label));
          return next;
        });
        setRemote(res);
      } catch {
        setRemote([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, hasSearch]);

  const shown = useMemo(() => {
    if (onSearch) return remote;
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.sub ?? ""}`.toLowerCase();
      return terms.every((w) => hay.includes(w));
    });
  }, [onSearch, remote, q, options]);

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? remoteLabels.get(v) ?? v;
  const subOf = (v: string) => options.find((o) => o.value === v)?.sub;
  const toggle = (v: string) => {
    if (single) {
      onChange([v]);
      setOpen(false);
      setQ("");
      return;
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  const clear = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <div className="ssel" ref={wrapRef}>
      <button type="button" className="ssel__ctrl" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}>
        {single && value.length ? (
          <span className="ssel__single">
            <b>{labelOf(value[0])}</b>
            {subOf(value[0]) ? <small>{subOf(value[0])}</small> : null}
            <span role="button" tabIndex={0} aria-label={removeLabel ?? "×"} onClick={clear} onKeyDown={(e) => { if (e.key === "Enter") clear(e); }}>
              <IconClose />
            </span>
          </span>
        ) : value.length ? (
          <span className="ssel__chips">
            {value.map((v) => (
              <span className="ssel__chip" key={v}>
                {labelOf(v)}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={removeLabel ?? "×"}
                  onClick={(e) => { e.stopPropagation(); toggle(v); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); toggle(v); } }}
                >
                  <IconClose />
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="ssel__ph">{placeholder}</span>
        )}
        <span className="ssel__cv" />
      </button>

      {open ? (
        <div className="ssel__menu" role="listbox" aria-label={ariaLabel}>
          <div className="ssel__search">
            <IconSearch />
            <input value={q} onChange={(e) => changeQuery(e.target.value)} placeholder={searchPlaceholder} autoFocus />
          </div>
          <div className="ssel__list">
            {loading ? (
              <p className="ssel__empty">…</p>
            ) : shown.length === 0 ? (
              <p className="ssel__empty">{emptyText}</p>
            ) : (
              shown.map((o) => {
                const on = value.includes(o.value);
                return (
                  <button type="button" key={o.value} className={`ssel__opt${on ? " on" : ""}`} role="option" aria-selected={on} onClick={() => toggle(o.value)}>
                    <span className="ssel__check">{on ? <IconCheck /> : null}</span>
                    <span className="ssel__ol">
                      <b>{o.label}</b>
                      {o.sub ? <span>{o.sub}</span> : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
