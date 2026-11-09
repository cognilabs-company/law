import type { ComponentType } from "react";
import { BriefcaseBusiness, Car, Gavel, HeartHandshake, House, Landmark, ScrollText, ShoppingBag } from "lucide-react";

// The eight legal areas of the LexGo 1920 design (client dashboard and the
// "Advokat va yuristlar" filter). The backend has no fixed area taxonomy —
// sellers carry free specialization slugs and services free category titles —
// so an area is matched by the words its specializations, services and
// categories use, in every script the catalog is written in.
// `image`: a 520px WebP copy of the 760px PNG beside it in public/img/category
// (the card shows it at ≤262px; the PNGs were ~200 KB each, ~1.75 MB for the
// eight, and stayed blank for a long time on a slow line).
export type LegalArea = {
  key: "labor" | "family" | "property" | "traffic" | "business" | "inheritance" | "criminal" | "consumer";
  Icon: ComponentType<{ className?: string }>;
  image: string;
  terms: string[];
};

export const LEGAL_AREAS: LegalArea[] = [
  { key: "labor", Icon: BriefcaseBusiness, image: "/img/category/Mehnat_huquqi.webp", terms: ["mehnat", "labor", "labour", "employment", "трудов", "меҳнат", "ishdan", "maosh"] },
  { key: "family", Icon: HeartHandshake, image: "/img/category/Oila_huquqi.webp", terms: ["oila", "family", "nikoh", "aliment", "ajrash", "vasiylik", "семь", "оила", "никоҳ", "алимент", "развод"] },
  { key: "property", Icon: House, image: "/img/category/Kochmas_mulk.webp", terms: ["realestate", "real-estate", "ko'chmas", "kochmas", "ko‘chmas", "mulk", "ijara", "uy-joy", "lease", "недвиж", "кўчмас", "ижара", "аренд"] },
  { key: "traffic", Icon: Car, image: "/img/category/Avtoavariya_YTH.webp", terms: ["avto", "ytx", "yth", "traffic", "accident", "sug'urta", "sugurta", "дтп", "йтҳ", "авто", "страхов"] },
  { key: "business", Icon: Landmark, image: "/img/category/Soliq_huquqi.webp", terms: ["biznes", "business", "soliq", "tax", "korxona", "korporativ", "corporate", "iqtisod", "economic", "налог", "бизнес", "корпоратив", "солиқ", "иқтисод"] },
  { key: "inheritance", Icon: ScrollText, image: "/img/category/meros_huquqi.webp", terms: ["meros", "inherit", "vasiyat", "will", "наслед", "мерос", "васият", "inherited"] },
  { key: "criminal", Icon: Gavel, image: "/img/category/Jinoyiy_huquq.webp", terms: ["jinoy", "criminal", "уголов", "жиноя", "himoya", "tergov", "defense"] },
  { key: "consumer", Icon: ShoppingBag, image: "/img/category/istemolchi_huquqi.webp", terms: ["iste'molchi", "istemolchi", "iste‘molchi", "consumer", "потребит", "истеъмолчи", "tovar"] },
];

export const areaByKey = (key: string): LegalArea | undefined => LEGAL_AREAS.find((a) => a.key === key);

const fold = (s: string) => s.toLowerCase().replace(/[ʻʼ'‘’`]/g, "'");

// True when any of the texts (specializations, service titles, categories)
// belongs to the area.
export function inArea(area: LegalArea, texts: string[]): boolean {
  const hay = texts.map(fold).join(" | ");
  return area.terms.some((term) => hay.includes(fold(term)));
}
