"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconInfo, IconMapPin, IconSearch } from "@/components/icons";
import { geocodeSearch, geocoderFailOf, isAborted, type GeocoderFail, type Place } from "@/lib/services/mapLocation";

// Address search through the backend geocoder: the keyboard (and no-map)
// way to choose a point — a client's manual starting point, a seller's
// office. Results are places with names, never coordinates. When the
// geocoder is down (§7.1: its key is refused in production today) the
// search says so in words and points to the map, which keeps working.
type Found = { q: string; items: Place[]; fail: GeocoderFail | null };

export function useGeocoderFailText(): (f: GeocoderFail, mapOn: boolean) => string {
  const t = useTranslations("marketMap.place");
  const tx = useTranslations("marketMap");
  return (f, mapOn) => {
    if (f === "unavailable") return mapOn ? t("unavailable") : t("unavailableNoMap");
    if (f === "busy") return mapOn ? t("busy") : t("busyNoMap");
    if (f === "offline") return tx("errors.offline");
    return t("error");
  };
}

export default function PlaceSearch({
  url,
  label,
  placeholder,
  onSelect,
  aiId,
  autoFocus,
  off,
  mapOn = false,
}: {
  url: string;
  label: string;
  placeholder: string;
  onSelect: (p: Place) => void;
  aiId: string;
  autoFocus?: boolean;
  // The config says the geocoder isn't set up: nothing is asked.
  off?: boolean;
  // A map beside the search lets the point be picked there instead.
  mapOn?: boolean;
}) {
  const t = useTranslations("marketMap.place");
  const failText = useGeocoderFailText();
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
    if (off || term.length < 2 || term === picked) return;
    const c = new AbortController();
    const timer = window.setTimeout(() => {
      geocodeSearch(term, locale, url, c.signal).then(
        (items) => {
          if (!c.signal.aborted) setFound({ q: term, items, fail: null });
        },
        (e) => {
          if (!c.signal.aborted && !isAborted(e)) setFound({ q: term, items: [], fail: geocoderFailOf(e) });
        },
      );
    }, 350);
    return () => {
      window.clearTimeout(timer);
      c.abort();
    };
  }, [term, picked, locale, url, off]);

  const current = off ? null : found && found.q === term && term !== picked ? found : null;
  const busy = !off && term.length >= 2 && term !== picked && !current;
  const listId = `${uid}-l`;

  return (
    <div className="mmp" data-ai-id={aiId} data-ai-type="search">
      <label className="mmp__field">
        <span className="sr-only">{label}</span>
        <IconSearch aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          disabled={off}
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
      {off ? (
        <p className="mmp__down" role="status" data-ai-id={`${aiId}.unavailable`}>
          <IconInfo aria-hidden="true" />
          <span>{failText("unavailable", mapOn)}</span>
        </p>
      ) : null}
      {!off && term.length > 0 && term.length < 2 ? <p className="mmp__hint">{t("short")}</p> : null}
      {current?.fail ? (
        current.fail === "unavailable" || current.fail === "busy" ? (
          <p className="mmp__down" role="alert" data-ai-id={`${aiId}.error`}>
            <IconInfo aria-hidden="true" />
            <span>{failText(current.fail, mapOn)}</span>
          </p>
        ) : (
          <p className="mmp__err" role="alert" data-ai-id={`${aiId}.error`}>
            {failText(current.fail, mapOn)}
          </p>
        )
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
