// Contact details never travel between a client and a lawyer. Every
// request that carries text from one to the other (chat messages and their
// captions, purchase and order notes, negotiation messages, checklist
// comments, results, extra-payment reasons, ratings, urgent and document
// requests) is checked here before it leaves the browser; one phone number,
// e-mail, link or messenger handle stops it with the same
// platform_contact_blocked error the backend gives, so every form shows it
// the way the chat already does. The inputs strip them as they are typed;
// this is the last line for any input that does not. Meeting links the
// chat itself allows (Zoom, LexGo call joins) pass here too.

import { type ContactKind } from "./contactGuard";
import { chatContacts } from "./chatFilter";
import { currentLocale } from "./apiMessage";

const PEER_TEXT: readonly RegExp[] = [
  /^\/secure-chats\/[^/]+\/messages(\/upload)?$/,
  /^\/marketplace\/lawyers\/[^/]+\/services\/[^/]+\/purchase-request$/,
  /^\/marketplace\/service-packages\/[^/]+\/lawyers\/[^/]+\/purchase-request$/,
  /^\/orders$/,
  /^\/orders\/[^/]+\/(status|decline)$/,
  /^\/marketplace\/(orders|me\/orders)\/[^/]+\/(negotiations?|checklist|complete|additional-payment-request|rating|cancellation-review|cancellation-request|second-opinion)(\/.*)?$/,
  /^\/marketplace\/negotiations\/[^/]+(\/.*)?$/,
  /^\/urgent-advokat\/requests(\/[^/]+)?$/,
  /^\/document-requests\/[^/]+\/(lawyer-review|messages|comments)$/,
  /^\/document-services\/review-existing\/request$/,
  /^\/second-opinion(s)?(\/.*)?$/,
];

// Fields that hold machine values, not the writer's words.
const MACHINE_KEY = /(^|_)(id|ids|url|urls|code|key|status|type|kind|channel|provider|currency|speed|urgency|mode|stage|source|locale|lang|language|mime_type|file_name|filename|title|at|date)$/i;
const UUIDISH = /^[0-9a-f-]{20,}$/i;

function texts(v: unknown, key = "", out: string[] = []): string[] {
  if (typeof v === "string") {
    if (!MACHINE_KEY.test(key) && !UUIDISH.test(v.trim())) out.push(v);
  } else if (Array.isArray(v)) v.forEach((x) => texts(x, key, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) texts(x, k, out);
  return out;
}

const MESSAGE: Record<string, string> = {
  uz: "Aloqa ma'lumotlarini (telefon, e-pochta, havola, Telegram) yuborib bo'lmaydi — aloqa faqat LexGo ichida bo'ladi.",
  ru: "Контактные данные (телефон, почта, ссылки, Telegram) отправлять нельзя — общение только внутри LexGo.",
  en: "Contact details (phone, email, links, Telegram) can't be sent — all contact stays inside LexGo.",
};

export type ContactBlock = { message: string; kinds: ContactKind[] };

// The block for this request, or null when it may go.
export function contactBlockOf(path: string, init?: RequestInit): ContactBlock | null {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "DELETE") return null;
  const bare = path.replace(/^https?:\/\/[^/]+/i, "").replace(/\?.*$/, "");
  if (!PEER_TEXT.some((re) => re.test(bare))) return null;
  const body = init?.body;
  let values: string[] = [];
  if (typeof body === "string") {
    try {
      values = texts(JSON.parse(body));
    } catch {
      values = [body];
    }
  } else if (typeof FormData !== "undefined" && body instanceof FormData) {
    body.forEach((v, k) => {
      if (typeof v === "string" && !MACHINE_KEY.test(k)) values.push(v);
    });
  }
  const kinds = [...new Set(values.flatMap((v) => chatContacts(v).map((h) => h.kind)))];
  return kinds.length ? { message: MESSAGE[currentLocale()] ?? MESSAGE.uz, kinds } : null;
}
