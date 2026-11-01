"use client";

import type { ReactNode } from "react";
import { openConsentSettings } from "@/lib/consent";
import "./cookieConsent.css";

// Opens the cookie settings dialog (components/legal/CookieConsent.tsx) from
// anywhere: the footer, a map waiting for consent.
export default function CookieSettingsButton({ children, className, aiId }: { children: ReactNode; className?: string; aiId?: string }) {
  return (
    <button type="button" className={className} onClick={openConsentSettings} data-ai-id={aiId}>
      {children}
    </button>
  );
}
