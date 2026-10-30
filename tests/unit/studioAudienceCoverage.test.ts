import { describe, expect, it } from "vitest";
import { audienceOfField } from "@/components/admin/studio/sx/schema/audience";
import { fieldPath } from "@/components/admin/studio/sx/labels";
import uz from "@/messages/uz.json";
import ru from "@/messages/ru.json";
import en from "@/messages/en.json";
import k02 from "../e2e/fixtures/studio-k02.json";
import k17 from "../e2e/fixtures/studio-k17-v3.json";
import k36 from "../e2e/fixtures/studio-k36.json";

// TSK-639097: every text a Studio author types — text, description, a list
// of texts — says who reads it, and offers a "for example" in all three
// languages. Checked against the live schemas recorded in the e2e fixtures.
type F = { key: string; type: string; fields?: F[]; item_type?: string; item_fields?: F[]; items?: { type?: string; fields?: F[] } };
const TEXT = new Set(["text", "textarea", "richtext", "markdown"]);

function textPaths(fields: F[], prefix = ""): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const path = prefix ? `${prefix}.${f.key}` : f.key;
    if (TEXT.has(f.type)) out.push(path);
    const nested = f.fields ?? f.item_fields ?? f.items?.fields;
    if (nested?.length) out.push(...textPaths(nested, `${path}.0`));
  }
  return out;
}

const ph = (m: unknown) => ((m as { studio: { sx: { ph: Record<string, string> } } }).studio.sx.ph);
const CASES: [string, F[]][] = [
  ["K02", (k02 as unknown as { k02: { schema: { fields: F[] } } }).k02.schema.fields],
  ["K17", (k17 as unknown as { k17: { schema: { fields: F[] } } }).k17.schema.fields],
  ["K36", (k36 as unknown as { k36: { schema: { fields: F[] } } }).k36.schema.fields],
];

describe("every Studio text field says who reads it and gives an example (TSK-639097)", () => {
  for (const [code, fields] of CASES) {
    it(`${code}: reader and example for each text field`, () => {
      const paths = textPaths(fields);
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        const aud = audienceOfField(code, path, {}, {});
        expect(aud, `${code} ${path}: reader`).not.toBeNull();
        if (aud?.who === "system") continue;
        const key = `${code}__${fieldPath(path)}`;
        for (const [lang, m] of [["uz", uz], ["ru", ru], ["en", en]] as const) {
          const text = ph(m)[key];
          expect(text, `${lang} sx.ph.${key}`).toBeTruthy();
          expect(text, `${lang} sx.ph.${key}`).toMatch(lang === "uz" ? /^Masalan/i : lang === "ru" ? /^Например/i : /^(For example|e\.g\.)/i);
        }
      }
    });
  }
});
