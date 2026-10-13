"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAiReveal } from "@/lib/guide/targets";
import { isCoarsePointer, nextTabbable, usePopover, type PopoverAlign } from "@/lib/usePopover";
import { useSwipeDismiss } from "@/lib/useSwipeDismiss";
import { useScrollEdges } from "@/lib/useScrollEdges";
import { matchesSearch, normalizeSearchText } from "@/lib/searchText";
import { IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight, IconMoreHorizontal, IconSearch } from "@/components/icons";
import IconButton, { type IconButtonVariant, type TipAlign, type TipSide } from "./IconButton";

export type MenuItem = {
  kind?: "item";
  key: string;
  label: string;
  description?: string;
  hint?: string;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  newTab?: boolean;
  danger?: boolean;
  disabled?: boolean | string;
  checked?: boolean;
  toggle?: boolean;
  items?: readonly MenuEntry[] | (() => readonly MenuEntry[]);
  stepTitle?: string;
  search?: boolean;
  aiId?: string;
  aiType?: string;
};

export type MenuSeparator = { kind: "separator"; key: string };
export type MenuHeading = { kind: "heading"; key: string; label: string };
export type MenuEntry = MenuItem | MenuSeparator | MenuHeading;
export type MenuFocus = "first" | "last" | "checked";

export type MenuProps = {
  items: readonly MenuEntry[];
  label: string;
  title?: string;
  triggerLabel?: string;
  text?: ReactNode;
  icon?: ReactNode;
  caret?: boolean;
  triggerClassName?: string;
  variant?: IconButtonVariant;
  size?: "sm" | "md";
  tip?: boolean | string;
  tipSide?: TipSide;
  tipAlign?: TipAlign;
  disabled?: boolean;
  busy?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  focus?: MenuFocus;
  search?: boolean;
  sheet?: boolean;
  align?: PopoverAlign;
  className?: string;
  minWidth?: number;
  maxWidth?: number;
  describedBy?: string;
  aiId?: string;
  aiLabel?: string;
  reveal?: boolean;
};

const SEARCH_AFTER = 8;
const TYPE_MS = 700;
const MAX_HEIGHT = 420;
const ITEM = '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]';
const NEVER = /(?!)/;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const isMenuItem = (e: MenuEntry): e is MenuItem => e.kind === undefined || e.kind === "item";

export const menuSeparator = (key: string): MenuSeparator => ({ kind: "separator", key });

export const menuHeading = (key: string, label: string): MenuHeading => ({ kind: "heading", key, label });

export function menuStepEntries(it: MenuItem): readonly MenuEntry[] {
  const v = it.items;
  return typeof v === "function" ? v() : (v ?? []);
}

export function tidyMenu(list: readonly MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const e of list) {
    const last = out[out.length - 1];
    if (e.kind === "separator") {
      if (!last || !isMenuItem(last)) continue;
      out.push(e);
    } else if (e.kind === "heading") {
      if (last && last.kind === "heading") out.pop();
      out.push(e);
    } else out.push(e);
  }
  while (out.length && !isMenuItem(out[out.length - 1])) out.pop();
  return out;
}

function filterMenu(list: readonly MenuEntry[], q: string): MenuEntry[] {
  return tidyMenu(list.filter((e) => !isMenuItem(e) || matchesSearch([e.label, e.description, e.hint].filter(Boolean).join(" "), q)));
}

function revealSource(items: readonly MenuEntry[]): string {
  const parts: string[] = [];
  for (const e of items) {
    if (!isMenuItem(e)) continue;
    if (e.aiId) parts.push(e.items ? `${esc(e.aiId)}(?:\\..+)?` : esc(e.aiId));
    if (e.items && typeof e.items !== "function") {
      for (const c of e.items) if (isMenuItem(c) && c.aiId && !(e.aiId && c.aiId.startsWith(`${e.aiId}.`))) parts.push(esc(c.aiId));
    }
  }
  return parts.length ? `^(?:${parts.join("|")})$` : "";
}

function stepFor(items: readonly MenuEntry[], id: string): string | null | undefined {
  for (const e of items) {
    if (!isMenuItem(e)) continue;
    if (e.aiId === id) return null;
    if (!e.items) continue;
    const inside = (e.aiId && id.startsWith(`${e.aiId}.`)) || (typeof e.items !== "function" && e.items.some((c) => isMenuItem(c) && c.aiId === id));
    if (inside) return e.disabled ? null : e.key;
  }
  return undefined;
}

function rootItem(items: readonly MenuEntry[], key: string): MenuItem | null {
  for (const e of items) if (isMenuItem(e) && e.key === key && e.items) return e;
  return null;
}

function itemsOf(list: HTMLElement | null): HTMLElement[] {
  return Array.from(list?.querySelectorAll<HTMLElement>(ITEM) ?? []);
}

function firstReal(all: HTMLElement[]): HTMLElement | undefined {
  return all.find((x) => !x.classList.contains("umenu__back")) ?? all[0];
}

function revealIn(box: HTMLElement | null, el: HTMLElement | undefined) {
  if (!box || !el) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.top < b.top) box.scrollTop -= b.top - r.top + 4;
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4;
}

function focusEl(box: HTMLElement | null, el: HTMLElement | undefined) {
  if (!el) return;
  el.focus({ preventScroll: true });
  revealIn(box, el);
}

const stopClick = (e: MouseEvent) => e.stopPropagation();

const stopDrag = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

type Intent = { kind: MenuFocus | "key"; key?: string };

type PopProps = {
  items: readonly MenuEntry[];
  step: string | null;
  setStep: (step: string | null) => void;
  heading: string;
  menuId: string;
  trigger: RefObject<HTMLButtonElement | null>;
  start: MenuFocus;
  search: boolean;
  sheet: boolean;
  align?: PopoverAlign;
  className?: string;
  minWidth?: number;
  maxWidth?: number;
  onClose: () => void;
};

function MenuPop({ items, step, setStep, heading, menuId, trigger, start, search, sheet, align, className, minWidth, maxWidth, onClose }: PopProps) {
  const t = useTranslations("common");
  const uid = useId();
  const pane = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const intent = useRef<Intent>({ kind: start });
  const [query, setQuery] = useState("");
  const pop = usePopover({ open: true, onClose: () => onClose(), trigger, popup: pane, sheet, align, minWidth, maxWidth, maxHeight: MAX_HEIGHT });
  useSwipeDismiss({ enabled: pop.isSheet, panel: pane, handles: [head], onDismiss: () => pop.close("escape") });
  useScrollEdges(list, { silent: true });

  const stepItem = step ? rootItem(items, step) : null;
  const entries = stepItem ? menuStepEntries(stepItem) : items;
  const actions = entries.filter(isMenuItem);
  const searchable = stepItem ? (stepItem.search ?? actions.length > SEARCH_AFTER) : search;
  const q = searchable ? query.trim() : "";
  const shown = q ? filterMenu(entries, q) : tidyMenu(entries);
  const title = stepItem ? (stepItem.stepTitle ?? stepItem.label) : heading;
  const empty = !shown.some(isMenuItem);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const box = list.current;
      const all = itemsOf(box);
      const want = intent.current;
      if (want.kind === "key") {
        focusEl(box, all.find((x) => x.dataset.key === want.key) ?? firstReal(all));
        return;
      }
      const input = field.current;
      if (input && !isCoarsePointer()) {
        input.focus({ preventScroll: true });
        return;
      }
      const pick = want.kind === "last" ? all[all.length - 1] : want.kind === "checked" ? (all.find((x) => x.getAttribute("aria-checked") === "true") ?? firstReal(all)) : firstReal(all);
      if (pick) focusEl(box, pick);
      else pane.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [step]);

  function enter(it: MenuItem) {
    intent.current = { kind: "checked" };
    typed.current = { text: "", at: 0 };
    setQuery("");
    setStep(it.key);
  }

  function back() {
    intent.current = { kind: "key", key: step ?? "" };
    typed.current = { text: "", at: 0 };
    setQuery("");
    setStep(null);
  }

  function activate(it: MenuItem) {
    if (it.disabled) return;
    if (it.items) {
      enter(it);
      return;
    }
    pop.close("select");
    it.onSelect?.();
  }

  function entryOf(el: HTMLElement | null): MenuItem | undefined {
    const key = el?.dataset.key;
    if (!key) return undefined;
    return shown.find((e): e is MenuItem => isMenuItem(e) && e.key === key);
  }

  function typeAhead(e: KeyboardEvent<HTMLElement>, all: HTMLElement[], at: number): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === " ") return false;
    const input = field.current;
    if (input) {
      const next = query + e.key;
      setQuery(next);
      input.focus({ preventScroll: true });
      requestAnimationFrame(() => input.setSelectionRange(next.length, next.length));
      return true;
    }
    const prev = typed.current;
    const fresh = e.timeStamp - prev.at > TYPE_MS;
    const text = (fresh ? "" : prev.text) + e.key;
    typed.current = { text, at: e.timeStamp };
    const same = [...text].every((c) => c === text[0]);
    const needle = normalizeSearchText(same ? text[0] : text);
    if (!needle) return true;
    const from = same ? at + 1 : Math.max(at, 0);
    for (let s = 0; s < all.length; s++) {
      const el = all[(from + s) % all.length];
      if (el.classList.contains("umenu__back")) continue;
      const label = el.querySelector(".umenu__l")?.textContent ?? "";
      if (normalizeSearchText(label).startsWith(needle)) {
        focusEl(list.current, el);
        break;
      }
    }
    return true;
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Tab") {
      e.preventDefault();
      const from = trigger.current;
      const to = from ? nextTabbable(from, e.shiftKey, pane.current) : null;
      if (!to) {
        pop.close("select");
        return;
      }
      pop.close("blur");
      to.focus();
      return;
    }
    const box = list.current;
    const all = itemsOf(box);
    const act = document.activeElement;
    const input = field.current;
    if (input && act === input) {
      if (e.key === "ArrowDown") focusEl(box, firstReal(all));
      else if (e.key === "ArrowUp") focusEl(box, all[all.length - 1]);
      else if (e.key === "Enter") {
        const first = shown.find((x): x is MenuItem => isMenuItem(x) && !x.disabled);
        if (first) activate(first);
      } else return;
      e.preventDefault();
      return;
    }
    const at = all.findIndex((x) => x === act);
    const cur = at >= 0 ? all[at] : null;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      if (!all.length) return;
      if (e.key === "ArrowUp" && at <= 0 && input) {
        input.focus({ preventScroll: true });
        return;
      }
      const n = all.length;
      const to = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key === "ArrowDown" ? (at + 1) % n : at <= 0 ? n - 1 : at - 1;
      focusEl(box, all[to]);
      return;
    }
    if (e.key === "ArrowRight") {
      const it = entryOf(cur);
      if (it?.items && !it.disabled) {
        e.preventDefault();
        enter(it);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      if (stepItem) {
        e.preventDefault();
        back();
      }
      return;
    }
    if (e.key === " " && cur instanceof HTMLAnchorElement) {
      e.preventDefault();
      cur.click();
      return;
    }
    if (typeAhead(e, all, at)) e.preventDefault();
  }

  const row = (e: MenuEntry): ReactNode => {
    if (e.kind === "separator") return <div key={e.key} role="separator" className="umenu__sep" />;
    if (e.kind === "heading")
      return (
        <div key={e.key} role="none" className="umenu__grp">
          {e.label}
        </div>
      );
    const why = typeof e.disabled === "string" ? e.disabled : "";
    const off = !!e.disabled;
    const whyId = why ? `${uid}-w-${e.key.replace(/[^a-zA-Z0-9_-]/g, "")}` : undefined;
    const opens = !!e.items;
    const attrs = {
      role: e.checked === undefined ? "menuitem" : e.toggle ? "menuitemcheckbox" : "menuitemradio",
      "aria-checked": e.checked === undefined ? undefined : e.checked,
      "aria-disabled": off || undefined,
      "aria-describedby": whyId,
      "aria-haspopup": opens ? ("menu" as const) : undefined,
      tabIndex: -1,
      className: cx("umenu__i", e.danger && "umenu__i--danger", e.checked && !e.toggle && "umenu__i--on", e.toggle && "umenu__i--sw"),
      "data-key": e.key,
      "data-ai-id": e.aiId,
      "data-ai-type": e.aiId ? (e.aiType ?? "button") : undefined,
      "data-ai-label": e.aiId ? e.label : undefined,
      onClick: () => activate(e),
    };
    const body = (
      <>
        {e.icon ? (
          <span className="umenu__ic" aria-hidden="true">
            {e.icon}
          </span>
        ) : null}
        <span className="umenu__tx">
          <span className="umenu__l">{e.label}</span>
          {e.description ? <span className="umenu__d">{e.description}</span> : null}
          {why ? (
            <span id={whyId} className="umenu__why">
              {why}
            </span>
          ) : null}
        </span>
        {e.hint ? <span className="umenu__h">{e.hint}</span> : null}
        {e.toggle ? <span className="umenu__sw" aria-hidden="true" /> : e.checked ? <IconCheck className="umenu__ck" aria-hidden="true" /> : null}
        {opens ? <IconChevronRight className="umenu__go" aria-hidden="true" /> : null}
      </>
    );
    if (e.href && !off) {
      const target = e.newTab ? "_blank" : undefined;
      const rel = e.newTab ? "noopener noreferrer" : undefined;
      if (EXTERNAL.test(e.href)) {
        return (
          <a key={e.key} href={e.href} target={target} rel={rel} draggable={false} {...attrs}>
            {body}
          </a>
        );
      }
      return (
        <Link key={e.key} href={e.href} target={target} rel={rel} draggable={false} {...attrs}>
          {body}
        </Link>
      );
    }
    return (
      <button key={e.key} type="button" {...attrs}>
        {body}
      </button>
    );
  };

  const searchBox = searchable ? (
    <div className="dsel__srch umenu__srch">
      <IconSearch aria-hidden="true" />
      <input
        ref={field}
        type="search"
        value={query}
        onChange={(ev) => setQuery(ev.target.value)}
        placeholder={t("select.search")}
        aria-label={t("select.search")}
        aria-controls={menuId}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
    </div>
  ) : null;

  const body = (
    <>
      {searchBox}
      <div ref={list} id={menuId} role="menu" aria-label={title} className="umenu scue-y">
        {stepItem ? (
          <button type="button" role="menuitem" tabIndex={-1} className="umenu__i umenu__back" data-key="" aria-label={`${t("menu.back")}: ${title}`} onClick={back}>
            <IconChevronLeft className="umenu__go" aria-hidden="true" />
            <span className="umenu__tx">
              <span className="umenu__l">{pop.isSheet ? t("menu.back") : title}</span>
            </span>
          </button>
        ) : null}
        {shown.map(row)}
      </div>
      {empty ? (
        <p className="umenu__empty" role="status">
          {t("select.empty")}
        </p>
      ) : null}
    </>
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    pop.isSheet ? (
      <>
        <div className="dsel__scrim" style={{ zIndex: pop.z - 1 }} aria-hidden="true" onClick={stopClick} />
        <div ref={pane} className={cx("dsel__sheet", "umenu-sheet", className)} role="dialog" aria-label={title} tabIndex={-1} data-placement="sheet" style={pop.style} onKeyDown={onKey} onClick={stopClick} onDragStart={stopDrag}>
          <div ref={head} className="dsel__shead">
            <span className="dsel__grip" aria-hidden="true" />
            <b className="dsel__stitle">{title}</b>
          </div>
          {body}
        </div>
      </>
    ) : (
      <div ref={pane} className={cx("umenu-pop", className)} tabIndex={-1} data-placement={pop.placement} style={pop.style} onKeyDown={onKey} onClick={stopClick} onDragStart={stopDrag}>
        {body}
      </div>
    ),
    document.body,
  );
}

export default function Menu({
  items,
  label,
  title,
  triggerLabel,
  text,
  icon,
  caret = true,
  triggerClassName,
  variant = "ghost",
  size = "md",
  tip = true,
  tipSide,
  tipAlign,
  disabled = false,
  busy = false,
  open: openProp,
  onOpenChange,
  focus = "first",
  search = false,
  sheet = true,
  align,
  className,
  minWidth,
  maxWidth,
  describedBy,
  aiId,
  aiLabel,
  reveal = true,
}: MenuProps) {
  const uid = useId();
  const menuId = `umenu-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const btn = useRef<HTMLButtonElement>(null);
  const [own, setOwn] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [start, setStart] = useState<MenuFocus>(focus);
  const open = openProp ?? own;
  const [was, setWas] = useState(open);
  if (was !== open) {
    setWas(open);
    if (!open && step !== null) setStep(null);
  }

  const setOpen = (v: boolean) => {
    if (openProp === undefined) setOwn(v);
    onOpenChange?.(v);
  };

  const show = (how: MenuFocus) => {
    if (disabled || busy) return;
    setStart(how);
    setStep(null);
    setOpen(true);
  };

  const src = reveal ? revealSource(items) : "";
  useAiReveal(src ? new RegExp(src) : NEVER, (id) => {
    if (disabled || busy) return;
    const at = stepFor(items, id);
    if (at === undefined) return;
    btn.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    setStart("first");
    setStep(at);
    setOpen(true);
  });

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (open) setOpen(false);
    else show(focus);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.stopPropagation();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    e.stopPropagation();
    if (!open) show(e.key === "ArrowUp" ? "last" : focus);
  };

  const summary = aiId
    ? items
        .filter(isMenuItem)
        .map((x) => x.label)
        .join(", ")
    : undefined;
  const heading = title ?? label;
  const ctl = {
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    "aria-describedby": describedBy,
    "data-ai-description": summary,
  };

  const trigger =
    text !== undefined ? (
      <button
        ref={btn}
        type="button"
        className={cx("umenu-btn", triggerClassName ?? "btn btn--line btn--sm")}
        aria-label={triggerLabel}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={onClick}
        onKeyDown={onKeyDown}
        data-ai-id={aiId}
        data-ai-type={aiId ? "button" : undefined}
        data-ai-label={aiId ? (aiLabel ?? triggerLabel ?? label) : undefined}
        {...ctl}
      >
        {text}
        {caret ? <IconChevronDown className="umenu-btn__cv" aria-hidden="true" /> : null}
      </button>
    ) : (
      <IconButton
        ref={btn}
        label={triggerLabel ?? label}
        icon={icon ?? <IconMoreHorizontal />}
        variant={variant}
        size={size}
        tip={tip}
        tipSide={tipSide}
        tipAlign={tipAlign}
        busy={busy}
        disabled={disabled}
        className={cx("umenu-trig", triggerClassName)}
        onClick={onClick}
        onKeyDown={onKeyDown}
        aiId={aiId}
        {...ctl}
      />
    );

  return (
    <>
      {trigger}
      {open ? (
        <MenuPop
          items={items}
          step={step}
          setStep={setStep}
          heading={heading}
          menuId={menuId}
          trigger={btn}
          start={start}
          search={search}
          sheet={sheet}
          align={align}
          className={className}
          minWidth={minWidth}
          maxWidth={maxWidth}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
