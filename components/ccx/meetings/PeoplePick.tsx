"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import type { SearchOption } from "@/components/SearchSelect";
import { IcCheck, IcClose, IcSearch, IcUser } from "../icons";
import { avatarText } from "./model";

type Props = {
  label: string;
  value: SearchOption[];
  onChange: (next: SearchOption[]) => void;
  search: (q: string) => Promise<SearchOption[]>;
  error?: string;
};

export default function PeoplePick({ label, value, onChange, search, error }: Props) {
  const t = useTranslations("admin.meetings");
  const ts = useTranslations("common.searchSelect");
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef(search);
  const query = q.trim();

  useEffect(() => {
    searchRef.current = search;
  });

  useEffect(() => {
    if (!query) return;
    let alive = true;
    const timer = setTimeout(() => {
      searchRef
        .current(query)
        .then((list) => {
          if (!alive) return;
          setHits(list);
          setFailed(false);
          setCursor(0);
        })
        .catch(() => {
          if (!alive) return;
          setHits([]);
          setFailed(true);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const picked = new Set(value.map((p) => p.value));
  const show = open && Boolean(query);
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const optId = (i: number) => `${id}-opt${i}`;

  function type(next: string) {
    setQ(next);
    setOpen(true);
    const nq = next.trim();
    if (nq === query) return;
    setFailed(false);
    if (!nq) {
      setHits([]);
      setLoading(false);
    } else setLoading(true);
  }

  function toggle(o: SearchOption) {
    onChange(picked.has(o.value) ? value.filter((p) => p.value !== o.value) : [...value, o]);
    setQ("");
    setHits([]);
    setLoading(false);
    setOpen(false);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => (c + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && show) {
      e.preventDefault();
      const o = hits[cursor];
      if (o && !loading) toggle(o);
    } else if (e.key === "Escape" && show) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Backspace" && !q && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className={`opx-field opx-mtg-pick${error ? " has-error" : ""}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor={`${id}-in`}>
        {label}
        <i aria-hidden="true">*</i>
      </label>
      <div className="opx-mtg-pick__wrap">
        <div className="opx-mtg-pick__box">
          <IcSearch size={17} />
          <input
            id={`${id}-in`}
            role="combobox"
            aria-expanded={show}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={show && hits[cursor] ? optId(cursor) : undefined}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${hintId} ${errId}` : hintId}
            value={q}
            placeholder={t("participantsSearch")}
            autoComplete="off"
            onChange={(e) => type(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
          />
          {loading ? <i className="opx-mtg-spin" aria-hidden="true" /> : null}
        </div>
        {show ? (
          <div className="opx-mtg-pick__menu">
            {loading && !hits.length ? (
              <p role="status">{ts("searching")}</p>
            ) : failed ? (
              <p role="alert">{ts("failed")}</p>
            ) : !hits.length ? (
              <p role="status">{t("participantsEmpty")}</p>
            ) : (
              <ul id={listId} role="listbox" aria-label={label} aria-multiselectable="true">
                {hits.map((o, i) => {
                  const on = picked.has(o.value);
                  return (
                    <li
                      key={o.value}
                      id={optId(i)}
                      role="option"
                      aria-selected={on}
                      className={i === cursor ? "is-cur" : undefined}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => toggle(o)}
                    >
                      <span className="opx-mtg-av" aria-hidden="true">
                        {avatarText(o.label) || <IcUser size={15} />}
                      </span>
                      <span className="opx-mtg-pick__txt">
                        <b>{o.label}</b>
                        {o.sub ? <small className="opx-num">{o.sub}</small> : null}
                      </span>
                      {o.tag ? <em>{o.tag}</em> : null}
                      {on ? <IcCheck size={16} className="opx-mtg-pick__on" /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
      <span className="opx-sr" id={hintId}>
        {t("participantsHint")}
      </span>
      {error ? (
        <p className="opx-ferr" id={errId} role="alert">
          {error}
        </p>
      ) : null}
      {value.length ? (
        <ul className="opx-mtg-chips" aria-label={ts("chosen")}>
          {value.map((p) => (
            <li key={p.value}>
              <span className="opx-mtg-av" aria-hidden="true">
                {avatarText(p.label) || <IcUser size={14} />}
              </span>
              <b>{p.label}</b>
              {p.tag ? <small>{p.tag}</small> : null}
              <button type="button" aria-label={ts("remove", { name: p.label })} title={ts("remove", { name: p.label })} onClick={() => onChange(value.filter((x) => x.value !== p.value))}>
                <IcClose size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
