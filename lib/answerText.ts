import { humanizeSlug } from "./lawyers";

// A form answer as plain words, never raw JSON: a list reads "a, b", a
// group "Label: value; Label: value", a yes/no in the reader's language.
export function answerText(v: unknown, yesNo: { yes: string; no: string }, label: (k: string) => string = humanizeSlug): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? yesNo.yes : yesNo.no;
  if (Array.isArray(v)) return v.map((x) => answerText(x, yesNo, label)).filter(Boolean).join(", ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => [label(k), answerText(x, yesNo, label)] as const)
      .filter(([, x]) => x)
      .map(([k, x]) => `${k}: ${x}`)
      .join("; ");
  }
  return String(v);
}
