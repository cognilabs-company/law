// Public support page (TEZKOR_HIMOYA_PUBLIC_SUPPORT_FRONTEND, 2026-11-26).
// GET /public/support?lang=uz|ru|en — login-free, read-only information for
// the App Store / Google Play "Support URL". It never creates a ticket; the
// signed-in support-ticket APIs are separate and unchanged.
import { asDict, asStr } from "@/lib/http";

export type SupportLang = "uz" | "ru" | "en";

export type SupportInfo = {
  brand: string;
  language: SupportLang;
  title: string;
  intro: string;
  instructions: string;
  include: string;
  security: string;
  // Action labels the backend localizes: "Email orqali yozish", "Qo‘ng‘iroq qilish".
  emailLabel: string;
  phoneLabel: string;
  privacyLabel: string;
  deletionLabel: string;
  operatorLabel: string;
  contact: { email: string; phone: string; emailUrl: string; phoneUrl: string };
  company: { name: string; taxId: string; address: string } | null;
  links: { privacyPolicy: string; accountDeletion: string };
};

// The backend answers 422 for any other value, so the page always names one.
export function supportLang(locale: string): SupportLang {
  return locale === "ru" || locale === "en" ? locale : "uz";
}

// Relative links in the answer point at the backend, not at this site.
// Anything that is neither an http(s) URL nor a site-relative path is dropped.
export function supportLink(href: string, origin: string): string {
  const v = href.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (!v.startsWith("/") || v.startsWith("//")) return "";
  return `${origin.replace(/\/+$/, "")}${v}`;
}

const mailto = (url: string, email: string) => (/^mailto:/i.test(url) ? url : email ? `mailto:${email}` : "");
const tel = (url: string, phone: string) => (/^tel:/i.test(url) ? url : phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "");

// null when the answer is not a support document (no title and no way to
// reach anyone): the caller shows its own fallback instead.
export function normSupport(raw: unknown, lang: SupportLang, origin: string): SupportInfo | null {
  const d = asDict(raw);
  const c = asDict(d.contact);
  const co = asDict(d.company);
  const l = asDict(d.links);
  const email = asStr(c.email).trim();
  const phone = asStr(c.phone).trim();
  const title = asStr(d.title).trim();
  if (!title || (!email && !phone)) return null;
  const language = asStr(d.language);
  const company = { name: asStr(co.name).trim(), taxId: asStr(co.tax_id).trim(), address: asStr(co.address).trim() };
  return {
    brand: asStr(d.brand).trim() || "Tezkor Himoya",
    language: language === "uz" || language === "ru" || language === "en" ? language : lang,
    title,
    intro: asStr(d.intro).trim(),
    instructions: asStr(d.instructions).trim(),
    include: asStr(d.include).trim(),
    security: asStr(d.security).trim(),
    emailLabel: asStr(d.email).trim(),
    phoneLabel: asStr(d.phone).trim(),
    privacyLabel: asStr(d.privacy).trim(),
    deletionLabel: asStr(d.deletion).trim(),
    operatorLabel: asStr(d.operator).trim(),
    contact: { email, phone, emailUrl: mailto(asStr(c.email_url).trim(), email), phoneUrl: tel(asStr(c.phone_url).trim(), phone) },
    company: company.name || company.taxId || company.address ? company : null,
    links: {
      privacyPolicy: supportLink(asStr(l.privacy_policy), origin),
      accountDeletion: supportLink(asStr(l.account_deletion), origin),
    },
  };
}

// The contacts the contract names; shown on their own when the API can't be
// reached, so the store's Support URL never opens an empty page.
export const SUPPORT_EMAIL = "zyovuddnov1@gmail.com";
export const SUPPORT_PHONE = "+998909338678";

// +998909338678 → +998 90 933 86 78; anything else as given.
export function formatSupportPhone(phone: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone.replace(/[\s()-]/g, ""));
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

type Translate = (key: string) => string;

// The page's own text (messages: supportPage.fallback) in the shape the API
// returns, for when the API is down. Links go to this site's own pages.
export function fallbackSupport(t: Translate, lang: SupportLang): SupportInfo {
  return {
    brand: "Tezkor Himoya",
    language: lang,
    title: t("fallback.title"),
    intro: t("fallback.intro"),
    instructions: t("fallback.instructions"),
    include: t("fallback.include"),
    security: t("fallback.security"),
    emailLabel: t("email"),
    phoneLabel: t("phone"),
    privacyLabel: t("privacy"),
    deletionLabel: t("deletion"),
    operatorLabel: t("operator"),
    contact: { email: SUPPORT_EMAIL, phone: SUPPORT_PHONE, emailUrl: `mailto:${SUPPORT_EMAIL}`, phoneUrl: `tel:${SUPPORT_PHONE}` },
    company: null,
    links: { privacyPolicy: `/${lang}/legal/privacy`, accountDeletion: `/${lang}/legal/account-deletion` },
  };
}
