"use client";

import { useSyncExternalStore } from "react";
import {
  consentSettingsOpen,
  readConsent,
  subscribeConsent,
  subscribeConsentSettings,
  type ConsentCategory,
  type ConsentRecord,
} from "./consent";

const unknown = () => undefined;

// The stored choice; undefined while the page is rendered on the server or
// hydrating (the browser's storage is not known yet), null when the visitor
// has not chosen.
export function useConsentRecord(): ConsentRecord | null | undefined {
  return useSyncExternalStore<ConsentRecord | null | undefined>(subscribeConsent, readConsent, unknown);
}

// Whether one category is on; undefined until the browser's choice is known.
export function useConsent(category: ConsentCategory): boolean | undefined {
  const rec = useConsentRecord();
  return rec === undefined ? undefined : rec?.choices[category] === true;
}

export function useConsentSettingsOpen(): boolean {
  return useSyncExternalStore(subscribeConsentSettings, consentSettingsOpen, () => false);
}
