"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { errDetail } from "@/lib/http";
import { labelOf, regionLabel } from "@/lib/labels";
import type { UrgentCandidate } from "@/lib/services/backend";
import { directionLabel } from "@/components/admin/UrgentAdvocateQueue";
import { IconAlert } from "@/components/icons";
import { useCtrlEnter } from "../panel/bits";
import { IcArrowLeft, IcCheck, IcRefresh } from "../icons";
import { px } from "./parts";

export function useReportDirty(dirty: boolean, report: (dirty: boolean) => void) {
  const sent = useRef<boolean | null>(null);
  useEffect(() => {
    if (sent.current === dirty) return;
    sent.current = dirty;
    report(dirty);
  }, [dirty, report]);
}

export function StepFoot({
  onBack,
  backLabel,
  primary,
  label,
  busy,
  busyLabel,
  disabled,
  danger,
  icon,
  kbd = true,
}: {
  onBack: () => void;
  backLabel: string;
  primary: () => void;
  label: string;
  busy: boolean;
  busyLabel: string;
  disabled?: boolean;
  danger?: boolean;
  icon?: ReactNode;
  kbd?: boolean;
}) {
  useCtrlEnter(() => {
    if (!busy && !disabled) primary();
  }, kbd);
  return (
    <footer className="opx-pfoot opx-ug-foot">
      <button type="button" className="opx-pbtn" disabled={busy} onClick={onBack}>
        <IcArrowLeft size={16} />
        {backLabel}
      </button>
      <button type="button" className={`opx-pbtn opx-pbtn--main${danger ? " is-danger" : ""}`} disabled={busy || disabled} aria-busy={busy} onClick={primary}>
        {icon}
        {busy ? busyLabel : label}
        {kbd ? <kbd>Ctrl Enter</kbd> : null}
      </button>
    </footer>
  );
}

export function StepError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  const tn = useTranslations("common.notify");
  const detail = errDetail(error);
  return (
    <div className="opx-ug-err" role="alert">
      <p>
        <b>{title}</b>
        {detail ? <small>{detail}</small> : null}
      </p>
      <button type="button" className="opx-pbtn opx-ug-sm" onClick={onRetry}>
        <IcRefresh size={15} />
        {tn("retry")}
      </button>
    </div>
  );
}

export function CandRow({ c, on, disabled, title, onToggle }: { c: UrgentCandidate; on: boolean; disabled?: boolean; title?: string; onToggle: () => void }) {
  const t = useTranslations("admin.urgent");
  const x = useTranslations("admin.ccx.urgent");
  const te = useTranslations("enums");
  const meta = [c.sellerType || c.role ? labelOf(t, "roles", c.sellerType || c.role) : "", c.region ? regionLabel(te, c.region) : "", c.successRate ? t("successRate", { n: Math.round(c.successRate) }) : ""].filter(Boolean).join(" · ");
  const ring = { "--p": `${Math.max(0, Math.min(100, c.score))}%` } as CSSProperties;
  return (
    <li>
      <button type="button" className={`opx-ug-cand${on ? " is-on" : ""}`} aria-pressed={on} disabled={disabled} title={title} onClick={onToggle}>
        <span className="opx-ug-cand__ck" aria-hidden="true">
          {on ? <IcCheck size={14} /> : null}
        </span>
        <span className="opx-ug-cand__who">
          <b>{c.name}</b>
          {meta ? <small>{meta}</small> : null}
          {c.specializations.length ? <small className="opx-ug-cand__spec">{c.specializations.map((s) => directionLabel(te, s, t)).join(", ")}</small> : null}
          {c.isCallcenterMember || c.isExternalSeller || !c.directionMatch ? (
            <span className="opx-ug-cand__tags">
              {c.isCallcenterMember ? <em>{t("tagCallcenter")}</em> : null}
              {c.isExternalSeller ? <em>{t("tagExternal")}</em> : null}
              {!c.directionMatch ? (
                <em className="is-warn">
                  <IconAlert {...px(12)} aria-hidden="true" />
                  {t("tagOffDirection")}
                </em>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="opx-ug-cand__score">
          <i className="opx-num" style={ring}>
            {c.score}
          </i>
          <small>{x("score")}</small>
        </span>
        <span className="opx-ug-cand__nums">
          {c.rating ? (
            <span className="opx-num">
              <i className="opx-ug-star" aria-hidden="true">
                ★
              </i>
              {c.rating.toFixed(1)}
              <small>({c.reviewsCount})</small>
            </span>
          ) : null}
          <span>
            <small>{x("workload")}</small>
            <b className="opx-num">{t("workloadN", { n: c.workload })}</b>
          </span>
        </span>
      </button>
    </li>
  );
}
