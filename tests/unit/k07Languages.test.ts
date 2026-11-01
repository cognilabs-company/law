import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { normStudioConstructor } from "@/lib/services/studio";
import { cleanPayload } from "@/lib/studioSchema";
import { k07LayoutFor } from "@/components/admin/studio/sx/ctor/legal";
import { k07Outgoing, k07ServerErrors, k07Transform, k07Validate, k07Keys, langState, omissionOf } from "@/components/admin/studio/sx/schema/legal/model";
import fx from "../e2e/fixtures/studio-k07.json";

// LEXGO_LEGAL_DOCUMENT_LANGUAGES_FRONTEND_FINAL_2026_11_01: the Studio K07
// editor writes Uzbek (required), Russian and English (optional, but only as
// a pair of title and text) into title_i18n / body_i18n, in one request.
const UZ = { title_i18n: { uz_latn: "Maxfiylik siyosati" }, body_i18n: { uz_latn: "<p>Matn</p>" } };
const doc = (ti: Record<string, string>, bi: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  source_script: "uz_latn",
  acceptance_required: true,
  ...extra,
  title_i18n: { ...UZ.title_i18n, ...ti },
  body_i18n: { ...UZ.body_i18n, ...bi },
});
const ctor = normStudioConstructor(fx.k07);
const layout = k07LayoutFor(ctor);
const api = (data: Record<string, unknown>) => new ApiError(422, "", undefined, { data, code: String((data.detail as { code?: string })?.code ?? "") });

describe("Uzbek is required", () => {
  it("an empty Uzbek title and text block on the script being written", () => {
    expect(k07Validate({ source_script: "uz_latn" })).toEqual({ "title_i18n.uz_latn": "@code:legal_uz_title_required", "body_i18n.uz_latn": "@code:legal_uz_body_required" });
    expect(k07Validate({ source_script: "uz_cyrl", title_i18n: { uz_cyrl: "Махфийлик" } })).toEqual({ "body_i18n.uz_cyrl": "@code:legal_uz_body_required" });
  });
  it("a body of empty markup is no text", () => {
    expect(k07Validate(doc({}, { uz_latn: "<p><br></p>" }))).toEqual({ "body_i18n.uz_latn": "@code:legal_uz_body_required" });
  });
  it("Uzbek alone is a valid document", () => {
    expect(k07Validate(doc({}, {}))).toEqual({});
  });
});

describe("Russian and English come as a pair", () => {
  it("a title without its text blocks on the text, and the other way round", () => {
    expect(k07Validate(doc({ en: "Privacy Policy" }, {}))).toEqual({ "body_i18n.en": "@code:legal_en_body_required" });
    expect(k07Validate(doc({}, { ru: "<p>Текст</p>" }))).toEqual({ "title_i18n.ru": "@code:legal_ru_title_required" });
  });
  it("a language left empty, or filled whole, is fine", () => {
    expect(k07Validate(doc({ ru: "", en: "Privacy Policy" }, { ru: "<p></p>", en: "<p>Text</p>" }))).toEqual({});
  });
  it("each tab says how far it is filled", () => {
    const v = doc({ en: "Privacy Policy" }, { ru: "" });
    expect([langState(v, "uz"), langState(v, "ru"), langState(v, "en")]).toEqual(["complete", "empty", "partial"]);
  });
});

describe("a language left out is warned about", () => {
  it("an existing document loses it from the new version", () => {
    expect(omissionOf(doc({ ru: "Политика" }, { ru: "<p>Текст</p>" }, { document_id: "c1" }))).toEqual({ kind: "removed", langs: ["en"] });
  });
  it("a new document just goes out without it", () => {
    expect(omissionOf(doc({}, {}))).toEqual({ kind: "unpublished", langs: ["ru", "en"] });
  });
  it("a half-filled language is not omitted (the pair check blocks it), nor a complete one", () => {
    expect(omissionOf(doc({ ru: "Политика", en: "Privacy" }, { ru: "<p>Текст</p>" }, { document_id: "c1" }))).toBeNull();
  });
});

describe("the backend's legal errors land on their fields", () => {
  it("legal_uz_translation_required goes to the Uzbek title and text being written", () => {
    const e = api({ detail: { code: "legal_uz_translation_required", fields: ["title_i18n.uz", "body_i18n.uz"] } });
    expect(k07ServerErrors({}, e, { source_script: "uz_cyrl" })).toEqual({ "title_i18n.uz_cyrl": "@code:legal_uz_title_required", "body_i18n.uz_cyrl": "@code:legal_uz_body_required" });
    const one = api({ detail: { code: "legal_uz_translation_required", fields: ["body_i18n.uz"] } });
    expect(k07ServerErrors({}, one, doc({}, {}))).toEqual({ "body_i18n.uz_latn": "@code:legal_uz_body_required" });
  });
  it("legal_translation_pair_required goes to the part that language lacks", () => {
    const e = api({ detail: { code: "legal_translation_pair_required", languages: ["en"] } });
    expect(k07ServerErrors({}, e, doc({ en: "Privacy Policy" }, {}))).toEqual({ "body_i18n.en": "@code:legal_en_body_required" });
    expect(k07ServerErrors({}, e, doc({}, { en: "<p>Text</p>" }))).toEqual({ "title_i18n.en": "@code:legal_en_title_required" });
    const both = api({ detail: { code: "legal_translation_pair_required", languages: ["ru", "en"] } });
    expect(k07ServerErrors({}, both, doc({ ru: "Политика" }, { en: "<p>Text</p>" }))).toEqual({ "body_i18n.ru": "@code:legal_ru_body_required", "title_i18n.en": "@code:legal_en_title_required" });
  });
  it("the same codes inside a list of errors, and a field error on the canonical uz path, are read too", () => {
    const listed = { ok: false, errors: [{ field: "title_i18n.uz", code: "legal_uz_translation_required" }] };
    expect(k07ServerErrors({ "title_i18n.uz": "@code:legal_uz_translation_required" }, listed, doc({}, {}))).toEqual({ "title_i18n.uz_latn": "@code:legal_uz_title_required" });
  });
  it("other errors are left as they came, and the result never holds a raw code as text", () => {
    const e = api({ detail: { code: "studio_payload_invalid" } });
    expect(k07ServerErrors({ version: "@code:required" }, e, doc({}, {}))).toEqual({ version: "@code:required" });
    const out = k07ServerErrors({}, api({ detail: { code: "legal_translation_pair_required", languages: ["en"] } }), doc({ en: "x" }, {}));
    for (const v of Object.values(out)) expect(v).toMatch(/^@code:legal_(uz|ru|en)_(title|body)_required$/);
  });
  it("the K07 layout reads server errors through this mapping", () => {
    expect(layout.serverErrors).toBe(k07ServerErrors);
  });
});

describe("what is sent", () => {
  it("English is kept through the transform, the schema clean-up and the outgoing step, even where the schema names only uz/ru", () => {
    const filled = doc({ ru: "Политика", en: "Privacy Policy" }, { ru: "<p>Текст</p>", en: "<p>Text</p>" }, { version_bump: "minor" });
    const transform = k07Transform(k07Keys(ctor));
    const shaped = transform(filled, filled);
    const sent = layout.outgoing!(cleanPayload(ctor.typed, shaped));
    expect(sent.title_i18n).toEqual({ uz_latn: "Maxfiylik siyosati", ru: "Политика", en: "Privacy Policy" });
    expect(sent.body_i18n).toEqual({ uz_latn: "<p>Matn</p>", ru: "<p>Текст</p>", en: "<p>Text</p>" });
  });
  it("an empty language is omitted, and neither title_json/body_json nor a canonical uz copy are sent", () => {
    const sent = k07Outgoing({ ...doc({ ru: "", en: "" }, { ru: "<p><br></p>", en: "" }), title_json: { uz_latn: "x" }, body_json: { uz_latn: "y" }, title_i18n: { uz: "eski", uz_latn: "Maxfiylik siyosati", ru: "", en: "" } });
    expect(sent.title_i18n).toEqual({ uz_latn: "Maxfiylik siyosati" });
    expect(sent.body_i18n).toEqual({ uz_latn: "<p>Matn</p>" });
    expect(sent).not.toHaveProperty("title_json");
    expect(sent).not.toHaveProperty("body_json");
  });
  it("a version loaded with the canonical uz key is edited in the chosen script", () => {
    const loaded = { source_script: "uz_latn", title_i18n: { uz: "Maxfiylik siyosati", en: "Privacy Policy" }, body_i18n: { uz: "<p>Matn</p>", en: "<p>Text</p>" } };
    const out = k07Transform(k07Keys(ctor))(loaded, loaded);
    expect(out.title_i18n).toEqual({ uz_latn: "Maxfiylik siyosati", en: "Privacy Policy" });
    expect(out.body_i18n).toEqual({ uz_latn: "<p>Matn</p>", en: "<p>Text</p>" });
  });
});
