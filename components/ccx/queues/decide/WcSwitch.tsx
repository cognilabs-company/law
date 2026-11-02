"use client";

import "./WcDecide.css";
import { useId, type ReactNode } from "react";

export default function WcSwitch({ label, text, checked, onChange, disabled, icon }: { label: string; text?: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; icon?: ReactNode }) {
  const id = useId();
  return (
    <label className={`opx-wsw${checked ? " is-on" : ""}${disabled ? " is-off" : ""}`}>
      {icon ? (
        <span className="opx-wsw__ic" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="opx-wsw__txt">
        <b>{label}</b>
        {text ? <small id={`${id}-d`}>{text}</small> : null}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-describedby={text ? `${id}-d` : undefined} onChange={(e) => onChange(e.target.checked)} />
      <i className="opx-wsw__tg" aria-hidden="true" />
    </label>
  );
}
