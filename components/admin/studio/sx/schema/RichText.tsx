"use client";

import "../sx-core.css";
import "../sx-form.css";
import "./sx-schema.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { SxButton } from "../Button";
import { EyeIcon, LinkSimpleIcon, ListBulletsIcon, PencilSimpleIcon, TextBIcon, TextHTwoIcon, TextItalicIcon, TextUnderlineIcon, glyph } from "../icons";
import { TextArea } from "../form/TextArea";
import type { SxIcon } from "../types";

const SAFE_TAGS = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "H3", "H4", "A", "BLOCKQUOTE"]);

export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(`<div>${String(html ?? "")}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      if (!SAFE_TAGS.has(child.tagName)) {
        const keep = child.tagName === "SCRIPT" || child.tagName === "STYLE" || child.tagName === "TEMPLATE" ? [] : [...child.childNodes];
        child.replaceWith(...keep);
        continue;
      }
      for (const a of [...child.attributes]) {
        const ok = child.tagName === "A" && a.name === "href" && /^(https?:|mailto:)/i.test(a.value.trim());
        if (!ok) child.removeAttribute(a.name);
      }
      if (child.tagName === "A") child.setAttribute("rel", "noopener noreferrer");
      walk(child);
    }
  };
  let guard = 0;
  while (guard < 8 && [...root.querySelectorAll("*")].some((el) => !SAFE_TAGS.has(el.tagName))) {
    walk(root);
    guard += 1;
  }
  walk(root);
  return root.innerHTML;
}

type Tool = { key: string; icon: SxIcon; open: string; close: string };

const TOOLS: readonly Tool[] = [
  { key: "bold", icon: TextBIcon, open: "<b>", close: "</b>" },
  { key: "italic", icon: TextItalicIcon, open: "<i>", close: "</i>" },
  { key: "underline", icon: TextUnderlineIcon, open: "<u>", close: "</u>" },
  { key: "list", icon: ListBulletsIcon, open: "<ul>\n<li>", close: "</li>\n</ul>" },
  { key: "heading", icon: TextHTwoIcon, open: "<h4>", close: "</h4>" },
  { key: "link", icon: LinkSimpleIcon, open: '<a href="https://">', close: "</a>" },
];

export type RichTextProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  readOnly?: boolean;
  invalid?: boolean;
  placeholder?: string;
  maxLength?: number;
  onBlur?: () => void;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  aiId?: string;
};

export function RichTextView({ html, className }: { html: string; className?: string }): ReactElement {
  const t = useTranslations("studio");
  const [safe, setSafe] = useState<{ src: string; out: string } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => {
      if (live) setSafe({ src: html, out: sanitizeHtml(html) });
    });
    return () => {
      live = false;
    };
  }, [html]);
  const out = safe && safe.src === html ? safe.out : "";
  if (!out.trim()) return <div className={className ?? "sx-sf-rt__view"} data-empty="">{t("sx.ui.notSet")}</div>;
  return <div className={className ?? "sx-sf-rt__view"} dangerouslySetInnerHTML={{ __html: out }} />;
}

export function RichText({
  id,
  value,
  onChange,
  label,
  readOnly = false,
  invalid = false,
  placeholder,
  maxLength,
  onBlur,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  aiId,
}: RichTextProps): ReactElement {
  const t = useTranslations("studio");
  const [preview, setPreview] = useState(false);
  const bad = invalid || ariaInvalid === true;

  if (readOnly) return <RichTextView html={value} />;

  const wrap = (tool: Tool) => {
    const el = document.getElementById(id) as HTMLTextAreaElement | null;
    const s = el?.selectionStart ?? value.length;
    const e = el?.selectionEnd ?? value.length;
    const next = `${value.slice(0, s)}${tool.open}${value.slice(s, e)}${tool.close}${value.slice(e)}`;
    onChange(next);
    const caretStart = tool.key === "link" ? s + tool.open.indexOf("https://") + 8 : s + tool.open.length;
    const caretEnd = tool.key === "link" ? caretStart : e + tool.open.length;
    requestAnimationFrame(() => {
      const box = document.getElementById(id) as HTMLTextAreaElement | null;
      if (!box) return;
      box.focus();
      box.setSelectionRange(caretStart, caretEnd);
    });
  };

  return (
    <div className="sx-sf-rt" data-invalid={bad ? "" : undefined} data-preview={preview ? "" : undefined}>
      <div className="sx-sf-rt__bar" role="toolbar" aria-label={t("sx.form.rt.toolbar")} aria-controls={id}>
        {TOOLS.map((tool) => (
          <IconButton
            key={tool.key}
            className="sx-ibtn"
            size="sm"
            icon={glyph(tool.icon, { size: 16 })}
            label={t(`sx.form.rt.${tool.key}`)}
            disabled={preview}
            onClick={() => wrap(tool)}
            aiId={aiId ? makeAiId(aiId, "rt", tool.key) : undefined}
          />
        ))}
        <span className="sx-sf-rt__sp" />
        <SxButton
          variant="ghost"
          size="sm"
          icon={preview ? PencilSimpleIcon : EyeIcon}
          aria-pressed={preview}
          onClick={() => setPreview((p) => !p)}
          aiId={aiId ? makeAiId(aiId, "rt", "preview") : undefined}
        >
          {preview ? t("sx.form.rt.write") : t("sx.form.rt.preview")}
        </SxButton>
      </div>
      {preview ? (
        <RichTextView html={value} />
      ) : (
        <TextArea
          id={id}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          invalid={bad}
          minRows={5}
          maxRows={16}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-label={labelledBy ? undefined : label}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-required={ariaRequired}
          aiId={aiId}
          aiLabel={label}
        />
      )}
    </div>
  );
}
