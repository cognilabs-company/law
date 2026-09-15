"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";
import { IconMonitor, IconMoon, IconSun } from "./icons";

const OPTIONS: { pref: ThemePref; Icon: ComponentType<{ className?: string }> }[] = [
  { pref: "light", Icon: IconSun },
  { pref: "dark", Icon: IconMoon },
  { pref: "system", Icon: IconMonitor },
];

// Theme picker: light, dark, or follow the device.
// - "bar": icon pill for the public navbar (matches the language pill)
// - "square": 40px bordered button for the portal/admin header and auth pages
// - "segmented": three inline buttons, for the mobile menu sheet
export default function ThemeToggle({ variant = "bar" }: { variant?: "bar" | "square" | "segmented" }) {
  const t = useTranslations("theme");
  const pref = useThemePref();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (variant === "segmented") {
    return (
      <div className="thm-seg" role="radiogroup" aria-label={t("label")}>
        {OPTIONS.map(({ pref: p, Icon }) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={pref === p}
            className={pref === p ? "on" : ""}
            onClick={() => setThemePref(p)}
          >
            <Icon />
            {t(p)}
          </button>
        ))}
      </div>
    );
  }

  const Current = OPTIONS.find((o) => o.pref === pref)?.Icon ?? IconMonitor;
  return (
    <div className={`thm thm--${variant}`} ref={ref}>
      <button
        type="button"
        className={variant === "bar" ? "btn btn--glass btn--sm thm__btn" : "thm__btn thm__sq"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("label")}: ${t(pref)}`}
        title={t("label")}
        onClick={() => setOpen((v) => !v)}
      >
        <Current />
      </button>
      {open ? (
        <ul className="lang__menu thm__menu" role="menu">
          {OPTIONS.map(({ pref: p, Icon }) => (
            <li key={p} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={pref === p}
                className={pref === p ? "on" : ""}
                onClick={() => {
                  setThemePref(p);
                  setOpen(false);
                }}
              >
                <Icon />
                {t(p)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
