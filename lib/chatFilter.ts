// Client-side contact masking for secure chat. The backend already filters
// blocked content, but we additionally hide usernames / social handles / phone
// numbers / links at display time so people can't swap off-platform contacts.

const SOCIAL = /\b(?:t\.me|telegram\.me|instagram\.com|wa\.me|whatsapp\.com|facebook\.com|fb\.com|vk\.com)\/\S+/gi;
const URL = /\bhttps?:\/\/\S+/gi;
const USERNAME = /(^|[\s(])@[A-Za-z0-9_.]{2,}/g;
const PHONE = /(?:\+?\d[\s\-().]?){9,}\d/g;

const MASK = "•••";

// Zoom meeting links are allowed (calls happen through them).
const ALLOWED = /zoom\.us|zoom\.com/i;

export const CALL_LINK_RE = /(https?:\/\/(?:[a-z0-9-]+\.)?zoom\.(?:us|com)\/\S+|\/secure-chats\/\S+\/join)/i;

export function maskContacts(input: string): string {
  if (!input) return input;
  return input
    .replace(SOCIAL, (m) => (ALLOWED.test(m) ? m : MASK))
    .replace(URL, (m) => (ALLOWED.test(m) ? m : MASK))
    .replace(USERNAME, (m) => m.replace(/@[A-Za-z0-9_.]{2,}/, MASK))
    .replace(PHONE, MASK);
}

// True if masking changed anything (a contact was hidden).
export function hasContact(input: string): boolean {
  return !!input && maskContacts(input) !== input;
}
