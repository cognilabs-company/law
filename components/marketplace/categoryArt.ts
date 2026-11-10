// The family-D picture (navy + blue line drawing on a light plate, see the
// client dashboard's "Huquqiy yo'nalishlar" cards) for a service category.
// The backend has no fixed taxonomy and writes titles in Uzbek (often
// Cyrillic), so a category is matched by the words of its slug, its title and
// the label the reader sees (uz / ru / en); the service's own title is the
// fallback hay. The order matters: the narrower subjects come first
// ("Davlat organlari bilan nizolar" is about state bodies, not courts;
// "Iqtisod, biznes va qarzdorlik" is business, not debts).
const CAT = "/img/category/";
const DOC = "/img/doc-catalog/";

const RULES: readonly (readonly [RegExp, string])[] = [
  [/davlat|state bod|госорган|давлат/, `${DOC}Davlat_organlari`],
  [/xorij|viza|migrat|abroad|visa|foreign|internation|зарубеж|виз[аы]|миграц|хориж/, `${DOC}Xorijiy_huquq`],
  [/brend|intellekt|brand|intellect|patent|internet|интеллект|бренд/, `${DOC}Investitsiya_IP`],
  [/ma.?muriy|administrat|административ|маъмурий/, `${DOC}Mamuriy`],
  [/jinoy|jinoi|criminal|уголов|жиноя|жиноий/, `${CAT}Jinoyat_ishlari`],
  [/meros|vasiyat|inherit|наслед|мерос|васият/, `${CAT}Meros`],
  [/oila|nikoh|aliment|ajrash|family|marriage|divorce|семь|брак|алимент|оила|никоҳ/, `${CAT}Oila_huquqi`],
  [/mehnat|labou?r|employ|трудов|меҳнат/, `${CAT}Mehnat_huquqi`],
  [/ko.?chmas|uy-joy|ijara|real.?estate|housing|lease|недвиж|жиль|аренд|кўчмас|уй-жой|ижара/, `${CAT}Kochmas_mulk`],
  [/avto|yth|ytx|traffic|accident|дтп|йтҳ|авто/, `${CAT}Avtoavariya_YTH`],
  [/iste.?mol|consumer|zarar|damage|потребит|ущерб|истеъмол|зарар/, `${CAT}Istemolchi_huquqlari`],
  [/soliq|bojxona|tax|custom|налог|тамож|солиқ|божхона/, `${CAT}Biznes_va_soliq`],
  [/biznes|business|kompaniya|company|tadbirkor|entrepreneur|korporativ|corporate|iqtisod|econom|бизнес|компан|предприним|корпоратив|иқтисод|экономик|тадбиркор/, `${CAT}Biznes_va_soliq`],
  [/qarz|undirish|debt|recover|долг|взыск|қарз|ундириш/, `${DOC}Qarzdorlik`],
  [/shartnoma|contract|договор|шартнома/, `${DOC}Shartnomalar`],
  [/sud|court|nizo|dispute|суд|спор|низо/, `${DOC}Sud_arizalari`],
  [/fuqarolik|civil|гражданск|фуқаролик/, `${DOC}Fuqarolik`],
  [/hujjat|ariza|document|application|документ|заявлен|ҳужжат|ариза/, `${DOC}Boshqa_hujjatlar`],
];

const FALLBACK = `${DOC}Boshqa_hujjatlar`;

const fold = (s: string) => s.normalize("NFC").toLowerCase().replace(/[’'ʻʼ‘`]/g, "'");

function find(hay: string): string | null {
  const h = fold(hay);
  if (!h.trim()) return null;
  for (const [re, src] of RULES) if (re.test(h)) return src;
  return null;
}

/** The plate picture (520x361 WebP) for a category: its texts first, then the service's own title. */
export function categoryArt(categoryTexts: readonly string[], serviceTitle = ""): string {
  return `${find(categoryTexts.join(" | ")) ?? find(serviceTitle) ?? FALLBACK}.webp`;
}
