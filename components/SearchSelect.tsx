"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { isCoarsePointer, usePopover } from "@/lib/usePopover";
import { matchesSearch } from "@/lib/searchText";
import { IconClose, IconCheck } from "./icons";

export type SearchOption = { value: string; label: string; sub?: string; tag?: string };

const OPTION = '[role="option"]';

function reveal(box: HTMLElement | null, el: HTMLElement | null | undefined, center = false) {
  if (!box || !el) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (center) box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
  else if (r.top < b.top) box.scrollTop -= b.top - r.top + 4;
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4;
}

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
  invalid,
  describedBy,
  hint,
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
  invalid?: boolean;
  describedBy?: string;
  hint?: string;
}) {
  const t = useTranslations("common.searchSelect");
  const uid = useId();
  const listId = `${uid}l`;
  const chosenId = `${uid}c`;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  // Labels of server results, so selected chips keep them after the results change.
  const [remoteLabels, setRemoteLabels] = useState<Map<string, SearchOption>>(() => new Map());
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const seq = useRef(0);
  // Keep the latest onSearch without making it an effect dependency — parents
  // often pass a fresh inline function each render, which would otherwise
  // re-trigger the search loop on every parent re-render (e.g. a roster poll).
  const searchRef = useRef(onSearch);
  useEffect(() => {
    searchRef.current = onSearch;
  });

  const reset = () => {
    setOpen(false);
    setQ("");
    setCursor(null);
    setLoading(false);
    setFailed(false);
  };

  const pop = usePopover({ open, onClose: reset, trigger: inputRef, anchor: wrapRef, popup: menuRef, sheet: false });

  // Debounced server search when onSearch is provided. Depends only on the
  // query + whether search mode is on, never on the callback identity.
  const hasSearch = !!onSearch;
  const query = q.trim();
  const typed = query !== "";
  function changeQuery(next: string) {
    setQ(next);
    setCursor(null);
    if (!hasSearch) return;
    const nextQuery = next.trim();
    if (nextQuery === query) return;
    setFailed(false);
    if (!nextQuery) {
      setRemote([]);
      setLoading(false);
    } else setLoading(true);
  }
  useEffect(() => {
    if (!hasSearch || !query) return;
    const run = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = (await searchRef.current?.(query)) ?? [];
        if (seq.current !== run) return;
        setRemoteLabels((prev) => {
          const next = new Map(prev);
          res.forEach((o) => next.set(o.value, o));
          return next;
        });
        setRemote(res);
        setFailed(false);
      } catch {
        if (seq.current !== run) return;
        setRemote([]);
        setFailed(true);
      } finally {
        if (seq.current === run) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      seq.current += 1;
    };
  }, [query, hasSearch]);

  const list = useMemo(() => {
    // With a starting list as well as a server search, an empty query shows
    // that list instead of nothing — a reference select opens on its first
    // page and narrows on the server as the user types.
    if (hasSearch) return typed ? (loading || failed ? [] : remote) : options;
    if (!typed) return options;
    return options.filter((o) => matchesSearch(`${o.label} ${o.sub ?? ""} ${o.tag ?? ""}`, query));
  }, [hasSearch, typed, loading, failed, remote, options, query]);

  const found = cursor === null ? -1 : list.findIndex((o) => o.value === cursor);
  const at = found >= 0 ? found : typed && list.length ? 0 : -1;

  const optionOf = (v: string) => options.find((o) => o.value === v) ?? remoteLabels.get(v);
  const labelOf = (v: string) => optionOf(v)?.label ?? v;
  const subOf = (v: string) => optionOf(v)?.sub;

  function show(activate: boolean) {
    if (open) return;
    const sel = single ? value[0] : undefined;
    setOpen(true);
    setCursor(sel ?? (activate ? (list[0]?.value ?? null) : null));
    if (sel) requestAnimationFrame(() => reveal(listRef.current, listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]'), true));
  }

  function move(i: number) {
    const o = list[i];
    if (!o) return;
    setCursor(o.value);
    reveal(listRef.current, listRef.current?.querySelectorAll<HTMLElement>(OPTION)[i]);
  }

  function pick(v: string) {
    if (single) {
      onChange([v]);
      pop.close("select");
      if (isCoarsePointer()) inputRef.current?.blur();
      return;
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    if (hasSearch && typed) {
      pop.close("select");
      return;
    }
    setCursor(v);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        show(!e.altKey);
        return;
      }
      if (e.altKey) {
        if (k === "ArrowUp") pop.close("select");
        return;
      }
      if (!list.length) return;
      if (k === "ArrowDown") move(at < 0 ? 0 : Math.min(list.length - 1, at + 1));
      else move(at < 0 ? list.length - 1 : Math.max(0, at - 1));
      return;
    }
    if (k === "Enter") {
      e.preventDefault();
      if (!open) {
        show(true);
        return;
      }
      const o = at >= 0 ? list[at] : undefined;
      if (o) pick(o.value);
      return;
    }
    if (k === "Tab" && open) pop.close("blur");
  }

  function onCtrlDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(".ssel__clear")) return;
    const input = inputRef.current;
    if (target !== input) {
      e.preventDefault();
      input?.focus({ preventScroll: true });
      if (open) {
        pop.close("select");
        return;
      }
    }
    show(false);
  }

  function clearSingle() {
    onChange([]);
    setCursor(null);
    if (!isCoarsePointer()) inputRef.current?.focus({ preventScroll: true });
  }

  function drop(v: string, e: ReactMouseEvent<HTMLButtonElement>) {
    const had = document.activeElement === e.currentTarget;
    const i = value.indexOf(v);
    onChange(value.filter((x) => x !== v));
    if (!had) return;
    requestAnimationFrame(() => {
      const chips = wrapRef.current?.querySelectorAll<HTMLElement>(".ssel__chip");
      const next = chips && chips.length ? chips[Math.min(Math.max(i, 0), chips.length - 1)] : null;
      if (next) next.focus({ preventScroll: true });
      else if (!isCoarsePointer()) inputRef.current?.focus({ preventScroll: true });
    });
  }

  const chosen = single && value.length ? value[0] : null;
  const showChosen = chosen !== null && !q;
  const hintOnly = hasSearch && !typed && !list.length;
  const hintId = `${uid}h`;
  const menuOpen = open && !hintOnly;
  const described = [describedBy, showChosen ? chosenId : "", open && hintOnly ? hintId : ""].filter(Boolean).join(" ") || undefined;
  const live = !open
    ? ""
    : hasSearch && typed && loading
      ? t("searching")
      : hasSearch && typed && failed
        ? t("failed")
        : typed
          ? list.length
            ? t("results", { n: list.length })
            : emptyText
          : "";

  let note: ReactNode = null;
  if (hasSearch && typed && loading)
    note = (
      <p className="ssel__note">
        <span className="ssel__spin" aria-hidden="true" />
        {t("searching")}
      </p>
    );
  else if (hasSearch && typed && failed) note = <p className="ssel__note ssel__note--err">{t("failed")}</p>;
  else if (!list.length) note = hasSearch && !typed ? <p className="ssel__note ssel__note--hint">{hint || t("typeToSearch")}</p> : <p className="ssel__empty">{emptyText}</p>;

  return (
    <div className="ssel" ref={wrapRef} data-open={open ? "true" : undefined} data-invalid={invalid ? "true" : undefined}>
      <div className="ssel__ctrl" onMouseDown={onCtrlDown}>
        <span className="ssel__box">
          <input
            ref={inputRef}
            type="text"
            className="ssel__input"
            role="combobox"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? listId : undefined}
            aria-activedescendant={menuOpen && at >= 0 ? `${uid}o${at}` : undefined}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            aria-describedby={described}
            aria-invalid={invalid ? true : undefined}
            value={q}
            placeholder={showChosen ? "" : open ? searchPlaceholder : placeholder}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(e) => {
              if (document.activeElement === e.currentTarget) show(false);
              changeQuery(e.target.value);
            }}
            onKeyDown={onKey}
          />
          {showChosen && chosen !== null ? (
            <span className="ssel__single" id={chosenId} aria-hidden="true">
              <b>{labelOf(chosen)}</b>
              {subOf(chosen) ? <small>{subOf(chosen)}</small> : null}
            </span>
          ) : null}
        </span>
        {chosen !== null ? (
          <button type="button" className="ssel__clear" aria-label={removeLabel || t("clear")} onClick={clearSingle}>
            <IconClose aria-hidden="true" />
          </button>
        ) : null}
        <span className="ssel__cv" aria-hidden="true" />
      </div>
      {open && hintOnly ? <p className="ssel__inhint" id={hintId}>{hint || t("typeToSearch")}</p> : null}

      {!single && value.length ? (
        <ul className="ssel__chips" aria-label={t("chosen")}>
          {value.map((v) => {
            const label = labelOf(v);
            const tag = optionOf(v)?.tag;
            return (
              <li key={v}>
                <button type="button" className="ssel__chip" aria-label={t("remove", { name: tag ? `${label}, ${tag}` : label })} title={tag ? `${label} · ${tag}` : label} onClick={(e) => drop(v, e)}>
                  <span>{label}</span>
                  {tag ? <em className="ssel__chip-tag">{`· ${tag}`}</em> : null}
                  <IconClose aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite">
        {live}
      </span>

      {menuOpen
        ? createPortal(
            <div
              ref={menuRef}
              className="ssel__menu"
              tabIndex={-1}
              data-placement={pop.placement}
              style={pop.style}
              onMouseDown={(e) => e.preventDefault()}
            >
              {note}
              <ul ref={listRef} id={listId} className="ssel__list" role="listbox" aria-label={ariaLabel} aria-multiselectable={single ? undefined : true}>
                {list.map((o, i) => {
                  const on = value.includes(o.value);
                  return (
                    <li key={o.value} role="presentation">
                      <button
                        type="button"
                        id={`${uid}o${i}`}
                        tabIndex={-1}
                        className={`ssel__opt${on ? " on" : ""}${i === at ? " is-active" : ""}`}
                        role="option"
                        aria-selected={on}
                        onClick={() => pick(o.value)}
                        onMouseMove={() => {
                          if (cursor !== o.value) setCursor(o.value);
                        }}
                      >
                        <span className="ssel__check" aria-hidden="true">{on ? <IconCheck /> : null}</span>
                        <span className="ssel__ol">
                          <b>{o.label}</b>
                          {o.sub ? <span>{o.sub}</span> : null}
                        </span>
                        {o.tag ? <em className="ssel__tag">{o.tag}</em> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
