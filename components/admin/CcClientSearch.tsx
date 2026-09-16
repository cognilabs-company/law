"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ccSearchClients, type CcClient } from "@/lib/services/backend";
import { isForbidden } from "@/lib/http";
import { Skeleton } from "@/components/portal/DataState";
import BusinessHoursBadge from "@/components/portal/BusinessHoursBadge";
import Modal from "@/components/admin/Modal";
import CcClientCard from "./CcClientCard";
import { IconSearch, IconUser, IconChevronRight } from "@/components/icons";

// Client lookup for the call-center console (GET /call-center/clients/search):
// searches as you type (name or phone, from 2 characters), Enter/button also
// work; a result opens the client card. 403 = this role has no lookup right.
export default function CcClientSearch({ canLog, onLogged }: { canLog: boolean; onLogged: () => void }) {
  const t = useTranslations("admin.callCenter");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CcClient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [open, setOpen] = useState<CcClient | null>(null);
  const seq = useRef(0);

  async function run(term: string) {
    const my = ++seq.current;
    if (term.length < 2) { setResults(null); setSearching(false); return; }
    setSearching(true);
    try {
      const r = await ccSearchClients(term);
      if (my === seq.current) setResults(r);
    } catch (e) {
      if (my !== seq.current) return;
      setResults([]);
      if (isForbidden(e)) setForbidden(true);
    } finally {
      if (my === seq.current) setSearching(false);
    }
  }
  // Debounced live search; a short term clears the list (no request).
  useEffect(() => {
    const term = q.trim();
    const h = setTimeout(() => void run(term), term.length < 2 ? 0 : 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="ppanel">
      <div className="ppanel__h"><b>{t("search")}</b><BusinessHoursBadge showHolidayNote /></div>
      <form className="lsp__search" onSubmit={(e) => { e.preventDefault(); void run(q.trim()); }} style={{ marginBottom: 12 }}>
        <IconSearch />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("search")} autoComplete="off" />
        <button type="submit" className="btn btn--pri btn--sm" disabled={q.trim().length < 2 || searching}>{searching ? t("searching") : t("searchBtn")}</button>
      </form>
      {forbidden ? (
        <p className="advmuted">{t("searchNoAccess")}</p>
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
                <span className="aitem__meta">{[c.lexgoId, c.phone, c.status ? (t.has(`status.${c.status}`) ? t(`status.${c.status}`) : c.status) : ""].filter(Boolean).join(" · ")}</span>
              </div>
              <IconChevronRight />
            </button>
          ))}
        </div>
      )}

      <Modal open={open !== null} onClose={() => setOpen(null)} title={open?.name || open?.phone || t("card.title")}>
        {open ? <CcClientCard client={open} canLog={canLog} onLogged={onLogged} /> : null}
      </Modal>
    </div>
  );
}
