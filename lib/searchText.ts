// Latin/Cyrillic tolerant text normalizer for client-side search. Mirrors the
// backend's normalized_search_text (GET /services/search) so the local filter
// and the server search agree on what matches: Uzbek Cyrillic and Russian
// letters are transliterated to Latin, apostrophes (o' / g' / oʻ) are dropped,
// everything else non-alphanumeric becomes a space.
const CYR: Record<string, string> = {
  "қ": "q", "ў": "o", "ғ": "g", "ҳ": "h", "х": "x", "ц": "s", "ш": "sh", "щ": "sh", "ч": "ch",
  "ю": "yu", "я": "ya", "ё": "yo", "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e",
  "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
  "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "ъ": "", "ь": "", "э": "e",
};

export function normalizeSearchText(value: string): string {
  const lower = value.toLowerCase().replace(/[’'ʻʼ`‘]/g, "");
  let out = "";
  for (const ch of lower) out += ch in CYR ? CYR[ch] : ch;
  return out.replace(/[^a-z0-9]+/g, " ").trim();
}

export function searchTerms(q: string): string[] {
  return normalizeSearchText(q).split(" ").filter(Boolean);
}

// True when every word of the query appears in the (normalized) haystack.
export function matchesSearch(haystack: string, q: string): boolean {
  const terms = searchTerms(q);
  if (!terms.length) return true;
  const hay = normalizeSearchText(haystack);
  return terms.every((w) => hay.includes(w));
}
