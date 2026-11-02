"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { isAborted } from "@/lib/http";
import { searchTaskUsers, type TaskPerson } from "@/lib/services/taskManagement";
import { IcCheck, IcClose, IcSearch } from "../icons";
import { Face } from "./kit";
import { useTx } from "./text";

export type PersonOpt = { value: string; label: string; sub: string };

export const personOpt = (p: Pick<TaskPerson, "id" | "name" | "lexgoId">): PersonOpt => ({ value: p.id, label: p.name || p.lexgoId || p.id, sub: p.lexgoId });

type Found = { q: string; items: PersonOpt[] };

export default function PeoplePick({ value, onChange, known, disabled, error }: { value: string[]; onChange: (ids: string[]) => void; known: PersonOpt[]; disabled?: boolean; error?: string }) {
  const { t } = useTx();
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [list, setList] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [names, setNames] = useState<Record<string, PersonOpt>>(() => Object.fromEntries(known.map((o) => [o.value, o])));
  const term = q.trim();

  useEffect(() => {
    if (!list) return;
    const c = new AbortController();
    const id = window.setTimeout(
      () => {
        searchTaskUsers(term, c.signal).then(
          (us) => {
            const items = us.map(personOpt);
            setFound({ q: term, items });
            setNames((n) => ({ ...n, ...Object.fromEntries(items.map((o) => [o.value, o])) }));
          },
          (e) => {
            if (!isAborted(e)) setFound({ q: term, items: [] });
          },
        );
      },
      term ? 250 : 0,
    );
    return () => {
      c.abort();
      window.clearTimeout(id);
    };
  }, [term, list]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const waiting = !found || found.q !== term;
  const items = found?.items ?? [];

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && list) {
      e.preventDefault();
      setList(false);
    } else if (e.key === "ArrowDown") {
      const first = box.current?.querySelector<HTMLButtonElement>(".opx-tk-pp__opt");
      if (!first) return;
      e.preventDefault();
      first.focus();
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setList(false);
      input.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const all = [...(box.current?.querySelectorAll<HTMLButtonElement>(".opx-tk-pp__opt") ?? [])];
    const at = all.findIndex((b) => b === document.activeElement);
    e.preventDefault();
    if (e.key === "ArrowUp" && at <= 0) {
      input.current?.focus();
      return;
    }
    all[Math.min(all.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  return (
    <div
      ref={box}
      className={`opx-tk-pp${error ? " has-error" : ""}`}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) setList(false);
      }}
    >
      <label className="opx-tk-lbl" htmlFor={`${uid}-i`}>
        {t("form.assignees")}
      </label>
      {value.length ? (
        <ul className="opx-tk-pp__chips">
          {value.map((id) => {
            const label = names[id]?.label || id;
            return (
              <li key={id}>
                <Face id={id} name={label} size={22} />
                <span>{label}</span>
                <button type="button" onClick={() => toggle(id)} aria-label={t("upload.remove", { name: label })} title={t("upload.remove", { name: label })} disabled={disabled}>
                  <IcClose size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="opx-tk-pp__input">
        <IcSearch size={17} />
        <input
          ref={input}
          id={`${uid}-i`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setList(true);
          }}
          onFocus={() => setList(true)}
          onKeyDown={onInputKey}
          placeholder={value.length ? t("form.assigneesSearch") : t("form.assigneesPh")}
          role="combobox"
          aria-expanded={list}
          aria-controls={`${uid}-l`}
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
        />
      </div>
      {list && !disabled ? (
        <div id={`${uid}-l`} className="opx-tk-pp__list" role="listbox" aria-multiselectable="true" aria-label={t("form.assignees")} onKeyDown={onListKey}>
          {waiting && !items.length ? (
            <p className="opx-tk-pp__none">{t("loading")}</p>
          ) : !items.length ? (
            <p className="opx-tk-pp__none">{t("form.assigneesEmpty")}</p>
          ) : (
            items.map((o) => {
              const on = value.includes(o.value);
              return (
                <button key={o.value} type="button" role="option" aria-selected={on} className="opx-tk-pp__opt" data-on={on || undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => toggle(o.value)}>
                  <Face id={o.value} name={o.label} size={26} />
                  <span className="opx-tk-pp__who">
                    <b>{o.label}</b>
                    {o.sub ? <small className="opx-num">{o.sub}</small> : null}
                  </span>
                  <span className="opx-tk-pp__tick" aria-hidden="true">
                    {on ? <IcCheck size={15} /> : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
      {!value.length ? <small className="opx-tk-pp__hint">{t("form.unassignedHint")}</small> : null}
      {error ? (
        <p className="opx-ferr" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
