// Document and service titles come straight out of the DOCX filenames the
// catalogue was imported from, so they carry the file system's leftovers:
// a leading underscore that marked a draft, a trailing full stop that ended
// the filename, and the odd double space.
//
// Measured against production (497 catalogue services): 12 titles start with
// "_", 47 end in ".", 4 hold a double space, none carry a file extension and
// none are numbered. The rules below are exactly those four cases and
// nothing speculative — a cleaner that guesses would eventually eat a real
// title.
//
// Applied in the normalizer rather than at each render, so every surface —
// catalogue card, sample hint, "Mening hujjatlarim" row, advocate inbox,
// chat header — shows the same clean name.

// A description is prose, not a title: a full stop at the end of it is
// legitimate, so only the filename's leading underscore and the double
// spaces are taken. In this catalogue the description is often the filename
// verbatim, which is why it showed the underscore at all.
export function cleanDocText(raw: string): string {
  return (raw || "").trim().replace(/^[_\s]+/, "").replace(/[\s ]+/g, " ").trim();
}

export function cleanDocTitle(raw: string): string {
  let s = (raw || "").trim();
  if (!s) return "";
  // A leading "_" (sometimes several) and whatever space follows it.
  s = s.replace(/^[_\s]+/, "");
  // Runs of whitespace, including the non-breaking spaces a few titles carry.
  s = s.replace(/[\s ]+/g, " ").trim();
  // The trailing full stop the filename ended with. Only when the word it
  // follows is a real word: an abbreviation ends in a short token ("va h.k.",
  // "т.б.") and that dot belongs to it. Three characters is the line —
  // "ариза." and "huquqiy." lose theirs, "h.k." keeps it.
  s = s.replace(/([^\s.…]{3,})\.$/, "$1");
  return s.trim();
}
