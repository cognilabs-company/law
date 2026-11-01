import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";
import { createConsentDoc, createConsentVersion, findLegalDoc, getLegalConsentBySlug, listAdminConsentDocs, normConsentDoc, normConsentDocs } from "@/lib/services/backend";
import { draftOf, emptyDraft, firstErrorLang, i18nPayload, langState, missingLangs, serverDraftErrors, validateDraft, type LegalDraft } from "@/lib/legalAdmin";

// LEXGO_LEGAL_DOCUMENT_LANGUAGES_FRONTEND_FINAL_2026_11_01 (backend eecebb9).
const PRIVACY_EN = {
  id: "p1", slug: "privacy", version: "1.0", title: "Privacy Policy", body: "PRIVACY POLICY\nPersonal Data Processing Policy …",
  language: "en", requested_language: "en", translation_fallback: false, available_languages: ["uz", "ru", "en"],
  title_i18n: { uz: "Maxfiylik siyosati", ru: "ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ", en: "Privacy Policy" },
  body_i18n: { uz: "…", ru: "…", en: "PRIVACY POLICY\nPersonal Data Processing Policy …" },
};
const OFFER_EN = {
  id: "o1", slug: "user_offer", aliases: ["terms"], version: "1.0", title: "Foydalanuvchi ofertasi", body: "…Uzbek content…",
  language: "uz", requested_language: "en", translation_fallback: true, available_languages: ["uz", "ru"],
  title_i18n: { uz: "Foydalanuvchi ofertasi", ru: "Пользовательская оферта" }, body_i18n: { uz: "…Uzbek content…", ru: "…" },
};

describe("the language a document is really in", () => {
  it("a full English document is English, with no fallback", () => {
    expect(normConsentDoc(PRIVACY_EN, "en")).toMatchObject({ title: "Privacy Policy", language: "en", requestedLanguage: "en", fallback: false, availableLanguages: ["uz", "ru", "en"] });
  });
  it("an honest Uzbek fallback is marked Uzbek, never English, and missing keys are not an error", () => {
    const d = normConsentDoc(OFFER_EN, "en");
    expect(d).toMatchObject({ title: "Foydalanuvchi ofertasi", body: "…Uzbek content…", language: "uz", requestedLanguage: "en", fallback: true, availableLanguages: ["uz", "ru"] });
    expect(d.titleI18n.en).toBeUndefined();
  });
  it("finds a document by its canonical slug or a footer alias", () => {
    const docs = normConsentDocs({ items: [PRIVACY_EN, OFFER_EN, { id: "r1", slug: "platform_rules", aliases: ["disclaimer", "legal_disclaimer"], title: "Platforma qoidalari", language: "uz" }] }, "en");
    expect(findLegalDoc(docs, "terms")?.slug).toBe("user_offer");
    expect(findLegalDoc(docs, "disclaimer")?.slug).toBe("platform_rules");
    expect(findLegalDoc(docs, "legal_disclaimer")?.slug).toBe("platform_rules");
    expect(findLegalDoc(docs, "privacy")?.id).toBe("p1");
    expect(findLegalDoc(docs, "nope")).toBeUndefined();
  });
});

describe("requests", () => {
  const sent: { url: string; method: string; body: Record<string, unknown> }[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    sent.length = 0;
  });
  const stub = (answer: unknown, status = 200) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        sent.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : {} });
        return new Response(JSON.stringify(answer), { status, headers: { "content-type": "application/json" } });
      }),
    );
  it("a footer alias is read through by-slug, in the page's language", async () => {
    stub(OFFER_EN);
    const d = await getLegalConsentBySlug("terms", "en");
    expect(sent[0].url).toMatch(/\/legal\/consents\/by-slug\/terms\?lang=en$/);
    expect(d).toMatchObject({ slug: "user_offer", aliases: ["terms"], language: "uz", fallback: true });
  });
  it("the admin list asks for the admin's language", async () => {
    stub({ items: [PRIVACY_EN] });
    await listAdminConsentDocs("ru");
    expect(sent[0].url).toMatch(/\/admin\/legal\/consents\?lang=ru$/);
  });
  it("a new document is one POST with title_i18n / body_i18n and no title_json / body_json", async () => {
    stub(PRIVACY_EN);
    await createConsentDoc({ slug: "privacy", version: "2.0", title_i18n: { uz: "T", en: "T" }, body_i18n: { uz: "B", en: "B" }, active: true, major: true });
    expect(sent[0]).toMatchObject({ method: "POST", body: { slug: "privacy", version: "2.0", title_i18n: { uz: "T", en: "T" }, body_i18n: { uz: "B", en: "B" }, requires_reaccept: true, is_active: true } });
    expect(sent[0].url).toMatch(/\/admin\/legal\/consents$/);
    expect(Object.keys(sent[0].body)).not.toContain("title_json");
    expect(Object.keys(sent[0].body)).not.toContain("body_json");
  });
  it("a new version is a PATCH on the document with version_bump", async () => {
    stub(PRIVACY_EN);
    await createConsentVersion("p1", { title_i18n: { uz: "T" }, body_i18n: { uz: "B" }, major: false, active: true });
    expect(sent[0]).toMatchObject({ method: "PATCH", body: { version_bump: "minor", title_i18n: { uz: "T" }, body_i18n: { uz: "B" }, requires_reaccept: false } });
    expect(sent[0].url).toMatch(/\/admin\/legal\/consents\/p1$/);
  });
});

describe("the admin editor's language rules", () => {
  const draft = (d: Partial<Record<"uz" | "ru" | "en", { title?: string; body?: string }>>): LegalDraft => {
    const out = emptyDraft();
    for (const [l, v] of Object.entries(d)) out[l as "uz"] = { title: v?.title ?? "", body: v?.body ?? "" };
    return out;
  };
  it("Uzbek title and body are required", () => {
    expect(validateDraft(draft({}))).toEqual({ "uz.title": "required", "uz.body": "required" });
    expect(validateDraft(draft({ uz: { title: "T", body: "B" } }))).toEqual({});
  });
  it("a started Russian or English needs both parts; an empty one is fine", () => {
    expect(validateDraft(draft({ uz: { title: "T", body: "B" }, en: { title: "Title" } }))).toEqual({ "en.body": "pair" });
    expect(validateDraft(draft({ uz: { title: "T", body: "B" }, ru: { body: "Текст" } }))).toEqual({ "ru.title": "pair" });
    expect(langState(draft({ ru: { title: " " } }), "ru")).toBe("empty");
  });
  it("sends every complete translation and leaves out the rest", () => {
    expect(i18nPayload(draft({ uz: { title: "T", body: "B" }, ru: { title: "Т", body: "Б" }, en: { title: "only title" } }))).toEqual({ title_i18n: { uz: "T", ru: "Т" }, body_i18n: { uz: "B", ru: "Б" } });
  });
  it("loads from title_i18n / body_i18n; an older version's plain text is its Uzbek", () => {
    expect(draftOf(normConsentDoc(PRIVACY_EN, "en")).ru.title).toBe("ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ");
    expect(draftOf(normConsentDoc({ id: "x", slug: "cookie", title: "Cookie siyosati", body: "Matn" }, "uz")).uz).toEqual({ title: "Cookie siyosati", body: "Matn" });
  });
  it("warns about each optional language the new version will lack, and which ones it removes", () => {
    expect(missingLangs(draft({ uz: { title: "T", body: "B" } }), ["uz", "ru", "en"])).toEqual([{ lang: "ru", had: true }, { lang: "en", had: true }]);
    expect(missingLangs(draft({ uz: { title: "T", body: "B" }, ru: { title: "Т", body: "Б" } }), ["uz"])).toEqual([{ lang: "en", had: false }]);
  });
  it("puts the backend's refusals on the right tab and field", () => {
    const uzErr = new ApiError(422, "", undefined, { code: "legal_uz_translation_required", data: { detail: { code: "legal_uz_translation_required", fields: ["title_i18n.uz", "body_i18n.uz"] } } });
    expect(serverDraftErrors(uzErr, draft({}))).toEqual({ "uz.title": "required", "uz.body": "required" });
    const pairErr = new ApiError(422, "", undefined, { code: "legal_translation_pair_required", data: { detail: { code: "legal_translation_pair_required", languages: ["en"] } } });
    const d = draft({ uz: { title: "T", body: "B" }, en: { title: "Title" } });
    const mapped = serverDraftErrors(pairErr, d);
    expect(mapped).toEqual({ "en.body": "pair" });
    expect(firstErrorLang(mapped ?? {})).toBe("en");
    expect(serverDraftErrors(new ApiError(500, "boom"), d)).toBeNull();
  });
});
