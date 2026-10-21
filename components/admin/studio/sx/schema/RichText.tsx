"use client";

import "../sx-core.css";
import "../sx-form.css";
import "./sx-schema.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { SxButton } from "../Button";
import { EyeIcon, LinkIcon, ListIcon, PencilIcon, BoldIcon, Heading2Icon, ItalicIcon, UnderlineIcon, glyph } from "../icons";
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

type Cmd = { key: string; icon: SxIcon; command: string; arg?: string };

const CMDS: readonly Cmd[] = [
  { key: "bold", icon: BoldIcon, command: "bold" },
  { key: "italic", icon: ItalicIcon, command: "italic" },
  { key: "underline", icon: UnderlineIcon, command: "underline" },
  { key: "list", icon: ListIcon, command: "insertUnorderedList" },
  { key: "heading", icon: Heading2Icon, command: "formatBlock", arg: "<h4>" },
];

function exec(command: string, arg?: string): void {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return;
  document.execCommand(command, false, arg);
}

function blank(html: string): boolean {
  return !String(html ?? "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function href(v: string): string {
  const u = v.trim();
  if (!u) return "";
  return /^(https?:|mailto:)/i.test(u) ? u : `https://${u}`;
}

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
  onBlur,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  aiId,
}: RichTextProps): ReactElement {
  const t = useTranslations("studio");
  const box = useRef<HTMLDivElement>(null);
  const sent = useRef<string | null>(null);
  const mark = useRef<Range | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState("");
  const bad = invalid || ariaInvalid === true;

  useEffect(() => {
    const el = box.current;
    if (!el || preview || readOnly) return;
    if (sent.current !== null && sent.current === value) return;
    el.innerHTML = sanitizeHtml(value);
    sent.current = value;
  }, [value, preview, readOnly]);

  useEffect(() => {
    if (linking) urlRef.current?.focus();
  }, [linking]);

  const emit = () => {
    const el = box.current;
    if (!el) return;
    const out = sanitizeHtml(el.innerHTML);
    const html = blank(out) ? "" : out;
    sent.current = html;
    if (html !== value) onChange(html);
  };

  const keep = () => {
    const sel = typeof window === "undefined" ? null : window.getSelection();
    const el = box.current;
    if (!sel || !el || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (el.contains(r.commonAncestorContainer)) mark.current = r.cloneRange();
  };

  const focusBack = () => {
    const el = box.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (sel && mark.current) {
      sel.removeAllRanges();
      sel.addRange(mark.current);
    }
  };

  const apply = (cmd: Cmd) => {
    focusBack();
    exec("defaultParagraphSeparator", "p");
    exec(cmd.command, cmd.arg);
    keep();
    emit();
  };

  const applyLink = () => {
    const to = href(url);
    focusBack();
    if (!to) exec("unlink");
    else {
      const sel = window.getSelection();
      if (sel && sel.isCollapsed) exec("insertHTML", `<a href="${esc(to)}">${esc(to)}</a>`);
      else exec("createLink", to);
    }
    setLinking(false);
    setUrl("");
    keep();
    emit();
  };

  if (readOnly) return <RichTextView html={value} />;

  return (
    <div className="sx-sf-rt" data-invalid={bad ? "" : undefined} data-preview={preview ? "" : undefined}>
      <div className="sx-sf-rt__bar" role="toolbar" aria-label={t("sx.form.rt.toolbar")} aria-controls={id}>
        {CMDS.map((cmd) => (
          <IconButton
            key={cmd.key}
            className="sx-ibtn"
            size="sm"
            icon={glyph(cmd.icon, { size: 16 })}
            label={t(`sx.form.rt.${cmd.key}`)}
            disabled={preview}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(cmd)}
            aiId={aiId ? makeAiId(aiId, "rt", cmd.key) : undefined}
          />
        ))}
        <IconButton
          className="sx-ibtn"
          size="sm"
          icon={glyph(LinkIcon, { size: 16 })}
          label={t("sx.form.rt.link")}
          disabled={preview}
          aria-pressed={linking}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            keep();
            setLinking((v) => !v);
          }}
          aiId={aiId ? makeAiId(aiId, "rt", "link") : undefined}
        />
        <span className="sx-sf-rt__sp" />
        <SxButton
          variant="ghost"
          size="sm"
          icon={preview ? PencilIcon : EyeIcon}
          aria-pressed={preview}
          onClick={() => setPreview((p) => !p)}
          aiId={aiId ? makeAiId(aiId, "rt", "preview") : undefined}
        >
          {preview ? t("sx.form.rt.write") : t("sx.form.rt.preview")}
        </SxButton>
      </div>
      {linking && !preview ? (
        <div className="sx-sf-rt__link">
          <input
            ref={urlRef}
            type="url"
            className="sx-sf-rt__url"
            value={url}
            placeholder={t("sx.form.rt.linkPh")}
            aria-label={t("sx.form.rt.link")}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setLinking(false);
                setUrl("");
              }
            }}
          />
          <SxButton variant="ghost" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={applyLink}>
            {t("sx.form.rt.linkApply")}
          </SxButton>
        </div>
      ) : null}
      {preview ? (
        <RichTextView html={value} />
      ) : (
        <div
          ref={box}
          id={id}
          className="sx-sf-rt__edit"
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
          data-empty={!value ? "" : undefined}
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
  );
}
