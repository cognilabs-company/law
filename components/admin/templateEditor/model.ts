import type { EditorField, EditorIssue, EditorMeta, EditorSection, EditorValidation } from "@/lib/services/templateEditor";

export type Model = { meta: EditorMeta; sections: EditorSection[]; fields: EditorField[] };

export type Selection = { kind: "field"; uid: string } | { kind: "section"; id: string } | null;

const CYR: Record<string, string> = {
  "ў": "o", "ғ": "g", "қ": "q", "ҳ": "h", "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
  "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
  "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "s", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "", "ы": "i",
  "ь": "", "э": "e", "ю": "yu", "я": "ya",
};

function latin(raw: string): string {
  return Array.from(raw.toLowerCase())
    .map((c) => (c in CYR ? CYR[c] : c))
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['`‘’ʻʼ]/g, "");
}

export function toKey(raw: string): string {
  return latin(raw).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60).replace(/_+$/g, "");
}

export function toSlug(raw: string): string {
  return latin(raw).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
}

export function cleanKeyInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export function cleanSlugInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export function humanizeKey(key: string): string {
  const s = key.replace(/_+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

export function uniqueSectionId(title: string, sections: EditorSection[]): string {
  const taken = new Set(sections.map((s) => s.id));
  const root = toKey(title) || "section";
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}_${n}`)) n++;
  return `${root}_${n}`;
}

let uidSeq = 0;
export function newFieldUid(): string {
  uidSeq += 1;
  return `n${uidSeq}`;
}

export function blankField(sectionId: string, key = "", label = ""): EditorField {
  return {
    uid: newFieldUid(),
    key,
    label,
    type: "text",
    required: true,
    sectionId,
    helpText: "",
    defaultValue: null,
    options: [],
    validation: {},
    insertText: "",
    savedKey: "",
    autoKey: !key,
  };
}

export function fieldsOf(fields: EditorField[], sectionId: string): EditorField[] {
  return fields.filter((f) => f.sectionId === sectionId);
}

export function orphanFields(fields: EditorField[], sections: EditorSection[]): EditorField[] {
  const ids = new Set(sections.map((s) => s.id));
  return fields.filter((f) => !ids.has(f.sectionId));
}

export function moveSection(sections: EditorSection[], id: string, dir: -1 | 1): EditorSection[] {
  const i = sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sections.length) return sections;
  const next = sections.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function dropSection(sections: EditorSection[], id: string, beforeId: string | null): EditorSection[] {
  if (id === beforeId) return sections;
  const moving = sections.find((s) => s.id === id);
  if (!moving) return sections;
  const rest = sections.filter((s) => s.id !== id);
  const at = beforeId ? rest.findIndex((s) => s.id === beforeId) : -1;
  if (at < 0) return [...rest, moving];
  return [...rest.slice(0, at), moving, ...rest.slice(at)];
}

export function moveField(fields: EditorField[], uid: string, dir: -1 | 1): EditorField[] {
  const f = fields.find((x) => x.uid === uid);
  if (!f) return fields;
  const same = fields.filter((x) => x.sectionId === f.sectionId);
  const i = same.findIndex((x) => x.uid === uid);
  const other = same[i + dir];
  if (!other) return fields;
  const a = fields.findIndex((x) => x.uid === uid);
  const b = fields.findIndex((x) => x.uid === other.uid);
  const next = fields.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export function dropField(fields: EditorField[], uid: string, sectionId: string, beforeUid: string | null): EditorField[] {
  if (uid === beforeUid) return fields;
  const f = fields.find((x) => x.uid === uid);
  if (!f) return fields;
  const moved = { ...f, sectionId };
  const rest = fields.filter((x) => x.uid !== uid);
  let at = beforeUid ? rest.findIndex((x) => x.uid === beforeUid) : -1;
  if (at < 0) {
    let last = -1;
    rest.forEach((x, i) => {
      if (x.sectionId === sectionId) last = i;
    });
    at = last + 1;
    if (last < 0) at = rest.length;
  }
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

export function appendToSection(fields: EditorField[], field: EditorField): EditorField[] {
  return dropField([...fields, field], field.uid, field.sectionId, null);
}

export function patchFromServer(fields: EditorField[], serverFields: EditorField[]): EditorField[] {
  if (!serverFields.length) return fields;
  const byKey = new Map(serverFields.map((s) => [s.key, s]));
  let changed = false;
  const next = fields.map((f) => {
    const s = byKey.get(f.key);
    if (!s || !s.insertText) return f;
    if (f.insertText === s.insertText && f.savedKey === f.key) return f;
    changed = true;
    return { ...f, insertText: s.insertText, savedKey: f.key };
  });
  return changed ? next : fields;
}

export type IssueIndex = {
  byKey: Map<string, EditorIssue[]>;
  bySection: Map<string, EditorIssue[]>;
  missingFields: string[];
  documentIssues: EditorIssue[];
};

export function indexIssues(v: EditorValidation | null, fields: EditorField[], sectionIds?: ReadonlySet<string>): IssueIndex {
  const byKey = new Map<string, EditorIssue[]>();
  const bySection = new Map<string, EditorIssue[]>();
  const missing = new Set<string>();
  const documentIssues: EditorIssue[] = [];
  if (!v) return { byKey, bySection, missingFields: [], documentIssues };
  const keys = new Set(fields.map((f) => f.key));
  const push = (m: Map<string, EditorIssue[]>, k: string, x: EditorIssue) => m.set(k, [...(m.get(k) ?? []), x]);
  for (const x of [...v.errors, ...v.warnings]) {
    if (x.code === "field_missing" && x.key && !keys.has(x.key)) {
      missing.add(x.key);
      continue;
    }
    if (x.key && keys.has(x.key)) push(byKey, x.key, x);
    else if (x.sectionId && (!sectionIds || sectionIds.has(x.sectionId))) push(bySection, x.sectionId, x);
    else documentIssues.push(x);
  }
  return { byKey, bySection, missingFields: Array.from(missing), documentIssues };
}
