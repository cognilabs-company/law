"use client";

import "../sx-core.css";
import "../sx-form.css";
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { SxButton } from "../Button";
import { PlusIcon, Trash2Icon, CircleAlertIcon, glyph } from "../icons";
import { useStudioLabels } from "../useStudioLabels";
import { hasKey, kvKind, renameKey, withoutKey } from "./logic";
import { NumberInput } from "./NumberInput";
import { Switch } from "./Switch";
import { TextInput } from "./TextInput";

export type KeyValueProps = {
  id: string;
  label: string;
  value: Readonly<Record<string, unknown>>;
  onChange: (next: Record<string, unknown>) => void;
  nameOf?: (key: string) => string | null;
  readOnly?: boolean;
  aiId?: string;
};

type Edit = { key: string; text: string; dup: boolean };
type Part = "name" | "value" | "remove";
type Commit = "enter" | "row" | "away";

const FRESH = "\u0000new";
const PARTS: Readonly<Record<Part, string>> = {
  name: ".sx-kv__name input",
  value: ".sx-kv__value input, .sx-kv__value button",
  remove: ".sx-kv__row > .ibtn",
};

export function KeyValue({ id, label, value, onChange, nameOf, readOnly = false, aiId }: KeyValueProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const source = value ?? {};
  const entries = Object.entries(source);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [fresh, setFresh] = useState(false);
  const [unread, setUnread] = useState<Readonly<Record<string, unknown>>>({});
  const listRef = useRef<HTMLUListElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<{ key: string; part: Part } | "add" | null>(null);

  useLayoutEffect(() => {
    const want = focusNext.current;
    if (!want) return;
    focusNext.current = null;
    if (want === "add") {
      footRef.current?.querySelector<HTMLElement>("button")?.focus();
      return;
    }
    const rows = listRef.current ? Array.from(listRef.current.children) : [];
    const row = rows.find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.kvKey === want.key);
    if (!row) return;
    const order: Part[] = [want.part, "value", "name", "remove"];
    for (const part of order) {
      const target = row.querySelector<HTMLElement>(PARTS[part]);
      if (target) {
        target.focus();
        return;
      }
    }
  });

  const set = (key: string, next: unknown) => onChange({ ...source, [key]: next });

  const displayName = (key: string): string => nameOf?.(key) || key;

  const textFor = (key: string): string => (edit && edit.key === key ? edit.text : key === FRESH ? "" : key);

  const commitName = (key: string, how: Commit) => {
    const text = textFor(key).trim();
    const follow = how !== "away";
    if (key === FRESH) {
      if (!text) {
        setEdit(null);
        return;
      }
      if (hasKey(source, text)) {
        setEdit({ key, text, dup: true });
        return;
      }
      setEdit(null);
      setFresh(false);
      if (follow) focusNext.current = { key: text, part: "value" };
      onChange({ ...source, [text]: "" });
      return;
    }
    if (!text || text === key) {
      setEdit(null);
      return;
    }
    if (hasKey(source, text)) {
      setEdit({ key, text, dup: true });
      return;
    }
    setEdit(null);
    if (hasKey(unread, key)) setUnread((u) => withoutKey(u, key));
    if (follow) focusNext.current = { key: text, part: how === "enter" ? "name" : "value" };
    onChange(renameKey(source, key, text));
  };

  const onNameKey = (e: KeyboardEvent<HTMLInputElement>, key: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitName(key, "enter");
      return;
    }
    if (e.key === "Escape" && (edit?.key === key || key === FRESH)) {
      e.preventDefault();
      e.stopPropagation();
      setEdit(null);
      if (key === FRESH) {
        setFresh(false);
        focusNext.current = "add";
      }
    }
  };

  const removeRow = (key: string, index: number) => {
    const next = withoutKey(source, key);
    const left = Object.keys(next);
    focusNext.current = left.length ? { key: left[Math.min(index, left.length - 1)], part: "remove" } : "add";
    if (edit?.key === key) setEdit(null);
    if (hasKey(unread, key)) setUnread((u) => withoutKey(u, key));
    onChange(next);
  };

  const markUnread = (key: string, bad: boolean, v: unknown) => {
    if (bad === (hasKey(unread, key) && Object.is(unread[key], v))) return;
    setUnread((u) => (bad ? { ...u, [key]: v } : withoutKey(u, key)));
  };

  const isUnread = (key: string): boolean => hasKey(unread, key) && hasKey(source, key) && Object.is(unread[key], source[key]);

  const valueControl = (key: string, v: unknown, name: string, noteId: string): ReactNode => {
    const kind = kvKind(v);
    const aria = `${t("sx.kv.value")}: ${name}`;
    if (readOnly) {
      if (kind === "nested") return <span className="sx-kv__nested">{t("sx.kv.nested")}</span>;
      if (kind === "boolean") return t(v ? "sx.ui.yes" : "sx.ui.no");
      if (kind === "number") return labels.num(v as number);
      if (kind === "empty" || v === "") return <span className="sx-kv__nested">{t("sx.ui.notSet")}</span>;
      return String(v);
    }
    if (kind === "nested") return <span className="sx-kv__nested">{t("sx.kv.nested")}</span>;
    if (kind === "boolean") return <Switch checked={v as boolean} onChange={(c) => set(key, c)} aria-label={aria} aiId={aiId ? makeAiId(aiId, key, "value") : undefined} />;
    if (kind === "number")
      return (
        <NumberInput
          value={v as number}
          onChange={(n) => {
            if (n !== undefined) set(key, n);
          }}
          onDraftInvalid={(bad) => markUnread(key, bad, v)}
          invalid={isUnread(key)}
          aria-label={aria}
          aria-describedby={isUnread(key) ? noteId : undefined}
          aiId={aiId ? makeAiId(aiId, key, "value") : undefined}
        />
      );
    return (
      <TextInput
        value={typeof v === "string" ? v : ""}
        onChange={(s) => set(key, s)}
        aria-label={aria}
        aiId={aiId ? makeAiId(aiId, key, "value") : undefined}
      />
    );
  };

  const nameControl = (key: string): ReactNode => {
    const known = key !== FRESH ? nameOf?.(key) : null;
    if (known || readOnly) {
      return (
        <>
          <span>{known || key}</span>
          {known ? <span className="sx-code">{key}</span> : null}
        </>
      );
    }
    const bad = edit?.key === key && edit.dup;
    return (
      <TextInput
        mono
        value={textFor(key)}
        invalid={bad}
        aria-label={t("sx.kv.name")}
        aria-describedby={bad ? `${uid}-dup` : undefined}
        onFocus={() => {
          if (!edit || edit.key !== key) setEdit({ key, text: textFor(key), dup: false });
        }}
        onChange={(text) => setEdit({ key, text, dup: false })}
        onBlur={(e) => {
          const next = e.relatedTarget;
          const row = e.currentTarget.closest(".sx-kv__row");
          commitName(key, next instanceof Node && !row?.contains(next) ? "away" : "row");
        }}
        onKeyDown={(e) => onNameKey(e, key)}
        aiId={aiId ? makeAiId(aiId, key === FRESH ? "new" : key, "name") : undefined}
      />
    );
  };

  const dupNote = (key: string): ReactNode =>
    edit?.key === key && edit.dup ? (
      <p className="sx-field__err sx-kv__err" id={`${uid}-dup`}>
        {glyph(CircleAlertIcon, { size: 14 })}
        <span>{t("sx.kv.dup")}</span>
      </p>
    ) : null;

  const empty = entries.length === 0 && !fresh;

  return (
    <div className="sx-kv" id={id} data-ro={readOnly ? "" : undefined}>
      {empty ? (
        <p className="sx-kv__empty">{t("sx.kv.empty")}</p>
      ) : (
        <>
          <div className="sx-kv__head" aria-hidden="true">
            <span>{t("sx.kv.name")}</span>
            <span>{t("sx.kv.value")}</span>
          </div>
          <ul ref={listRef} className="sx-kv__list" role="list" aria-label={label}>
            {entries.map(([key, v], index) => {
              const name = displayName(key);
              const noteId = `${uid}-num${index}`;
              return (
                <li key={key} className="sx-kv__row" data-kv-key={key}>
                  <div className="sx-kv__name">{nameControl(key)}</div>
                  <div className="sx-kv__value">{valueControl(key, v, name, noteId)}</div>
                  {readOnly ? null : (
                    <IconButton
                      className="sx-ibtn"
                      size="sm"
                      tip={false}
                      icon={glyph(Trash2Icon, { size: 16 })}
                      label={t("sx.kv.removeRow", { name })}
                      onClick={() => removeRow(key, index)}
                      aiId={aiId ? makeAiId(aiId, key, "remove") : undefined}
                    />
                  )}
                  {dupNote(key)}
                  {!readOnly && isUnread(key) ? (
                    <p className="sx-field__err sx-kv__err" id={noteId} data-for="value">
                      {glyph(CircleAlertIcon, { size: 14 })}
                      <span>{labels.error("@number")}</span>
                    </p>
                  ) : null}
                </li>
              );
            })}
            {fresh && !readOnly ? (
              <li className="sx-kv__row" data-kv-key={FRESH}>
                <div className="sx-kv__name">{nameControl(FRESH)}</div>
                <div className="sx-kv__value" />
                <IconButton
                  className="sx-ibtn"
                  size="sm"
                  tip={false}
                  icon={glyph(Trash2Icon, { size: 16 })}
                  label={t("sx.ui.cancel")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setEdit(null);
                    setFresh(false);
                    focusNext.current = "add";
                  }}
                />
                {dupNote(FRESH)}
              </li>
            ) : null}
          </ul>
        </>
      )}
      {readOnly ? null : (
        <div className="sx-kv__foot" ref={footRef}>
          <SxButton
            variant="add"
            size="sm"
            icon={PlusIcon}
            disabled={fresh}
            onClick={() => {
              setFresh(true);
              setEdit({ key: FRESH, text: "", dup: false });
              focusNext.current = { key: FRESH, part: "name" };
            }}
            aiId={aiId ? makeAiId(aiId, "add") : undefined}
          >
            {t("sx.kv.add")}
          </SxButton>
        </div>
      )}
    </div>
  );
}
