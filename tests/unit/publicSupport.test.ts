import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fallbackSupport, formatSupportPhone, normSupport, supportLang, supportLink, SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/support";
import { fetchPublicSupport } from "@/lib/supportServer";

// TEZKOR_HIMOYA_PUBLIC_SUPPORT_FRONTEND (2026-11-26): GET /public/support?lang=.
const ORIGIN = "https://lexgo.api.cognilabs.org";
const EN = {
  brand: "Tezkor Himoya",
  language: "en",
  available_languages: ["uz", "ru", "en"],
  title: "Support center",
  intro: "Get help with the Tezkor Himoya application.",
  instructions: "For account access, services, payments or technical issues, email or call us.",
  include: "Describe the issue, when it occurred, your device and application version.",
  security: "Do not send passwords, SMS/Telegram verification codes, card PINs or full card details.",
  email: "Email support",
  phone: "Call support",
  privacy: "Privacy policy",
  deletion: "Account deletion",
  operator: "Platform operator",
  contact: { email: "zyovuddnov1@gmail.com", phone: "+998909338678", email_url: "mailto:zyovuddnov1@gmail.com", phone_url: "tel:+998909338678" },
  company: { name: "LEXGO-TECH MChJ", tax_id: "313406672", address: "Samarqand viloyati, Ishtixon tumani" },
  links: { support: "/support?lang=en", privacy_policy: "/legal/privacy-policy?lang=en", account_deletion: "/legal/account-deletion?lang=en" },
};

describe("the language asked for", () => {
  it("is always one of uz, ru, en — Uzbek by default (anything else is a 422)", () => {
    expect(supportLang("ru")).toBe("ru");
    expect(supportLang("en")).toBe("en");
    expect(supportLang("uz")).toBe("uz");
    expect(supportLang("de")).toBe("uz");
    expect(supportLang("")).toBe("uz");
  });
});

describe("the support answer", () => {
  it("keeps the localized text, the action labels and the clickable contact URLs", () => {
    const s = normSupport(EN, "en", ORIGIN)!;
    expect(s.title).toBe("Support center");
    expect(s.intro).toBe(EN.intro);
    expect(s.security).toBe(EN.security);
    expect(s.emailLabel).toBe("Email support");
    expect(s.phoneLabel).toBe("Call support");
    expect(s.contact).toEqual({ email: "zyovuddnov1@gmail.com", phone: "+998909338678", emailUrl: "mailto:zyovuddnov1@gmail.com", phoneUrl: "tel:+998909338678" });
    expect(s.company).toEqual({ name: "LEXGO-TECH MChJ", taxId: "313406672", address: "Samarqand viloyati, Ishtixon tumani" });
    expect(s.language).toBe("en");
  });

  it("resolves relative links against the backend origin, not this site", () => {
    const s = normSupport(EN, "en", ORIGIN)!;
    expect(s.links.privacyPolicy).toBe("https://lexgo.api.cognilabs.org/legal/privacy-policy?lang=en");
    expect(s.links.accountDeletion).toBe("https://lexgo.api.cognilabs.org/legal/account-deletion?lang=en");
    expect(supportLink("/x", `${ORIGIN}/`)).toBe(`${ORIGIN}/x`);
    expect(supportLink("https://example.org/p", ORIGIN)).toBe("https://example.org/p");
  });

  it("drops links and contact URLs that are not web, mail or phone links", () => {
    expect(supportLink("javascript:alert(1)", ORIGIN)).toBe("");
    expect(supportLink("//evil.example/x", ORIGIN)).toBe("");
    const s = normSupport({ ...EN, contact: { ...EN.contact, email_url: "javascript:alert(1)", phone_url: "" } }, "en", ORIGIN)!;
    expect(s.contact.emailUrl).toBe("mailto:zyovuddnov1@gmail.com");
    expect(s.contact.phoneUrl).toBe("tel:+998909338678");
  });

  it("is not a support document without a title or any contact", () => {
    expect(normSupport({}, "uz", ORIGIN)).toBeNull();
    expect(normSupport({ ...EN, contact: {} }, "uz", ORIGIN)).toBeNull();
    expect(normSupport({ ...EN, title: "" }, "uz", ORIGIN)).toBeNull();
  });

  it("has no operator block when the company is missing", () => {
    expect(normSupport({ ...EN, company: null }, "en", ORIGIN)!.company).toBeNull();
  });
});

describe("the built-in copy for when the API is down", () => {
  it("still gives the contract's email and phone, and this site's own legal pages", () => {
    const f = fallbackSupport((k) => `[${k}]`, "ru");
    expect(f.contact.emailUrl).toBe(`mailto:${SUPPORT_EMAIL}`);
    expect(f.contact.phoneUrl).toBe(`tel:${SUPPORT_PHONE}`);
    expect(f.links).toEqual({ privacyPolicy: "/ru/legal/privacy", accountDeletion: "/ru/legal/account-deletion" });
    expect(f.title).toBe("[fallback.title]");
  });

  it("is in all three languages and promises no hours or reply time", () => {
    for (const lang of ["uz", "ru", "en"]) {
      const m = JSON.parse(readFileSync(join(process.cwd(), "messages", `${lang}.json`), "utf8"));
      const page = m.supportPage;
      for (const k of ["metaTitle", "contactsTitle", "email", "phone", "includeTitle", "operator", "taxId", "address", "docsTitle", "privacy", "deletion"]) expect(page[k], `${lang}.${k}`).toBeTruthy();
      for (const k of ["title", "intro", "instructions", "include", "security"]) expect(page.fallback[k], `${lang}.fallback.${k}`).toBeTruthy();
      expect(m.footer.links.support).toBeTruthy();
      expect(JSON.stringify(page)).not.toMatch(/24\s*\/\s*7|24 soat|24 час|24 hours|круглосуточ|kecha-kunduz|within \d|ichida javob|в течение/i);
    }
  });

  it("formats the Uzbek phone number for reading", () => {
    expect(formatSupportPhone("+998909338678")).toBe("+998 90 933 86 78");
    expect(formatSupportPhone("+1 555 0100")).toBe("+1 555 0100");
  });
});

describe("the server fetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the page's language, without a token, and is cached per language", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(EN), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const s = await fetchPublicSupport("en");
    expect(s?.title).toBe("Support center");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { next?: { revalidate?: number; tags?: string[] } }];
    expect(url).toMatch(/\/public\/support\?lang=en$/);
    expect(new Headers(init.headers).get("Authorization")).toBeNull();
    expect(init.next?.revalidate).toBe(600);
    expect(init.next?.tags).toContain("public-support-en");
  });

  it("is null when the API errors or can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 422 })));
    expect(await fetchPublicSupport("uz")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await fetchPublicSupport("uz")).toBeNull();
  });
});
