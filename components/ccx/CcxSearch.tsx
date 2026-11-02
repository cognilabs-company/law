"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccSearchClients, type CcClient } from "@/lib/services/backend";
import { isAborted } from "@/lib/http";
import { prettyPhone } from "./now/feed";
import { IcSearch, IcUser } from "./icons";

export type CcxSearchHandle = { focus: () => void };

type State = { q: string; items: CcClient[]; busy: boolean; failed: boolean };

const CcxSearch = forwardRef<CcxSearchHandle, { enabled: boolean }>(function CcxSearch({ enabled }, ref) {
  const t = useTranslations("admin.ccx.search");
  const router = useRouter();
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [res, setRes] = useState<State>({ q: "", items: [], busy: false, failed: false });

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

  const term = q.trim();
  useEffect(() => {
    if (!enabled || term.length < 2) return;
    let live = true;
    const id = window.setTimeout(() => {
      setRes((r) => ({ ...r, busy: true }));
      ccSearchClients(term).then(
        (items) => live && setRes({ q: term, items: items.slice(0, 6), busy: false, failed: false }),
        (e: unknown) => {
          if (!live || isAborted(e)) return;
          setRes({ q: term, items: [], busy: false, failed: true });
        },
      );
    }, 280);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [enabled, term]);

  const go = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setOpen(false);
    setQ("");
    input.current?.blur();
    router.push(`/admin/call-center?view=clients&q=${encodeURIComponent(v)}`);
  };

  const shown = term.length >= 2 && res.q === term ? res.items : [];
  const showList = open && term.length >= 2;
  const cur = Math.min(hi, Math.max(0, shown.length - 1));

  return (
    <div className={`opx-search${open ? " is-open" : ""}`}>
      <IcSearch size={19} className="opx-search__ic" />
      <input
        ref={input}
        type="search"
        value={q}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${uid}-list`}
        aria-autocomplete="list"
        aria-activedescendant={showList && shown.length ? `${uid}-${cur}` : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(shown.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = shown[cur];
            go(pick ? pick.phone || pick.name : q);
          } else if (e.key === "Escape") {
            setQ("");
            setOpen(false);
          }
        }}
        data-ai-id="call_center.header.search"
      />
      <kbd className="opx-search__kbd" aria-hidden="true">
        Ctrl K
      </kbd>
      {showList ? (
        <ul className="opx-search__list" id={`${uid}-list`} role="listbox" aria-label={t("results")}>
          {res.busy && !shown.length ? <li className="opx-search__note">{t("searching")}</li> : null}
          {!res.busy && res.failed ? <li className="opx-search__note">{t("failed")}</li> : null}
          {!res.busy && !res.failed && res.q === term && !shown.length ? <li className="opx-search__note">{t("empty")}</li> : null}
          {shown.map((c, i) => (
            <li
              key={c.id || c.phone}
              id={`${uid}-${i}`}
              role="option"
              aria-selected={i === cur}
              className={`opx-search__opt${i === cur ? " is-on" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                go(c.phone || c.name);
              }}
              onMouseEnter={() => setHi(i)}
            >
              <span className="opx-search__av">
                <IcUser size={17} />
              </span>
              <span className="opx-search__who">
                <b>{c.name || prettyPhone(c.phone)}</b>
                <small>{[c.phone ? prettyPhone(c.phone) : "", c.lexgoId].filter(Boolean).join(" · ")}</small>
              </span>
            </li>
          ))}
          <li
            className="opx-search__all"
            role="option"
            aria-selected={false}
            onMouseDown={(e) => {
              e.preventDefault();
              go(q);
            }}
          >
            {t("all", { q: term })}
          </li>
        </ul>
      ) : null}
    </div>
  );
});

export default CcxSearch;
