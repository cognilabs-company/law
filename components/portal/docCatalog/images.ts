import { normalizeSearchText } from "@/lib/searchText";

// Illustrations are chosen from the NORMALIZED name — transliterated out of
// Cyrillic, apostrophes dropped (lib/searchText) — not from the raw string.
// Production sends both scripts: of the 127 distinct subcategories live today,
// about a hundred are Cyrillic ("Шартномалар", "Меҳнат низолари", "Ижро"),
// and the old Latin-only regexes matched 20 of them. Everything else fell back
// to a cycled icon, which is why most service cards had no picture.
type ImageRule = {
  // Substrings of the normalized name; the first rule with any of them wins,
  // so ORDER IS THE SPECIFICITY. "Меҳнат шартномаси" must reach the labour
  // rule before the contracts one.
  any?: string[];
  // Whole normalized name, for a name too short to match on safely ("M&A").
  eq?: string[];
  src: string;
};
function pickImage(name: string, rules: ImageRule[]): string | null {
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
  { any: ["fuqarolik"], src: "/img/fuqaro.png" },
  { any: ["iqtisodiy"], src: "/img/Iqtisodiy.png" },
  { any: ["jinoiy"], src: "/img/jinoiy.png" },
  { any: ["mamuriy"], src: "/img/mamuriy.png" },
];
export function generalCategoryImage(name: string): string | null {
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
  { any: ["mehnat", "ishdan boshatish", "ish beruvchi"], src: "/img/mehnat-nizolari.png" },
  // Family and inheritance. Before contracts, so a marriage contract stays here.
  { any: ["oila", "aliment", "nikoh", "otalik", "ota ona", "meros", "vasiyat"], src: "/img/oliaviy-meros.png" },
  // Before the credit rule, whose "bank" would otherwise swallow "Банкротлик".
  { any: ["bankrotlik"], src: "/img/Bankrotlik.png" },
  { any: ["tergov", "ehtiyot chora"], src: "/img/tergov-chorasi.png" },
  { any: ["prokuror", "jinoyat", "jabrlanuvchi"], src: "/img/prokuror-jinoyat.png" },
  { any: ["transport", "logistika", "yol harakati"], src: "/img/Transport-logistika.png" },
  { any: ["notarial", "ishonchnoma"], src: "/img/ishonchnoma.png" },
  // "undirish" (recovery) and "ijro" (enforcement) are the same picture, and
  // both come before the debt rule so "Судгача ундириш" lands here.
  { any: ["undirish", "ijro"], src: "/img/ijro.png" },
  { any: ["qarzdorlik", "talabnoma", "sudgacha tartib"], src: "/img/Qarzdorlik.png" },
  // Administrative before the court rule: "Маъмурий судлов" is administrative.
  { any: ["mamuriy jarima", "mamuriy javobgarlik", "mamuriy huquqbuzarlik", "mamuriy sudlov"], src: "/img/mamuriy-jarima.png" },
  { any: ["davlat organlari", "davlat xaridlari"], src: "/img/davlat-orgnalari.png" },
  { any: ["kredit", "garov", "bank", "tolov tizim"], src: "/img/kredit.png" },
  { any: ["royxatga olish", "ruxsatnoma", "litsenziya", "lisenziya", "migrasiya", "kompaniya royxati", "qurilish nazorati"], src: "/img/royhatga-olish.png" },
  { any: ["korporativ", "tasis hujjat", "kompaniyada ozgarish", "ishtirokchilar", "tugatish", "qayta tashkil", "ulush",
          "investisiya", "due diligence", "patent", "tovar belgisi", "mualliflik", "ip nizolari"],
    eq: ["m a"], src: "/img/Korporativ.png" },
  // Personal NON-property rights, before the property rule — "номулкий
  // ҳуқуқлар" contains "mulkiy huquq" and would otherwise read as property.
  { any: ["shaxsiy nomulkiy"], src: "/img/boshqa-fuqorolik.png" },
  { any: ["uy joy", "kochmas mulk", "mulk nizolari", "mulkiy huquq", "er huquqi", "chegara nizolari", "ijara"], src: "/img/uyjoy-nizolari.png" },
  { any: ["oldi sotdi", "yetkazib berish", "istemolchi", "marketpleys"], src: "/img/yetkazib-berish.png" },
  // Contracts before tax/audit, so "Шартнома аудити" stays a contract matter.
  { any: ["shartnoma", "oferta"], src: "/img/shartnomlar.png" },
  { any: ["soliq", "audit", "muvofiqlik", "compliance", "malumotlar himoyasi"], src: "/img/Iqtisodiy.png" },
  { any: ["sud arizalari", "iltimosnoma", "sud bosqichi", "sudlov", "arbitraj", "yuqori instansiya", "advokat bilan ariza"], src: "/img/sudarizalari.png" },
  // Catch-all for the document-shaped subcategories, last of the specific ones.
  { any: ["hujjat"], src: "/img/boshqa-fuqorolik.png" },
  { any: ["fuqarolik"], src: "/img/fuqaro.png" },
];
export function subcategoryImage(name: string): string | null {
  return pickImage(name, SUBCATEGORY_IMAGES);
}
