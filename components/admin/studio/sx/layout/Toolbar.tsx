"use client";

import "../sx-core.css";
import "../sx-layout.css";
import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { layerCount } from "@/lib/layers";
import { SxButton } from "../Button";
import { TextInput } from "../form/TextInput";
import { glyph, RotateCcwIcon, SearchIcon, XIcon } from "../icons";

export type SxToolbarProps = {
  search?: { value: string; onChange: (v: string) => void; placeholder: string; label: string; aiId?: string };
  children?: ReactNode;
  count?: ReactNode;
  end?: ReactNode;
  active?: boolean;
  onReset?: () => void;
  aiId?: string;
};

const EDITABLE = "input,textarea,select,[contenteditable]:not([contenteditable='false'])";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return !!target.closest(EDITABLE);
}

function firstVisibleSearch(): HTMLInputElement | null {
  const all = document.querySelectorAll<HTMLInputElement>(".sx-toolbar__search input");
  for (const el of all) {
    if (!el.disabled && el.getClientRects().length > 0) return el;
  }
  return null;
}

function ToolbarSearch({ value, onChange, placeholder, label, aiId }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; aiId: string }): ReactElement {
  const t = useTranslations("studio");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const slash = e.key === "/" || (e.code === "Slash" && !e.shiftKey);
      if (!slash || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented) return;
      if (isEditable(e.target) || layerCount() > 0) return;
      const input = inputRef.current;
      if (!input || firstVisibleSearch() !== input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const filled = value !== "";

  const clear = () => {
    onChange("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
    if (filled) {
      e.preventDefault();
      e.stopPropagation();
      onChange("");
      return;
    }
    e.currentTarget.blur();
  };

  return (
    <div className="sx-toolbar__search" data-filled={filled ? "" : undefined}>
      <TextInput
        ref={inputRef}
        type="search"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts="/"
        leading={SearchIcon}
        enterKeyHint="search"
        aiId={aiId}
        aiLabel={label}
        trailing={
          filled ? (
            <button
              type="button"
              className="sx-toolbar__clear"
              aria-label={t("sx.search.clear")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={clear}
            >
              {glyph(XIcon, { size: 16 })}
            </button>
          ) : (
            <kbd className="sx-toolbar__kbd" aria-hidden="true" title={t("sx.search.hint")}>
              /
            </kbd>
          )
        }
      />
    </div>
  );
}

export function SxToolbar({ search, children, count, end, active = false, onReset, aiId }: SxToolbarProps): ReactElement {
  const t = useTranslations("studio");
  const base = aiId ?? "admin.studio.toolbar";
  return (
    <div className="sx-toolbar" data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined}>
      {search ? (
        <ToolbarSearch
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder}
          label={search.label}
          aiId={search.aiId ?? aiIdOf(base, "search")}
        />
      ) : null}
      {children ? <div className="sx-toolbar__filters">{children}</div> : null}
      <div className="sx-toolbar__count" role="status">
        {count === undefined || count === null || count === false || count === "" ? null : count}
      </div>
      {active && onReset ? (
        <SxButton variant="ghost" size="sm" icon={RotateCcwIcon} onClick={onReset} aiId={aiIdOf(base, "reset")}>
          {t("sx.table.reset")}
        </SxButton>
      ) : null}
      {end ? <div className="sx-toolbar__end">{end}</div> : null}
    </div>
  );
}
