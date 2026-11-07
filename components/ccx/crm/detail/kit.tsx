"use client";

import "../../panel/panel.css";
import "./detail.css";
import { useEffect, useId, type ReactNode, type RefObject } from "react";
import CheckBox from "@/components/CheckBox";
import { CrmDateTime } from "@/components/crm/fields";
import Select from "@/components/Select";
import { initials } from "@/components/crm/bits";
import { useCrmMeta } from "@/lib/crm/useCrm";
import { isFinalStatus, type CrmContact, type CrmMeta } from "@/lib/services/crm";
import { IcAward, IcClock, IcClose, IcDoc, IcInbox, IcLayers, IcPhone, IcRefresh } from "../../icons";
import { useStageLabel } from "../leads/util";
import { IcAlert, IcMail, IcSend, IcSpark, IcTarget } from "./glyphs";

export type Tone = "ok" | "warn" | "hot" | "info" | "mute";

export function statusTone(meta: CrmMeta | null, s: string): Tone {
  if (s === "rejected") return "hot";
  if (s === "won") return "ok";
  if (s === "decision_pending") return "warn";
  if (isFinalStatus(meta, s)) return "mute";
  return "info";
}

export function StatusGlyph({ status, size = 16 }: { status: string; size?: number }) {
  switch (status) {
    case "new":
      return <IcSpark size={size} />;
    case "qualified":
      return <IcTarget size={size} />;
    case "proposal":
      return <IcDoc size={size} />;
    case "decision_pending":
      return <IcClock size={size} />;
    case "won":
      return <IcAward size={size} />;
    case "rejected":
      return <IcClose size={size} />;
    default:
      return <IcLayers size={size} />;
  }
}

export function StatusChip({ meta, status }: { meta: CrmMeta | null; status: string }) {
  const shared = useCrmMeta().meta;
  const label = useStageLabel(meta ?? shared);
  return (
    <span className="opx-cd-pill" data-tone={statusTone(meta, status)}>
      <i aria-hidden="true" />
      {label(status)}
    </span>
  );
}

export function Pill({ tone = "info", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className="opx-cd-pill" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

export function Avatar({ name, size = "md", title }: { name: string; size?: "sm" | "md" | "lg" | "xl"; title?: string }) {
  return (
    <span className={`opx-cd-av opx-cd-av--${size}`} title={title} aria-hidden={title ? undefined : true}>
      {name ? initials(name) : "?"}
    </span>
  );
}

export function Card({ icon, title, aside, children, className, tone }: { icon?: ReactNode; title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; tone?: "warn" | "bad" }) {
  const id = useId();
  return (
    <section className={`opx-cd-card${className ? ` ${className}` : ""}`} data-tone={tone} aria-labelledby={id}>
      <header className="opx-cd-card__h">
        {icon ? (
          <span className="opx-cd-card__ic" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <h3 id={id}>{title}</h3>
        {aside ? <div className="opx-cd-card__aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="opx-cd-empty">
      <span className="opx-cd-empty__ic" aria-hidden="true">
        {icon ?? <IcInbox size={22} />}
      </span>
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

export function Failed({ text, retry, onRetry }: { text: string; retry?: string; onRetry?: () => void }) {
  return (
    <div className="opx-cd-fail" role="alert">
      <IcAlert size={18} />
      <span>{text}</span>
      {onRetry && retry ? (
        <button type="button" className="opx-pbtn opx-cd-btn-sm" onClick={onRetry}>
          <IcRefresh size={15} />
          {retry}
        </button>
      ) : null}
    </div>
  );
}

export function Shim({ h = 70 }: { h?: number }) {
  return <i className="opx-shim opx-cd-shim" style={{ height: h }} />;
}

type FieldBase = { label: string; hint?: ReactNode; error?: string; required?: boolean; invalid?: boolean };

function FieldFoot({ id, hint, error, count }: { id: string; hint?: ReactNode; error?: string; count?: string }) {
  if (!hint && !error && !count) return null;
  return (
    <>
      {hint || count ? (
        <span className="opx-field__meta">
          {hint ? <small id={`${id}-h`}>{hint}</small> : <small />}
          {count ? <small className="opx-num">{count}</small> : null}
        </span>
      ) : null}
      {error ? (
        <p className="opx-ferr" id={`${id}-e`} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function FieldLabel({ id, label, required }: { id: string; label: string; required?: boolean }) {
  return (
    <label htmlFor={id}>
      {label}
      {required ? <i aria-hidden="true">*</i> : null}
    </label>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  hint,
  error,
  invalid,
  required,
  max,
  placeholder,
  type = "text",
  inputMode,
  autoFocus,
  onEnter,
}: FieldBase & { value: string; onChange: (v: string) => void; max?: number; placeholder?: string; type?: "text" | "email" | "tel"; inputMode?: "text" | "numeric" | "tel" | "email"; autoFocus?: boolean; onEnter?: () => void }) {
  const id = useId();
  return (
    <div className={`opx-field${error || invalid ? " has-error" : ""}`}>
      <FieldLabel id={id} label={label} required={required} />
      <input
        id={id}
        type={type}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
        aria-invalid={error || invalid ? true : undefined}
        aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={
          onEnter
            ? (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onEnter();
                }
              }
            : undefined
        }
      />
      <FieldFoot id={id} hint={hint} error={error} />
    </div>
  );
}

export function TextArea({ label, value, onChange, hint, error, invalid, required, max, placeholder, rows = 3, autoFocus, counter }: FieldBase & { value: string; onChange: (v: string) => void; max?: number; placeholder?: string; rows?: number; autoFocus?: boolean; counter?: boolean }) {
  const id = useId();
  return (
    <div className={`opx-field${error || invalid ? " has-error" : ""}`}>
      <FieldLabel id={id} label={label} required={required} />
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={max}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={error || invalid ? true : undefined}
        aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldFoot id={id} hint={hint} error={error} count={counter && max ? `${value.length}/${max}` : undefined} />
    </div>
  );
}

export type Opt = { value: string; label: string };

export function SelectInput({ label, value, onChange, options, hint, error, invalid }: FieldBase & { value: string; onChange: (v: string) => void; options: Opt[] }) {
  const id = useId();
  return (
    <div className={`opx-field opx-cd-select${error || invalid ? " has-error" : ""}`}>
      <label id={`${id}-l`}>{label}</label>
      <Select value={value} onChange={onChange} options={options} labelId={`${id}-l`} invalid={error || invalid ? true : undefined} />
      <FieldFoot id={id} hint={hint} error={error} />
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

export const toLocal = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fromLocal = (v: string): string => (v ? new Date(v).toISOString() : "");

export function inHours(h: number): string {
  const d = new Date(Date.now() + h * 3_600_000);
  d.setMinutes(0, 0, 0);
  return toLocal(d.toISOString());
}

export function DateTimeInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="opx-field opx-cd-dt">
      <span className="opx-field__cap">{label}</span>
      <CrmDateTime value={value} onChange={onChange} label={label} />
      <FieldFoot id={id} hint={hint} />
    </div>
  );
}

export function Seg<T extends string>({ label, value, options, onChange, size }: { label: string; value: T; options: { value: T; label: ReactNode; icon?: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void; size?: "sm" }) {
  return (
    <div className={`opx-cd-seg${size ? ` opx-cd-seg--${size}` : ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Check({ checked, onChange, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <CheckBox checked={checked} onChange={onChange} disabled={disabled}>
      {children}
    </CheckBox>
  );
}

export function SheetHead({ icon, title, sub }: { icon: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="opx-cd-shead">
      <span className="opx-cd-shead__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="opx-cd-shead__t">
        <b>{title}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
    </div>
  );
}

export function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

export const telOf = (phone: string): string => {
  const d = phone.replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : "";
};

export const contactHref = (c: CrmContact): string =>
  c.type === "phone" ? `tel:${c.value.replace(/\s+/g, "")}` : c.type === "email" ? `mailto:${c.value}` : c.type === "telegram" ? `https://t.me/${c.value.replace(/^@/, "")}` : "";

export function ContactGlyph({ type, size = 15 }: { type: string; size?: number }) {
  if (type === "phone") return <IcPhone size={size} />;
  if (type === "email") return <IcMail size={size} />;
  return <IcSend size={size} />;
}
