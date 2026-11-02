"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { CcClient } from "@/lib/services/backend";
import { labelOf } from "@/lib/labels";
import { initials } from "@/lib/lawyers";
import { prettyPhone } from "../now/feed";
import { IcRefresh, IcSearch, IcShield, IcUser } from "../icons";
import { toneOf } from "./parts";

export type SearchState = { term: string; status: "loading" | "ready" | "error"; items: CcClient[] };

export default function ClientList({
  term,
  min,
  search,
  denied,
  pickedId,
  onPick,
  onRetry,
}: {
  term: string;
  min: number;
  search: SearchState;
  denied: boolean;
  pickedId: string;
  onPick: (c: CcClient) => void;
  onRetry: () => void;
}) {
  const t = useTranslations("admin.ccx.clients");
  const tc = useTranslations("admin.callCenter");
  const tn = useTranslations("common.notify");
  const live = term.length >= min;
  const fresh = live && search.term === term;
  const busy = live && (!fresh || search.status === "loading");
  const items = search.items;
  const count = fresh && search.status === "ready" ? items.length : null;

  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button.opx-cl-row"));
    const at = rows.findIndex((b) => b === document.activeElement);
    const next = rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    next.focus();
  };

  let body: ReactNode;
  if (denied) {
    body = (
      <p className="opx-cl-note" data-tone="warn" role="status">
        <IcShield size={18} />
        <span>{tc("searchNoAccess")}</span>
      </p>
    );
  } else if (!live) {
    body = (
      <div className="opx-cl-empty">
        <span className="opx-cl-empty__orb" aria-hidden="true">
          <IcSearch size={26} />
        </span>
        <p>{tc("searchHint")}</p>
      </div>
    );
  } else if (fresh && search.status === "error") {
    body = (
      <div className="opx-cl-note" data-tone="bad" role="alert">
        <span>{tc("searchFailed")}</span>
        <button type="button" className="opx-cl-mini" onClick={onRetry}>
          <IcRefresh size={15} />
          {tn("retry")}
        </button>
      </div>
    );
  } else if (fresh && search.status === "ready" && !items.length) {
    body = (
      <div className="opx-cl-empty">
        <span className="opx-cl-empty__orb" aria-hidden="true">
          <IcUser size={26} />
        </span>
        <p>{tc("noResults")}</p>
      </div>
    );
  } else if (!items.length) {
    body = (
      <div className="opx-cl-list__wait" aria-busy="true" aria-label={tc("searching")}>
        <i className="opx-shim" />
        <i className="opx-shim" />
        <i className="opx-shim" />
      </div>
    );
  } else {
    body = (
      <ul className={`opx-cl-rows${busy ? " is-busy" : ""}`} aria-label={t("resultsAria")} aria-busy={busy || undefined} onKeyDown={onKey}>
        {items.map((c, i) => {
          const on = c.id === pickedId;
          const label = c.name || prettyPhone(c.phone);
          return (
            <li key={c.id} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
              <button type="button" className={`opx-cl-row${on ? " is-on" : ""}`} aria-current={on || undefined} onClick={() => onPick(c)}>
                <span className="opx-cl-av" aria-hidden="true">
                  {c.name ? initials(c.name) : <IcUser size={18} />}
                </span>
                <span className="opx-cl-row__txt">
                  <b>{label}</b>
                  <small className="opx-num">{[c.name ? prettyPhone(c.phone) : "", c.lexgoId].filter(Boolean).join(" · ")}</small>
                </span>
                {c.status ? (
                  <span className="opx-cl-dot" data-tone={toneOf(c.status)}>
                    {labelOf(tc, "status", c.status)}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="opx-cl-list" aria-label={t("resultsAria")}>
      <header className="opx-cl-list__head">
        <h3>{count == null ? tc("search") : t("found", { n: count })}</h3>
        {busy ? <span className="opx-cl-spin" aria-hidden="true" /> : null}
      </header>
      <span className="opx-sr" role="status">
        {busy ? tc("searching") : count == null ? "" : t("found", { n: count })}
      </span>
      {body}
    </section>
  );
}
