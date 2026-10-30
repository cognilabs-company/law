"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";

export type ConfirmTone = "danger" | "primary";
export type ConfirmOptions = {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  busyLabel?: string;
  onConfirm?: () => unknown;
};

type Ask = { key: number; opts: ConfirmOptions; done: Promise<boolean>; resolve: (ok: boolean) => void };

let current: Ask | null = null;
let seq = 0;
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

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  // ConfirmHost is mounted once in the root layout (app/[locale]/layout.tsx),
  // so the drawn dialog is always available. An ask made before the host has
  // subscribed (only possible in the instant before hydration finishes) is
  // simply held in `current`: useSyncExternalStore reads the snapshot when it
  // subscribes and shows it then — never the browser's window.confirm.
  if (current && same(current.opts, opts)) return current.done;
  const prev = current;
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
  const [busyKey, setBusyKey] = useState(0);
  const key = ask?.key ?? 0;
  const open = key > 0;
  const danger = ask?.opts.tone === "danger";
  const busy = open && busyKey === key;

  useEffect(() => {
    if (!key) return;
    (danger ? cancelRef.current : okRef.current)?.focus({ preventScroll: true });
  }, [key, danger]);

  async function confirm() {
    const run = ask?.opts.onConfirm;
    if (!run) {
      settle(key, true);
      return;
    }
    if (busy) return;
    okRef.current?.closest<HTMLElement>("[role=dialog]")?.focus({ preventScroll: true });
    setBusyKey(key);
    try {
      const r = await run();
      if (r === false) {
        requestAnimationFrame(() => okRef.current?.focus({ preventScroll: true }));
        return;
      }
      settle(key, true);
    } catch {
      requestAnimationFrame(() => okRef.current?.focus({ preventScroll: true }));
      return;
    } finally {
      setBusyKey((k) => (k === key ? 0 : k));
    }
  }

  const opts = ask?.opts;
  const described = opts?.text ? textId : undefined;
  return (
    <Modal
      open={open}
      onClose={() => settle(key, false)}
      title={opts?.title ?? ""}
      size="sm"
      busy={busy}
      initialFocus={danger ? cancelRef : okRef}
      footer={
        opts ? (
          <div className="cdlg__acts">
            <button
              ref={cancelRef}
              type="button"
              className="btn btn--line"
              aria-describedby={described}
              disabled={busy}
              onClick={() => settle(key, false)}
            >
              {opts.cancelLabel || t("cancel")}
            </button>
            <button
              ref={okRef}
              type="button"
              className={`btn ${danger ? "btn--danger" : "btn--pri"}${busy ? " is-busy" : ""}`}
              aria-describedby={described}
              aria-busy={busy || undefined}
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? <span className="cdlg__spin" aria-hidden="true" /> : null}
              {busy && opts.busyLabel ? opts.busyLabel : opts.confirmLabel || t("confirm")}
            </button>
          </div>
        ) : null
      }
    >
      {opts ? (
        <div className="cdlg">
          {opts.text ? (
            <p className="cdlg__text" id={textId}>
              {opts.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
