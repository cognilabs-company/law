"use client";

import { useThemePref } from "@/lib/theme";

// Keeps <html data-theme> following the OS setting and other tabs on every
// page, including ones without a theme picker on screen.
export default function ThemeSync() {
  useThemePref();
  return null;
}
