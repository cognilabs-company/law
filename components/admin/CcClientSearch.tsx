"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ccSearchClients, type CcClient } from "@/lib/services/backend";
import { isForbidden } from "@/lib/http";
import { labelOf } from "@/lib/labels";
import { ErrorState, Skeleton } from "@/components/portal/DataState";
import BusinessHoursBadge from "@/components/portal/BusinessHoursBadge";
import InlineAlert from "@/components/ui/InlineAlert";
import CcClientCard from "./CcClientCard";
import { IconSearch, IconUser, IconChevronRight } from "@/components/icons";

// Client lookup for the call-center console (GET /call-center/clients/search):
// searches as you type (name or phone, from 2 characters), Enter/button also
// work; a result opens the client card. 403 = this role has no lookup right.
export default function CcClientSearch({
  canLog,
  onLogged,
  request,
}: {
  canLog: boolean;
  onLogged: (phone: string) => void;
  request?: { q: string; n: number };
}) {
  const t = useTranslations("admin.callCenter");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CcClient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const [open, setOpen] = useState<CcClient | null>(null);
  const [asked, setAsked] = useState({ q: "", n: request?.n ?? 0 });
  const seq = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  if (request && request.n !== asked.n) {
    setAsked({ q: request.q, n: request.n });
    setQ(request.q);
  }

  async function run(term: string) {
    const my = ++seq.current;
    setFailure(null);
    if (term.length < 2) { setResults(null); setSearching(false); return; }
    setSearching(true);
    try {
      const r = await ccSearchClients(term);
      if (my === seq.current) setResults(r);
    } catch (e) {
      if (my !== seq.current) return;
      if (isForbidden(e)) {
        setResults([]);
        setForbidden(true);
      } else {
        setResults(null);
        setFailure({ error: e });
      }
    } finally {
      if (my === seq.current) setSearching(false);
    }
  }
  // Debounced live search; a short term clears the list (no request).
  useEffect(() => {
    const term = q.trim();
    const h = setTimeout(() => void run(term), term.length < 2 || (asked.n && asked.q === q) ? 0 : 350);
    return () => clearTimeout(h);
  }, [q, asked]);

  useEffect(() => {
    if (asked.n) input.current?.focus();
  }, [asked.n]);

  return (
    <div className="ppanel">
      <div className="ppanel__h cch cch--wrap">
        <h2 className="cch__t"><span className="cch__tt">{t("search")}</span></h2>
        <BusinessHoursBadge holidayTitle={false} />
      </div>
      <form className="lsp__search" onSubmit={(e) => { e.preventDefault(); void run(q.trim()); }} style={{ marginBottom: 12 }} data-ai-target="callcenter:client-search">
        <IconSearch />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("search")} autoComplete="off" />
        <button type="submit" className="btn btn--pri btn--sm" disabled={q.trim().length < 2 || searching}>{searching ? t("searching") : t("searchBtn")}</button>
      </form>
      {forbidden ? (
        <InlineAlert tone="locked" compact>{t("searchNoAccess")}</InlineAlert>
      ) : failure ? (
        <ErrorState error={failure.error} onRetry={() => run(q.trim())} title={t("searchFailed")} compact />
      ) : searching && results === null ? (
        <Skeleton rows={2} />
      ) : results === null ? (
        <p className="advmuted">{t("searchHint")}</p>
      ) : !results.length ? (
        <p className="advmuted">{t("noResults")}</p>
      ) : (
        <div className="alist">
          {results.map((c) => (
            <button type="button" className="aitem aitem--link" key={c.id} onClick={() => setOpen(c)}>
              <span className="aitem__n"><IconUser /></span>
              <div className="aitem__m">
                <b>{c.name || c.phone}</b>
                <span className="aitem__meta">{[c.lexgoId, c.phone, c.status ? labelOf(t, "status", c.status) : ""].filter(Boolean).join(" · ")}</span>
              </div>
              <IconChevronRight />
            </button>
          ))}
        </div>
      )}

      {open ? <CcClientCard key={open.id} client={open} canLog={canLog} onLogged={onLogged} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
