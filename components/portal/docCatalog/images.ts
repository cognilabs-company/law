import { normalizeSearchText } from "@/lib/searchText";

// Illustrations are chosen from the NORMALIZED name — transliterated out of
// Cyrillic, apostrophes dropped (lib/searchText) — not from the raw string.
// Production sends both scripts: of the 127 distinct subcategories live today,
// about a hundred are Cyrillic ("Шартномалар", "Меҳнат низолари", "Ижро"),
// and the old Latin-only regexes matched 20 of them. Everything else fell back
// to a cycled icon, which is why most service cards had no picture.
//
// The pictures are the client dashboard's family D (image-catalog: navy +
// royal-blue duotone line drawings), shown on the dashboard's light plate
// (dash1920.css .cx-area__img), which stays light in dark mode. The glossy 3D
// renders this map used to point at (/img/fuqaro.png …) are the old design.
// public/img/doc-catalog/* come as a 520x361 plate (<name>.webp) and a 256px
// square cut (<name>-sq.webp); the legal-area drawings in public/img/category/*
// only as the wide plate, which a square slot shows whole (contain).
export type DocArt = { wide: string; square: string };
const dc = (n: string): DocArt => ({ wide: `/img/doc-catalog/${n}.webp`, square: `/img/doc-catalog/${n}-sq.webp` });
const area = (n: string): DocArt => ({ wide: `/img/category/${n}.webp`, square: `/img/category/${n}.webp` });

// "Barcha yo'nalishlar": a folder of papers and a pen — every document.
export const ALL_TEMPLATES_IMAGE: DocArt = dc("Boshqa_hujjatlar");

type ImageRule = {
  // Substrings of the normalized name; the first rule with any of them wins,
  // so ORDER IS THE SPECIFICITY. "Меҳнат шартномаси" must reach the labour
  // rule before the contracts one.
  any?: string[];
  // Whole normalized name, for a name too short to match on safely ("M&A").
  eq?: string[];
  src: DocArt;
};
function pickImage(name: string, rules: ImageRule[]): DocArt | null {
  const n = normalizeSearchText(name);
  if (!n) return null;
  for (const r of rules) {
    if (r.eq?.includes(n)) return r.src;
    if (r.any?.some((k) => n.includes(k))) return r.src;
  }
  return null;
}

// The 4 top-level general categories (LEXGO_GENERAL_DOCUMENT_CATEGORIES_FRONTEND.md).
const GENERAL_CATEGORY_IMAGES: ImageRule[] = [
  { any: ["fuqarolik"], src: dc("Fuqarolik") },
  { any: ["iqtisodiy"], src: area("Biznes_va_soliq") },
  { any: ["jinoiy", "jinoyat"], src: area("Jinoyat_ishlari") },
  { any: ["mamuriy"], src: dc("Mamuriy") },
];
export function generalCategoryImage(name: string): DocArt | null {
  return pickImage(name, GENERAL_CATEGORY_IMAGES);
}

// LEXGO_DOCUMENT_SUBCATEGORIES_FRONTEND.md: every service now carries a real
// `subcategory` string from the backend (21 in production, verified live —
// "Oila va aliment" 133, "Mehnat huquqi" 261, etc., across all 4 general
// categories, not just Fuqarolik, so this matches by name only — the same
// subcategory gets the same icon no matter which general category it's
// under) — this replaces the previous client-side title-keyword guess
// entirely. 20 of the 21 now have an illustration (public/img/); only
// "Ijara va lizing" (1 service in production) falls back to a cycled icon.
const SUBCATEGORY_IMAGES: ImageRule[] = [
  // Labour before contracts and before permits: "Меҳнат шартномаси" and
  // "Меҳнат рухсатномаси" are labour matters.
  { any: ["mehnat", "ishdan boshatish", "ish beruvchi"], src: area("Mehnat_huquqi") },
  // Inheritance and family. Before contracts, so a marriage contract stays here.
  { any: ["meros", "vasiyat"], src: area("Meros") },
  { any: ["oila", "aliment", "nikoh", "otalik", "ota ona"], src: area("Oila_huquqi") },
  // Before the credit rule, whose "bank" would otherwise swallow "Банкротлик".
  { any: ["bankrotlik"], src: dc("Bankrotlik") },
  { any: ["tergov", "ehtiyot chora"], src: dc("Tergov") },
  { any: ["prokuror", "jinoyat", "jabrlanuvchi"], src: area("Jinoyat_ishlari") },
  { any: ["transport", "logistika", "yol harakati"], src: dc("Transport_logistika") },
  { any: ["notarial", "ishonchnoma"], src: dc("Ishonchnoma") },
  // "undirish" (recovery) and "ijro" (enforcement) come before the debt rule
  // so "Судгача ундириш" lands here.
  { any: ["undirish", "ijro"], src: dc("Ijro_undirish") },
  { any: ["qarzdorlik", "talabnoma", "sudgacha tartib"], src: dc("Qarzdorlik") },
  // Administrative before the court rule: "Маъмурий судлов" is administrative.
  { any: ["mamuriy jarima", "mamuriy javobgarlik", "mamuriy huquqbuzarlik", "mamuriy sudlov"], src: dc("Mamuriy_jarima") },
  { any: ["davlat organlari", "davlat xaridlari"], src: dc("Davlat_organlari") },
  { any: ["kredit", "garov", "bank", "tolov tizim"], src: dc("Kredit_bank") },
  { any: ["royxatga olish", "ruxsatnoma", "litsenziya", "lisenziya", "migrasiya", "kompaniya royxati", "qurilish nazorati"], src: dc("Royxatga_olish") },
  { any: ["korporativ", "tasis hujjat", "kompaniyada ozgarish", "ishtirokchilar", "tugatish", "qayta tashkil", "ulush", "due diligence"],
    eq: ["m a"], src: dc("Korporativ") },
  // Investments and intellectual property: a light bulb, a patent, a chart.
  { any: ["investisiya", "patent", "tovar belgisi", "mualliflik", "ip nizolari"], src: dc("Investitsiya_IP") },
  // Personal NON-property rights (and personal data), before the property
  // rule — "номулкий ҳуқуқлар" contains "mulkiy huquq" and would otherwise
  // read as property.
  { any: ["shaxsiy nomulkiy", "malumotlar himoyasi"], src: dc("Shaxsiy_huquqlar") },
  { any: ["uy joy", "kochmas mulk", "mulk nizolari", "mulkiy huquq", "er huquqi", "chegara nizolari", "ijara"], src: area("Kochmas_mulk") },
  { any: ["oldi sotdi", "yetkazib berish", "istemolchi", "marketpleys"], src: area("Istemolchi_huquqlari") },
  // Contracts before tax/audit, so "Шартнома аудити" stays a contract matter.
  { any: ["shartnoma", "oferta"], src: dc("Shartnomalar") },
  { any: ["soliq", "audit", "muvofiqlik", "compliance"], src: area("Biznes_va_soliq") },
  { any: ["sud arizalari", "iltimosnoma", "sud bosqichi", "sudlov", "arbitraj", "yuqori instansiya", "advokat bilan ariza"], src: dc("Sud_arizalari") },
  // Catch-all for the document-shaped subcategories, last of the specific ones.
  { any: ["hujjat"], src: dc("Boshqa_hujjatlar") },
  { any: ["fuqarolik"], src: dc("Fuqarolik") },
];
export function subcategoryImage(name: string): DocArt | null {
  return pickImage(name, SUBCATEGORY_IMAGES);
}

// A template's picture: its subject when the title names one, else its
// general category's, else the folder of papers.
const CATEGORY_IMAGE_NAME: Record<string, string> = {
  "legal-doc-civil": "fuqarolik",
  "legal-doc-criminal": "jinoiy",
  "legal-doc-administrative": "mamuriy",
  "legal-doc-economic": "iqtisodiy",
};
export function categoryKeyImage(key: string, title = ""): DocArt | null {
  return generalCategoryImage(CATEGORY_IMAGE_NAME[key] ?? title);
}
export function templateImage(title: string, categoryKey: string): DocArt {
  return subcategoryImage(title) ?? categoryKeyImage(categoryKey) ?? ALL_TEMPLATES_IMAGE;
}
