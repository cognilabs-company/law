import { openModalRoot } from "@/lib/ai/dom";
import { raPathOf, raSensitivityOf } from "./registry";

// When the client's shared tab must stop showing (remote assistance v2): on
// pages the backend treats as sensitive (payment, identity, security, auth)
// and while a secret field is focused or sits in an open modal. The share is
// muted then — the operator sees "hidden for privacy" — and comes back when
// it ends.

const SENSITIVE = /(?:^|\/)(?:payments?|checkout|pay|cards?|identity|myid|oneid|kyc|security|2fa|auth|login|register|reset-password|admin|call-center|internal)(?:\/|$)/i;
const SENSITIVE_TAB = /(?:^|[?&])tab=(?:security|payments?|cards?|identity)(?:&|$)/i;

export function raSensitivePage(pathname: string, search = ""): boolean {
  return SENSITIVE.test(raPathOf(pathname)) || SENSITIVE_TAB.test(search);
}

export type RaScreenFacts = { focusedSecret: boolean; modalSecret: boolean };

export function raShareHidden(pathname: string, search: string, facts: RaScreenFacts): boolean {
  return raSensitivePage(pathname, search) || facts.focusedSecret || facts.modalSecret;
}

const SECRET_FIELD = 'input[type="password"],input[autocomplete="one-time-code"],input[autocomplete^="cc-"],input[autocomplete="new-password"],input[autocomplete="current-password"],[data-ra-sensitivity="secret"]';

function secretField(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.matches(SECRET_FIELD)) return true;
  const id = el.closest("[data-ai-id]")?.getAttribute("data-ai-id") ?? "";
  const input = el instanceof HTMLInputElement ? el : null;
  return raSensitivityOf(id, { type: input?.type, autocomplete: el.getAttribute("autocomplete") ?? undefined, marked: el.closest("[data-ra-sensitivity]")?.getAttribute("data-ra-sensitivity") ?? undefined }) === "secret" && !!(input || el.isContentEditable || el instanceof HTMLTextAreaElement);
}

export function raScreenFacts(): RaScreenFacts {
  if (typeof document === "undefined") return { focusedSecret: false, modalSecret: false };
  const modal = openModalRoot();
  return {
    focusedSecret: secretField(document.activeElement),
    modalSecret: !!modal && !!modal.querySelector(SECRET_FIELD),
  };
}
