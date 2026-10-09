import type { ReactNode } from "react";

export default function InternalField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="internal-field">
      <span className="internal-field__label">{label}</span>
      {children}
      {hint ? <small className="internal-field__hint">{hint}</small> : null}
    </label>
  );
}
