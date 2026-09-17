export type Lawyer = {
  userId?: string; // backend user id (for purchase/chat), when from the API
  name: string;
  regionKey: string; // key into enums.regions
  areaKey: string; // key into enums.areas
  exp: number;
  rate: number;
  rev: number;
  full: number;
  part: number;
  price: string; // formatted number, currency word comes from translations
  verified: boolean; // identity/licence verified by LexGo (not the "super lawyer" status)
  kind?: "advocate" | "lawyer"; // advokat vs yurist, for client-facing labels
  languages?: string[];
  isNew?: boolean; // T1-09: recently verified with few reviews → "Yangi" badge + first-page quota
};

// Practice areas and regions used across the site (keys resolved via messages).
export const AREA_KEYS = [
  "criminal",
  "economic",
  "civil",
  "family",
  "labor",
  "administrative",
  "tax",
  "ip",
  "migration",
  "realEstate",
];

export const REGION_KEYS = [
  "tashkent",
  "samarkand",
  "fergana",
  "bukhara",
  "namangan",
  "andijan",
  "kashkadarya",
  "khorezm",
  "jizzakh",
  "navoi",
];

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Turn a backend slug that has no i18n label (e.g. "fixture-nikoh-shartnomasi",
// "family-divorce") into a readable fallback ("Nikoh shartnomasi", "Family
// divorce") instead of showing the raw key.
export function humanizeSlug(s: string): string {
  const cleaned = (s || "")
    .replace(/^(fixture|service|area|category)[-_]/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : s;
}
