"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconMapPin, IconSearch } from "@/components/icons";
import { geocodeSearch, isAborted, mapErrorKey, type MapErrorKey, type Place } from "@/lib/services/mapLocation";

// Address search through the backend geocoder: the keyboard (and no-map)
// way to choose a point — a client's manual starting point, a seller's
// office. Results are places with names, never coordinates.
type Found = { q: string; items: Place[]; fail: MapErrorKey | null };

export default function PlaceSearch({
  url,
  label,
  placeholder,
  onSelect,
  aiId,
  autoFocus,
}: {
  url: string;
  label: string;
  placeholder: string;
  onSelect: (p: Place) => void;
  aiId: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations("marketMap.place");
  const tx = useTranslations("marketMap");
  const locale = useLocale();
  const uid = useId();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [picked, setPicked] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const term = q.trim();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    if (term.length < 2 || term === picked) return;
    const c = new AbortController();
    const timer = window.setTimeout(() => {
      geocodeSearch(term, locale, url, c.signal).then(
        (items) => {
          if (!c.signal.aborted) setFound({ q: term, items, fail: null });
        },
        (e) => {
          if (!c.signal.aborted && !isAborted(e)) setFound({ q: term, items: [], fail: mapErrorKey(e) });
        },
      );
    }, 350);
    return () => {
      window.clearTimeout(timer);
      c.abort();
    };
  }, [term, picked, locale, url]);

  const current = found && found.q === term && term !== picked ? found : null;
  const busy = term.length >= 2 && term !== picked && !current;
  const listId = `${uid}-l`;

  return (
    <div className="mmp" data-ai-id={aiId} data-ai-type="search">
      <label className="mmp__field">
        <span className="sr-only">{label}</span>
        <IconSearch aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          aria-controls={current?.items.length ? listId : undefined}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={200}
        />
        {busy ? <span className="mmp__spin" aria-hidden="true" /> : null}
      </label>
      <p className="sr-only" role="status">
        {busy ? t("searching") : current ? (current.fail ? "" : t("count", { n: current.items.length })) : ""}
      </p>
      {term.length > 0 && term.length < 2 ? <p className="mmp__hint">{t("short")}</p> : null}
      {current?.fail ? (
        <p className="mmp__err" role="alert">
          {current.fail === "generic" || current.fail === "not_found" ? t("error") : tx(`errors.${current.fail}`)}
        </p>
      ) : null}
      {current && !current.fail && !current.items.length ? <p className="mmp__hint">{t("none")}</p> : null}
      {current?.items.length ? (
        <ul id={listId} className="mmp__list" aria-label={t("results")}>
          {current.items.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                onClick={() => {
                  setPicked(p.title);
                  setQ(p.title);
                  onSelect(p);
                }}
                data-ai-id={`${aiId}.result`}
              >
                <IconMapPin aria-hidden="true" />
                <span>
                  <b>{p.title}</b>
                  {p.detail ? <small>{p.detail}</small> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
