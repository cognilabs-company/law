import { describe, expect, it } from "vitest";
import { backendLink, normPublicSupport, prettyPhone } from "@/lib/publicSupport";

// TEZKOR_HIMOYA_PUBLIC_SUPPORT_FRONTEND.md: GET /public/support?lang=…
const RAW = {
  brand: "Tezkor Himoya",
  title: "Support center",
  intro: "Get help with the Tezkor Himoya application.",
  instructions: "Email or call us.",
  include: "Describe the issue.",
  security: "Do not send passwords.",
  email: "Email support",
  phone: "Call support",
  privacy: "Privacy policy",
  deletion: "Account deletion",
  operator: "Platform operator",
  contact: { email: "zyovuddnov1@gmail.com", phone: "+998909338678", email_url: "mailto:zyovuddnov1@gmail.com", phone_url: "tel:+998909338678" },
  company: { name: "LEXGO-TECH MChJ", tax_id: "313406672", address: "Samarqand viloyati" },
  links: { support: "/support?lang=en", privacy_policy: "/legal/privacy-policy?lang=en", account_deletion: "/legal/account-deletion?lang=en" },
};

describe("public support", () => {
  it("reads the contract and resolves relative links on the backend origin", () => {
    const s = normPublicSupport(RAW)!;
    expect(s.contact).toEqual({ email: "zyovuddnov1@gmail.com", phone: "+998909338678", emailUrl: "mailto:zyovuddnov1@gmail.com", phoneUrl: "tel:+998909338678" });
    expect(s.company).toEqual({ name: "LEXGO-TECH MChJ", taxId: "313406672", address: "Samarqand viloyati" });
    expect(s.links.privacy).toBe("https://lexgo.api.cognilabs.org/legal/privacy-policy?lang=en");
    expect(s.links.deletion).toBe("https://lexgo.api.cognilabs.org/legal/account-deletion?lang=en");
    expect(s.labels.operator).toBe("Platform operator");
  });

  it("never renders a non-mailto/tel action URL", () => {
    const s = normPublicSupport({ ...RAW, contact: { ...RAW.contact, email_url: "javascript:alert(1)", phone_url: "https://x" } })!;
    expect(s.contact.emailUrl).toBe("mailto:zyovuddnov1@gmail.com");
    expect(s.contact.phoneUrl).toBe("tel:+998909338678");
  });

  it("returns null without any contact", () => {
    expect(normPublicSupport({ title: "x" })).toBeNull();
    expect(normPublicSupport(null)).toBeNull();
  });

  it("formats the phone and keeps absolute links", () => {
    expect(prettyPhone("+998909338678")).toBe("+998 90 933 86 78");
    expect(backendLink("https://a.b/c")).toBe("https://a.b/c");
  });
});
