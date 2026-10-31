"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ApiError, isCodeLike } from "@/lib/http";
import { humanize } from "@/lib/labels";
import { IconArrowRight, IconCheck } from "@/components/icons";
import Modal from "@/components/admin/Modal";
import { HrmError } from "@/components/internal/HrmUi";

// Shared pieces of the Live Office screens: status names and colours, the
// h:mm:ss durations the guide asks for (§11), links to the object an activity
// was about, and the "reason required" dialog every busy start/stop and
// revoke goes through (§12, §13).

export const STATUS_TONE: Record<string, string> = { working: "ok", online: "info", busy: "warn", meeting: "violet", remote: "info", break: "violet", inactive: "gray", offline: "off" };

export function useLiveText() {
  const t = useTranslations("internal.live");
  const label = (group: string, value: string) => (!value ? "—" : t.has(`${group}.${value}`) ? t(`${group}.${value}`) : humanize(value));
  return {
    t,
    status: (v: string) => label("status", v),
    roomType: (v: string) => label("roomType", v),
    membership: (v: string) => label("membershipType", v),
    module: (v: string) => label("modules", v),
    correctionType: (v: string) => label("correctionType", v),
    decision: (v: string) => label("decision", v),
  };
}

// 3725 s → "1:02:05" (h:mm:ss), as §11 asks; nothing is "0:00:00".
export function hms(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

// The status a viewer should see: a presence that has not beaten for longer
// than the inactive window counts as inactive even before the next event.
export function shownStatus(status: string, lastSeenAt: string, now: number, inactiveAfterSec: number): string {
  if (!now || !lastSeenAt || !["online", "working"].includes(status)) return status || "offline";
  const seen = Date.parse(lastSeenAt);
  return Number.isFinite(seen) && now - seen > inactiveAfterSec * 1000 ? "inactive" : status;
}

export function LiveStatus({ value, compact }: { value: string; compact?: boolean }) {
  const { status } = useLiveText();
  return (
    <span className={`lv-st lv-st--${STATUS_TONE[value] ?? "gray"}${compact ? " lv-st--sm" : ""}`}>
      <i aria-hidden />
      {status(value)}
    </span>
  );
}

// An activity's detail_url opens the real object (§10): an app path through
// the locale-aware Link, a full URL in a new tab.
export function ObjectLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (!href) return <>{children}</>;
  if (/^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className ?? "lv-link"}>
        {children}
        <IconArrowRight aria-hidden />
      </a>
    );
  }
  return (
    <Link href={href.startsWith("/") ? href : `/${href}`} className={className ?? "lv-link"}>
      {children}
      <IconArrowRight aria-hidden />
    </Link>
  );
}

// The backend's own words for a refused request (a 409 status move, a 422
// field, a 403 scope), so the user sees why — not a generic failure.
export function apiMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const d = (e.detail || "").trim();
    if (d && !isCodeLike(d) && !/^\d{3}$/.test(d) && d.length < 400) return d;
  }
  return fallback;
}

// "Why?" — a dialog that will not submit without a reason.
export function ReasonModal({
  open,
  title,
  lead,
  label,
  placeholder,
  submitLabel,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  lead?: string;
  label: string;
  placeholder?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  children?: ReactNode;
}) {
  const { t } = useLiveText();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const close = () => {
    if (busy) return;
    setReason("");
    setErr("");
    onClose();
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = reason.trim();
    if (!r || busy) return;
    setBusy(true);
    setErr("");
    try {
      await onSubmit(r);
      setReason("");
      onClose();
    } catch (cause) {
      setErr(apiMessage(cause, t("errors.save")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={close} title={title}>
      <form className="hrm-form lv-reason" onSubmit={submit}>
        {lead ? <p className="hrm-form__note">{lead}</p> : null}
        {children}
        <label className="lv-field">
          <span>
            {label} <i className="lv-req">*</i>
          </span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder={placeholder} required autoFocus />
        </label>
        {err ? <HrmError text={err} /> : null}
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || !reason.trim()}>
            <IconCheck />
            {busy ? t("saving") : submitLabel}
          </button>
          <button className="btn btn--line btn--sm" type="button" onClick={close}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Local date (YYYY-MM-DD), `back` days ago.
export function dayIso(back = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "2026-10-11" + "09:30" → "2026-10-11T09:30:00+05:00" in the viewer's offset.
export function zonedIso(date: string, time: string): string {
  if (!date) return "";
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = (time || "00:00").split(":").map(Number);
  const local = new Date(y, mo - 1, d, h || 0, mi || 0, 0);
  const off = -local.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const p = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  return `${date}T${p(h || 0)}:${p(mi || 0)}:00${sign}${p(off / 60)}:${p(off % 60)}`;
}
