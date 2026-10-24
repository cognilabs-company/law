// Contact details in a lawyer's own description of their experience.
// The service "experience note" and the profile's "about me" / work
// achievements are public text a client reads before buying; a phone number,
// a username, an e-mail or a link there takes the deal off the platform. The
// backend has the last word (platform_contact_blocked); this finds the same
// things as they are typed, so the field can say so before saving.
//
// Ordinary experience text has plenty of digits — years ("2015–2023"),
// articles ("Oila kodeksining 39-moddasi"), counts, sums — so a run of
// digits counts as a phone number only when it is shaped like one: a
// leading "+", Uzbekistan's 998 country code, or nine digits that start with
// a mobile/landline operator code.

export type ContactKind = "phone" | "email" | "link" | "username" | "messenger";
export type ContactHit = { kind: ContactKind; text: string };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL = /\b(?:https?:\/\/|www\.)\S+/gi;
// A bare domain: name.tld with a common TLD, optionally a path.
const DOMAIN = /\b[a-z0-9][a-z0-9-]{0,62}\.(?:uz|com|ru|me|org|net|io|info|biz|co|su|kz|tj|kg|app|site|online|link|pro|ly|gg|to)\b(?:\/\S*)?/gi;
const USERNAME = /(^|[^A-Za-z0-9_.@])@([A-Za-z][A-Za-z0-9_.]{3,31})/g;
// A messenger named next to an address: "telegram: lawyer_99", "tg - aziz",
// "whatsapp +998…". The name alone ("not via Telegram") is not a contact.
const MESSENGER = /(?<![\p{L}\p{N}])(telegram\p{L}*|tg|whats\s?app\p{L}*|viber\p{L}*|imo|signal|instagram\p{L}*|insta|facebook|fb|wechat|skype|botim|телеграм\p{L}*|вайбер\p{L}*|ватсап\p{L}*|инстаграм\p{L}*)(\s*[:=]\s*|\s*[—–-]\s*|\s+)(@?[A-Za-z0-9_.+]{3,})/giu;
const DIGIT_RUN = /\+?\(?\d[\d\s().\-–]{6,}\d/g;
// Official legal sources may be cited by name; they are not anyone's contact.
const CITABLE = /^(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)*(?:lex\.uz|gov\.uz|adliya\.uz|sud\.uz|norma\.uz|parliament\.gov\.uz|president\.uz)(?:\/\S*)?$/i;
const UZ_CODES = new Set(["20", "33", "50", "55", "61", "62", "65", "66", "67", "69", "70", "71", "72", "73", "74", "75", "76", "77", "78", "79", "88", "90", "91", "93", "94", "95", "97", "98", "99"]);

function phoneLike(run: string): boolean {
  const digits = run.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return false;
  if (run.trim().startsWith("+")) return digits.length >= 10;
  if (digits.startsWith("998") && digits.length === 12) return true;
  if (digits.length === 9 && UZ_CODES.has(digits.slice(0, 2))) {
    // "90 123 45 67": spaced into phone groups, or written solid.
    return true;
  }
  // The old domestic form: 8 (90) 123 45 67.
  return digits.startsWith("8") && digits.length === 10 && UZ_CODES.has(digits.slice(1, 3));
}

export function findContacts(text: string): ContactHit[] {
  if (!text) return [];
  const hits: ContactHit[] = [];
  const seen = new Set<string>();
  const add = (kind: ContactKind, raw: string) => {
    const t = raw.trim();
    const key = `${kind}|${t.toLowerCase()}`;
    if (kind === "link" && CITABLE.test(t)) return;
    // "www.site.uz" and "site.uz", or "Telegram: @x" and "@x", are one
    // find: the longer one stays.
    const low = t.toLowerCase();
    if (hits.some((h) => h.text.toLowerCase().includes(low))) return;
    for (let i = hits.length - 1; i >= 0; i--) if (low.includes(hits[i].text.toLowerCase())) hits.splice(i, 1);
    if (t && !seen.has(key)) {
      seen.add(key);
      hits.push({ kind, text: t });
    }
  };
  let rest = text;
  for (const m of text.matchAll(EMAIL)) {
    add("email", m[0]);
    rest = rest.replace(m[0], " ");
  }
  for (const m of rest.matchAll(URL)) add("link", m[0].replace(/[.,;:!?)]+$/, ""));
  for (const m of rest.matchAll(DOMAIN)) add("link", m[0].replace(/[.,;:!?)]+$/, ""));
  for (const m of rest.matchAll(USERNAME)) add("username", `@${m[2]}`);
  for (const m of rest.matchAll(MESSENGER)) {
    // Only when what follows is an address: after "telegram:" anything is,
    // otherwise it must look like a handle (a digit, @, _ or a dot), so
    // "Telegram orqali emas" stays prose.
    const sep = m[2];
    const handle = m[3];
    if (/[:=]/.test(sep) || /[\d@_.]/.test(handle)) add("messenger", m[0]);
  }
  for (const m of rest.matchAll(DIGIT_RUN)) if (phoneLike(m[0])) add("phone", m[0]);
  return hits;
}

export const hasContactDetails = (text: string): boolean => findContacts(text).length > 0;

// The text with its contact details taken out, and what was taken. A find
// that runs to the end of the text may still be growing ("+998 90 12",
// "@aziz_y"), so while the lawyer types it stays (and the note flags it)
// until they write past it; `all` takes everything, for a paste or when
// the field is left.
export function stripContacts(text: string, all = false): { text: string; removed: ContactHit[] } {
  const hits = findContacts(text);
  if (!hits.length) return { text, removed: [] };
  const end = text.trimEnd().length;
  const removed = all ? hits : hits.filter((h) => text.lastIndexOf(h.text) + h.text.length < end);
  if (!removed.length) return { text, removed };
  let out = text;
  for (const h of removed) out = out.split(h.text).join("");
  // Close the gap the find leaves: "Tel: , yoki" reads as "Tel:, yoki".
  out = out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.;:!?])/g, "$1").replace(/^[ \t]*[,;]+[ \t]*/, "");
  return { text: all ? out.trim() : out, removed };
}
