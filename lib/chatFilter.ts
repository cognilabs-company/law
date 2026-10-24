// Client-side contact masking for secure chat. The backend already filters
// blocked content, but we additionally hide usernames / social handles / phone
// numbers / e-mails / links at display time so people can't swap off-platform
// contacts. What counts as a contact is lib/contactGuard's one detector, the
// same that guards a lawyer's public texts.

import { findContacts, type ContactHit } from "./contactGuard";

const MASK = "•••";

// Zoom meeting links are allowed (calls happen through them).
const ALLOWED = /zoom\.us|zoom\.com/i;

const MACHINE_NAME_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d{10,})$/i;

export function isMachineFileName(name: string): boolean {
  const base = String(name || "").replace(/\.[^.]+$/, "").trim();
  if (!base) return true;
  return MACHINE_NAME_RE.test(base) || /^(?:voice|file|image|photo)[-_]\d{8,}$/i.test(base);
}

export const CALL_LINK_RE = /(https?:\/\/(?:[a-z0-9-]+\.)?zoom\.(?:us|com)\/\S+|\/secure-chats\/\S+\/join)/i;

// The contacts in a chat message, call links excepted.
export function chatContacts(input: string): ContactHit[] {
  return findContacts(input).filter((h) => !(h.kind === "link" && (ALLOWED.test(h.text) || CALL_LINK_RE.test(h.text))));
}

export function maskContacts(input: string): string {
  if (!input) return input;
  let out = input;
  for (const h of chatContacts(input)) out = out.split(h.text).join(MASK);
  return out;
}

// True if masking changed anything (a contact was hidden).
export function hasContact(input: string): boolean {
  return !!input && maskContacts(input) !== input;
}
