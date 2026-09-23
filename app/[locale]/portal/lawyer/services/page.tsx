"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { getMyServices, putMyServices, getAllServices } from "@/lib/services/backend";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/useResource";
import ServiceSelector from "@/components/register/ServiceSelector";
import { firstFieldError, priceRangeOf } from "@/lib/formErrors";
import { fmtUzs } from "@/lib/money";
import { Notice } from "@/components/admin/AdminBits";
import { IconCheck } from "@/components/icons";

// GET /lawyers/me/services returns the services but not the chosen prices
// (reported), so the prices the seller typed are remembered per account.
const PRICES_KEY = (uid: string) => `lexgo_service_prices_${uid}`;
const POLICY_KEY = (uid: string) => `lexgo_price_policy_${uid}`;

// T2-02: pick services from the catalogue, accept the price policy, set a
// price per service inside the 70–100 % band of the recommendation (the
// backend rejects anything else with 422 and names the allowed range).
export default function LawyerServices() {
  const t = useTranslations("portal.lawyer.services");
  const { session } = useAuth();
  const uid = session?.id ?? "";
  // getAllServices, not getServices: /services is paged now (LEXGO_SERVICES_
  // CATALOG_OPTIMIZATION_FRONTEND.md) — a seller must be able to pick ANY
  // catalogue service here, not just whatever's on the first page.
  const catalog = useResource(() => getAllServices(), []);
  const [sel, setSel] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [agreed, setAgreed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    getMyServices()
      .then((s) => setSel(s))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    const h = setTimeout(() => {
      try {
        setPrices(JSON.parse(localStorage.getItem(PRICES_KEY(uid)) || "{}") as Record<string, number>);
        setAgreed(localStorage.getItem(POLICY_KEY(uid)) === "1");
      } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(h);
  }, [uid]);

  const byId = useMemo(() => new Map(catalog.data.map((s) => [s.id, s])), [catalog.data]);
  // Recommended = catalogue base price (the backend adds region/experience modifiers on save).
  const bandOf = (id: string) => { const base = byId.get(id)?.price ?? 0; return base ? { min: Math.round(base * 0.7), max: base } : null; };
  const offBand = sel.filter((id) => { const b = bandOf(id); const p = prices[id]; return b && p && (p < b.min || p > b.max); });

  async function save() {
    if (busy) return;
    if (!agreed) { setNote({ ok: false, msg: t("policyRequired") }); return; }
    if (offBand.length) { const b = bandOf(offBand[0])!; setNote({ ok: false, msg: t("priceOutOfRange", { min: fmtUzs(b.min), max: fmtUzs(b.max) }) }); return; }
    setBusy(true);
    setNote(null);
    try {
      const chosen: Record<string, number> = {};
      for (const id of sel) if (prices[id]) chosen[id] = prices[id];
      await putMyServices(sel, chosen);
      try { localStorage.setItem(PRICES_KEY(uid), JSON.stringify(chosen)); localStorage.setItem(POLICY_KEY(uid), "1"); } catch { /* ignore */ }
      setNote({ ok: true, msg: t("saved") });
    } catch (e) {
      // 422: the backend says which price is out of range, or which field is invalid.
      const range = priceRangeOf(e);
      const field = firstFieldError(e);
      setNote({
        ok: false,
        msg: range
          ? t("priceOutOfRange", { min: fmtUzs(range.min), max: fmtUzs(range.max) })
          : field
            ? t("invalidField", { detail: field })
            : t("error"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{sel.length}</span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      <ServiceSelector value={sel} onChange={setSel} excludeAdvokatRequired />

      {sel.length ? (
        <div className="svprices">
          <div className="ppanel__h" style={{ marginTop: 18 }}><b>{t("pricesTitle")}</b><span className="advmuted">{t("pricesBand")}</span></div>
          <div className="alist">
            {sel.map((id) => {
              const s = byId.get(id);
              const b = bandOf(id);
              const p = prices[id] ?? 0;
              const bad = !!b && !!p && (p < b.min || p > b.max);
              return (
                <div className={`svprice${bad ? " err" : ""}`} key={id}>
                  <div className="svprice__m">
                    <b>{s?.name ?? id}</b>
                    <span>{b ? t("recommended", { min: fmtUzs(b.min), max: fmtUzs(b.max) }) : t("noRecommended")}</span>
                  </div>
                  <input inputMode="numeric" value={p ? String(p) : ""} placeholder={b ? String(b.max) : "0"} aria-label={t("pricesTitle")} onChange={(e) => setPrices((x) => ({ ...x, [id]: parseInt(e.target.value.replace(/\D/g, "") || "0", 10) || 0 }))} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <label className={`vac${agreed ? " on" : ""}`} style={{ marginTop: 14, alignSelf: "flex-start" }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <IconCheck />{t("policyAgree")}
      </label>
      <p className="rf__hint">{t("policyHint")}</p>

      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      <button className="btn btn--pri btn--full" type="button" onClick={save} disabled={busy || !loaded} style={{ marginTop: 14 }}>
        {busy ? t("saving") : t("save")}
        {busy ? null : <IconCheck />}
      </button>
    </div>
  );
}
