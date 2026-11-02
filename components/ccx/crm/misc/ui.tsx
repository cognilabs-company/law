"use client";

import "../../panel/panel.css";
import "./misc.css";
import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { minutesUntil } from "@/lib/crm/useCrm";
import { toast } from "@/lib/toast";
import { IcInbox, IcRefresh } from "../../icons";
import { IcAlert } from "./icons";

export type Tone = "ok" | "warn" | "hot" | "info" | "mute";

export function copyText(text: string, done: string): void {
  void navigator.clipboard?.writeText(text).then(
    () => toast(done, { tone: "ok" }),
    () => undefined,
  );
}

export function Card({ icon, title, count, aside, children, className }: { icon?: ReactNode; title: ReactNode; count?: number; aside?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section className={`opx-cm-card${className ? ` ${className}` : ""}`} aria-labelledby={id}>
      <header className="opx-cm-card__head">
        {icon ? (
          <span className="opx-cm-card__ic" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <h3 id={id}>{title}</h3>
        {count != null ? <b className="opx-cm-count opx-num">{count}</b> : null}
        {aside ? <div className="opx-cm-card__aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="opx-cm-kpis">{children}</div>;
}

export function Kpi({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; tone?: Tone }) {
  return (
    <div className="opx-cm-kpi" data-tone={tone}>
      <span className="opx-cm-kpi__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="opx-cm-kpi__txt">
        <small>{label}</small>
        <b className="opx-num">{value}</b>
        {sub ? <em>{sub}</em> : null}
      </span>
    </div>
  );
}

export type SegOpt<T extends string> = { value: T; label: string };

export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: SegOpt<T>[]; onChange: (v: T) => void }) {
  return (
    <span className="opx-cm-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? "is-on" : undefined} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  const t = useTranslations("admin.ccx.now");
  return (
    <button type="button" className={`opx-cm-icon${busy ? " is-busy" : ""}`} onClick={onClick} aria-label={t("refresh")} title={t("refresh")}>
      <IcRefresh size={17} />
    </button>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="opx-cm-empty">
      <span className="opx-cm-empty__ic" aria-hidden="true">
        {icon ?? <IcInbox size={24} />}
      </span>
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

export function Failed({ title, text, retry, onRetry }: { title: string; text: string; retry: string; onRetry: () => void }) {
  return (
    <div className="opx-cm-card opx-cm-fail" role="alert">
      <Empty
        icon={<IcAlert size={24} />}
        title={title}
        text={text}
        action={
          <button type="button" className="opx-pbtn opx-pbtn--main" onClick={onRetry}>
            <IcRefresh size={16} />
            {retry}
          </button>
        }
      />
    </div>
  );
}

export function Skel({ heights }: { heights: number[] }) {
  return (
    <div className="opx-cm-skel" aria-busy="true">
      {heights.map((h, i) => (
        <i key={i} className="opx-shim" style={{ height: h }} />
      ))}
    </div>
  );
}

export function When({ at, now }: { at: string; now: number }) {
  const t = useTranslations("crm.when");
  const m = minutesUntil(at, now);
  if (m === null) return null;
  const abs = Math.abs(m);
  const span = abs < 60 ? t("min", { n: abs }) : abs < 60 * 48 ? t("h", { n: Math.round(abs / 60) }) : t("d", { n: Math.round(abs / 1440) });
  const tone: Tone = m < 0 ? "hot" : m <= 60 ? "warn" : "info";
  return (
    <span className="opx-pill opx-cm-when opx-num" data-tone={tone} title={at}>
      {m < 0 ? t("overdue", { span }) : abs < 1 ? t("now") : t("in", { span })}
    </span>
  );
}
