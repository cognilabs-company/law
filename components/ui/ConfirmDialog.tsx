"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";

export type ConfirmTone = "danger" | "primary";
export type ConfirmOptions = {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type Ask = { key: number; opts: ConfirmOptions; done: Promise<boolean>; resolve: (ok: boolean) => void };

const OVERLAYS = '.amodal, [role="dialog"], [aria-modal="true"]';

let current: Ask | null = null;
let seq = 0;
let savedOverflow: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function snapshot(): Ask | null {
  return current;
}

function serverSnapshot(): Ask | null {
  return null;
}

function same(a: ConfirmOptions, b: ConfirmOptions): boolean {
  return (
    a.title === b.title &&
    a.text === b.text &&
    a.confirmLabel === b.confirmLabel &&
    a.cancelLabel === b.cancelLabel &&
    a.tone === b.tone
  );
}

function settle(key: number, ok: boolean): void {
  const ask = current;
  if (!ask || ask.key !== key) return;
  current = null;
  emit();
  ask.resolve(ok);
}

function restoreOverflow(): void {
  const saved = savedOverflow;
  savedOverflow = null;
  if (saved && document.querySelector(OVERLAYS)) document.body.style.overflow = saved;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!listeners.size) return Promise.resolve(window.confirm(opts.text ? `${opts.title}\n\n${opts.text}` : opts.title));
  if (current && same(current.opts, opts)) return current.done;
  const prev = current;
  if (!prev) savedOverflow = document.body.style.overflow;
  let resolve: (ok: boolean) => void = () => undefined;
  const done = new Promise<boolean>((r) => {
    resolve = r;
  });
  current = { key: ++seq, opts, done, resolve };
  emit();
  prev?.resolve(false);
  return done;
}

export default function ConfirmHost() {
  const t = useTranslations("common.confirm");
  const ask = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const textId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const key = ask?.key ?? 0;
  const open = key > 0;
  const danger = ask?.opts.tone === "danger";

  useEffect(() => {
    if (!key) return;
    (danger ? cancelRef.current : okRef.current)?.focus({ preventScroll: true });
  }, [key, danger]);

  useEffect(() => {
    if (!open) restoreOverflow();
  }, [open]);

  const opts = ask?.opts;
  const described = opts?.text ? textId : undefined;
  return (
    <Modal open={open} onClose={() => settle(key, false)} title={opts?.title ?? ""}>
      {opts ? (
        <div className="cdlg">
          {opts.text ? (
            <p className="cdlg__text" id={textId}>
              {opts.text}
            </p>
          ) : null}
          <div className="cdlg__acts">
            <button
              ref={cancelRef}
              type="button"
              className="btn btn--line"
              aria-describedby={described}
              onClick={() => settle(key, false)}
            >
              {opts.cancelLabel || t("cancel")}
            </button>
            <button
              ref={okRef}
              type="button"
              className={`btn ${danger ? "btn--danger" : "btn--pri"}`}
              aria-describedby={described}
              onClick={() => settle(key, true)}
            >
              {opts.confirmLabel || t("confirm")}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
