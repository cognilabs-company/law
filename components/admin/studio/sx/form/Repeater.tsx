"use client";

import "../sx-core.css";
import "../sx-form.css";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { notify } from "@/lib/toast";
import { SxButton } from "../Button";
import { ChevronDownIcon, ChevronRightIcon, GripVerticalIcon, PlusIcon, Trash2Icon, CircleAlertIcon, glyph } from "../icons";
import type { SxIcon } from "../types";
import { usePopover } from "@/lib/usePopover";
import { carryRowKey, dropTarget, insertAt, moveItem, removeAt, rowKeys } from "./logic";

export type RepeaterProps<T> = {
  id: string;
  label: string;
  itemName: string;
  items: readonly T[];
  onChange: (next: T[]) => void;
  newItem: () => T;
  summary: (item: T, index: number) => string;
  meta?: (item: T, index: number) => ReactNode;
  renderItem: (item: T, index: number, set: (next: T) => void) => ReactNode;
  inline?: boolean;
  rowErrors?: (index: number) => number;
  minItems?: number;
  maxItems?: number;
  addLabel?: string;
  // Kinds to add (TSK-938937): the add button opens a menu and the picked
  // kind makes the new row (a question by its answer type, …).
  addMenu?: readonly RepeaterAddChoice<T>[];
  emptyText?: string;
  readOnly?: boolean;
  defaultExpanded?: "none" | "new" | "all";
  onTouched?: () => void;
  aiId?: string;
};

export type RepeaterAddChoice<T> = { key: string; label: string; icon?: SxIcon; make: () => T };
type Expand = { open: ReadonlySet<string>; closed: ReadonlySet<string> };
type Pending = { key: string; part: "handle" | "first" | "remove" } | { key: ""; part: "add" };
type Drag = { from: number; pointer: number; startY: number; row: HTMLElement; handle: HTMLElement; started: boolean; to: number };

const FOCUSABLE = 'input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])';
const DRAG_SLOP = 4;

function withKey(set: ReadonlySet<string>, key: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}

export function Repeater<T>({
  id,
  label,
  itemName,
  items,
  onChange,
  newItem,
  summary,
  meta,
  renderItem,
  inline = false,
  rowErrors,
  maxItems,
  addLabel,
  addMenu,
  emptyText,
  readOnly = false,
  defaultExpanded = "new",
  onTouched,
  aiId,
}: RepeaterProps<T>): ReactElement {
  const t = useTranslations("studio");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const keys = rowKeys(items);
  const [expand, setExpand] = useState<Expand>(() => ({ open: new Set(), closed: new Set() }));
  const [announce, setAnnounce] = useState("");
  const [drop, setDrop] = useState<{ from: number; to: number; top: number } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const pending = useRef<Pending | null>(null);
  const drag = useRef<Drag | null>(null);
  const escape = useRef<((e: globalThis.KeyboardEvent) => void) | null>(null);
  const latest = useRef({ items, onChange });

  useLayoutEffect(() => {
    latest.current = { items, onChange };
  });

  useEffect(
    () => () => {
      if (escape.current) window.removeEventListener("keydown", escape.current, true);
      escape.current = null;
      drag.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    const want = pending.current;
    if (!want) return;
    pending.current = null;
    if (want.part === "add") {
      addRef.current?.querySelector<HTMLElement>("button")?.focus();
      return;
    }
    const rows = listRef.current ? Array.from(listRef.current.children) : [];
    const row = rows.find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.repKey === want.key);
    if (!row) return;
    let target: HTMLElement | null = null;
    if (want.part === "handle") target = row.querySelector<HTMLElement>(".sx-rep__handle");
    else if (want.part === "remove") target = row.querySelector<HTMLElement>(".sx-rep__remove");
    else {
      const zone = row.querySelector<HTMLElement>(".sx-rep__body, .sx-rep__ctl");
      target = zone?.querySelector<HTMLElement>(FOCUSABLE) ?? row.querySelector<HTMLElement>(".sx-rep__toggle");
    }
    target?.focus();
  });

  const flagged = inline || !rowErrors ? [] : keys.filter((k, i) => rowErrors(i) > 0 && !expand.open.has(k) && !expand.closed.has(k));
  if (flagged.length) setExpand((e) => ({ ...e, open: new Set([...e.open, ...flagged]) }));

  const nameAt = (index: number): string => {
    const item = items[index];
    const s = item === undefined ? "" : summary(item, index).trim();
    return s || t("sx.rep.item", { n: index + 1 });
  };

  const isOpen = (key: string, index: number): boolean => {
    if (expand.closed.has(key)) return false;
    if (expand.open.has(key)) return true;
    if ((rowErrors?.(index) ?? 0) > 0) return true;
    return defaultExpanded === "all";
  };

  const toggle = (key: string, index: number) => {
    const now = isOpen(key, index);
    setExpand((e) => ({ ...e, open: withKey(e.open, key, !now), closed: withKey(e.closed, key, now) }));
  };

  const commitMove = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= items.length) return;
    const name = nameAt(from);
    const next = moveItem(items, from, to);
    pending.current = { key: rowKeys(next)[to], part: "handle" };
    onChange(next);
    onTouched?.();
    setAnnounce(t("sx.rep.moved", { name, pos: to + 1 }));
  };

  const [menu, setMenu] = useState(false);
  const menuBtn = useRef<HTMLButtonElement | null>(null);
  const menuPane = useRef<HTMLUListElement | null>(null);
  const pop = usePopover({ open: menu, onClose: () => setMenu(false), trigger: menuBtn, popup: menuPane, sheet: false, minWidth: 220 });
  const add = (made?: T) => {
    const item = made ?? newItem();
    const [key] = rowKeys([...items, item]).slice(-1);
    setExpand((e) => ({ ...e, open: withKey(e.open, key, true), closed: withKey(e.closed, key, false) }));
    pending.current = { key, part: "first" };
    onChange([...items, item]);
  };

  const remove = (index: number) => {
    const item = items[index];
    const name = nameAt(index);
    const next = removeAt(items, index);
    const nextKeys = rowKeys(next);
    pending.current = next.length ? { key: nextKeys[Math.min(index, next.length - 1)], part: "remove" } : { key: "", part: "add" };
    onChange(next);
    onTouched?.();
    notify.info(t("sx.rep.removed", { name }), {
      duration: 6000,
      action: {
        label: t("sx.rep.undo"),
        onClick: () => {
          const cur = latest.current;
          cur.onChange(insertAt(cur.items, index, item));
        },
      },
    });
  };

  const setAt = (index: number) => (next: T) => {
    carryRowKey(items[index], next);
    const arr = items.slice();
    arr[index] = next;
    onChange(arr);
  };

  const stopDrag = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (escape.current) {
      window.removeEventListener("keydown", escape.current, true);
      escape.current = null;
    }
    setDrop(null);
    if (!d) return;
    d.row.style.transform = "";
    d.row.removeAttribute("data-dragging");
    if (d.handle.hasPointerCapture(d.pointer)) d.handle.releasePointerCapture(d.pointer);
    if (commit && d.started) commitMove(d.from, d.to);
  };

  const onHandleDown = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    if (readOnly || e.button !== 0 || drag.current) return;
    const row = e.currentTarget.closest<HTMLElement>(".sx-rep__row");
    if (!row) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { from: index, pointer: e.pointerId, startY: e.clientY, row, handle: e.currentTarget, started: false, to: index };
  };

  const onHandleMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const list = listRef.current;
    if (!d || e.pointerId !== d.pointer || !list) return;
    const dy = e.clientY - d.startY;
    if (!d.started) {
      if (Math.abs(dy) < DRAG_SLOP) return;
      d.started = true;
      d.row.setAttribute("data-dragging", "");
      const onEscape = (k: globalThis.KeyboardEvent) => {
        if (k.key !== "Escape") return;
        k.preventDefault();
        k.stopPropagation();
        stopDrag(false);
      };
      escape.current = onEscape;
      window.addEventListener("keydown", onEscape, true);
    }
    e.preventDefault();
    d.row.style.transform = `translateY(${dy}px)`;
    const rows = Array.from(list.querySelectorAll<HTMLElement>(":scope > .sx-rep__row"));
    const others = rows.filter((r) => r !== d.row);
    const mids = others.map((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2;
    });
    const to = dropTarget(mids, e.clientY);
    d.to = to;
    const listTop = list.getBoundingClientRect().top;
    const edge = to === 0 ? others[0] : others[to - 1];
    let top = 0;
    if (edge) {
      const b = edge.getBoundingClientRect();
      top = (to === 0 ? b.top : b.bottom) - listTop;
    }
    setDrop((prev) => (prev && prev.to === to && prev.top === top ? prev : { from: d.from, to, top }));
  };

  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (readOnly) return;
    let to = -1;
    if (e.key === "ArrowUp") to = index - 1;
    else if (e.key === "ArrowDown") to = index + 1;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = items.length - 1;
    else return;
    e.preventDefault();
    if (to < 0 || to >= items.length || to === index) return;
    commitMove(index, to);
  };

  const hintId = `${uid}-move`;
  const canAdd = !readOnly && (maxItems === undefined || items.length < maxItems);
  const addText = addLabel || t("sx.rep.addThe", { name: itemName });

  return (
    <div className="sx-rep" id={id} data-inline={inline ? "" : undefined} data-ro={readOnly ? "" : undefined}>
      {items.length ? (
        <ol ref={listRef} className="sx-rep__list" role="list" aria-label={label}>
          {items.map((item, index) => {
            const key = keys[index];
            const name = nameAt(index);
            const errors = rowErrors?.(index) ?? 0;
            const open = !inline && isOpen(key, index);
            const bodyId = `${uid}-b${index}`;
            const metaId = `${uid}-m${index}`;
            const errId = `${uid}-e${index}`;
            const metaNode = meta?.(item, index);
            const hasMeta = metaNode !== undefined && metaNode !== null && metaNode !== false && metaNode !== "";
            const toggleDesc = [hasMeta ? metaId : "", errors > 0 ? errId : ""].filter(Boolean).join(" ");
            const rawSummary = summary(item, index).trim();
            return (
              <li key={key} className="sx-rep__row" data-rep-key={key} data-open={open ? "" : undefined}>
                <div className="sx-rep__head">
                  {readOnly ? null : (
                    <button
                      type="button"
                      className="sx-rep__handle"
                      aria-label={t("sx.rep.move", { name })}
                      aria-describedby={hintId}
                      onPointerDown={(e) => onHandleDown(e, index)}
                      onPointerMove={onHandleMove}
                      onPointerUp={() => stopDrag(true)}
                      onPointerCancel={() => stopDrag(false)}
                      onLostPointerCapture={() => {
                        if (drag.current) stopDrag(false);
                      }}
                      onKeyDown={(e) => onHandleKey(e, index)}
                      data-ai-id={aiId ? makeAiId(aiId, index, "move") : undefined}
                      data-ai-type={aiId ? "button" : undefined}
                      data-ai-label={aiId ? t("sx.rep.move", { name }) : undefined}
                    >
                      {glyph(GripVerticalIcon, { size: 16 })}
                    </button>
                  )}
                  <span className="sx-rep__idx" aria-hidden="true">
                    {index + 1}
                  </span>
                  {inline ? (
                    <div className="sx-rep__ctl">{renderItem(item, index, setAt(index))}</div>
                  ) : (
                    <button
                      type="button"
                      className="sx-rep__toggle"
                      aria-expanded={open}
                      aria-controls={bodyId}
                      aria-label={t(open ? "sx.rep.collapse" : "sx.rep.expand", { name })}
                      aria-describedby={toggleDesc || undefined}
                      onClick={() => toggle(key, index)}
                      data-ai-id={aiId ? makeAiId(aiId, index) : undefined}
                      data-ai-type={aiId ? "button" : undefined}
                      data-ai-label={aiId ? name : undefined}
                    >
                      <span className="sx-rep__chev" aria-hidden="true">
                        {glyph(ChevronRightIcon, { size: 14 })}
                      </span>
                      <span className="sx-rep__sum" data-empty={rawSummary ? undefined : ""}>
                        {name}
                      </span>
                      {hasMeta ? (
                        <span className="sx-rep__meta" id={metaId}>
                          {metaNode}
                        </span>
                      ) : null}
                    </button>
                  )}
                  {errors > 0 ? (
                    <span className="sx-rep__err">
                      {glyph(CircleAlertIcon, { size: 14 })}
                      <span aria-hidden="true">{errors}</span>
                      <span className="sx-vh" id={errId}>
                        {t("sx.rep.errors", { n: errors })}
                      </span>
                    </span>
                  ) : (
                    <span />
                  )}
                  {readOnly ? null : (
                    <IconButton
                      className="sx-ibtn sx-rep__remove"
                      size="sm"
                      tip={false}
                      icon={glyph(Trash2Icon, { size: 16 })}
                      label={t("sx.rep.remove", { name })}
                      onClick={() => remove(index)}
                      aiId={aiId ? makeAiId(aiId, index, "remove") : undefined}
                    />
                  )}
                </div>
                {inline ? null : (
                  <div className="sx-rep__body" id={bodyId} hidden={!open} role="group" aria-label={name}>
                    {renderItem(item, index, setAt(index))}
                  </div>
                )}
              </li>
            );
          })}
          {drop && drop.to !== drop.from ? <li className="sx-rep__drop" role="presentation" aria-hidden="true" style={{ top: drop.top }} /> : null}
        </ol>
      ) : (
        <p className="sx-rep__empty">{emptyText || t("sx.rep.empty")}</p>
      )}
      {readOnly ? null : (
        <span className="sx-vh" id={hintId}>
          {t("sx.rep.moveHint")}
        </span>
      )}
      <span className="sx-vh" aria-live="polite">
        {announce}
      </span>
      {canAdd ? (
        <div className="sx-rep__foot" ref={addRef}>
          {addMenu?.length ? (
            <>
              <SxButton ref={menuBtn} variant="add" size="sm" icon={PlusIcon} iconEnd={ChevronDownIcon} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)} aiId={aiId ? makeAiId(aiId, "add") : undefined}>
                {addText}
              </SxButton>
              {menu ? (
                <ul ref={menuPane} className="sx-rep__menu" role="menu" aria-label={addText} style={pop.style} data-placement={pop.placement}>
                  {addMenu.map((c) => (
                    <li key={c.key} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          pop.close("select");
                          add(c.make());
                        }}
                      >
                        {c.icon ? glyph(c.icon, { size: 16 }) : null}
                        <span>{c.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <SxButton variant="add" size="sm" icon={PlusIcon} onClick={() => add()} aiId={aiId ? makeAiId(aiId, "add") : undefined}>
              {addText}
            </SxButton>
          )}
        </div>
      ) : null}
    </div>
  );
}
