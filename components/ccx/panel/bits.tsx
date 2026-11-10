"use client";

import { useEffect, useId, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtAgeMin } from "@/lib/date";
import { prettyPhone } from "../now/feed";
import { CopyButton } from "../now/NowFocus";
import { History } from "./Detail";
import { IcCheck, IcDoc, IcPhone, IcTimeline, IcUser } from "../icons";

export type Tone = "hot" | "warn" | "ok";

export function PanelHead({ icon, tag, code, ageMin, tone }: { icon: ReactNode; tag: string; code: string; ageMin?: number; tone?: Tone }) {
  const locale = useLocale();
  return (
    <div className="opx-phead">
      <span className="opx-phead__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="opx-phead__tag">{tag}</span>
      <b className="opx-phead__code opx-num">{code}</b>
      {ageMin != null ? (
        <span className="opx-phead__age opx-num" data-tone={tone ?? "ok"}>
          {fmtAgeMin(ageMin, locale)}
        </span>
      ) : null}
    </div>
  );
}

export function PartyCard({ role, name, phone, lexgoId, extra, quietCall }: { role: string; name: ReactNode; phone?: string; lexgoId?: string; extra?: ReactNode; quietCall?: boolean }) {
  const t = useTranslations("admin.ccx.panel");
  const dial = (phone ?? "").replace(/[^\d+]/g, "");
  return (
    <section className="opx-party">
      <span className="opx-party__ic" aria-hidden="true">
        <IcUser size={20} />
      </span>
      <div className="opx-party__txt">
        <small>{role}</small>
        <b>{name}</b>
        {phone ? (
          <span className="opx-num">
            <IcPhone size={14} />
            {prettyPhone(phone)}
            <CopyButton value={phone} label={t("phone")} />
          </span>
        ) : null}
        {lexgoId ? (
          <span className="opx-num">
            <small>Tezkor Himoya ID</small> {lexgoId}
          </span>
        ) : null}
        {extra}
      </div>
      {dial ? (
        <a className={`opx-pbtn${quietCall ? "" : " opx-pbtn--call"}`} href={`tel:${dial}`}>
          <IcPhone size={15} />
          {t("call")}
        </a>
      ) : null}
    </section>
  );
}

export type Fact = { icon?: ReactNode; label: string; value: ReactNode };

export function FactStrip({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null;
  return (
    <dl className="opx-facts">
      {facts.map((f, i) => (
        <div key={`${f.label}-${i}`}>
          {f.icon ? (
            <span className="opx-facts__ic" aria-hidden="true">
              {f.icon}
            </span>
          ) : null}
          <span>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </span>
        </div>
      ))}
    </dl>
  );
}

export function CaseBox({ icon, label, title, children, aside }: { icon?: ReactNode; label: string; title?: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <section className="opx-case">
      <span className="opx-case__ic" aria-hidden="true">
        {icon ?? <IcDoc size={18} />}
      </span>
      <div className="opx-case__txt">
        <h3>{label}</h3>
        {title ? <b>{title}</b> : null}
        {children}
      </div>
      {aside ? <div className="opx-case__aside">{aside}</div> : null}
    </section>
  );
}

export function Section({ icon, title, count, children, className }: { icon?: ReactNode; title: string; count?: number; children: ReactNode; className?: string }) {
  return (
    <section className={`opx-psec${className ? ` ${className}` : ""}`}>
      <h3>
        {icon}
        {title}
        {count != null ? <b className="opx-num">{count}</b> : null}
      </h3>
      {children}
    </section>
  );
}

export type Step = { id: string; at: string; title: string; sub?: string; icon?: ReactNode };

export function Timeline({ steps, empty }: { steps: Step[]; empty: string }) {
  const t = useTranslations("admin.ccx.panel");
  return (
    <Section icon={<IcTimeline size={17} />} title={t("history")} count={steps.length} className="opx-psec--tl">
      {steps.length ? (
        <div className="opx-dk">
          <History steps={steps} empty={empty} />
        </div>
      ) : (
        <p className="opx-pnone">{empty}</p>
      )}
    </Section>
  );
}

export type ChoiceOpt = { value: string; label: string; hint?: string; danger?: boolean; disabled?: boolean };

export function Choice({ label, options, value, onChange, error }: { label: string; options: ChoiceOpt[]; value: string; onChange: (v: string) => void; error?: string }) {
  const id = useId();
  return (
    <fieldset className={`opx-choice${error ? " has-error" : ""}`} aria-describedby={error ? `${id}-e` : undefined}>
      <legend>{label}</legend>
      <div className="opx-choice__row" role="radiogroup">
        {options.map((o) => (
          <label key={o.value} className={`opx-choice__opt${value === o.value ? " is-on" : ""}${o.danger ? " is-danger" : ""}${o.disabled ? " is-off" : ""}`} title={o.hint}>
            <input type="radio" name={id} value={o.value} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} />
            {value === o.value ? <IcCheck size={15} /> : null}
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {options.find((o) => o.value === value)?.hint ? <p className="opx-choice__hint">{options.find((o) => o.value === value)?.hint}</p> : null}
      {error ? (
        <p className="opx-ferr" id={`${id}-e`} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  required?: boolean;
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string;
  inputMode?: "text" | "numeric" | "decimal";
  readOnly?: boolean;
  rows?: number;
};

export function Field({ label, value, onChange, max, required, multiline, placeholder, hint, error, inputMode, readOnly, rows = 3 }: FieldProps) {
  const id = useId();
  const described = [hint ? `${id}-h` : "", error ? `${id}-e` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`opx-field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>
        {label}
        {required ? <i aria-hidden="true">*</i> : null}
      </label>
      {multiline ? (
        <textarea id={id} value={value} rows={rows} maxLength={max} required={required} placeholder={placeholder} readOnly={readOnly} aria-invalid={Boolean(error)} aria-describedby={described} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} value={value} maxLength={max} required={required} placeholder={placeholder} inputMode={inputMode} readOnly={readOnly} aria-invalid={Boolean(error)} aria-describedby={described} onChange={(e) => onChange(e.target.value)} />
      )}
      <span className="opx-field__meta">
        {hint ? <small id={`${id}-h`}>{hint}</small> : <small />}
        {max ? <small className="opx-num">{`${value.length}/${max}`}</small> : null}
      </span>
      {error ? (
        <p className="opx-ferr" id={`${id}-e`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "bad"; children: ReactNode }) {
  return (
    <p className="opx-pnote" data-tone={tone} role={tone === "bad" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function useCtrlEnter(run: () => void, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, on]);
}

export function PanelFoot({ onCancel, cancelLabel, primary, primaryLabel, busy, disabled, danger, extra, kbd = true }: { onCancel?: () => void; cancelLabel?: string; primary?: () => void; primaryLabel?: string; busy?: boolean; disabled?: boolean; danger?: boolean; extra?: ReactNode; kbd?: boolean }) {
  const t = useTranslations("admin.ccx.panel");
  useCtrlEnter(() => {
    if (primary && !busy && !disabled) primary();
  }, Boolean(primary) && kbd);
  return (
    <footer className="opx-pfoot">
      {onCancel ? (
        <button type="button" className="opx-pbtn" onClick={onCancel}>
          {cancelLabel ?? t("cancel")}
        </button>
      ) : null}
      {extra}
      {primary ? (
        <button type="button" className={`opx-pbtn opx-pbtn--main${danger ? " is-danger" : ""}`} onClick={primary} disabled={busy || disabled} aria-busy={busy}>
          {busy ? t("working") : primaryLabel}
        </button>
      ) : null}
    </footer>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="opx-pload" aria-busy="true" aria-label={label}>
      <i className="opx-shim" />
      <i className="opx-shim" />
      <i className="opx-shim" />
    </div>
  );
}
