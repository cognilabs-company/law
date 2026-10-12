"use client";

import { Fragment, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { isCoarsePointer, usePopover } from "@/lib/usePopover";
import { matchesSearch, normalizeSearchText } from "@/lib/searchText";
import { IconSearch } from "./icons";

export type Option = { value: string; label: string; group?: string; hint?: string };

const SEARCH_AFTER = 8;
const TYPE_MS = 700;
const OPTION = '[role="option"]';

export function rankOptions(
  options: Option[],
  counts: ReadonlyMap<string, number>,
  rest: string,
  hint?: (n: number) => string,
): Option[] {
  const rows = options.map((o) => ({ o, n: Math.max(0, counts.get(o.value) ?? 0) }));
  const busy = rows.some((r) => r.n > 0);
  const idle = rows.some((r) => r.n === 0);
  rows.sort((a, b) => b.n - a.n || a.o.label.localeCompare(b.o.label));
  return rows.map(({ o, n }) => ({
    ...o,
    group: busy && idle && n === 0 ? rest : o.group,
    hint: n > 0 && hint ? hint(n) : o.hint,
  }));
}

type Run = { group: string; rows: Option[] };

function runsOf(list: Option[]): Run[] {
  const out: Run[] = [];
  for (const o of list) {
    const group = o.group ?? "";
    const last = out[out.length - 1];
    if (last && last.group === group) last.rows.push(o);
    else out.push({ group, rows: [o] });
  }
  return out;
}

function reveal(box: HTMLElement | null, el: HTMLElement | null | undefined, center = false) {
  if (!box || !el) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (center) box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
  else if (r.top < b.top) box.scrollTop -= b.top - r.top + 4;
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4;
}

function stepTo(key: string, at: number, last: number, page: number): number | null {
  const from = Math.max(at, 0);
  if (key === "ArrowDown") return at < 0 ? 0 : Math.min(last, at + 1);
  if (key === "ArrowUp") return Math.max(0, at - 1);
  if (key === "Home") return 0;
  if (key === "End") return last;
  if (key === "PageDown") return Math.min(last, from + page);
  if (key === "PageUp") return Math.max(0, from - page);
  return null;
}

export default function Select({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  invalid,
  describedBy,
  labelId,
  search,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  ariaLabel?: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  labelId?: string;
  search?: boolean;
}) {
  const t = useTranslations("common.select");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const pane = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  const typed = useRef({ text: "", at: 0 });
  const uid = useId();
  const valId = `${uid}v`;
  const listId = `${uid}l`;

  const pop = usePopover({
    open,
    onClose: () => {
      setOpen(false);
      setQuery("");
    },
    trigger: btn,
    popup: pane,
  });

  const ph = placeholder?.trim() ?? "";
  const items = ph ? options.filter((o) => !(o.value === "" && o.label.trim() === ph)) : options;
  const selected = items.find((o) => o.value === value) ?? (placeholder ? undefined : items[0]);
  const searchable = search ?? items.length > SEARCH_AFTER;
  const q = searchable ? query.trim() : "";
  const shown = q ? items.filter((o) => matchesSearch(`${o.label} ${o.group ?? ""}`, q)) : items;
  const title = ariaLabel || placeholder || "";

  const optionsIn = () => Array.from(list.current?.querySelectorAll<HTMLElement>(OPTION) ?? []);

  function focusOption(el: HTMLElement | undefined, center = false) {
    if (!el) return;
    el.focus({ preventScroll: true });
    reveal(list.current, el, center);
  }

  function focusStart() {
    const opts = optionsIn();
    const cur = opts.find((o) => o.getAttribute("aria-selected") === "true");
    const input = field.current;
    if (input && !isCoarsePointer()) {
      input.focus({ preventScroll: true });
      reveal(list.current, cur, true);
      return;
    }
    if (cur || opts[0]) focusOption(cur ?? opts[0], true);
    else pane.current?.focus({ preventScroll: true });
  }

  function show() {
    if (open) return;
    typed.current = { text: "", at: 0 };
    setOpen(true);
    requestAnimationFrame(focusStart);
  }

  function shut() {
    setOpen(false);
    setQuery("");
  }

  function pick(v: string) {
    onChange(v);
    pop.close("select");
  }

  function leave() {
    btn.current?.focus({ preventScroll: true });
    shut();
  }

  function typeAhead(e: KeyboardEvent<HTMLElement>, opts: HTMLElement[], at: number): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key;
    const prev = typed.current;
    const fresh = e.timeStamp - prev.at > TYPE_MS;
    if (k === " " ? fresh || !prev.text : k.length !== 1) return false;
    e.preventDefault();
    const input = field.current;
    if (input) {
      const next = query + k;
      setQuery(next);
      input.focus({ preventScroll: true });
      requestAnimationFrame(() => input.setSelectionRange(next.length, next.length));
      return true;
    }
    const text = (fresh ? "" : prev.text) + k;
    typed.current = { text, at: e.timeStamp };
    const same = [...text].every((c) => c === text[0]);
    const needle = normalizeSearchText(same ? text[0] : text);
    if (!needle || !shown.length) return true;
    const from = same ? at + 1 : Math.max(at, 0);
    for (let s = 0; s < shown.length; s++) {
      const i = (from + s) % shown.length;
      if (normalizeSearchText(shown[i].label).startsWith(needle)) {
        focusOption(opts[i]);
        break;
      }
    }
    return true;
  }

  function onPaneKey(e: KeyboardEvent<HTMLElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Tab") {
      leave();
      return;
    }
    const opts = optionsIn();
    const act = document.activeElement;
    const input = field.current;
    if (input && act === input) {
      if (e.key === "ArrowDown") {
        const cur = q ? -1 : opts.findIndex((o) => o.getAttribute("aria-selected") === "true");
        focusOption(opts[Math.max(0, cur)]);
      } else if (e.key === "ArrowUp") focusOption(opts[opts.length - 1]);
      else if (e.key === "Enter") {
        if (!q) pop.close("select");
        else if (shown[0]) pick(shown[0].value);
      } else return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const at = opts.findIndex((o) => o === act);
    if (e.key === "Enter") {
      e.stopPropagation();
      return;
    }
    if (e.key === "ArrowUp" && at <= 0 && input) {
      e.preventDefault();
      e.stopPropagation();
      input.focus({ preventScroll: true });
      return;
    }
    const row = opts[Math.max(at, 0)]?.offsetHeight || 44;
    const page = Math.max(1, Math.floor((list.current?.clientHeight ?? 0) / row) - 1);
    const to = stepTo(e.key, at, opts.length - 1, page);
    if (to === null) {
      if (typeAhead(e, opts, at) || e.key === " ") e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    focusOption(opts[to]);
  }

  function onBtnKey(e: KeyboardEvent<HTMLButtonElement>) {
    const nav = e.key === "ArrowDown" || e.key === "ArrowUp";
    if (open) {
      if (!nav) return;
      e.preventDefault();
      focusStart();
      return;
    }
    if (nav || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      show();
    }
  }

  const listAria = labelId ? { "aria-labelledby": labelId } : { "aria-label": ariaLabel };

  const optionEl = (o: Option) => (
    <li key={o.value} role="presentation">
      <button type="button" role="option" aria-selected={o.value === value} className="dsel__opt" onClick={() => pick(o.value)}>
        {o.hint ? (
          <>
            <span className="dsel__lbl" title={o.label}>{o.label}</span>
            <span className="dsel__hint">{o.hint}</span>
          </>
        ) : (
          <span className="dsel__lbl" title={o.label}>{o.label}</span>
        )}
      </button>
    </li>
  );

  const rows: ReactNode = shown.length ? (
    runsOf(shown).map((r, n) =>
      r.group ? (
        <li key={`g${n}`} role="presentation" className="dsel__grp">
          <ul role="group" aria-label={r.group} className="dsel__grpl">
            <li role="presentation" aria-hidden="true" className="dsel__grph">
              {r.group}
            </li>
            {r.rows.map(optionEl)}
          </ul>
        </li>
      ) : (
        <Fragment key={`r${n}`}>{r.rows.map(optionEl)}</Fragment>
      ),
    )
  ) : (
    <li role="presentation" className="dsel__empty">
      {t("empty")}
    </li>
  );

  const bindList = (el: HTMLUListElement | null) => {
    list.current = el;
  };

  const bindOwnList = (el: HTMLUListElement | null) => {
    list.current = el;
    pane.current = el;
  };

  const innerList = (
    <ul ref={bindList} id={listId} className="dsel__menu" role="listbox" {...listAria}>
      {rows}
    </ul>
  );

  const searchBox = searchable ? (
    <div className="dsel__srch">
      <IconSearch aria-hidden="true" />
      <input
        ref={field}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("search")}
        aria-label={t("search")}
        aria-controls={listId}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
    </div>
  ) : null;

  const bindPane = (el: HTMLDivElement | null) => {
    pane.current = el;
  };

  const popup: ReactNode = !open ? null : pop.isSheet ? (
    <>
      <div className="dsel__scrim" style={{ zIndex: pop.z - 1 }} aria-hidden="true" />
      <div
        ref={bindPane}
        className="dsel__sheet"
        role="dialog"
        aria-label={title || undefined}
        tabIndex={-1}
        data-placement="sheet"
        style={pop.style}
        onKeyDown={onPaneKey}
      >
        <div className="dsel__shead">
          <span className="dsel__grip" aria-hidden="true" />
          {title ? <b className="dsel__stitle">{title}</b> : null}
        </div>
        {searchBox}
        {innerList}
      </div>
    </>
  ) : searchable ? (
    <div ref={bindPane} className="dsel__pop" tabIndex={-1} data-placement={pop.placement} style={pop.style} onKeyDown={onPaneKey}>
      {searchBox}
      {innerList}
    </div>
  ) : (
    <ul
      ref={bindOwnList}
      id={listId}
      className="dsel__menu"
      role="listbox"
      tabIndex={-1}
      {...listAria}
      data-placement={pop.placement}
      style={pop.style}
      onKeyDown={onPaneKey}
    >
      {rows}
    </ul>
  );

  return (
    <div className="dsel" data-open={open} data-invalid={invalid ? "true" : undefined}>
      <button
        ref={btn}
        type="button"
        className="dsel__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={labelId ? undefined : ariaLabel}
        aria-labelledby={labelId ? `${labelId} ${valId}` : undefined}
        aria-describedby={describedBy}
        onClick={() => (open ? shut() : show())}
        onKeyDown={onBtnKey}
      >
        <span id={valId} className={`dsel__val${selected ? "" : " dsel__val--ph"}`}>
          {selected?.label ?? placeholder}
        </span>
        <span className="dsel__cv" />
      </button>
      {popup ? createPortal(popup, document.body) : null}
    </div>
  );
}
