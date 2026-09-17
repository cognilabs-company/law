"use client";

import { useRef } from "react";
import { initials } from "@/lib/lawyers";
import { IconUpload } from "../icons";

export default function PhotoUpload({
  value,
  name,
  onChange,
  label,
  hint,
  capture,
}: {
  value?: string;
  name: string;
  onChange: (dataUrl: string) => void;
  label: string;
  hint: string;
  capture?: "user" | "environment"; // phone camera mode (selfie / document scan)
}) {
  const ref = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="phup">
      <button
        type="button"
        className="phup__av"
        onClick={() => ref.current?.click()}
        aria-label={label}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" />
        ) : (
          <span>{name ? initials(name) : <IconUpload />}</span>
        )}
      </button>
      <div className="phup__m">
        <button type="button" className="btn btn--soft btn--sm" onClick={() => ref.current?.click()}>
          <IconUpload />
          {label}
        </button>
        <span>{hint}</span>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture={capture}
        hidden
        onChange={pick}
      />
    </div>
  );
}
