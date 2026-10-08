"use client";

import { useId, type ComponentType, type ReactNode, type SVGProps } from "react";
import Modal from "@/components/admin/Modal";
import { studioErrorOf } from "@/lib/services/studio";
import { StudioEmpty, StudioErrorNote, useStudioText } from "../bits";
import { IconHourglass, IconRefresh } from "@/components/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export type Phase = "loading" | "ready" | "error";

export function isMissingError(e: unknown): boolean {
  return studioErrorOf(e).kind === "missing";
}

export function StudioKpi({ icon: Glyph, value, label, hint, tone }: { icon: Icon; value: string; label: string; hint?: string; tone?: "ok" | "warn" | "brand" }) {
  return (
    <div className={`stu-mkpi${tone ? ` stu-mkpi--${tone}` : ""}`}>
      <span className="stu-mkpi__ico" aria-hidden>
        <Glyph />
      </span>
      <span className="stu-mkpi__m">
        <b>{value}</b>
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
    </div>
  );
}

export function PanelHead({ icon: Glyph, title, text, children }: { icon: Icon; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="stu-sph">
      <span className="stu-sph__ico" aria-hidden>
        <Glyph />
      </span>
      <div className="stu-sph__t">
        <h3>{title}</h3>
        {text ? <p>{text}</p> : null}
      </div>
      {children ? <div className="stu-sph__acts">{children}</div> : null}
    </div>
  );
}

export function LoadProblem({ error, onRetry, busy, missingText }: { error: unknown; onRetry: () => void; busy?: boolean; missingText?: string }) {
  const { t } = useStudioText();
  if (isMissingError(error)) {
    return (
      <StudioEmpty icon={IconHourglass} title={t("settings.common.missingTitle")} text={missingText || t("settings.common.missingText")}>
        <button type="button" className="btn btn--line btn--sm" onClick={onRetry} disabled={busy}>
          <IconRefresh className={busy ? "stu-spinning" : undefined} aria-hidden />
          {t("settings.common.recheck")}
        </button>
      </StudioEmpty>
    );
  }
  return <StudioErrorNote error={error} onRetry={onRetry} busy={busy} />;
}

export function ConfirmModal({
  open,
  title,
  text,
  points,
  confirmLabel,
  icon: Glyph,
  tone,
  busy,
  aiId,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  points?: string[];
  confirmLabel: string;
  icon: Icon;
  tone?: "warn";
  busy: boolean;
  aiId: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useStudioText();
  const uid = useId();
  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={title} aiId={aiId}>
      <div className={`stu-sconf${tone === "warn" ? " stu-sconf--warn" : ""}`}>
        <span className="stu-sconf__ico" aria-hidden>
          <Glyph />
        </span>
        <p id={`${uid}-t`}>{text}</p>
        {points?.length ? (
          <ul className="stu-sconf__list">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        <div className="stu-sconf__acts">
          <button type="button" className="btn btn--line btn--sm" onClick={onClose} disabled={busy} data-ai-id={`${aiId}.cancel`} data-ai-type="button" data-ai-label={t("actions.cancel")}>
            {t("actions.cancel")}
          </button>
          <button
            type="button"
            className="btn btn--pri btn--sm"
            onClick={onConfirm}
            disabled={busy}
            aria-describedby={`${uid}-t`}
            data-ai-id={`${aiId}.confirm`}
            data-ai-type="button"
            data-ai-label={confirmLabel}
          >
            {busy ? <span className="stu-spin" aria-hidden /> : <Glyph aria-hidden />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const a = parts[0].replace(/^\+/, "").charAt(0);
  const b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (a + b).toUpperCase() || "?";
}

export function matchesTerms(hay: (string | undefined)[], q: string): boolean {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = hay.filter(Boolean).join(" ").toLowerCase();
  return terms.every((w) => text.includes(w));
}
