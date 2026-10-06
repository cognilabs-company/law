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
import { IconCheck, IconClock } from "@/components/icons";

const PRICES_KEY = (uid: string) => `lexgo_service_prices_${uid}`;
const POLICY_KEY = (uid: string) => `lexgo_price_policy_${uid}`;

function remember(uid: string, chosen: Record<string, number>): void {
  try {
    localStorage.setItem(PRICES_KEY(uid), JSON.stringify(chosen));
    localStorage.setItem(POLICY_KEY(uid), "1");
  } catch {
    return;
  }
}

export default function LegacyServicePicker() {
  const t = useTranslations("portal.lawyer.services");
  const ts = useTranslations("sellerServices.pending");
  const { session } = useAuth();
  const uid = session?.id ?? "";
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
      .catch(() => setSel([]))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    const h = setTimeout(() => {
      try {
        setPrices(JSON.parse(localStorage.getItem(PRICES_KEY(uid)) || "{}") as Record<string, number>);
        setAgreed(localStorage.getItem(POLICY_KEY(uid)) === "1");
      } catch {
        setPrices({});
      }
    }, 0);
    return () => clearTimeout(h);
  }, [uid]);

  const byId = useMemo(() => new Map(catalog.data.map((s) => [s.id, s])), [catalog.data]);
  const bandOf = (id: string) => {
    const base = byId.get(id)?.price ?? 0;
    return base ? { min: Math.round(base * 0.7), max: base } : null;
  };
  const offBand = sel.filter((id) => {
    const b = bandOf(id);
    const p = prices[id];
    return b && p && (p < b.min || p > b.max);
  });

  async function save() {
    if (busy) return;
    if (!agreed) {
      setNote({ ok: false, msg: t("policyRequired") });
      return;
    }
    if (offBand.length) {
      const b = bandOf(offBand[0])!;
      setNote({ ok: false, msg: t("priceOutOfRange", { min: fmtUzs(b.min), max: fmtUzs(b.max) }) });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const chosen: Record<string, number> = {};
      for (const id of sel) if (prices[id]) chosen[id] = prices[id];
      await putMyServices(sel, chosen);
      remember(uid, chosen);
      setNote({ ok: true, msg: t("saved") });
    } catch (e) {
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
      <div className="svm__notice svm__notice--wait" role="note" style={{ marginBottom: 16 }}>
        <span className="svm__nic" aria-hidden="true">
          <IconClock />
        </span>
        <div className="svm__nt">
          <b>{ts("title")}</b>
          <p>{ts("legacyNote")}</p>
        </div>
      </div>
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{sel.length}</span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      <ServiceSelector value={sel} onChange={setSel} excludeAdvokatRequired />

      {sel.length ? (
        <div className="svprices" data-ai-target="services:prices">
          <div className="ppanel__h" style={{ marginTop: 18 }}>
            <b>{t("pricesTitle")}</b>
            <span className="advmuted">{t("pricesBand")}</span>
          </div>
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
                  <input
                    inputMode="numeric"
                    value={p ? String(p) : ""}
                    placeholder={b ? String(b.max) : "0"}
                    aria-label={t("pricesTitle")}
                    onChange={(e) => setPrices((x) => ({ ...x, [id]: parseInt(e.target.value.replace(/\D/g, "") || "0", 10) || 0 }))}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <label className={`vac${agreed ? " on" : ""}`} style={{ marginTop: 14, alignSelf: "flex-start" }} data-ai-target="services:policy">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <IconCheck />
        {t("policyAgree")}
      </label>
      <p className="rf__hint">{t("policyHint")}</p>

      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      <button className="btn btn--pri btn--full" type="button" onClick={save} disabled={busy || !loaded} style={{ marginTop: 14 }} data-ai-target="button:save-services">
        {busy ? t("saving") : t("save")}
        {busy ? null : <IconCheck />}
      </button>
    </div>
  );
}
