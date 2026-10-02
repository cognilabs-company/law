// Legal agent answers (md/FRONTEND_LEGAL_AGENT.md). The assistant message is
// Markdown built from lex.uz articles: a "Qisqa javob" lead, numbered rules
// each followed by a verbatim «quote», an optional partial-coverage note,
// "Aniqroq javob uchun" follow-up questions and a closing source/disclaimer
// line. The API has no status or follow-up fields yet (§4), so both are read
// from the text here — one place, so the day the backend sends them only
// this file changes.

export type MdItemPart = { kind: "text" | "quote"; text: string };
export type MdItem = { parts: MdItemPart[]; sub: string[] };
export type MdBlock =
  | { t: "p"; text: string }
  | { t: "h"; text: string }
  | { t: "lead"; label: string; text: string }
  | { t: "list"; ordered: boolean; start: number; items: MdItem[] }
  | { t: "quote"; text: string }
  | { t: "note"; text: string }
  | { t: "footer"; text: string }
  | { t: "followups"; title: string; items: string[] };

export type AgentKind =
  | "answer" | "not_found" | "lex_unavailable" | "document_request" | "error";

const LIST_RE = /^(\s*)(\d+[.)]|[-*+•])\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const HEAD_RE = /^#{1,6}\s+(.*)$/;

const indentOf = (s: string) => s.length - s.trimStart().length;
const isBlank = (s: string | undefined) => s === undefined || !s.trim();

// A paragraph that is nothing but **bold** / _italic_ text.
const wholeBold = (s: string) => /^\*\*([^*][\s\S]*?)\*\*:?$/.exec(s.trim());
const wholeItalic = (s: string) => /^(?:_([^_][\s\S]*?)_|\*([^*][\s\S]*?)\*)$/.exec(s.trim());

export function parseAgentMarkdown(src: string): MdBlock[] {
  const lines = (src || "").replace(/\r\n?/g, "\n").split("\n");
  const out: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    const trimmed = line.trim();

    const head = HEAD_RE.exec(trimmed);
    if (head) { out.push({ t: "h", text: head[1].replace(/\*\*/g, "") }); i++; continue; }

    if (QUOTE_RE.test(line) && indentOf(line) < 2) {
      const q: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) q.push(QUOTE_RE.exec(lines[i++])![1]);
      out.push({ t: "quote", text: q.join("\n").trim() });
      continue;
    }

    const li = LIST_RE.exec(line);
    if (li && indentOf(line) < 2) {
      const ordered = /\d/.test(li[2]);
      const items: MdItem[] = [];
      const start = ordered ? parseInt(li[2], 10) || 1 : 1;
      while (i < lines.length) {
        const cur = lines[i];
        if (isBlank(cur)) {
          // A blank line ends the list unless the list (or this item) goes on.
          let j = i + 1;
          while (j < lines.length && isBlank(lines[j])) j++;
          const nx = lines[j];
          const sameList = nx !== undefined && indentOf(nx) < 2 && LIST_RE.test(nx) && /\d/.test(LIST_RE.exec(nx)![2]) === ordered;
          if (nx !== undefined && (sameList || indentOf(nx) >= 2)) { i = j; continue; }
          break;
        }
        const m = LIST_RE.exec(cur);
        if (m && indentOf(cur) < 2) {
          if (/\d/.test(m[2]) !== ordered) break;
          items.push({ parts: [{ kind: "text", text: m[3] }], sub: [] });
          i++;
          continue;
        }
        if (indentOf(cur) < 2 && !items.length) break;
        if (indentOf(cur) < 2 && (HEAD_RE.test(cur.trim()) || QUOTE_RE.test(cur))) break;
        const item = items[items.length - 1];
        const q = QUOTE_RE.exec(cur);
        const subLi = LIST_RE.exec(cur);
        const last = item.parts[item.parts.length - 1];
        if (q) {
          if (last.kind === "quote" && !isBlank(lines[i - 1])) last.text += "\n" + q[1];
          else item.parts.push({ kind: "quote", text: q[1] });
        } else if (subLi && indentOf(cur) >= 2) {
          item.sub.push(subLi[3]);
        } else if (indentOf(cur) < 2 && isBlank(lines[i - 1])) {
          break; // an unindented paragraph after a blank line is not this item's
        } else {
          last.text += "\n" + cur.trim();
        }
        i++;
      }
      out.push({ t: "list", ordered, start, items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i])) {
      const l = lines[i];
      if (para.length && (LIST_RE.test(l) || QUOTE_RE.test(l) || HEAD_RE.test(l.trim()))) break;
      para.push(l.trim());
      i++;
    }
    out.push(paragraph(para.join("\n")));
  }

  // "**Aniqroq javob uchun:**" + a list → quick-reply follow-ups (§2.2).
  for (let k = 0; k < out.length - 1; k++) {
    const b = out[k];
    const n = out[k + 1];
    if (b.t === "h" && /aniqroq javob uchun/i.test(b.text) && n.t === "list") {
      const items = n.items.map((it) => it.parts.map((p) => p.text).join(" ").trim()).filter(Boolean);
      out.splice(k, 2, { t: "followups", title: b.text.replace(/:\s*$/, ""), items });
    }
  }
  return out;
}

function paragraph(text: string): MdBlock {
  const lead = /^\*\*([^*]{1,40}?):?\*\*:?\s*([\s\S]+)$/.exec(text);
  if (lead && /qisqa javob|xulosa/i.test(lead[1])) return { t: "lead", label: lead[1].replace(/:$/, ""), text: lead[2] };
  const b = wholeBold(text);
  if (b && b[1].length <= 90) return { t: "h", text: b[1].replace(/:\s*$/, "") };
  const it = wholeItalic(text);
  if (it) {
    const body = (it[1] ?? it[2]).trim();
    return /^manba/i.test(body) ? { t: "footer", text: body } : { t: "note", text: body };
  }
  return { t: "p", text };
}

// Which of §3's answer types this is, so the right action sits under it.
export function classifyAgentAnswer(content: string): AgentKind {
  const s = (content || "").toLowerCase();
  if (/lex\.uz sayti hozir javob bermayapti/.test(s)) return "lex_unavailable";
  if (/^\s*(ai servis bilan aloqa vaqtida xatolik|javob tayyorlashda texnik xatolik)/.test(s)) return "error";
  if (/aniq javob beradigan modda topilmadi/.test(s)) return "not_found";
  if (/hujjat so['ʻ’`]rovi/.test(s)) return "document_request";
  return "answer";
}

// "Mehnat kodeksi, 161-modda. Ishdan bo'shatish" → document, article, heading.
export function splitSourceTitle(title: string): { doc: string; article: string; heading: string } {
  const m = /^(.*?),\s*(\d[^,.]*?modda(?:si)?)\.?\s*(.*)$/i.exec(title.trim());
  if (m) return { doc: m[1].trim(), article: m[2].trim(), heading: m[3].trim() };
  return { doc: title.trim(), article: "", heading: "" };
}

export const normUrl = (u: string) => u.trim().replace(/\/+(?=#|$)/, "");

// Markdown → one line of plain text, for chat-list previews.
export function mdPlain(src: string): string {
  return (src || "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(\d+[.)]|[-*+])\s+/gm, "")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/(^|\W)[_*]([^_*]+)[_*](?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}
