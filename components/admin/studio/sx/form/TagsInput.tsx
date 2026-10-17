"use client";

import "../sx-core.css";
import "../sx-form.css";
import { useLayoutEffect, useRef, useState, type ClipboardEvent, type FocusEvent, type KeyboardEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { XIcon, glyph } from "../icons";
import { focusBoxInput } from "./TextInput";

export type TagsInputProps = {
  id: string;
  value: readonly string[];
  onChange: (next: string[]) => void;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  max?: number;
  onBlur?: () => void;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  aiId?: string;
};

const fold = (s: string) => s.trim().toLocaleLowerCase();

export function splitTags(text: string): string[] {
  return String(text ?? "")
    .split(/[\n\r,]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function mergeTags(current: readonly string[], add: readonly string[]): string[] {
  const out = current.slice();
  const seen = new Set(out.map(fold));
  for (const raw of add) {
    const s = raw.replace(/\s+/g, " ").trim();
    if (!s || seen.has(fold(s))) continue;
    seen.add(fold(s));
    out.push(s);
  }
  return out;
}

type Focus = { kind: "chip"; index: number } | { kind: "input" } | null;

export function TagsInput({
  id,
  value,
  onChange,
  label,
  placeholder,
  readOnly = false,
  disabled = false,
  invalid = false,
  max,
  onBlur,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  aiId,
}: TagsInputProps): ReactElement {
  const t = useTranslations("studio");
  const [text, setText] = useState("");
  const [editAt, setEditAt] = useState<number | null>(null);
  const [say, setSay] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<Focus>(null);
  const bad = invalid || ariaInvalid === true;
  const items = value.filter((v) => typeof v === "string" && v.trim());
  const full = max !== undefined && items.length >= max;

  useLayoutEffect(() => {
    const want = pending.current;
    if (!want) return;
    pending.current = null;
    if (want.kind === "input") {
      inputRef.current?.focus();
      return;
    }
    const chips = listRef.current?.querySelectorAll<HTMLButtonElement>(".sx-tags__chip");
    const chip = chips && chips.length ? chips[Math.max(0, Math.min(want.index, chips.length - 1))] : null;
    if (chip) chip.focus();
    else inputRef.current?.focus();
  });

  const focusNow = (want: Exclude<Focus, null>) => {
    if (want.kind === "input") {
      inputRef.current?.focus();
      return;
    }
    const chips = listRef.current?.querySelectorAll<HTMLButtonElement>(".sx-tags__chip");
    const chip = chips && chips.length ? chips[Math.max(0, Math.min(want.index, chips.length - 1))] : null;
    if (chip) chip.focus();
    else inputRef.current?.focus();
  };

  const commit = (raw: string): boolean => {
    const parts = splitTags(raw);
    if (!parts.length) {
      setText("");
      return false;
    }
    const base = items.slice();
    const at = editAt === null ? base.length : Math.min(editAt, base.length);
    const seen = new Set(base.map(fold));
    const fresh: string[] = [];
    let dup = false;
    for (const p of parts) {
      if (seen.has(fold(p))) {
        dup = true;
        continue;
      }
      if (max !== undefined && base.length + fresh.length >= max) break;
      seen.add(fold(p));
      fresh.push(p);
    }
    setText("");
    setEditAt(null);
    if (fresh.length) {
      onChange([...base.slice(0, at), ...fresh, ...base.slice(at)]);
      setSay(t("sx.tags.added", { name: fresh.join(", ") }));
    } else if (dup) setSay(t("sx.tags.duplicate"));
    return fresh.length > 0;
  };

  const removeAt = (index: number, focusNext: boolean) => {
    const name = items[index];
    if (name === undefined) return;
    onChange(items.filter((_, i) => i !== index));
    setSay(t("sx.tags.removed", { name }));
    if (focusNext) pending.current = index > 0 ? { kind: "chip", index: index - 1 } : { kind: "input" };
  };

  const editChip = (index: number) => {
    const name = items[index];
    if (name === undefined || readOnly || disabled) return;
    const keep = text.trim() ? mergeTags([], splitTags(text)) : [];
    const rest = items.filter((_, i) => i !== index);
    onChange(keep.length ? mergeTags(rest, keep) : rest);
    setText(name);
    setEditAt(index);
    pending.current = { kind: "input" };
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      if (!text.trim()) {
        if (e.key === ",") e.preventDefault();
        return;
      }
      e.preventDefault();
      commit(text);
      return;
    }
    if (e.key === "Tab" && !e.shiftKey && text.trim()) {
      e.preventDefault();
      commit(text);
      return;
    }
    const input = e.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    if (e.key === "Backspace" && !text && items.length) {
      e.preventDefault();
      focusNow({ kind: "chip", index: items.length - 1 });
      return;
    }
    if (e.key === "ArrowLeft" && atStart && items.length) {
      e.preventDefault();
      focusNow({ kind: "chip", index: items.length - 1 });
    }
  };

  const onChipKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      if (!readOnly && !disabled) removeAt(index, true);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusNow({ kind: "chip", index: Math.max(0, index - 1) });
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusNow(index + 1 < items.length ? { kind: "chip", index: index + 1 } : { kind: "input" });
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const data = e.clipboardData.getData("text");
    if (!/[\n\r,]/.test(data)) return;
    e.preventDefault();
    commit(`${text}${data}`);
  };

  const onBoxBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    if (next && e.currentTarget.contains(next)) return;
    if (text.trim()) commit(text);
    onBlur?.();
  };

  if (readOnly) {
    return (
      <div className="sx-tags" data-ro="" id={id} role="group" aria-labelledby={labelledBy} aria-describedby={describedBy}>
        {items.length ? (
          <ul className="sx-tags__list" aria-label={t("sx.tags.listLabel", { label })}>
            {items.map((name, i) => (
              <li key={`${i}:${name}`} className="sx-tags__item">
                <span className="sx-tags__chip" data-static="">
                  {name}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="sx-tags__none">{t("sx.ui.notSet")}</span>
        )}
      </div>
    );
  }

  return (
    <div
      className="sx-tags"
      data-invalid={bad ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      onMouseDown={focusBoxInput}
      onBlur={onBoxBlur}
    >
      {items.length ? (
        <ul className="sx-tags__list" ref={listRef} aria-label={t("sx.tags.listLabel", { label })}>
          {items.map((name, i) => (
            <li key={`${i}:${name}`} className="sx-tags__item">
              <button
                type="button"
                className="sx-tags__chip"
                aria-label={t("sx.tags.edit", { name })}
                disabled={disabled}
                onClick={() => editChip(i)}
                onKeyDown={(e) => onChipKey(e, i)}
                data-ai-id={aiId ? makeAiId(aiId, "tag", i) : undefined}
                data-ai-type={aiId ? "button" : undefined}
                data-ai-label={aiId ? name : undefined}
              >
                {name}
              </button>
              <IconButton
                className="sx-ibtn sx-tags__x"
                size="sm"
                tip={false}
                disabled={disabled}
                icon={glyph(XIcon, { size: 14 })}
                label={t("sx.tags.remove", { name })}
                onClick={() => removeAt(i, true)}
                aiId={aiId ? makeAiId(aiId, "tag", i, "remove") : undefined}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="sx-tags__input"
        value={text}
        placeholder={full ? undefined : (placeholder ?? t("sx.tags.placeholder"))}
        disabled={disabled || (full && !text)}
        autoComplete="off"
        enterKeyHint="enter"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={bad ? true : undefined}
        aria-required={ariaRequired}
        onChange={(e) => {
          const v = e.target.value;
          if (/[\n\r,]/.test(v)) commit(v);
          else setText(v);
        }}
        onKeyDown={onInputKey}
        onPaste={onPaste}
        data-ai-id={aiId}
        data-ai-type={aiId ? "input" : undefined}
        data-ai-label={aiId ? label : undefined}
      />
      <span className="sx-vh" aria-live="polite">
        {say}
      </span>
    </div>
  );
}
