"use client";

import { useLayoutEffect } from "react";
import { useLocale } from "next-intl";
import { applyTheme, readThemePref, useThemePref } from "@/lib/theme";

// Keeps <html data-theme> following the OS setting and other tabs on every
// page, including ones without a theme picker on screen.
//
// The locale layout owns <html>, so switching the language mounts a fresh
// <html> without the data-theme the head script set on the first load, and
// the page fell back to light. Putting the saved theme back before the
// browser paints keeps the user's choice across a language switch.
export default function ThemeSync() {
  const pref = useThemePref();
  const locale = useLocale();
  useLayoutEffect(() => {
    applyTheme(readThemePref());
  }, [pref, locale]);
  return null;
}
