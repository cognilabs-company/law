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
  readOnly,
}: {
  value?: string;
  name: string;
  onChange: (dataUrl: string) => void;
  label: string;
  hint: string;
  capture?: "user" | "environment"; // phone camera mode (selfie / document scan)
  readOnly?: boolean; // avatar only, no buttons
}) {
  const ref = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      // Downscale to 512 px (JPEG) — the image is stored as a data URL.
      const img = new Image();
      img.onload = () => {
        const max = 512;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        if (k === 1 && src.length < 200000) { onChange(src); return; }
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        onChange(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => onChange(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  if (readOnly) {
    return (
      <div className="phup">
        <span className="phup__av">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" />
          ) : (
            <span>{name ? initials(name) : <IconUpload />}</span>
          )}
        </span>
      </div>
    );
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
