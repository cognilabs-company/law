"use client";

import "./pickfield.css";
import type { KeyboardEvent } from "react";
import { useLocale } from "next-intl";
import { fmtDate } from "@/lib/date";
import { IcClock } from "../icons";
import { IcCalendar } from "./icons";

type Props = {
  kind?: "date" | "time";
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  min?: string;
  max?: string;
  step?: number;
  invalid?: boolean;
  big?: boolean;
};

const open = (el: HTMLInputElement) => {
  try {
    el.showPicker();
  } catch {}
};

export default function PickField({ kind = "date", value, onChange, label, placeholder, min, max, step, invalid, big }: Props) {
  const locale = useLocale();
  const shown = value ? (kind === "date" ? fmtDate(value, locale) : value) : placeholder;
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    open(e.currentTarget);
  };
  return (
    <span className="opx-tk-pick" data-big={big || undefined} data-empty={value ? undefined : ""} data-invalid={invalid || undefined}>
      {kind === "date" ? <IcCalendar size={big ? 17 : 15} /> : <IcClock size={big ? 17 : 15} />}
      <span className="opx-tk-pick__v opx-num" aria-hidden="true">
        {shown}
      </span>
      <input
        type={kind}
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        title={label}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => open(e.currentTarget)}
        onKeyDown={onKey}
      />
    </span>
  );
}
