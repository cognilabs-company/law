"use client";

import type { ComponentType, KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { fmtUzs } from "@/lib/money";
import { SERVICE_STATUSES, adPackageKey, type ManagedService, type ServiceStatus } from "@/lib/services/sellerServices";
import { IconAlert, IconPause, IconPlay, IconPower, IconTrash } from "@/components/icons";

export const som = (n: number) => fmtUzs(Math.max(0, n || 0));

const STATUS_ICON: Record<ServiceStatus, ComponentType<{ "aria-hidden"?: boolean }>> = {
  active: IconPlay,
  paused: IconPause,
  inactive: IconPower,
};

export function InBody({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export function StatusPill({ status }: { status: ServiceStatus }) {
  const t = useTranslations("sellerServices.status");
  return (
    <span className={`svst svst--${status}`}>
      <i aria-hidden="true" />
      {t(status)}
    </span>
  );
}

export function StatusSwitch({
  value,
  busy,
  disabled,
  onChange,
  label,
  aiTarget,
}: {
  value: ServiceStatus;
  busy?: boolean;
  disabled?: boolean;
  onChange: (s: ServiceStatus) => void;
  label: string;
  aiTarget?: string;
}) {
  const t = useTranslations("sellerServices");
  const off = Boolean(disabled || busy);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step || off) return;
    e.preventDefault();
    const n = SERVICE_STATUSES.length;
    const next = SERVICE_STATUSES[(SERVICE_STATUSES.indexOf(value) + step + n) % n];
    onChange(next);
    e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[SERVICE_STATUSES.indexOf(next)]?.focus();
  };
  return (
    <div className={`svsw${busy ? " is-busy" : ""}`} role="radiogroup" aria-label={label} aria-busy={busy || undefined} onKeyDown={onKey} data-ai-target={aiTarget}>
      {SERVICE_STATUSES.map((s) => {
        const Icon = STATUS_ICON[s];
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={`svsw__o svsw__o--${s}${on ? " is-on" : ""}`}
            disabled={off}
            title={t(`statusHint.${s}`)}
            onClick={() => {
              if (!on) onChange(s);
            }}
          >
            <Icon aria-hidden />
            <span>{t(`status.${s}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function usePackageName() {
  const t = useTranslations("sellerServices.packages");
  return (title: string) => {
    const k = adPackageKey(title);
    return k ? t(k) : title;
  };
}

export function RemoveServiceModal({
  item,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  item: ManagedService;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("sellerServices");
  const close = () => {
    if (!busy) onCancel();
  };
  return (
    <InBody>
      <Modal open onClose={close} title={t("remove.title")}>
        <div className="svrm">
          <span className="svrm__ic" aria-hidden="true">
            <IconTrash />
          </span>
          <p className="svrm__t">{t("remove.text", { title: item.service.name })}</p>
          {item.ownPromotion ? (
            <p className="svrm__warn">
              <IconAlert aria-hidden="true" />
              <span>{t("remove.promoWarn")}</span>
            </p>
          ) : null}
          {error ? (
            <p className="svm__err" role="alert">
              {error}
            </p>
          ) : null}
          <div className="svrm__acts">
            <button type="button" className="btn btn--line" onClick={close} disabled={busy}>
              {t("form.cancel")}
            </button>
            <button type="button" className="btn btn--danger" onClick={onConfirm} disabled={busy}>
              <IconTrash aria-hidden="true" />
              {busy ? t("remove.removing") : t("remove.confirm")}
            </button>
          </div>
        </div>
      </Modal>
    </InBody>
  );
}
