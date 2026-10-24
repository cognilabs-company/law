// Service category names in uz (Latin) / ru / en. The backend keeps one
// title per category, written in Uzbek (mostly Cyrillic), and has no
// translations, so every picker that lists categories would show that
// Uzbek title to a Russian or English reader. The names live here by slug;
// a category this list does not know (one an admin adds later) keeps the
// backend's own title.

export type CategoryLocale = "uz" | "ru" | "en";

type Names = Record<CategoryLocale, string>;

const NAMES: Readonly<Record<string, Names>> = {
  "oila-va-nikoh": { uz: "Oila va nikoh", ru: "Семья и брак", en: "Family and marriage" },
  "uy-joy-va-kochmas-mulk": { uz: "Uy-joy va ko‘chmas mulk", ru: "Жильё и недвижимость", en: "Housing and real estate" },
  "qarz-pul-va-undirish": { uz: "Qarz, pul va undirish", ru: "Долги, деньги и взыскание", en: "Debts, money and recovery" },
  "sud-va-nizolar": { uz: "Sud va nizolar", ru: "Суды и споры", en: "Courts and disputes" },
  "jinoyat-ishlari": { uz: "Jinoyat ishlari", ru: "Уголовные дела", en: "Criminal cases" },
  "mamuriy-ishlar": { uz: "Ma’muriy ishlar", ru: "Административные дела", en: "Administrative cases" },
  "mehnat-qonunchiligi": { uz: "Mehnat qonunchiligi", ru: "Трудовое право", en: "Employment law" },
  "biznes-ochish-va-kompaniya": { uz: "Biznes ochish va kompaniya", ru: "Открытие бизнеса и компании", en: "Starting a business" },
  shartnomalar: { uz: "Shartnomalar", ru: "Договоры", en: "Contracts" },
  "soliq-va-bojxona": { uz: "Soliq va bojxona", ru: "Налоги и таможня", en: "Tax and customs" },
  "hujjat-va-arizalar": { uz: "Hujjat va arizalar", ru: "Документы и заявления", en: "Documents and applications" },
  "davlat-organlari-bilan-nizolar": { uz: "Davlat organlari bilan nizolar", ru: "Споры с госорганами", en: "Disputes with state bodies" },
  meros: { uz: "Meros", ru: "Наследство", en: "Inheritance" },
  "zarar-va-istemolchi-huquqlari": { uz: "Zarar va iste’molchi huquqlari", ru: "Ущерб и права потребителей", en: "Damages and consumer rights" },
  "tadbirkorlik-va-biznes-himoyasi": { uz: "Tadbirkorlik va biznes himoyasi", ru: "Защита предпринимателей и бизнеса", en: "Business protection" },
  "brend-intellektual-mulk-va-internet": { uz: "Brend, intellektual mulk va internet", ru: "Бренд, интеллектуальная собственность и интернет", en: "Brands, IP and the internet" },
  "xorij-viza-va-migratsiya": { uz: "Xorij, viza va migratsiya", ru: "Зарубежье, визы и миграция", en: "Abroad, visas and migration" },
  "iqtisod-biznes-va-qardorilika-oid-ishlar": { uz: "Iqtisod, biznes va qarzdorlikka oid ishlar", ru: "Экономика, бизнес и задолженность", en: "Economy, business and debt" },
  "legal-doc-criminal": { uz: "Jinoiy", ru: "Уголовные", en: "Criminal" },
  "legal-doc-administrative": { uz: "Ma’muriy", ru: "Административные", en: "Administrative" },
};

// Some lists carry only the title (a package's category, a tree path), so
// the backend's titles find their category too.
const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[’'ʻʼ‘`]/g, "'").replace(/\s+/g, " ").trim();
const BY_TITLE: ReadonlyMap<string, Names> = new Map(
  Object.values(NAMES).flatMap((n) => [n.uz, n.ru, n.en].map((s) => [norm(s), n] as const)),
);
const BACKEND_TITLES: Readonly<Record<string, string>> = {
  "оила ва никоҳ": "oila-va-nikoh",
  "уй-жой ва кўчмас мулк": "uy-joy-va-kochmas-mulk",
  "қарз, пул ва ундириш": "qarz-pul-va-undirish",
  "суд ва низолар": "sud-va-nizolar",
  "жиноят ишлари": "jinoyat-ishlari",
  "маъмурий ишлар": "mamuriy-ishlar",
  "меҳнат қонунчилиги": "mehnat-qonunchiligi",
  "бизнес очиш ва компания": "biznes-ochish-va-kompaniya",
  шартномалар: "shartnomalar",
  "солиқ ва божхона": "soliq-va-bojxona",
  "ҳужжат ва аризалар": "hujjat-va-arizalar",
  "давлат органлари билан низолар": "davlat-organlari-bilan-nizolar",
  мерос: "meros",
  "зарар ва истеъмолчи ҳуқуқлари": "zarar-va-istemolchi-huquqlari",
  "тадбиркорлик ва бизнес ҳимояси": "tadbirkorlik-va-biznes-himoyasi",
  "бренд, интеллектуал мулк ва интернет": "brend-intellektual-mulk-va-internet",
  "хориж, виза ва миграция": "xorij-viza-va-migratsiya",
  "iqtisod, biznes va qardorilika oid ishlar": "iqtisod-biznes-va-qardorilika-oid-ishlar",
};

const localeOf = (locale: string): CategoryLocale => (locale === "ru" || locale === "en" ? locale : "uz");

function namesOf(slug: string, title: string): Names | undefined {
  const s = slug.trim().toLowerCase();
  if (s && Object.prototype.hasOwnProperty.call(NAMES, s)) return NAMES[s];
  const t = norm(title);
  if (!t) return undefined;
  const bySlug = BACKEND_TITLES[t];
  return bySlug ? NAMES[bySlug] : BY_TITLE.get(t);
}

// A category's name for the reader: ours when we know the category, else
// the backend's title as written.
export function categoryName(cat: { slug?: string; title?: string; name?: string }, locale: string): string {
  const title = (cat.title ?? cat.name ?? "").trim();
  return namesOf(cat.slug ?? "", title)?.[localeOf(locale)] ?? title;
}

// The same, from a backend title alone.
export function categoryTitleName(title: string, locale: string): string {
  return namesOf("", title)?.[localeOf(locale)] ?? title;
}
