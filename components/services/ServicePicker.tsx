"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { searchServices, type BackendService } from "@/lib/services/backend";
import { isAdvocateOnly } from "@/lib/services/sellerServices";
import { IconCheck, IconClose, IconLayers, IconLock, IconSearch } from "@/components/icons";
import { som } from "./bits";

type Hit = { service: BackendService; blocked: "" | "taken" | "advocate" };
type Result = { q: string; hits: BackendService[]; failed: boolean };

export default function ServicePicker({
  value,
  onChange,
  taken,
  lawyer,
  invalid,
  inputId,
}: {
  value: BackendService | null;
  onChange: (s: BackendService | null) => void;
  taken: Set<string>;
  lawyer: boolean;
  invalid?: string;
  inputId: string;
}) {
  const t = useTranslations("sellerServices.form");
  const locale = useLocale();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [active, setActive] = useState(0);
  const query = q.trim();
  const enough = query.length >= 2;

  useEffect(() => {
    if (!enough) return;
    let alive = true;
    const h = window.setTimeout(() => {
      searchServices(query, { limit: 20 }, locale)
        .then((rows) => {
          if (alive) setRes({ q: query, hits: rows.map((r) => r.service).filter((s) => s.id && s.isActive), failed: false });
        })
        .catch(() => {
          if (alive) setRes({ q: query, hits: [], failed: true });
        });
    }, 260);
    return () => {
      alive = false;
      window.clearTimeout(h);
    };
  }, [query, enough, locale]);

  const ready = enough && res?.q === query ? res : null;
  const loading = enough && !ready;
  const hits: Hit[] = (ready?.hits ?? []).map((s) => ({
    service: s,
    blocked: taken.has(s.id) ? "taken" : lawyer && isAdvocateOnly(s) ? "advocate" : "",
  }));
  const open = enough && !value;
  const pickable = hits.map((h, i) => (h.blocked ? -1 : i)).filter((i) => i >= 0);
  const cur = pickable.includes(active) ? active : (pickable[0] ?? -1);

  const pick = (s: BackendService) => {
    onChange(s);
    setQ("");
    setActive(0);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && q) {
      e.preventDefault();
      setQ("");
      return;
    }
    if (!open || !pickable.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const at = pickable.indexOf(cur);
      const next = pickable[(at + (e.key === "ArrowDown" ? 1 : -1) + pickable.length) % pickable.length];
      setActive(next);
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && cur >= 0) {
      e.preventDefault();
      pick(hits[cur].service);
    }
  };

  if (value) {
    return (
      <div className="svpick__sel">
        <span className="svpick__ic" aria-hidden="true">
          <IconCheck />
        </span>
        <span className="svpick__selm">
          <b>{value.name}</b>
          <small>
            {[value.categoryTitle, value.subcategory].filter(Boolean).join(" · ")}
            {value.price ? ` · ${t("fromPrice", { price: som(value.price) })}` : ""}
          </small>
        </span>
        <button
          type="button"
          className="btn btn--line btn--sm"
          onClick={() => {
            onChange(null);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          {t("change")}
        </button>
      </div>
    );
  }

  return (
    <div className={`svpick${invalid ? " is-bad" : ""}`}>
      <div className="svpick__field">
        <IconSearch aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={t("searchPh")}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && cur >= 0 ? `${listId}-${cur}` : undefined}
          aria-invalid={invalid ? true : undefined}
        />
        {q ? (
          <button type="button" className="svpick__clear" onClick={() => setQ("")} aria-label={t("clear")}>
            <IconClose />
          </button>
        ) : null}
      </div>
      <ul className="svpick__list" id={listId} role="listbox" aria-label={t("service")} hidden={!open}>
        {loading ? <li className="svpick__msg">{t("searching")}</li> : null}
        {ready && ready.failed ? <li className="svpick__msg svpick__msg--bad">{t("searchFailed")}</li> : null}
        {ready && !ready.failed && !hits.length ? <li className="svpick__msg">{t("noResults")}</li> : null}
        {ready
          ? hits.map((h, i) => (
              <li
                key={h.service.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === cur}
                aria-disabled={h.blocked ? true : undefined}
                className={`svpick__o${i === cur ? " is-cur" : ""}${h.blocked ? " is-off" : ""}`}
                onMouseEnter={() => {
                  if (!h.blocked) setActive(i);
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!h.blocked) pick(h.service);
                }}
              >
                <span className="svpick__oi" aria-hidden="true">
                  {h.blocked === "advocate" ? <IconLock /> : h.blocked === "taken" ? <IconCheck /> : <IconLayers />}
                </span>
                <span className="svpick__om">
                  <b>{h.service.name}</b>
                  <small>{[h.service.categoryTitle, h.service.subcategory].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="svpick__or">
                  {h.blocked === "taken" ? (
                    <em className="svpick__tag">{t("added")}</em>
                  ) : h.blocked === "advocate" ? (
                    <em className="svpick__tag svpick__tag--lock" title={t("advocateOnlyHint")}>
                      {t("advocateOnly")}
                    </em>
                  ) : h.service.price ? (
                    <span className="svpick__price">{t("fromPrice", { price: som(h.service.price) })}</span>
                  ) : null}
                </span>
              </li>
            ))
          : null}
      </ul>
      {!enough ? <p className="svpick__hint">{q ? t("typeMore") : t("serviceHint")}</p> : null}
    </div>
  );
}
