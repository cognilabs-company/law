"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { errorText } from "@/lib/errorText";
import { statusLabel, type StatusNamespace } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { assistDocDuplicateOf, assistErrorKind, assistMarketDuplicateOf, type AssistClient } from "@/lib/services/supportAssist";
import { IconAlert, IconCheck, IconClose } from "@/components/icons";

export type Tr = ReturnType<typeof useTranslations>;

export type AssistSectionProps = {
  ticketId: string;
  client: AssistClient | null;
  clientName: string;
  onDone: () => void;
  onBlock: (e: unknown) => boolean;
};

export type InfoRow = { key: string; label: string; value: ReactNode };

const OK = new Set(["active", "paid", "completed", "done", "file_ready", "delivered", "rated", "approved", "verified", "closed"]);
const WARN = new Set(["pending", "pending_payment", "payment_pending", "waiting_payment", "awaiting_payment", "payment_required", "open_pool", "questionnaire", "new", "waiting_info", "waiting_docs"]);
const ERR = new Set(["cancelled", "canceled", "rejected", "declined", "failed", "expired", "lost", "payment_cancelled", "refunded"]);

function toneOf(status: string): string {
  const s = status.toLowerCase();
  if (OK.has(s)) return "ok";
  if (WARN.has(s)) return "warn";
  if (ERR.has(s)) return "err";
  return "info";
}

export function sumText(t: Tr, amount: number, currency = "UZS"): string {
  return !currency || currency === "UZS" ? t("sum", { amount: fmtUzs(amount) }) : `${fmtUzs(amount)} ${currency}`;
}

export function clientLine(t: Tr, client: AssistClient | null, fallbackName: string): string {
  const name = client?.name || fallbackName;
  const id = client?.lexgoId ? t("client.lexgoId", { id: client.lexgoId }) : "";
  return [name || t("client.noName"), id].filter(Boolean).join(" · ");
}

export function assistErrorText(e: unknown, t: Tr, tc: Tr): string {
  const doc = assistDocDuplicateOf(e);
  if (doc) return doc.workId ? t("errors.docDuplicate", { id: doc.workId }) : t("errors.docDuplicatePlain");
  const market = assistMarketDuplicateOf(e);
  if (market) return market.workId ? t("errors.marketDuplicate", { id: market.workId }) : t("errors.marketDuplicatePlain");
  const kind = assistErrorKind(e);
  if (kind) return t(`errors.${kind}`);
  return errorText(e, tc);
}

export function StatusChip({ status, prefer }: { status: string; prefer?: StatusNamespace }) {
  const tp = useTranslations("portal.common");
  if (!status) return null;
  return <span className={`sasst__st sasst__st--${toneOf(status)}`}>{statusLabel(tp, status, prefer)}</span>;
}

export function InfoList({ rows }: { rows: InfoRow[] }) {
  return (
    <dl className="sasst__dl">
      {rows.map((r) => (
        <div key={r.key}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ResultCard({ title, rows, note, warn, onDismiss }: { title: string; rows: InfoRow[]; note?: ReactNode; warn?: boolean; onDismiss: () => void }) {
  const t = useTranslations("support.assist");
  return (
    <div className={`sasst__res${warn ? " sasst__res--warn" : ""}`} role="status" data-ai-private>
      <div className="sasst__resh">
        {warn ? <IconAlert aria-hidden="true" /> : <IconCheck aria-hidden="true" />}
        <b>{title}</b>
        <button type="button" className="sasst__x" onClick={onDismiss} aria-label={t("result.dismiss")} title={t("result.dismiss")}>
          <IconClose />
        </button>
      </div>
      <InfoList rows={rows} />
      {note ? <p>{note}</p> : null}
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  rows,
  note,
  busy,
  error,
  onCancel,
  onConfirm,
  aiId,
}: {
  open: boolean;
  title: string;
  rows: InfoRow[];
  note: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  aiId?: string;
}) {
  const t = useTranslations("support.assist");
  if (!open || typeof document === "undefined") return null;
  const close = () => {
    if (!busy) onCancel();
  };
  return createPortal(
    <Modal open onClose={close} title={title}>
      <div className="sasst__cf" data-ai-id={aiId || undefined} data-ai-type={aiId ? "modal" : undefined} data-ai-label={title} data-ai-private>
        <InfoList rows={rows} />
        <p className="sasst__cfnote">
          <IconAlert aria-hidden="true" />
          <span>{note}</span>
        </p>
        {error ? (
          <p className="sasst__err" role="alert">
            {error}
          </p>
        ) : null}
        <div className="sasst__cfacts">
          <button type="button" className="btn btn--line" onClick={close} disabled={busy}>
            {t("confirm.cancel")}
          </button>
          <button
            type="button"
            className="btn btn--grad"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
            data-ai-id={aiId ? `${aiId}.confirm` : undefined}
            data-ai-label={t("confirm.send")}
          >
            {busy ? t("confirm.sending") : t("confirm.send")}
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

export function AssistNote({ icon, title, text, children }: { icon: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="sasst__lock">
      <span className="sasst__lockic" aria-hidden="true">
        {icon}
      </span>
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
      {children}
    </div>
  );
}
