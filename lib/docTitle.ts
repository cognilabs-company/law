// Document and service titles come straight out of the DOCX filenames the
// catalogue was imported from, so they carry the file system's leftovers:
// a leading underscore that marked a draft, a trailing full stop that ended
// the filename, and the odd double space.
//
// Measured against production (497 catalogue services, 988 document
// templates, 2026-09-29): 12 titles start with "_", 47 end in ".", 4 hold a
// double space, 3 still carry the ".docx" extension, 4 are nothing but a
// UUID and 8 hide a Latin letter inside a Cyrillic word. The rules below are
// exactly those cases and nothing speculative — a cleaner that guesses would
// eventually eat a real title.
//
// Two rules were considered and rejected. Stripping a trailing "(1)"/"(2)"
// would merge 11 sibling services that are genuinely different documents
// (different field counts, different bodies) into pairs of identically named
// cards, which is worse than the marker. Folding ALL-CAPS titles to sentence
// case would touch only 3 services and 3 templates and would lowercase the
// proper nouns inside them.
//
// Applied in the normalizer rather than at each render, so every surface —
// catalogue card, sample hint, "Mening hujjatlarim" row, advocate inbox,
// chat header — shows the same clean name.

// A description is prose, not a title: a full stop at the end of it is
// legitimate, so only the filename's leading underscore and the double
// spaces are taken. In this catalogue the description is often the filename
// verbatim, which is why it showed the underscore at all.
export function cleanDocText(raw: string): string {
  return (raw || "").trim().replace(/^[_\s]+/, "").replace(/[\s ]+/g, " ").trim();
}

// The importer wrote the source file's own name when the DOCX carried no
// title of its own, extension included. Anchored at the end and limited to
// the office/text extensions the import actually produced, so a version
// number survives: "Xizmat 2.0" ends in ".0" and "Lexgo.AI obunasi (jismoniy
// shaxs)" does not end in a dotted token at all. 3 template titles, 0
// services, 0 false positives over all 1485 rows.
const FILE_EXTENSION = /\.(docx?|pdf|rtf|odt|txt)$/i;

// A row whose whole title is a UUID has no title: the importer fell back to
// the file's GUID name and the document's real name was lost. 2 services and
// 2 templates, all four of them "<uuid>" verbatim with a "<uuid>.docx" source
// file behind them. Anchored over the whole string on purpose — a real title
// that merely contained a UUID would keep it — and verified to match nothing
// else across all 1485 rows.
const UUID_ONLY = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

// The Latin letters whose Cyrillic twin is visually identical in this font
// set. Only these: "I" is deliberately absent because the catalogue uses it
// as a Roman numeral ("(I гуруҳ)", "(II гуруҳ)", "(III гуруҳ)") next to
// Cyrillic words, and mapping it would rewrite a correct title.
const CYRILLIC_TWIN: Record<string, string> = {
  A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х",
  a: "а", c: "с", e: "е", o: "о", p: "р", x: "х",
};

const LATIN_LETTER = /[A-Za-z]/;
const CYRILLIC_LETTER = /[Ѐ-ӿ]/;

// A Latin letter sitting inside a Cyrillic word breaks both sorting and
// search: "Cуд мажлисини бошқа кунга қолдириш" sorts under C among the Latin
// titles and no Cyrillic "Суд" query will ever find it, and "КОМПЛEКСДАГИ"
// hides a Latin E. 4 services and 4 templates, every one of them a single
// stray letter.
//
// Two guards keep the rule off legitimate text. The letter must be isolated
// — no Latin letter on either side — so a real Latin run ("II", "III", an
// English word) is never touched; and it must actually touch a Cyrillic
// letter, so a lone Latin initial in a Latin title is left alone. On top of
// that the title as a whole must be predominantly Cyrillic: without that
// guard "Nikoh shartnomasi (brachnыy kontrakt) tuzish" — a Latin title with
// one Cyrillic ы in it — would have its neighbouring Latin letters pulled
// across into Cyrillic.
function fixCyrillicHomoglyphs(s: string): string {
  const cyrillic = (s.match(/[Ѐ-ӿ]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  if (!cyrillic || latin >= cyrillic) return s;
  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    const twin = CYRILLIC_TWIN[chars[i]];
    if (!twin) continue;
    const prev = i > 0 ? chars[i - 1] : "";
    const next = i + 1 < chars.length ? chars[i + 1] : "";
    if (LATIN_LETTER.test(prev) || LATIN_LETTER.test(next)) continue;
    if (!CYRILLIC_LETTER.test(prev) && !CYRILLIC_LETTER.test(next)) continue;
    chars[i] = twin;
  }
  return chars.join("");
}

export function cleanDocTitle(raw: string): string {
  let s = (raw || "").trim();
  if (!s) return "";
  // A leading "_" (sometimes several) and whatever space follows it.
  s = s.replace(/^[_\s]+/, "");
  // Runs of whitespace, including the non-breaking spaces a few titles carry.
  s = s.replace(/[\s ]+/g, " ").trim();
  // Before the trailing-dot rule, so that rule never has to reason about the
  // dot inside ".docx".
  s = s.replace(FILE_EXTENSION, "");
  // Nothing worth keeping. Empty rather than a guessed name: the callers that
  // have a second name for the row (the client's own subject line, the service
  // behind a document request) show that instead, and the two that have none —
  // the catalogue card and the admin console — keep the raw string so the bad
  // row stays visible to whoever has to fix the data.
  if (UUID_ONLY.test(s)) return "";
  // The trailing full stop the filename ended with. Only when the word it
  // follows is a real word: an abbreviation ends in a short token ("va h.k.",
  // "т.б.") and that dot belongs to it. Three characters is the line —
  // "ариза." and "huquqiy." lose theirs, "h.k." keeps it.
  s = s.replace(/([^\s.…]{3,})\.$/, "$1");
  s = fixCyrillicHomoglyphs(s);
  return s.trim();
}
