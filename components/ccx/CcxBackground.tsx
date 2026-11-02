"use client";

import type { CcxBackground as Bg, CcxTheme } from "@/lib/ccx/prefs";

export default function CcxBackground({ theme, bg }: { theme: CcxTheme; bg: Bg }) {
  const src = theme === "dark" ? "/img/ccx/bg-night.webp" : "/img/ccx/bg-day.webp";
  return (
    <div className="opx-bg" data-bg={bg} aria-hidden="true">
      <div className="opx-bg__base" />
      {bg === "plain" ? null : <div className="opx-bg__img" style={{ backgroundImage: `url(${src})` }} />}
      <div className="opx-bg__glow opx-bg__glow--a" />
      <div className="opx-bg__glow opx-bg__glow--b" />
      <div className="opx-bg__grain" />
      <div className="opx-bg__veil" />
    </div>
  );
}
