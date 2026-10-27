"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import DatePicker from "@/components/DatePicker";
import Select, { type Option } from "@/components/Select";
import TimePicker from "@/components/TimePicker";

// The site's own controls for every CRM form: the handmade Select,
// DatePicker and TimePicker — never the browser's native ones.

export function CrmSelect({ value, onChange, options, label, placeholder, search }: { value: string; onChange: (v: string) => void; options: Option[]; label: string; placeholder?: string; search?: boolean }): ReactElement {
  return (
    <span className="crm-sel">
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} placeholder={placeholder ?? label} search={search ?? options.length > 8} />
    </span>
  );
}

// A day, "YYYY-MM-DD" ("" for none).
export function CrmDate({ value, onChange, label, min, max }: { value: string; onChange: (v: string) => void; label: string; min?: string; max?: string }): ReactElement {
  const t = useTranslations("crm.fields");
  return (
    <span className="crm-date">
      <DatePicker value={value} onChange={onChange} placeholder={label} ariaLabel={label} min={min} max={max} clearLabel={t("clear")} />
    </span>
  );
}

// A local date and time, "YYYY-MM-DDTHH:MM" ("" for none), as two pickers.
export function CrmDateTime({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }): ReactElement {
  const t = useTranslations("crm.fields");
  const [day, time] = value ? value.split("T") : ["", ""];
  const today = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const min = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  return (
    <span className="crm-dt" role="group" aria-label={label}>
      <DatePicker value={day ?? ""} onChange={(d) => onChange(d ? `${d}T${time || "09:00"}` : "")} placeholder={t("day")} ariaLabel={`${label}: ${t("day")}`} min={min} clearLabel={t("clear")} />
      <TimePicker value={time ?? ""} onChange={(tm) => day && onChange(`${day}T${tm || "09:00"}`)} placeholder="09:00" ariaLabel={`${label}: ${t("time")}`} disabled={!day} clearLabel={t("clear")} step={15} />
    </span>
  );
}
