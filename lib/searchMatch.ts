// Typo- and Cyrillic-tolerant text matching for the service catalog search
// (T1-06). The backend's own GET /services/search is both slow (~11s) and,
// as tested against production, returns zero hits for Uzbek-Cyrillic input
// ("нафака") or a differently-suffixed spelling ("ajrashuv" for the
// catalog's "ajralish") — see md/LEXGO_GM_QABUL_TEST_NATIJASI_2026-09-19.md
// §3. This runs entirely against the catalog already loaded client-side, so
// it never depends on that endpoint working well.

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
  ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  // Uzbek-specific Cyrillic letters (not in Russian).
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

function transliterate(lower: string): string {
  let out = "";
  for (const ch of lower) out += CYRILLIC[ch] ?? ch;
  return out;
}

// Lowercase, transliterate Cyrillic, drop apostrophe variants (so a
// typed "o'zbek" and a transliterated "ўзбек" normalize the same), collapse
// everything else non-alphanumeric to single spaces.
export function normalizeSearchText(s: string): string {
  return transliterate(s.toLowerCase())
    .replace(/['ʻ’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// Uzbek is agglutinative — related words share a stem and differ only in
// their suffix ("ajralish"/"ajrashuv", both "divorce/separation" from the
// same root), so a shared-prefix ratio catches far more real near-misses
// here than whole-word edit distance alone; edit distance still catches an
// actual typo (one swapped/missing/doubled letter) on a short word that
// doesn't share a long enough prefix.
function wordsFuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < 3) return false;
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
  let p = 0;
  while (p < shorter.length && a[p] === b[p]) p++;
  if (p >= 4 && p / shorter.length >= 0.5) return true;
  const allowed = longer.length <= 5 ? 1 : longer.length <= 9 ? 2 : 3;
  return levenshtein(a, b) <= allowed;
}

// True when every (normalized) word of `query` fuzzy-matches some word of
// `text` — a multi-word query like "ish haqi" still has to match both words,
// in any order. Exact substring is checked first as the cheap common case.
export function fuzzyContains(query: string, text: string): boolean {
  const nq = normalizeSearchText(query);
  if (!nq) return true;
  const nt = normalizeSearchText(text);
  if (nt.includes(nq)) return true;
  const qWords = nq.split(" ").filter(Boolean);
  const tWords = nt.split(" ").filter(Boolean);
  return qWords.every((qw) => tWords.some((tw) => wordsFuzzyMatch(qw, tw)));
}
