"use client";

import "./pickfield.css";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";

type Props = {
  kind?: "date" | "time";
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  min?: string;
  max?: string;
  // Seconds between offered times (as the old native field took it).
  step?: number;
  invalid?: boolean;
  big?: boolean;
};

const STEPS = [5, 10, 15, 30] as const;
const minutesOf = (step?: number): (typeof STEPS)[number] => {
  const m = step ? Math.round(step / 60) : 15;
  return STEPS.find((s) => s >= m) ?? 30;
};

// A date ("YYYY-MM-DD") or time ("HH:MM") field in the workspace's look,
// built on the app's handmade pickers: no native date/time control opens.
export default function PickField({ kind = "date", value, onChange, label, placeholder, min, max, step, invalid, big }: Props) {
  return (
    <span className="opx-tk-pick" data-big={big || undefined} data-empty={value ? undefined : ""} data-invalid={invalid || undefined} data-kind={kind} title={label}>
      {kind === "date" ? (
        <DatePicker value={value} onChange={onChange} placeholder={placeholder} ariaLabel={label} min={min} max={max} />
      ) : (
        <TimePicker value={value} onChange={onChange} placeholder={placeholder} ariaLabel={label} step={minutesOf(step)} />
      )}
    </span>
  );
}
