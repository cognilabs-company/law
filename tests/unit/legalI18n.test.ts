import { afterEach, describe, expect, it, vi } from "vitest";
import { legalLang } from "@/lib/legal";
import { getLegalConsent, listLegalConsents, listMyConsentRows, normConsentDoc } from "@/lib/services/backend";
import { fetchConsentDetail, fetchCurrentConsents } from "@/lib/legalServer";

// LEXGO_PRIVACY_POLICY_I18N_FRONTEND_2026_11_01: legal documents in uz, ru
// and en, chosen with ?lang=, shown exactly as the backend wrote them.
const I18N = {
  title_i18n: { uz: "Maxfiylik siyosati", ru: "ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ", en: "Privacy Policy" },
  body_i18n: { uz: "Shaxsga doir maʼlumotlar.", ru: "Персональные данные.", en: "Personal data." },
};
// What an Uzbek-only answer looks like (an older document, or the retry).
const UZ_ONLY = { title_i18n: { uz: I18N.title_i18n.uz }, body_i18n: { uz: I18N.body_i18n.uz } };
const doc = (lang: string, extra: Record<string, unknown> = {}) => ({
  id: "c1",
  slug: "privacy",
  version: "1.0",
  title: I18N.title_i18n[lang as "uz"],
  body: I18N.body_i18n[lang as "uz"],
  language: lang,
  available_languages: ["uz", "ru", "en"],
  is_active: true,
  ...I18N,
  ...extra,
});

describe("the app locale → the legal language", () => {
  it("maps ru and en to themselves and every Uzbek form, or anything else, to uz", () => {
    expect(legalLang("ru")).toBe("ru");
    expect(legalLang("en")).toBe("en");
    expect(legalLang("en-GB")).toBe("en");
    for (const l of ["uz", "uz_latn", "uz_cyrl", "uz-Cyrl", "kk", "", null, undefined]) expect(legalLang(l)).toBe("uz");
  });
});

describe("a legal document reads in the asked language", () => {
  it("takes the plain title and body when they are in that language", () => {
    const d = normConsentDoc(doc("ru"), "ru");
    expect(d).toMatchObject({ title: "ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ", body: "Персональные данные.", language: "ru", version: "1.0", id: "c1" });
  });
  it("shows the plain fields as returned and marks them with the language they are really in", () => {
    // Final contract (eecebb9): an English request for a document with no
    // English gets the Uzbek text, language "uz", translation_fallback true.
    const d = normConsentDoc(doc("uz", { requested_language: "en", translation_fallback: true, available_languages: ["uz"], title_i18n: { uz: I18N.title_i18n.uz }, body_i18n: { uz: I18N.body_i18n.uz } }), "en");
    expect(d).toMatchObject({ title: "Maxfiylik siyosati", body: "Shaxsga doir maʼlumotlar.", language: "uz", requestedLanguage: "en", fallback: true, availableLanguages: ["uz"] });
  });
  it("an older response without plain fields reads the asked language from the maps, then Uzbek", () => {
    expect(normConsentDoc({ id: "c1", slug: "privacy", title: "", body: "", title_i18n: I18N.title_i18n, body_i18n: I18N.body_i18n }, "en")).toMatchObject({ title: "Privacy Policy", body: "Personal data.", language: "en", fallback: false });
    const d = normConsentDoc({ id: "c1", slug: "privacy", title: "", body: "", title_i18n: { uz: "Maxfiylik siyosati" }, body_i18n: { uz: "Matn." } }, "en");
    expect(d).toMatchObject({ title: "Maxfiylik siyosati", body: "Matn.", language: "uz", fallback: true });
  });
  it("still reads an older response: title_json / body_json (uz_latn), then name / content", () => {
    expect(normConsentDoc({ id: "c1", slug: "terms", title_json: { uz_latn: "Shartlar", ru: "Условия" }, body_json: { uz_cyrl: "Матн" } }, "ru")).toMatchObject({ title: "Условия", body: "Матн" });
    expect(normConsentDoc({ id: "c1", slug: "terms", name: "Shartlar", content: "Matn" }, "en")).toMatchObject({ title: "Shartlar", body: "Matn" });
  });
});

describe("every legal request names the language", () => {
  const asked: string[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    asked.length = 0;
  });
  const stub = (answer: (url: URL) => { status: number; json: unknown }) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(String(input), "http://x");
        asked.push(url.pathname + url.search);
        const a = answer(url);
        return new Response(JSON.stringify(a.json), { status: a.status, headers: { "content-type": "application/json" } });
      }),
    );

  it("list, detail and the user's own consents send ?lang=", async () => {
    stub((url) => {
      const lang = url.searchParams.get("lang") ?? "uz";
      if (url.pathname.endsWith("/me")) return { status: 200, json: [{ accepted: true, requires_reaccept: false, consent: doc(lang) }] };
      return { status: 200, json: url.pathname.endsWith("/c1") ? doc(lang) : { items: [doc(lang)] } };
    });
    expect((await listLegalConsents("ru"))[0].title).toBe("ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ");
    expect((await getLegalConsent("c1", "en")).body).toBe("Personal data.");
    expect((await listMyConsentRows("ru"))[0]).toMatchObject({ id: "c1", version: "1.0", title: "ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ" });
    expect(asked.map((a) => a.replace(/^.*\/legal\//, "/legal/"))).toEqual(["/legal/consents?lang=ru", "/legal/consents/c1?lang=en", "/legal/consents/me?lang=ru"]);
  });

  it("a 422 legal_language_not_supported asks once more for Uzbek, quietly", async () => {
    stub((url) =>
      url.searchParams.get("lang") === "uz"
        ? { status: 200, json: { items: [doc("uz", UZ_ONLY)] } }
        : { status: 422, json: { detail: { code: "legal_language_not_supported", message: "Supported legal document languages: uz, ru, en", allowed: ["uz", "ru", "en"] } } },
    );
    const docs = await listLegalConsents("en");
    expect(docs[0].title).toBe("Maxfiylik siyosati");
    expect(asked.map((a) => new URL(a, "http://x").searchParams.get("lang"))).toEqual(["en", "uz"]);
  });

  it("any other 422 is not retried", async () => {
    stub(() => ({ status: 422, json: { detail: { code: "validation_error" } } }));
    await expect(getLegalConsent("c1", "ru")).rejects.toBeTruthy();
    expect(asked).toHaveLength(1);
  });

  it("the server pages cache each language apart and retry Uzbek on a 422", async () => {
    const inits: { url: string; tags: string[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: { next?: { tags?: string[] } }) => {
        const url = new URL(String(input));
        inits.push({ url: url.pathname + url.search, tags: init?.next?.tags ?? [] });
        const lang = url.searchParams.get("lang");
        if (lang === "en" && url.pathname.endsWith("/c1")) return new Response(JSON.stringify({ detail: { code: "legal_language_not_supported" } }), { status: 422 });
        return new Response(JSON.stringify(url.pathname.endsWith("/c1") ? doc("uz", UZ_ONLY) : { items: [doc(lang ?? "uz")] }), { status: 200 });
      }),
    );
    expect((await fetchCurrentConsents("ru"))?.[0].title).toBe("ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ");
    expect((await fetchConsentDetail("c1", "en"))?.title).toBe("Maxfiylik siyosati");
    expect(inits.map((i) => i.url)).toEqual(["/legal/consents?lang=ru", "/legal/consents/c1?lang=en", "/legal/consents/c1?lang=uz"]);
    expect(inits[0].tags).toEqual(["legal-consents", "legal-consents-ru"]);
    expect(inits[2].tags).toContain("legal-consent-c1-uz");
  });
});
