"use client";

import "../sx-core.css";
import "../sx-tones.css";
import "./sx-ctorpage.css";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { SxButton } from "../Button";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, GripVerticalIcon, LockIcon, RefreshCwIcon, glyph } from "../icons";
import { SxNote } from "../layout/Note";
import { SxPanel } from "../layout/Panel";
import { StatusPill } from "../StatusPill";
import { useStudioLive } from "../live";
import { useStudioLabels, type SxTranslate } from "../useStudioLabels";
import { canReorderRecord, fetchCtorRecords, isNotReorderable, reorderCtorRecords, reorderItemsOf, rowKeyOf, type CtorRecord } from "./recordsApi";
import { isTestRow, rowTitle, StatusTile, TestBadge } from "./variants";

export const REORDER_LIMIT = 200;
const BASE = "admin.studio.list.reorder";
const EDGE = 64;
const STEP = 14;
const SK = [0, 1, 2, 3];

type Loaded = { rows: CtorRecord[]; total: number; hasMore: boolean };
type Drag = { key: string; from: number; over: number };

export type ReorderPanelProps = { code: string; name: string; onClose: (changed: boolean) => void };

export function moveKey(order: readonly string[], from: number, to: number): string[] {
  const next = [...order];
  if (from < 0 || from >= next.length) return next;
  const [k] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, k);
  return next;
}

export function splitReorderable(rows: readonly CtorRecord[]): { movable: CtorRecord[]; locked: CtorRecord[] } {
  return { movable: rows.filter(canReorderRecord), locked: rows.filter((r) => !canReorderRecord(r)) };
}

export function ReorderPanel({ code, name, onClose }: ReorderPanelProps): ReactElement {
  const t = useTranslations("studio") as SxTranslate;
  const labels = useStudioLabels();
  const errText = useEditorErrorText();
  const [tick, setTick] = useState(0);
  const [got, setGot] = useState<{ tick: number; data: Loaded | null; error: unknown } | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [saving, setSaving] = useState(false);
  const [say, setSay] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const confirmed = useRef<string[]>([]);
  const pending = useRef<string[] | null>(null);
  const busy = useRef(false);
  const changed = useRef(false);
  const focusKey = useRef("");
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    doneRef.current?.focus();
  }, []);

  useStudioLive((e) => {
    if (e.event !== "studio.resync" || busy.current || pending.current) return;
    setDrag(null);
    setTick((n) => n + 1);
  });

  useEffect(() => {
    const ctl = new AbortController();
    fetchCtorRecords(code, { source: "", limit: REORDER_LIMIT, offset: 0 }, ctl.signal).then(
      (d) => {
        if (ctl.signal.aborted) return;
        const keys = d.items.filter(canReorderRecord).map(rowKeyOf);
        confirmed.current = keys;
        pending.current = null;
        setOrder(keys);
        setGot({ tick, data: { rows: d.items, total: d.total, hasMore: d.hasMore || d.total > d.items.length }, error: null });
      },
      (e: unknown) => {
        if (ctl.signal.aborted) return;
        logApiError("studio.records.reorder.load", e);
        setGot({ tick, data: null, error: e ?? new Error("failed") });
      },
    );
    return () => ctl.abort();
  }, [code, tick]);

  useEffect(() => {
    const k = focusKey.current;
    if (!k || !listRef.current) return;
    focusKey.current = "";
    const el = [...listRef.current.querySelectorAll<HTMLElement>("[data-reorder-handle]")].find((x) => x.dataset.reorderHandle === k);
    el?.focus();
  }, [order]);

  const current = got && got.tick === tick ? got : null;
  const data = current?.data ?? null;
  const byKey = new Map<string, CtorRecord>((data?.rows ?? []).map((r) => [rowKeyOf(r), r]));
  const { locked } = splitReorderable(data?.rows ?? []);
  const shown = drag ? moveKey(order, drag.from, drag.over) : order;
  const titleOf = (r: CtorRecord | undefined) => (r ? rowTitle(r) || t("sx.ui.untitled") : "");

  const flush = async (): Promise<void> => {
    if (busy.current) return;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    busy.current = true;
    setSaving(true);
    try {
      const items = reorderItemsOf(next.map((k) => byKey.get(k)).filter((r): r is CtorRecord => !!r));
      await reorderCtorRecords(code, items);
      confirmed.current = next;
      changed.current = true;
    } catch (e) {
      logApiError("studio.records.reorder", e);
      pending.current = null;
      setOrder(confirmed.current);
      const stale = isNotReorderable(e);
      setSay(t("sx.cp2.reorder.failed"));
      notify.error(stale ? t("sx.cp2.reorder.notReorderable") : errText(e).text || t("sx.cp2.reorder.failed"), { error: e });
      if (stale) setTick((n) => n + 1);
    } finally {
      busy.current = false;
      setSaving(false);
      if (pending.current) void flush();
    }
  };

  const commit = (next: string[], key: string) => {
    const at = next.indexOf(key);
    setOrder(next);
    setSay(t("sx.cp2.reorder.moved", { name: titleOf(byKey.get(key)), n: at + 1, total: next.length }));
    pending.current = next;
    void flush();
  };

  const moveBy = (key: string, delta: number) => {
    const from = order.indexOf(key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    focusKey.current = key;
    commit(moveKey(order, from, to), key);
  };

  const moveTo = (key: string, to: number) => {
    const from = order.indexOf(key);
    if (from < 0 || from === to) return;
    focusKey.current = key;
    commit(moveKey(order, from, to), key);
  };

  const onHandleDown = (e: PointerEvent<HTMLButtonElement>, key: string) => {
    if (e.button !== 0 || !listRef.current) return;
    e.preventDefault();
    const from = order.indexOf(key);
    if (from < 0) return;
    listRef.current.setPointerCapture(e.pointerId);
    setDrag({ key, from, over: from });
    setSay(t("sx.cp2.reorder.grabbed", { name: titleOf(byKey.get(key)), n: from + 1, total: order.length }));
  };

  const onListMove = (e: PointerEvent<HTMLOListElement>) => {
    if (!drag || !listRef.current) return;
    const others = [...listRef.current.querySelectorAll<HTMLElement>("[data-reorder-key]")].filter((el) => el.dataset.reorderKey !== drag.key);
    let over = 0;
    for (const el of others) {
      const r = el.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) over += 1;
    }
    if (over !== drag.over) setDrag({ ...drag, over });
    if (e.clientY < EDGE) window.scrollBy(0, -STEP);
    else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, STEP);
  };

  const endDrag = (drop: boolean) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (drop && d.over !== d.from) commit(moveKey(order, d.from, d.over), d.key);
    else setSay(t("sx.cp2.reorder.cancelled"));
  };

  const onListKey = (e: KeyboardEvent<HTMLOListElement>) => {
    if (drag && e.key === "Escape") {
      e.preventDefault();
      endDrag(false);
    }
  };

  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>, key: string) => {
    if (drag) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      moveBy(key, e.key === "ArrowUp" ? -1 : 1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      moveTo(key, e.key === "Home" ? 0 : order.length - 1);
    }
  };

  const done = (
    <SxButton ref={doneRef} variant="primary" size="sm" icon={CheckIcon} busy={saving} onClick={() => onClose(changed.current)} aiId={aiIdOf(BASE, "done")}>
      {t("sx.cp2.reorder.done")}
    </SxButton>
  );

  let body: ReactElement;
  if (!current)
    body = (
      <ul className="sx-cp-ro__list" aria-hidden="true">
        {SK.map((i) => (
          <li key={i} className="sx-cp-ro__item" data-sk="">
            <span className="sx-sk sx-cp-ro__sk" />
          </li>
        ))}
      </ul>
    );
  else if (current.error || !data)
    body = (
      <SxNote
        tone="error"
        className="sx-cp-note"
        action={
          <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={() => setTick((n) => n + 1)} aiId={aiIdOf(BASE, "retry")}>
            {t("sx.ui.retry")}
          </SxButton>
        }
      >
        {errText(current.error).text || t("sx.ui.loadFail")}
      </SxNote>
    );
  else if (!order.length)
    body = (
      <p className="sx-cp-ro__empty" role="status">
        {t("sx.cp2.reorder.none")}
      </p>
    );
  else
    body = (
      <ol
        ref={listRef}
        className="sx-cp-ro__list"
        aria-label={t("sx.cp2.reorder.listLabel", { name })}
        data-dragging={drag ? "" : undefined}
        onPointerMove={onListMove}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
        onKeyDown={onListKey}
        data-ai-id={aiIdOf(BASE, "list")}
        data-ai-type="list"
        data-ai-label={t("sx.cp2.reorder.listLabel", { name })}
      >
        {shown.map((key, i) => {
          const r = byKey.get(key);
          if (!r) return null;
          const title = titleOf(r);
          const handleLabel = t("sx.cp2.reorder.handle", { name: title, n: i + 1, total: shown.length });
          const rid = aiIdOf(BASE, "row", key);
          return (
            <li key={key} className="sx-cp-ro__item" data-reorder-key={key} data-drag={drag?.key === key ? "" : undefined} data-test={isTestRow(r) ? "" : undefined}>
              <button
                type="button"
                className="sx-cp-ro__handle"
                data-reorder-handle={key}
                aria-label={handleLabel}
                aria-describedby={`${BASE}-hint`}
                title={t("sx.cp2.reorder.drag")}
                onPointerDown={(e) => onHandleDown(e, key)}
                onKeyDown={(e) => onHandleKey(e, key)}
                data-ai-id={aiIdOf(rid, "handle")}
                data-ai-type="button"
                data-ai-label={handleLabel}
              >
                {glyph(GripVerticalIcon, { size: 18 })}
              </button>
              <span className="sx-cp-ro__pos sx-num" aria-hidden="true">
                {labels.num(i + 1)}
              </span>
              <StatusTile status={r.status} source={r.source} />
              <span className="sx-cp-ro__body">
                <span className="sx-cp-ro__t">{title}</span>
                <span className="sx-cp-ro__m">
                  {isTestRow(r) ? <TestBadge t={t} /> : null}
                  <span>{t(`sx.cpage.source.${r.source}`)}</span>
                </span>
              </span>
              {r.status ? <StatusPill status={r.status} source={r.source} size="sm" /> : null}
              <span className="sx-cp-ro__arrows">
                <button
                  type="button"
                  className="sx-cp-ro__arrow"
                  aria-label={t("sx.cp2.reorder.up", { name: title })}
                  title={t("sx.cp2.reorder.upShort")}
                  disabled={i === 0 || !!drag}
                  onClick={() => moveBy(key, -1)}
                  data-ai-id={aiIdOf(rid, "up")}
                  data-ai-type="button"
                  data-ai-label={t("sx.cp2.reorder.up", { name: title })}
                >
                  {glyph(ArrowUpIcon, { size: 16 })}
                </button>
                <button
                  type="button"
                  className="sx-cp-ro__arrow"
                  aria-label={t("sx.cp2.reorder.down", { name: title })}
                  title={t("sx.cp2.reorder.downShort")}
                  disabled={i === shown.length - 1 || !!drag}
                  onClick={() => moveBy(key, 1)}
                  data-ai-id={aiIdOf(rid, "down")}
                  data-ai-type="button"
                  data-ai-label={t("sx.cp2.reorder.down", { name: title })}
                >
                  {glyph(ArrowDownIcon, { size: 16 })}
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    );

  return (
    <SxPanel className="sx-cp-panel sx-cp-ro" title={t("sx.cp2.reorder.title")} lead={<span id={`${BASE}-hint`}>{t("sx.cp2.reorder.lead")}</span>} actions={done} aiId={BASE}>
      <div className="sx-cp-ro__in">
        {data?.hasMore ? (
          <SxNote tone="info" className="sx-cp-note">
            {t("sx.cp2.reorder.partial", { n: data.rows.length, total: data.total })}
          </SxNote>
        ) : null}
        {body}
        {data && locked.length ? (
          <details className="sx-cp-ro__locked" data-ai-id={aiIdOf(BASE, "locked")} data-ai-type="section" data-ai-label={t("sx.cp2.reorder.locked", { n: locked.length })}>
            <summary className="sx-cp-ro__lsum">
              {glyph(LockIcon, { size: 14 })}
              <span>{t("sx.cp2.reorder.locked", { n: locked.length })}</span>
            </summary>
            <p className="sx-cp-ro__lnote">{t("sx.cp2.reorder.lockedText")}</p>
            <ul className="sx-cp-ro__llist">
              {locked.map((r) => (
                <li key={rowKeyOf(r)} className="sx-cp-ro__lrow">
                  <span className="sx-cp-ro__t">{titleOf(r)}</span>
                  {isTestRow(r) ? <TestBadge t={t} /> : null}
                  {r.status ? <StatusPill status={r.status} source={r.source} size="sm" /> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <p className="sx-vh" role="status" aria-live="polite">
          {say}
        </p>
      </div>
    </SxPanel>
  );
}
