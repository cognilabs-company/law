// Uzbek text from the backend is often in Cyrillic ("Ота-оналик ҳуқуқидан
// маҳрум қилиш") while the uz interface is Latin. uzLatin() writes it in
// the official Latin alphabet; text without Cyrillic comes back unchanged.

const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "’", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ё: "yo", ў: "o‘", қ: "q", ғ: "g‘", ҳ: "h",
};
const VOWELS = new Set([..."аоуэиеёюяў"]);

const CYR = /[Ѐ-ӿ]/;

export function uzLatin(text: string): string {
  if (!text || !CYR.test(text)) return text;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const low = ch.toLowerCase();
    const upper = ch !== low;
    let lat: string;
    if (low === "е") {
      // "ye" at a word's start or after a vowel/ъ/ь, otherwise "e".
      const prev = text[i - 1]?.toLowerCase() ?? "";
      lat = !prev || !CYR.test(prev) || VOWELS.has(prev) || prev === "ъ" || prev === "ь" ? "ye" : "e";
    } else if (low in MAP) lat = MAP[low];
    else {
      out += ch;
      continue;
    }
    if (upper && lat) {
      const nextUpper = text[i + 1] && text[i + 1] !== text[i + 1].toLowerCase();
      lat = nextUpper ? lat.toUpperCase() : lat.charAt(0).toUpperCase() + lat.slice(1);
    }
    out += lat;
  }
  return out;
}

// For a label shown in the given interface locale: Latin for uz only.
export const uzLabel = (text: string, locale: string): string => (locale === "uz" ? uzLatin(text) : text);
