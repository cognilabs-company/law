"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ccSearchClients, listCcCalls, logCcCall, type CcClient } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useReload } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";
import BusinessHoursBadge from "@/components/portal/BusinessHoursBadge";
import { IconSearch, IconPhone, IconUser } from "@/components/icons";

function fmt(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("ru-RU");
}

export default function AdminCallCenter() {
  const t = useTranslations("admin.callCenter");
  const [key, reload] = useReload();
  const calls = useResource(() => listCcCalls(), [key]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CcClient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await ccSearchClients(q.trim()));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }
  async function logCall(c: CcClient) {
    setBusy(c.id);
    try {
      await logCcCall({ phone: c.phone, client_user_id: c.id, direction: "outgoing" });
      reload();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pgrid2">
      <div className="ppanel">
        <div className="ppanel__h"><b>{t("search")}</b><BusinessHoursBadge showHolidayNote /></div>
        <form className="lsp__search" onSubmit={search} style={{ marginBottom: 12 }}>
          <IconSearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("search")} />
        </form>
        {searching ? (
          <Skeleton rows={2} />
        ) : results === null ? (
          <p className="advmuted">{t("searchHint")}</p>
        ) : !results.length ? (
          <p className="advmuted">{t("noResults")}</p>
        ) : (
          <div className="alist">
            {results.map((c) => (
              <div className="aitem" key={c.id}>
                <span className="aitem__n"><IconUser /></span>
                <div className="aitem__m">
                  <b>{c.name || c.phone}</b>
                  <span className="aitem__meta">{[c.lexgoId, c.phone, c.status ? (t.has(`status.${c.status}`) ? t(`status.${c.status}`) : c.status) : ""].filter(Boolean).join(" · ")}</span>
                </div>
                <button className="btn btn--pri btn--sm" type="button" disabled={busy === c.id} onClick={() => logCall(c)}><IconPhone />{t("logCall")}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ppanel">
        <div className="ppanel__h"><b>{t("recent")}</b><span className="advmuted">{calls.data.length}</span></div>
        {calls.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !calls.data.length ? (
          <p className="advmuted">{t("noCalls")}</p>
        ) : (
          <div className="alist">
            {calls.data.map((c) => (
              <div className="creq" key={c.id}>
                <span className="creq__st" />
                <div className="creq__m"><b>{c.phone || "—"}</b><span>{[t.has(`dir.${c.direction}`) ? t(`dir.${c.direction}`) : c.direction, fmt(c.createdAt)].filter(Boolean).join(" · ")}</span></div>
                <span className="creq__badge">{c.status ? (t.has(`status.${c.status}`) ? t(`status.${c.status}`) : c.status) : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
