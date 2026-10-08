"use client";

import { useEffect, useRef, type ComponentType, type ReactNode, type SVGProps } from "react";
import Modal from "@/components/admin/Modal";
import type { UserEvent } from "@/lib/userSocket";
import { StudioErrorNote, useStudioLive, useStudioText } from "../bits";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export const IconArchive = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="4" width="18" height="4" rx="1.2" />
    <path d="M5 8v10.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V8" />
    <path d="M10 12h4" />
  </svg>
);

export function studioEventCode(e: UserEvent): string {
  const d = (e.data && typeof e.data === "object" ? e.data : e) as Record<string, unknown>;
  const obj = d.object && typeof d.object === "object" ? (d.object as Record<string, unknown>) : {};
  const pick = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return pick(d.constructor_code) || pick(d.constructorCode) || pick(obj.constructor_code) || pick(obj.constructorCode);
}

const touchesObjects = (e: UserEvent) => e.event === "studio.resync" || e.event.startsWith("studio.object_");

export function useStudioRefetch(run: () => void, match?: (e: UserEvent) => boolean, enabled = true): void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useStudioLive((e) => {
    if (!touchesObjects(e)) return;
    if (e.event !== "studio.resync" && match && !match(e)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(run, 400);
  }, enabled);
}

export function StudioConfirm({
  open,
  title,
  text,
  icon: Glyph,
  confirmLabel,
  tone = "warn",
  busy,
  error,
  onConfirm,
  onClose,
  aiId,
  children,
}: {
  open: boolean;
  title: string;
  text: string;
  icon: Icon;
  confirmLabel: string;
  tone?: "warn" | "brand";
  busy: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
  aiId: string;
  children?: ReactNode;
}) {
  const { t } = useStudioText();
  return (
    <Modal open={open} onClose={() => (busy ? undefined : onClose())} title={title} aiId={aiId}>
      <div className="stu-cfm">
        <span className={`stu-cfm__ico stu-cfm__ico--${tone}`} aria-hidden>
          <Glyph />
        </span>
        <p className="stu-cfm__t">{text}</p>
        {children}
        {error ? <StudioErrorNote error={error} compact /> : null}
        <div className="stu-cfm__acts">
          <button type="button" className="btn btn--line" onClick={onClose} disabled={busy} data-ai-id={`${aiId}.cancel`} data-ai-type="button" data-ai-label={t("actions.cancel")}>
            {t("actions.cancel")}
          </button>
          <button type="button" className="btn btn--pri" onClick={onConfirm} disabled={busy} data-ai-id={`${aiId}.confirm`} data-ai-type="button" data-ai-label={confirmLabel}>
            {busy ? <span className="stu-spin" aria-hidden /> : <Glyph aria-hidden />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
