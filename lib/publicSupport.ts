// Server components only. The backend's public, login-free support info
// (TEZKOR_HIMOYA_PUBLIC_SUPPORT_FRONTEND.md): GET /public/support?lang=uz|ru|en.
// It informs; it does not open a support ticket.

const BACKEND = process.env.BACKEND_ORIGIN || "https://lexgo.api.cognilabs.org";

export type SupportLang = "uz" | "ru" | "en";

export type PublicSupport = {
  title: string;
  intro: string;
  instructions: string;
  include: string;
  security: string;
  labels: { email: string; phone: string; privacy: string; deletion: string; operator: string };
  contact: { email: string; phone: string; emailUrl: string; phoneUrl: string };
  company: { name: string; taxId: string; address: string };
  links: { privacy: string; deletion: string };
};

// Used when the API is unreachable, so the store's Support URL never shows an
// error: the contacts the MD names.
export const SUPPORT_EMAIL = "zyovuddnov1@gmail.com";
export const SUPPORT_PHONE = "+998909338678";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const dict = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

// Relative links use the backend origin, not the frontend's (MD).
export function backendLink(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${BACKEND}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Only mailto:/tel: actions; anything else falls back to one built from the value.
const safeHref = (url: string, scheme: "mailto:" | "tel:", value: string): string =>
  url.toLowerCase().startsWith(scheme) ? url : value ? `${scheme}${scheme === "tel:" ? value.replace(/[^+\d]/g, "") : value}` : "";

export function normPublicSupport(raw: unknown): PublicSupport | null {
  const d = dict(raw);
  const c = dict(d.contact);
  const co = dict(d.company);
  const l = dict(d.links);
  const email = str(c.email);
  const phone = str(c.phone);
  if (!email && !phone) return null;
  return {
    title: str(d.title),
    intro: str(d.intro),
    instructions: str(d.instructions),
    include: str(d.include),
    security: str(d.security),
    labels: { email: str(d.email), phone: str(d.phone), privacy: str(d.privacy), deletion: str(d.deletion), operator: str(d.operator) },
    contact: { email, phone, emailUrl: safeHref(str(c.email_url), "mailto:", email), phoneUrl: safeHref(str(c.phone_url), "tel:", phone) },
    company: { name: str(co.name), taxId: str(co.tax_id), address: str(co.address) },
    links: { privacy: backendLink(str(l.privacy_policy)), deletion: backendLink(str(l.account_deletion)) },
  };
}

// Cached 10 minutes per language; null when the API fails (an unsupported
// locale is a 422, so the caller passes uz, ru or en explicitly).
export async function getPublicSupport(lang: SupportLang): Promise<PublicSupport | null> {
  try {
    const res = await fetch(`${BACKEND}/public/support?lang=${lang}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 600, tags: ["public-support", `public-support-${lang}`] },
    });
    return res.ok ? normPublicSupport(await res.json()) : null;
  } catch {
    return null;
  }
}

// "+998909338678" → "+998 90 933 86 78"; other shapes are shown as given.
export function prettyPhone(p: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(p.replace(/[^+\d]/g, ""));
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}
