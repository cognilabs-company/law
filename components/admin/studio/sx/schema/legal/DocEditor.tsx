"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "../sx-schema.css";
import "./sx-legal.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { BracesIcon, ListOrderedIcon, PilcrowIcon, QuoteIcon } from "lucide-react";
import Menu, { type MenuEntry } from "@/components/ui/Menu";
import IconButton from "@/components/ui/IconButton";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { SxButton } from "../../Button";
import { BoldIcon, EyeIcon, Heading2Icon, ItalicIcon, ListIcon, PencilIcon, UnderlineIcon, glyph } from "../../icons";
import type { SxIcon } from "../../types";
import { RichTextView, sanitizeHtml } from "../RichText";
import { blankHtml, placeholderToken, placeholdersIn, plainLength, type DocField } from "./model";

type Cmd = { key: string; icon: SxIcon; labelKey: string; command: string; arg?: string };

const CMDS: readonly Cmd[] = [
  { key: "bold", icon: BoldIcon, labelKey: "sx.form.rt.bold", command: "bold" },
  { key: "italic", icon: ItalicIcon, labelKey: "sx.form.rt.italic", command: "italic" },
  { key: "underline", icon: UnderlineIcon, labelKey: "sx.form.rt.underline", command: "underline" },
  { key: "heading", icon: Heading2Icon, labelKey: "sx.form.rt.heading", command: "formatBlock", arg: "<h4>" },
  { key: "para", icon: PilcrowIcon, labelKey: "sx.doc.para", command: "formatBlock", arg: "<p>" },
  { key: "list", icon: ListIcon, labelKey: "sx.form.rt.list", command: "insertUnorderedList" },
  { key: "ol", icon: ListOrderedIcon, labelKey: "sx.doc.ol", command: "insertOrderedList" },
  { key: "quote", icon: QuoteIcon, labelKey: "sx.doc.quote", command: "formatBlock", arg: "<blockquote>" },
];

export type DocEditorProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  readOnly?: boolean;
  invalid?: boolean;
  placeholder?: string;
  fields?: readonly DocField[];
  compact?: boolean;
  onBlur?: () => void;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  aiId?: string;
};

function clean(html: string): string {
  const out = sanitizeHtml(html);
  return blankHtml(out) ? "" : out;
}

function exec(command: string, arg?: string): void {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return;
  document.execCommand(command, false, arg);
}

export function DocEditor({
  id,
  value,
  onChange,
  label,
  readOnly = false,
  invalid = false,
  placeholder,
  fields = [],
  compact = false,
  onBlur,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  aiId,
}: DocEditorProps): ReactElement {
  const t = useTranslations("studio");
  const box = useRef<HTMLDivElement>(null);
  const sent = useRef<string | null>(null);
  const range = useRef<Range | null>(null);
  const [preview, setPreview] = useState(false);
  const bad = invalid || ariaInvalid === true;

  useEffect(() => {
    const el = box.current;
    if (!el || preview) return;
    if (sent.current !== null && sent.current === value) return;
    el.innerHTML = sanitizeHtml(value);
    sent.current = value;
  }, [value, preview]);

  const emit = () => {
    const el = box.current;
    if (!el) return;
    const html = clean(el.innerHTML);
    sent.current = html;
    if (html !== value) onChange(html);
  };

  const keep = () => {
    const sel = typeof window === "undefined" ? null : window.getSelection();
    const el = box.current;
    if (!sel || !el || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (el.contains(r.commonAncestorContainer)) range.current = r.cloneRange();
  };

  const focusBack = () => {
    const el = box.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (sel && range.current) {
      sel.removeAllRanges();
      sel.addRange(range.current);
    }
  };

  const apply = (command: string, arg?: string) => {
    focusBack();
    exec("defaultParagraphSeparator", "p");
    exec(command, arg);
    keep();
    emit();
  };

  const insert = (name: string) => {
    focusBack();
    const el = box.current;
    const sel = window.getSelection();
    if (el && sel && (!sel.rangeCount || !el.contains(sel.getRangeAt(0).commonAncestorContainer))) {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    exec("insertText", placeholderToken(name));
    keep();
    emit();
  };


  const used = placeholdersIn(value);
  const known = new Set(fields.map((f) => f.name));
  const unknown = used.filter((n) => !known.has(n));
  const menu: MenuEntry[] = fields.map((f) => ({ key: f.name, label: f.label, hint: placeholderToken(f.name), onSelect: () => insert(f.name), aiId: aiId ? makeAiId(aiId, "insert", f.name) : undefined }));
  const showPh = !readOnly && !preview && !value;

  if (readOnly) {
    return (
      <div className="sx-doc" data-compact={compact ? "" : undefined} data-ro="">
        <div className="sx-doc__desk">
          <div className="sx-doc__page">
            <RichTextView html={value} className="sx-doc__view" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sx-doc" data-compact={compact ? "" : undefined} data-invalid={bad ? "" : undefined} data-preview={preview ? "" : undefined}>
      <div className="sx-doc__bar" role="toolbar" aria-label={t("sx.doc.toolbar")} aria-controls={id}>
        {CMDS.map((c) => (
          <IconButton
            key={c.key}
            className="sx-ibtn"
            size="sm"
            icon={glyph(c.icon, { size: 16 })}
            label={t(c.labelKey)}
            disabled={preview}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(c.command, c.arg)}
            aiId={aiId ? makeAiId(aiId, "doc", c.key) : undefined}
          />
        ))}
        {compact ? null : (
          <Menu
            items={menu}
            label={t("sx.doc.insert")}
            text={t("sx.doc.insert")}
            icon={glyph(BracesIcon, { size: 16 })}
            caret
            size="sm"
            className="sx-pop sx-menu"
            triggerClassName="sx-ibtn sx-doc__insert"
            disabled={preview || !fields.length}
            tip={fields.length ? false : t("sx.doc.insertNone")}
            aiId={aiId ? makeAiId(aiId, "insert") : undefined}
          />
        )}
        <span className="sx-doc__sp" />
        <SxButton variant="ghost" size="sm" icon={preview ? PencilIcon : EyeIcon} aria-pressed={preview} onClick={() => setPreview((p) => !p)} aiId={aiId ? makeAiId(aiId, "doc", "preview") : undefined}>
          {preview ? t("sx.form.rt.write") : t("sx.form.rt.preview")}
        </SxButton>
      </div>
      <div className="sx-doc__desk">
        <div className="sx-doc__page">
          {preview ? (
            <RichTextView html={value} className="sx-doc__view" />
          ) : (
            <div
              ref={box}
              id={id}
              className="sx-doc__edit"
              role="textbox"
              aria-multiline="true"
              aria-label={labelledBy ? undefined : label}
              aria-labelledby={labelledBy}
              aria-describedby={describedBy}
              aria-invalid={bad ? true : undefined}
              aria-required={ariaRequired}
              aria-placeholder={placeholder}
              contentEditable
              suppressContentEditableWarning
              tabIndex={0}
              spellCheck
              data-empty={showPh ? "" : undefined}
              data-ph={placeholder}
              onInput={emit}
              onKeyUp={keep}
              onMouseUp={keep}
              onBlur={() => {
                keep();
                emit();
                onBlur?.();
              }}
              onPaste={(e) => {
                const html = e.clipboardData.getData("text/html");
                const text = e.clipboardData.getData("text/plain");
                if (!html && !text) return;
                e.preventDefault();
                if (html) exec("insertHTML", sanitizeHtml(html));
                else exec("insertText", text);
                emit();
              }}
              data-ai-id={aiId}
              data-ai-type="textarea"
              data-ai-label={label}
            />
          )}
        </div>
      </div>
      <div className="sx-doc__foot">
        <span>{used.length ? t("sx.doc.used", { n: used.length }) : ""}</span>
        {unknown.length && fields.length ? <span className="sx-doc__warn">{t("sx.doc.unknown", { list: unknown.map(placeholderToken).join(", ") })}</span> : null}
        <span className="sx-doc__sp" />
        <span className="sx-num">{t("sx.doc.chars", { n: plainLength(value) })}</span>
      </div>
    </div>
  );
}
