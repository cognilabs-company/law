"use client";

import "../sx-core.css";
import "../sx-form.css";
import "./sx-picker-more.css";
import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import { isCoarsePointer, nextTabbable, usePopover, type PopoverCloseReason } from "@/lib/usePopover";
import { useSwipeDismiss } from "@/lib/useSwipeDismiss";
import { SxButton } from "../Button";
import { useDebouncedValue } from "../hooks";
import { RefreshCwIcon, ChevronDownIcon, CheckIcon, PencilIcon, PlusIcon, SearchIcon, XIcon, glyph } from "../icons";
import type { SxIcon, SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { dedupeOptions, filterOptions, isNavKey, navIndex, optionRuns, remoteOptions, toggleValue, typeAhead, type OptionPages, type TypeBuffer } from "./logic";
import type { SxOptionPage } from "./useReferenceOptions";

export type PickerManage = {
  editLabel: (name: string) => string;
  onEdit?: (value: string, label: string) => void;
  createLabel?: (query: string) => string;
  onCreate?: (query: string) => void;
};

type PickerBase = {
  id?: string;
  label: string;
  placeholder?: string;
  options?: readonly SxOption[];
  loadOptions?: (query: string, signal: AbortSignal) => Promise<SxOption[]>;
  loadPage?: (query: string, offset: number, signal: AbortSignal) => Promise<SxOptionPage>;
  indentOf?: (o: SxOption) => number;
  resolveOptions?: (values: readonly string[], signal: AbortSignal) => Promise<SxOption[]>;
  searchable?: boolean;
  clearable?: boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  size?: "md" | "sm";
  leadingIcon?: SxIcon;
  emptyText?: string;
  onBlur?: () => void;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  aiId?: string;
  className?: string;
  manage?: PickerManage;
  tail?: ReactNode;
};

export type PickerProps = PickerBase &
  (
    | { multiple?: false; value: string; onChange: (value: string) => void }
    | { multiple: true; value: readonly string[]; onChange: (value: string[]) => void; max?: number }
  );

type Start = "selected" | "first" | "last" | { key: string; at: number };
type Act = "selected" | "first" | "last" | { v: string };

const SEP = "\u0001";
const EDIT_KEY = "F2";
const DEBOUNCE_MS = 250;
const PAGE = 8;
const SKELETON = [62, 48, 70];
const TAB_STOPS = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
const keepFocus = (e: MouseEvent) => e.preventDefault();

function valuesOf(props: PickerProps): string[] {
  if (props.multiple === true) return props.value.filter(Boolean);
  return props.value ? [props.value] : [];
}

function codeTag(o: SxOption | undefined): string {
  const code = o?.code?.trim() ?? "";
  return code && code !== o?.label.trim() ? code : "";
}

type PageMeta = { total: number | null; hasMore: boolean };
type MoreInfo = { shown: number; total: number | null; hasMore: boolean; loading: boolean; failed: boolean; onMore: () => void };

function omit(map: Readonly<Record<string, true>>, keys: readonly string[]): Record<string, true> {
  const out: Record<string, true> = {};
  for (const [k, v] of Object.entries(map)) if (!keys.includes(k)) out[k] = v;
  return out;
}

export function Picker(props: PickerProps): ReactElement {
  const {
    id,
    label,
    placeholder,
    options,
    loadOptions,
    loadPage,
    indentOf,
    resolveOptions,
    searchable: searchableProp,
    clearable: clearableProp,
    required: requiredProp = false,
    disabled = false,
    readOnly = false,
    invalid: invalidProp = false,
    size = "md",
    leadingIcon,
    emptyText,
    onBlur,
    aiId,
    className,
    manage,
    tail,
  } = props;
  const labelledBy = props["aria-labelledby"];
  const describedBy = props["aria-describedby"];
  const required = requiredProp || props["aria-required"] === true;
  const invalid = invalidProp || props["aria-invalid"] === true;
  const multi = props.multiple === true;
  const max = props.multiple === true ? props.max : undefined;
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const baseId = id ?? `sxp-${uid}`;
  const listId = `${baseId}-list`;
  const isAsync = !!loadOptions || !!loadPage;
  const searchable = searchableProp ?? (isAsync || (options?.length ?? 0) > 7);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [start, setStart] = useState<Start>("selected");
  const [viaKeys, setViaKeys] = useState(false);
  const [pages, setPages] = useState<OptionPages>({});
  const [failed, setFailed] = useState<Readonly<Record<string, true>>>({});
  const [retry, setRetry] = useState(0);
  const [resolved, setResolved] = useState<Readonly<Record<string, SxOption>>>({});
  const [meta, setMeta] = useState<Readonly<Record<string, PageMeta>>>({});
  const [more, setMore] = useState<{ key: string; state: "loading" | "failed" } | null>(null);
  const pageRef = useRef(loadPage);
  const moreCtrl = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tagsRef = useRef<HTMLUListElement>(null);
  const loadRef = useRef(loadOptions);
  const resolveRef = useRef(resolveOptions);
  const asked = useRef(new Set<string>());
  const tagFocus = useRef<number | null>(null);

  useLayoutEffect(() => {
    loadRef.current = loadOptions;
    pageRef.current = loadPage;
    resolveRef.current = resolveOptions;
  });

  useEffect(() => () => moreCtrl.current?.abort(), []);

  const values = valuesOf(props);
  const valuesKey = values.join(SEP);
  const q = query.trim();
  const dq = useDebouncedValue(q, DEBOUNCE_MS);
  const haveFirst = !!pages[""];
  const failedFirst = !!failed[""];
  const haveQuery = dq === "" || !!pages[dq];
  const failedQuery = !!failed[dq];

  useEffect(() => {
    const load = loadRef.current;
    const page = pageRef.current;
    if (!open || !isAsync || (!load && !page) || haveFirst || failedFirst) return;
    const ctrl = new AbortController();
    const run: Promise<SxOptionPage> = page ? page("", 0, ctrl.signal) : (load as NonNullable<typeof load>)("", ctrl.signal).then((rows) => ({ options: rows, total: null, hasMore: false }));
    run.then(
      (res) => {
        if (ctrl.signal.aborted) return;
        setPages((p) => ({ ...p, "": res.options }));
        setMeta((m) => ({ ...m, "": { total: res.total, hasMore: res.hasMore } }));
      },
      () => {
        if (!ctrl.signal.aborted) setFailed((f) => ({ ...f, "": true }));
      },
    );
    return () => ctrl.abort();
  }, [open, isAsync, haveFirst, failedFirst, retry]);

  useEffect(() => {
    const load = loadRef.current;
    const page = pageRef.current;
    if (!open || !isAsync || (!load && !page) || !dq || haveQuery || failedQuery) return;
    const ctrl = new AbortController();
    const run: Promise<SxOptionPage> = page ? page(dq, 0, ctrl.signal) : (load as NonNullable<typeof load>)(dq, ctrl.signal).then((rows) => ({ options: rows, total: null, hasMore: false }));
    run.then(
      (res) => {
        if (ctrl.signal.aborted) return;
        setPages((p) => ({ ...p, [dq]: res.options }));
        setMeta((m) => ({ ...m, [dq]: { total: res.total, hasMore: res.hasMore } }));
      },
      () => {
        if (!ctrl.signal.aborted) setFailed((f) => ({ ...f, [dq]: true }));
      },
    );
    return () => ctrl.abort();
  }, [open, isAsync, dq, haveQuery, failedQuery, retry]);

  const known = useMemo(() => {
    const map = new Map<string, SxOption>();
    for (const o of options ?? []) map.set(o.value, o);
    for (const rows of Object.values(pages)) for (const o of rows) if (!map.has(o.value)) map.set(o.value, o);
    for (const o of Object.values(resolved)) if (!map.has(o.value)) map.set(o.value, o);
    return map;
  }, [options, pages, resolved]);

  useEffect(() => {
    const resolve = resolveRef.current;
    if (!resolve || !valuesKey) return;
    const unknown = valuesKey.split(SEP).filter((v) => v && !known.has(v) && !asked.current.has(v));
    if (!unknown.length) return;
    const seen = asked.current;
    for (const v of unknown) seen.add(v);
    const ctrl = new AbortController();
    let settled = false;
    resolve(unknown, ctrl.signal).then(
      (rows) => {
        settled = true;
        if (ctrl.signal.aborted || !rows.length) return;
        setResolved((r) => {
          const next = { ...r };
          for (const o of rows) next[o.value] = o;
          return next;
        });
      },
      () => {
        settled = true;
      },
    );
    return () => {
      if (settled) return;
      ctrl.abort();
      for (const v of unknown) seen.delete(v);
    };
  }, [valuesKey, known]);

  useLayoutEffect(() => {
    const at = tagFocus.current;
    if (at === null) return;
    tagFocus.current = null;
    const buttons = tagsRef.current?.querySelectorAll<HTMLButtonElement>(".sx-picker__tag-x");
    const target = buttons && buttons.length ? buttons[Math.min(at, buttons.length - 1)] : triggerRef.current;
    target?.focus({ preventScroll: true });
  });

  const shown = useMemo(
    () => (isAsync ? remoteOptions(pages, q) : filterOptions(options ?? [], searchable ? q : "")),
    [isAsync, pages, q, options, searchable],
  );
  const pending = isAsync && !failed[q] && !(q ? pages[q] : pages[""]);
  const loadFailed = isAsync && !!failed[q];
  const metaKey = q ? (q === dq && pages[dq] ? dq : null) : "";
  const metaNow = metaKey !== null ? meta[metaKey] : undefined;

  const loadMore = (key: string) => {
    const page = pageRef.current;
    const have = pages[key];
    if (!page || !have || more?.state === "loading") return;
    moreCtrl.current?.abort();
    const ctrl = new AbortController();
    moreCtrl.current = ctrl;
    setMore({ key, state: "loading" });
    page(key, have.length, ctrl.signal).then(
      (res) => {
        if (ctrl.signal.aborted) return;
        setPages((p) => ({ ...p, [key]: dedupeOptions([...(p[key] ?? []), ...res.options]) }));
        setMeta((m) => ({ ...m, [key]: { total: res.total ?? m[key]?.total ?? null, hasMore: res.hasMore && res.options.length > 0 } }));
        setMore(null);
      },
      () => {
        if (!ctrl.signal.aborted) setMore({ key, state: "failed" });
      },
    );
  };

  const moreInfo: MoreInfo | null =
    metaKey !== null && metaNow && pages[metaKey] && (metaNow.hasMore || (metaNow.total !== null && metaNow.total > pages[metaKey].length))
      ? {
          shown: pages[metaKey].length,
          total: metaNow.total,
          hasMore: metaNow.hasMore,
          loading: more?.key === metaKey && more.state === "loading",
          failed: more?.key === metaKey && more.state === "failed",
          onMore: () => loadMore(metaKey),
        }
      : null;

  const nameOf = (v: string): string => known.get(v)?.label || labels.unknownRef(v);
  const selectedOption = !multi && values[0] ? known.get(values[0]) : undefined;
  const selectedCode = codeTag(selectedOption);
  const hasValue = values.length > 0;
  const clearable = (clearableProp ?? (!required && !multi)) && hasValue && !disabled && !readOnly;
  const onEdit = manage?.onEdit;
  const editable = !!onEdit && !disabled && !readOnly;
  const editOne = editable && !multi && hasValue;

  const emit = (next: string[]) => {
    if (props.multiple === true) props.onChange(next);
    else props.onChange(next[0] ?? "");
  };

  const show = (how: Start, seed = "", keys = false) => {
    if (disabled || readOnly || open) return;
    setStart(how);
    setQuery(seed);
    setViaKeys(keys);
    setOpen(true);
  };

  const hide = () => {
    setOpen(false);
    setQuery("");
    setFailed({});
    onBlur?.();
  };

  const clear = () => {
    emit([]);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const removeTag = (value: string, index: number) => {
    emit(values.filter((v) => v !== value));
    tagFocus.current = index;
    onBlur?.();
  };

  const pick = (o: SxOption): "close" | "stay" => {
    if (props.multiple === true) {
      props.onChange(toggleValue(values, o.value, props.max));
      return "stay";
    }
    props.onChange(o.value);
    return "close";
  };

  const retryLoad = () => {
    setFailed((f) => omit(f, ["", q, dq]));
    setRetry((n) => n + 1);
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (open || e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      show("selected", "", true);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      show("last", "", true);
      return;
    }
    if ((e.key === "Backspace" || e.key === "Delete") && clearable) {
      e.preventDefault();
      clear();
      return;
    }
    if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (searchable) show("first", e.key, true);
      else show({ key: e.key, at: e.timeStamp }, "", true);
    }
  };

  const triggerIcon = selectedOption?.icon ?? leadingIcon;
  const iconSize = size === "sm" ? 16 : 18;
  const text = multi ? (hasValue ? labels.list(values.map(nameOf), 2) : "") : hasValue ? nameOf(values[0]) : "";
  const fullText = multi ? values.map(nameOf).join(", ") : text;
  const ph = placeholder || t(multi ? "sx.form.pickMany" : "sx.form.pick");

  if (readOnly) {
    const names = values.map(nameOf);
    return (
      <div
        className={cx("sx-picker", className)}
        data-ro=""
        data-size={size}
        role="group"
        id={baseId}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        aria-describedby={describedBy}
      >
        <div className="sx-picker__box">
          <div className="sx-picker__ro" data-empty={names.length ? undefined : ""}>
            {triggerIcon ? <span className="sx-picker__lead">{glyph(triggerIcon, { size: iconSize })}</span> : null}
            <span className="sx-picker__value" data-multi={multi ? "" : undefined}>
              {names.length ? names.join(", ") : t("sx.ui.notSet")}
            </span>
            {selectedCode ? <span className="sx-code">{selectedCode}</span> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx("sx-picker", className)}
      data-size={size}
      data-open={open ? "" : undefined}
      data-invalid={invalid ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      data-multi={multi ? "" : undefined}
      data-filled={hasValue ? "" : undefined}
    >
      <div ref={boxRef} className="sx-picker__box" data-clear={clearable ? "" : undefined} data-edit={editOne ? "" : undefined}>
        <button
          ref={triggerRef}
          type="button"
          id={baseId}
          className="sx-picker__trigger"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : label}
          aria-required={required ? true : undefined}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          onClick={(e) => (open ? hide() : show("selected", "", e.detail === 0))}
          onKeyDown={onTriggerKey}
          onBlur={() => {
            if (!open) onBlur?.();
          }}
          data-ai-id={aiId}
          data-ai-type={aiId ? "select" : undefined}
          data-ai-label={aiId ? label : undefined}
        >
          {triggerIcon ? <span className="sx-picker__lead">{glyph(triggerIcon, { size: iconSize })}</span> : null}
          <span className="sx-picker__value" data-ph={text ? undefined : ""} title={fullText || undefined}>
            {text || ph}
          </span>
          {selectedCode ? <span className="sx-code">{selectedCode}</span> : null}
          <span className="sx-picker__caret" aria-hidden="true">
            {glyph(ChevronDownIcon, { size: 16 })}
          </span>
        </button>
        {clearable ? (
          <IconButton
            className="sx-ibtn sx-picker__clear"
            size="sm"
            tip={false}
            icon={glyph(XIcon, { size: 16 })}
            label={t("sx.form.clear")}
            onClick={clear}
          />
        ) : null}
        {editOne && manage ? (
          <IconButton
            className="sx-ibtn sx-picker__edit"
            size="sm"
            tip={false}
            icon={glyph(PencilIcon, { size: 15 })}
            label={manage.editLabel(nameOf(values[0]))}
            onClick={() => onEdit(values[0], nameOf(values[0]))}
            aiId={aiId ? `${aiId}.edit` : undefined}
          />
        ) : null}
      </div>
      {multi && hasValue ? (
        <ul ref={tagsRef} className="sx-picker__tags" aria-label={label}>
          {values.map((v, i) => {
            const name = nameOf(v);
            return (
              <li key={v} className="sx-picker__tag">
                <span className="sx-picker__tag-text" title={name}>
                  {name}
                </span>
                {editable && manage ? (
                  <button type="button" className="sx-picker__tag-edit" aria-label={manage.editLabel(name)} title={manage.editLabel(name)} onClick={() => onEdit(v, name)} data-ai-id={aiId ? `${aiId}.edit.${i}` : undefined}>
                    {glyph(PencilIcon, { size: 13 })}
                  </button>
                ) : null}
                {disabled ? null : (
                  <button type="button" className="sx-picker__tag-x" aria-label={t("sx.form.remove", { name })} onClick={() => removeTag(v, i)}>
                    {glyph(XIcon, { size: 14 })}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {tail}
      {open ? (
        <PickerPop
          label={label}
          listId={listId}
          trigger={triggerRef}
          anchor={boxRef}
          shown={shown}
          values={values}
          multi={multi}
          max={max}
          searchable={searchable}
          query={query}
          onQuery={setQuery}
          pending={pending}
          failed={loadFailed}
          onRetry={retryLoad}
          emptyText={emptyText}
          start={start}
          keyboard={viaKeys}
          onPick={pick}
          onClose={hide}
          more={moreInfo}
          indentOf={q ? undefined : indentOf}
          manage={manage}
          aiId={aiId}
        />
      ) : null}
    </div>
  );
}

type PopProps = {
  label: string;
  listId: string;
  trigger: RefObject<HTMLButtonElement | null>;
  anchor: RefObject<HTMLDivElement | null>;
  shown: readonly SxOption[];
  values: readonly string[];
  multi: boolean;
  max?: number;
  searchable: boolean;
  query: string;
  onQuery: (query: string) => void;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
  emptyText?: string;
  start: Start;
  keyboard: boolean;
  onPick: (o: SxOption) => "close" | "stay";
  onClose: (reason: PopoverCloseReason) => void;
  more?: MoreInfo | null;
  indentOf?: (o: SxOption) => number;
  manage?: PickerManage;
  aiId?: string;
};

function initialAct(start: Start, shown: readonly SxOption[], enabled: readonly number[]): { act: Act; buffer: TypeBuffer } {
  if (typeof start === "object") {
    const hit = typeAhead(
      shown.map((o) => o.label),
      enabled,
      -1,
      { text: "", at: 0 },
      start.key,
      start.at,
    );
    return { act: hit.index >= 0 ? { v: shown[hit.index].value } : "selected", buffer: hit.buffer };
  }
  return { act: start, buffer: { text: "", at: 0 } };
}

function PickerPop({
  label,
  listId,
  trigger,
  anchor,
  shown,
  values,
  multi,
  max,
  searchable,
  query,
  onQuery,
  pending,
  failed,
  onRetry,
  emptyText,
  start,
  keyboard,
  onPick,
  onClose,
  more,
  indentOf,
  manage,
  aiId,
}: PopProps): ReactNode {
  const t = useTranslations("studio");
  const popRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const reveal = useRef(true);
  const centered = useRef(false);
  const pop = usePopover({ open: true, onClose, trigger, popup: popRef, anchor, fit: "list", minWidth: 240, maxWidth: 420, maxHeight: 330, sheet: true });
  useSwipeDismiss({ enabled: pop.isSheet, panel: popRef, handles: [headRef], scroller: listRef, onDismiss: () => pop.close("escape") });

  const selected = new Set(values);
  const maxed = multi && max !== undefined && values.length >= max;
  const isOff = (o: SxOption) => !!o.disabled || (maxed && !selected.has(o.value));
  const enabled: number[] = [];
  shown.forEach((o, i) => {
    if (!isOff(o)) enabled.push(i);
  });

  const [init] = useState(() => initialAct(start, shown, enabled));
  const [act, setAct] = useState<Act>(init.act);
  const [kb, setKb] = useState(keyboard);
  const typed = useRef<TypeBuffer>(init.buffer);

  let activeIdx = -1;
  if (enabled.length) {
    if (typeof act === "object") {
      const i = shown.findIndex((o) => o.value === act.v);
      if (i >= 0 && !isOff(shown[i])) activeIdx = i;
    } else if (act === "last") activeIdx = enabled[enabled.length - 1];
    else if (act === "selected") {
      const i = shown.findIndex((o) => selected.has(o.value) && !isOff(o));
      if (i >= 0) activeIdx = i;
    }
    if (activeIdx < 0) activeIdx = enabled[0];
  }
  const optId = (i: number) => `${listId}-o${i}`;
  const activeId = activeIdx >= 0 ? optId(activeIdx) : undefined;

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const input = searchRef.current;
      if (input && !isCoarsePointer()) {
        input.focus({ preventScroll: true });
        const end = input.value.length;
        input.setSelectionRange(end, end);
        return;
      }
      (listRef.current ?? popRef.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const box = listRef.current;
    if (!pop.ready || !reveal.current || !box || !activeId) return;
    const el = document.getElementById(activeId);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (!centered.current) {
      centered.current = true;
      if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
      return;
    }
    if (r.top < b.top) box.scrollTop -= b.top - r.top + 4;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4;
  }, [activeId, pop.ready]);

  const moveTo = (index: number) => {
    if (index < 0 || index >= shown.length) return;
    reveal.current = true;
    setAct({ v: shown[index].value });
  };

  const afterClose = (fn: () => void) => {
    pop.close("select");
    requestAnimationFrame(fn);
  };

  const choose = (o: SxOption) => {
    if (isOff(o)) return;
    setAct({ v: o.value });
    if (onPick(o) === "close") pop.close("select");
  };

  const editRow = manage?.onEdit;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (!kb) setKb(true);
    const target = e.target instanceof HTMLElement ? e.target : null;
    const inSearch = target !== null && target === searchRef.current;
    if (e.key === "Tab") {
      const box = popRef.current;
      const here = target ?? box;
      const side = e.shiftKey ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
      const stops = box && here ? Array.from(box.querySelectorAll<HTMLElement>(TAB_STOPS)).filter((el) => el !== here && el.tabIndex >= 0) : [];
      if (here && stops.some((el) => here.compareDocumentPosition(el) & side)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        pop.close("select");
        return;
      }
      const from = trigger.current;
      const to = from ? nextTabbable(from, false, popRef.current) : null;
      if (!to) {
        pop.close("select");
        return;
      }
      pop.close("blur");
      to.focus();
      return;
    }
    if (target && !inSearch && target.closest("button")) return;
    if (e.key === EDIT_KEY && editRow && activeIdx >= 0 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      const o = shown[activeIdx];
      afterClose(() => editRow(o.value, o.label));
      return;
    }
    if (isNavKey(e.key)) {
      if (inSearch && (e.key === "Home" || e.key === "End")) return;
      e.preventDefault();
      moveTo(navIndex(enabled, activeIdx, e.key, PAGE));
      return;
    }
    if (e.key === "Enter") {
      if (activeIdx < 0) return;
      e.preventDefault();
      choose(shown[activeIdx]);
      return;
    }
    if (inSearch) return;
    if (e.key === " ") {
      e.preventDefault();
      if (activeIdx >= 0) choose(shown[activeIdx]);
      return;
    }
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const input = searchRef.current;
    if (searchable && input) {
      const next = query + e.key;
      onQuery(next);
      setAct("first");
      reveal.current = true;
      input.focus({ preventScroll: true });
      requestAnimationFrame(() => input.setSelectionRange(next.length, next.length));
      return;
    }
    const hit = typeAhead(
      shown.map((o) => o.label),
      enabled,
      activeIdx,
      typed.current,
      e.key,
      e.timeStamp,
    );
    typed.current = hit.buffer;
    if (hit.index !== activeIdx) moveTo(hit.index);
  };

  const onPopMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target && target.closest("input,button,a")) return;
    e.preventDefault();
  };

  const icons = new Set(shown.map((o) => o.icon));
  const showIcons = shown.some((o) => o.icon) && icons.size > 1;
  const q = query.trim();
  const skeleton = pending && shown.length === 0;

  const onCreate = manage?.onCreate;
  const keyHintId = editRow ? `${listId}-keys` : undefined;

  const row = ({ option: o, index: i }: { option: SxOption; index: number }) => {
    const off = isOff(o);
    const on = selected.has(o.value);
    const why = typeof o.disabled === "string" ? o.disabled : "";
    const desc = [o.description, why].filter(Boolean).join(" · ");
    const code = codeTag(o);
    const depth = indentOf ? Math.max(0, Math.min(8, Math.floor(indentOf(o) || 0))) : 0;
    return (
      <li
        key={o.value}
        id={optId(i)}
        role="option"
        aria-selected={on}
        aria-disabled={off ? true : undefined}
        aria-keyshortcuts={editRow ? EDIT_KEY : undefined}
        data-active={i === activeIdx ? "" : undefined}
        data-depth={depth || undefined}
        style={depth ? ({ "--sx-depth": depth } as CSSProperties) : undefined}
        className="sx-picker__opt"
        onMouseDown={keepFocus}
        onPointerMove={() => {
          if (kb) setKb(false);
          if (off || i === activeIdx) return;
          reveal.current = false;
          setAct({ v: o.value });
        }}
        onClick={() => choose(o)}
      >
        {showIcons ? (
          <span className="sx-picker__opt-icon" aria-hidden="true">
            {o.icon ? glyph(o.icon, { size: 18 }) : null}
          </span>
        ) : null}
        <span className="sx-picker__opt-text">
          <span className="sx-picker__opt-label">{o.label}</span>
          {desc ? <span className="sx-picker__opt-desc">{desc}</span> : null}
        </span>
        {code ? <span className="sx-code">{code}</span> : null}
        {editRow ? (
          <span
            className="sx-picker__opt-edit"
            aria-hidden="true"
            title={`${manage?.editLabel(o.label) ?? ""} (${EDIT_KEY})`}
            onMouseDown={keepFocus}
            onClick={(e) => {
              e.stopPropagation();
              afterClose(() => editRow(o.value, o.label));
            }}
            data-ai-id={aiId ? `${aiId}.option-edit.${i}` : undefined}
            data-ai-type="button"
            data-ai-label={manage?.editLabel(o.label)}
          >
            {glyph(PencilIcon, { size: 15 })}
            {kb && i === activeIdx ? (
              <kbd className="sx-picker__opt-key" title={t("sx.inline.editKeyHint")}>
                {EDIT_KEY}
              </kbd>
            ) : null}
          </span>
        ) : null}
        <span className="sx-picker__check" aria-hidden="true">
          {on ? glyph(CheckIcon, { size: 16 }) : null}
        </span>
      </li>
    );
  };

  const items = optionRuns(shown).map((run, n) =>
    run.group ? (
      <li key={`g${n}`} role="presentation" className="sx-picker__grp">
        <ul role="group" aria-label={run.group} className="sx-picker__grp">
          <li role="presentation" aria-hidden="true" className="sx-picker__group">
            {run.group}
          </li>
          {run.rows.map(row)}
        </ul>
      </li>
    ) : (
      <Fragment key={`r${n}`}>{run.rows.map(row)}</Fragment>
    ),
  );

  const search = searchable ? (
    <div className="sx-picker__search">
      {glyph(SearchIcon, { size: 16 })}
      <input
        ref={searchRef}
        type="search"
        className="sx-input__control"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setAct("first");
          reveal.current = true;
        }}
        placeholder={t("sx.form.search")}
        aria-label={t("sx.form.searchIn", { label })}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={true}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-describedby={keyHintId}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {pending && !skeleton ? <span className="sx-spin" aria-hidden="true" /> : null}
    </div>
  ) : null;

  const body = (
    <>
      {keyHintId ? (
        <span id={keyHintId} className="sx-vh">
          {t("sx.inline.editKeyHintSr")}
        </span>
      ) : null}
      {search}
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        className="sx-picker__list"
        aria-label={t("sx.form.listLabel", { label })}
        aria-multiselectable={multi ? true : undefined}
        aria-activedescendant={activeId}
        aria-busy={skeleton ? true : undefined}
        aria-describedby={keyHintId}
        tabIndex={-1}
      >
        {skeleton
          ? SKELETON.map((w, i) => (
              <li key={i} role="presentation" aria-hidden="true" className="sx-picker__sk">
                <span className="sx-sk" style={{ width: `${w}%` }} />
              </li>
            ))
          : items}
      </ul>
      {!skeleton && shown.length === 0 && !failed ? (
        <p className="sx-picker__state" role="status">
          {q ? t("sx.form.emptyQuery", { q }) : emptyText || t("sx.form.empty")}
        </p>
      ) : null}
      {failed ? (
        <div className="sx-picker__state" data-tone="error" role="status">
          <span>{t("sx.form.loadFail")}</span>
          <SxButton
            variant="ghost"
            size="sm"
            icon={RefreshCwIcon}
            onClick={() => {
              onRetry();
              (searchRef.current ?? listRef.current)?.focus({ preventScroll: true });
            }}
          >
            {t("sx.ui.retry")}
          </SxButton>
        </div>
      ) : null}
      {more && !skeleton ? (
        <div className="sx-picker__more" data-tone={more.failed ? "error" : undefined}>
          <span className="sx-picker__more-count" role="status">
            {more.failed ? t("sx.form.loadFail") : more.total !== null ? t("sx.form.shownOf", { n: more.shown, total: more.total }) : t("sx.form.shownSome", { n: more.shown })}
          </span>
          {more.hasMore ? (
            <SxButton variant="ghost" size="sm" icon={more.failed ? RefreshCwIcon : undefined} busy={more.loading} onClick={more.onMore} aiId="admin.studio.picker.more">
              {more.failed ? t("sx.ui.retry") : t("sx.form.loadMore")}
            </SxButton>
          ) : null}
        </div>
      ) : null}
      {onCreate && manage?.createLabel && !skeleton ? (
        <div className="sx-picker__create">
          <SxButton variant="add" size="sm" icon={PlusIcon} onMouseDown={keepFocus} onClick={() => afterClose(() => onCreate(q))} aiId={aiId ? `${aiId}.create` : undefined}>
            {manage.createLabel(q)}
          </SxButton>
        </div>
      ) : null}
      {maxed ? (
        <p className="sx-picker__max" role="status">
          {t("sx.form.maxReached", { n: max ?? 0 })}
        </p>
      ) : null}
    </>
  );

  if (typeof document === "undefined") return null;

  if (pop.isSheet) {
    const titleId = `${listId}-title`;
    return createPortal(
      <>
        <div className="sx-picker__scrim" style={{ zIndex: pop.z - 1 }} aria-hidden="true" />
        <div
          ref={popRef}
          className="sx-pop sx-picker__pop sx-picker__sheet"
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-placement="sheet"
          data-kb={kb ? "" : undefined}
          style={pop.style}
          onKeyDown={onKey}
          onMouseDown={onPopMouseDown}
        >
          <div ref={headRef} className="sx-picker__shead">
            <span className="sx-picker__grip" aria-hidden="true" />
            <h2 className="sx-picker__stitle" id={titleId}>
              {label}
            </h2>
            <IconButton className="sx-ibtn" size="sm" tip={false} icon={glyph(XIcon, { size: 16 })} label={t("sx.ui.close")} onClick={() => pop.close("escape")} />
          </div>
          {body}
          {multi ? (
            <div className="sx-picker__foot">
              <SxButton variant="primary" onClick={() => pop.close("select")}>
                {t("sx.form.done")}
              </SxButton>
            </div>
          ) : null}
        </div>
      </>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={popRef}
      className="sx-pop sx-picker__pop"
      tabIndex={-1}
      data-placement={pop.placement}
      data-kb={kb ? "" : undefined}
      style={pop.style}
      onKeyDown={onKey}
      onMouseDown={onPopMouseDown}
    >
      {body}
    </div>,
    document.body,
  );
}
